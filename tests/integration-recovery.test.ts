import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { SettingsStore } from '../src/app/settings.ts';
import { AppRuntime } from '../src/app/runtime.ts';
import { createAppServer } from '../src/app/server.ts';
import { createHttpServer } from '../src/server/server.ts';
import type { TwitchCallbacks, TwitchTransportFactory } from '../src/twitch/intake.ts';
import { testPipeline } from './pipeline-fixture.ts';
import { memoryRedemptionStore } from './fixtures.ts';

async function until(check: () => boolean | Promise<boolean>) {
  const end = Date.now() + 4000;
  while (!(await check())) {
    if (Date.now() > end) throw new Error('Integration fixture timed out.');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

test('server startup failure disposes its remembered Twitch transport', async () => {
  const root = await mkdtemp(join(tmpdir(), 'momoitts-startup-recovery-'));
  const store = new SettingsStore({ privateRoot: root, env: {} });
  store.rememberTwitch(true);
  let started = false;
  let stopped = false;
  const server = createAppServer({
    management: store,
    twitch: {
      clientId: 'dummyclient12345',
      channel: 'testchannel',
      rewardTitle: 'Ask',
      rewardCost: 1,
    },
    redemptionStore: memoryRedemptionStore(),
    twitchTransport: (_config, callbacks) => ({
      async start() {
        started = true;
        callbacks.connected('reward1', true);
      },
      stop() {
        stopped = true;
      },
      async isLive() {
        return true;
      },
      async status() {
        return 'UNFULFILLED';
      },
      async outstanding() {
        return [];
      },
      async settle(_reward, _id, target) {
        return target;
      },
    }),
  });
  try {
    await until(() => started);
    server.emit('error', new Error('Synthetic bind failure'));
    assert(stopped);
  } finally {
    server.emit('close');
    await rm(root, { recursive: true, force: true });
  }
});

test('local controls preserve Twitch refunds, cancellation and private recovery with offline providers', async () => {
  const root = await mkdtemp(join(tmpdir(), 'momoitts-integration-flow-'));
  const dir = root;
  let callbacks!: TwitchCallbacks;
  let connections = 0;
  let failSettlement = false;
  const remote = new Map<string, string>();
  const factory: TwitchTransportFactory = (_config, cb) => {
    callbacks = cb;
    connections++;
    return {
      async start() {
        cb.connected('reward1', true);
      },
      stop() {},
      async isLive() {
        return true;
      },
      async status(_reward, id) {
        return remote.get(id) ?? 'UNFULFILLED';
      },
      async outstanding() {
        return [];
      },
      async settle(_reward, id, target) {
        if (failSettlement) throw new Error('offline');
        remote.set(id, target);
        return target;
      },
    };
  };
  let app: AppRuntime | undefined;
  const redeem = (id: string) =>
    callbacks.redemption({
      id,
      rewardId: 'reward1',
      broadcasterId: '123',
      broadcasterName: 'testchannel',
      userName: id,
      input: 'Tyrone: Offline integration',
      status: 'UNFULFILLED',
      redemptionDate: new Date(),
    });
  try {
    await writeFile(
      join(dir, 'twitch.env'),
      'TWITCH_CLIENT_ID=dummyclient12345\nTWITCH_CHANNEL=testchannel\nTWITCH_REWARD_TITLE=Ask characters\nTWITCH_REWARD_COST=1\n',
    );
    await writeFile(
      join(dir, 'app.json'),
      JSON.stringify({ volume: 100, setupSeen: true, twitchConnected: false }),
    );
    const create = () =>
      new AppRuntime({
        management: new SettingsStore({
          privateRoot: root,
          env: {},
        }),
        pipeline: testPipeline(),
        twitchTransport: factory,
        settings: { globalCooldownMs: 0, viewerCooldownMs: 0 },
      });
    app = create();
    assert.equal(connections, 0);
    app.connectTwitch();
    await until(() => app!.snapshot().twitch.status === 'connected');
    redeem('paused');
    await until(() => remote.get('paused') === 'CANCELED');
    app.session.poll('obs-fixture');
    app.session.setRepliesEnabled(true);
    await until(() => app!.session.queue.snapshot().repliesEnabled);
    redeem('complete');
    await until(() => app!.session.state.status === 'ready');
    const completedClip = app.session.state.clip!.id;
    app.session.playbackEvent('obs-fixture', completedClip, 'playing');
    app.session.playbackEvent('obs-fixture', completedClip, 'ended');
    await until(() => remote.get('complete') === 'FULFILLED');
    redeem('skip');
    await until(() =>
      app!.session.queue.snapshot().requests.some((entry) => entry.viewer === 'skip'),
    );
    app.session.queue.skip();
    await until(() => remote.get('skip') === 'CANCELED');
    await new Promise((resolve) => setTimeout(resolve, 750));
    assert.equal(app.session.audio(app.session.state.clip!.url), null);
    redeem('gap');
    await until(() => app!.session.state.status === 'ready');
    failSettlement = true;
    app.disconnectTwitch();
    await until(() => app!.snapshot().twitch.pendingUpdates === 1);
    await until(() => !app!.session.busy);
    await until(async () => {
      const journal = JSON.parse(await readFile(join(dir, 'twitch-redemptions.json'), 'utf8'));
      return journal.entries.some(
        (entry: { id: string; target: string }) =>
          entry.id === 'gap' && entry.target === 'CANCELED',
      );
    });
    app.close();
    app = create();
    assert.equal(connections, 1);
    assert.equal(app.session.queue.snapshot().requests.length, 0);
    failSettlement = false;
    app.connectTwitch();
    await until(() => remote.get('gap') === 'CANCELED');
    assert.equal(app.session.queue.snapshot().repliesEnabled, false);
    assert.equal(app.session.playbackEvent('obs-fixture', completedClip, 'ended'), 'stale');
    // The remote acknowledgement precedes atomic journal persistence.
    // Wait for durable cleanup rather than assuming the mock settle callback completes it.
    await until(async () => {
      const persisted = JSON.parse(await readFile(join(dir, 'twitch-redemptions.json'), 'utf8'));
      return persisted.entries.length === 0;
    });
    const journal = JSON.parse(await readFile(join(dir, 'twitch-redemptions.json'), 'utf8'));
    assert.deepEqual(journal.entries, []);
    assert.equal(app.snapshot().twitch.pendingUpdates, 0);
  } finally {
    app?.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('malformed Twitch configuration leaves Settings and independent previews available', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'momoitts-invalid-integration-'));
  const twitchText =
    'TWITCH_CLIENT_ID=PRIVATE_INVALID_CLIENT!\nTWITCH_CHANNEL=PRIVATE_INVALID_CHANNEL!\n';
  const controlsText =
    'STREAMELEMENTS_CHANNEL_ID=PRIVATE_INVALID_CHANNEL!\nSTREAMELEMENTS_OVERLAY_TOKEN=PRIVATE_TOKEN_VALUE\n';
  let runtime: AppRuntime | undefined;
  let server: ReturnType<typeof createHttpServer> | undefined;
  const originalFetch = globalThis.fetch;
  let transportCalls = 0;
  try {
    await writeFile(join(dir, 'twitch.env'), twitchText);
    await writeFile(join(dir, 'streamelements.env'), controlsText);
    await writeFile(
      join(dir, 'app.json'),
      JSON.stringify({ volume: 100, setupSeen: false, twitchConnected: true }),
    );
    const store = new SettingsStore({ privateRoot: dir, env: {} });
    runtime = new AppRuntime({
      management: store,
      twitchTransport() {
        transportCalls++;
        throw new Error('Unexpected Twitch transport.');
      },
    });
    const state = runtime.snapshot();
    assert(state.management);
    assert.equal(state.queue?.repliesEnabled, false);
    assert.equal(state.twitch.status, 'error');
    assert.equal('streamElements' in state, false);
    assert.equal(store.env().STREAMELEMENTS_OVERLAY_TOKEN, undefined);
    {
      assert.equal(state.twitch.message, 'Repair private Twitch configuration and restart.');
      assert.throws(
        () => runtime!.connectTwitch(),
        /Repair private Twitch configuration and restart/,
      );
      assert.equal(store.twitchConnected, true, 'Failed connection must preserve saved intent.');
    }
    assert.equal(transportCalls, 0);
    assert(!JSON.stringify(state).includes('PRIVATE_'));
    server = createHttpServer(runtime);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert(address && typeof address !== 'string');
    const base = 'http://127.0.0.1:' + address.port;
    assert.equal((await fetch(base + '/')).status, 200);
    assert.equal((await fetch(base + '/api/state')).status, 200);
    runtime.saveSettings('generation', {
      provider: 'openrouter',
      key: 'dummy-preview-key',
      model: 'test/model',
      maxTokens: 1024,
    });
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: { role: 'assistant', content: 'Independent text preview.' },
              finish_reason: 'stop',
            },
          ],
        }),
      );
    assert.deepEqual(
      await runtime.testResponse(
        { text: 'Preview with optional setup errors' },
        new AbortController().signal,
      ),
      { dialogue: 'Independent text preview.' },
    );
    runtime.saveSettings('speech', { key: 'dummy-speech-key' });
    const audio = Buffer.from([0x49, 0x44, 0x33, 0, 0, 0]);
    globalThis.fetch = async () => new Response(audio);
    assert.deepEqual(
      await runtime.testSpeech(
        { text: 'Independent voice preview', voiceId: '0123456789abcdef0123456789abcdef' },
        new AbortController().signal,
      ),
      audio,
    );
    assert.equal(transportCalls, 0);
    assert.equal(await readFile(join(dir, 'twitch.env'), 'utf8'), twitchText);
    assert.equal(await readFile(join(dir, 'streamelements.env'), 'utf8'), controlsText);
    assert.equal(
      new SettingsStore({
        privateRoot: dir,
        env: { STREAMELEMENTS_OVERLAY_TOKEN: 'ignored-inherited' },
      }).proof('a'.repeat(64)),
      new SettingsStore({ privateRoot: dir, env: {} }).proof('a'.repeat(64)),
      'Retired overlay settings must not affect startup or launcher reuse.',
    );
  } finally {
    globalThis.fetch = originalFetch;
    runtime?.close();
    if (server) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
    await rm(dir, { recursive: true, force: true });
  }
});
