import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SettingsStore } from '../src/app/settings.ts';
import { TwitchSetup } from '../src/twitch/setup.ts';
import { AppRuntime } from '../src/app/runtime.ts';
import type { TwitchCallbacks } from '../src/twitch/intake.ts';
import { testPipeline } from './pipeline-fixture.ts';
import { memoryRedemptionStore } from './fixtures.ts';

const clientId = 'fixtureclient12345';
async function until(condition: () => boolean) {
  for (let i = 0; i < 500 && !condition(); i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert(condition());
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'momoitts-guided-'));
  await mkdir(join(root, 'prompts'));
  await writeFile(join(root, 'prompts/a.txt'), 'Trusted fixture prompt.');
  await writeFile(join(root, 'prompts/b.txt'), 'Another trusted fixture prompt.');
  await writeFile(
    join(root, 'catalog.json'),
    JSON.stringify([
      {
        id: 'alpha',
        name: 'Alpha',
        promptFile: 'prompts/a.txt',
        voiceIdEnv: 'FISH_ALPHA_VOICE_ID',
      },
      { id: 'beta', name: 'Beta', promptFile: 'prompts/b.txt', voiceIdEnv: 'FISH_BETA_VOICE_ID' },
    ]),
  );
  await writeFile(
    join(root, 'generation.env'),
    'MOMOI_TTS_TEXT_PROVIDER=openrouter\nOPENROUTER_MODEL=test/model\nOPENROUTER_API_KEY=dummy-generation\n',
  );
  await writeFile(
    join(root, 'fish.env'),
    'FISH_API_KEY=dummy-speech\nFISH_ALPHA_VOICE_ID=' + 'a'.repeat(32),
  );
  const store = new SettingsStore({
    privateRoot: root,
    env: { TWITCH_CLIENT_ID: clientId },
    catalog: pathToFileURL(join(root, 'catalog.json')),
  });
  return { root, store };
}
const tokenResponse = {
  access_token: 'dummy-private-access',
  refresh_token: 'dummy-private-refresh',
  scope: ['channel:manage:redemptions'],
  expires_in: 3600,
};
const validation = {
  client_id: clientId,
  user_id: '123',
  login: 'fixture',
  scopes: tokenResponse.scope,
};

test('Exit wins over authorization waiting for transport shutdown', async () => {
  const { root, store } = await fixture();
  let calls = 0;
  const runtime = new AppRuntime({
    management: store,
    twitchSetupFetch: async () => {
      calls++;
      throw new Error('No network expected.');
    },
    onQuit() {},
  });
  try {
    const pending = runtime.twitchAction('authorize', {}, new AbortController().signal);
    runtime.quit();
    await assert.rejects(pending, /canceled/u);
    assert.equal(calls, 0);
    assert(runtime.exiting);
    await assert.rejects(access(join(root, 'twitch-token.json')));
  } finally {
    runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('guided authorization saves private tokens, creates one paused owned reward and edits it by stable ID', async () => {
  const { root, store } = await fixture();
  let changes = 0,
    creates = 0;
  const rewards: Record<string, unknown>[] = [];
  const mock: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url === 'https://id.twitch.tv/oauth2/device')
      return Response.json({
        device_code: 'private-device-code',
        user_code: 'ABCD',
        verification_uri: 'https://www.twitch.tv/activate',
        interval: 5,
        expires_in: 120,
      });
    if (url === 'https://id.twitch.tv/oauth2/token') {
      assert.equal((init?.body as URLSearchParams).get('scopes'), 'channel:manage:redemptions');
      return Response.json(tokenResponse);
    }
    if (url === 'https://id.twitch.tv/oauth2/validate') return Response.json(validation);
    assert(url.startsWith('https://api.twitch.tv/helix/channel_points/custom_rewards?'));
    if (!init?.method) return Response.json({ data: rewards });
    const body = JSON.parse(String(init.body));
    assert.equal(
      init.method === 'POST' ? body.is_enabled : body.is_paused,
      init.method === 'POST' ? false : true,
    );
    if (init.method === 'POST') {
      creates++;
      rewards.push({ id: 'stable-reward', ...body });
    } else Object.assign(rewards[0]!, body);
    return Response.json({ data: rewards });
  };
  const setup = new TwitchSetup(store, () => changes++, { fetch: mock, pollMs: 1 });
  try {
    assert(store.snapshot().localReady, 'unconfigured Beta must not block Alpha');
    await setup.start();
    const publicState = JSON.stringify(setup.snapshot());
    assert(!publicState.includes('private-device-code'));
    assert(!publicState.includes('dummy-private'));
    await until(() => !setup.snapshot().busy);
    assert.equal(changes, 1);
    assert.equal(setup.snapshot().channel, 'fixture');
    assert.match(new TwitchSetup(store, () => {}).snapshot().message, /authorization saved/u);
    const saved = await readFile(join(root, 'twitch-token.json'), 'utf8');
    assert(saved.includes('dummy-private-access'));
    const testsBeforeReward = store.snapshot().testRevision;
    await setup.reward(
      { title: 'Ask anyone', cost: 500, cooldown: 60 },
      new AbortController().signal,
    );
    assert.equal(creates, 1);
    assert.equal(
      store.snapshot().testRevision,
      testsBeforeReward,
      'Creating a reward preserves successful private-reply and OBS test evidence.',
    );
    assert.equal(setup.snapshot().rewardId, 'stable-reward');
    assert.match(new TwitchSetup(store, () => {}).snapshot().message, /reward are saved/u);
    await setup.reward(
      { title: 'Renamed reward', cost: 100, cooldown: 120 },
      new AbortController().signal,
    );
    assert.equal(creates, 1);
    assert.equal(store.twitchConfig()?.rewardTitle, 'Renamed reward');
    assert.equal(store.twitchConfig()?.rewardId, 'stable-reward');
    assert.equal(store.snapshot().testRevision, testsBeforeReward);
    assert(String(rewards[0]!.prompt).includes('Alpha'));
    assert(!String(rewards[0]!.prompt).includes('Beta'));
    store.saveCharacter('alpha', {
      prompt: 'Kept instructions.',
      voiceId: 'a'.repeat(32),
      available: false,
    });
    assert(!store.snapshot().localReady);
    assert.equal(store.characterEditor('alpha').voiceId, 'a'.repeat(32));
    assert.throws(() =>
      store.saveCharacter('beta', { prompt: 'Test', voiceId: '', available: true }),
    );
  } finally {
    setup.cancel();
    await rm(root, { recursive: true, force: true });
  }
});

test('canceled authorization ignores a late OAuth result and never persists credentials', async () => {
  const { root, store } = await fixture();
  let resolveToken!: (response: Response) => void,
    polled = false;
  const mock: typeof fetch = async (input) => {
    if (String(input).endsWith('/device'))
      return Response.json({
        device_code: 'private-code',
        user_code: 'ABCD',
        verification_uri: 'https://www.twitch.tv/activate',
        interval: 5,
        expires_in: 120,
      });
    polled = true;
    return new Promise<Response>((resolve) => {
      resolveToken = resolve;
    });
  };
  const setup = new TwitchSetup(
    store,
    () => assert.fail('Canceled flow must not configure Twitch'),
    { fetch: mock, pollMs: 1 },
  );
  try {
    await setup.start();
    await until(() => polled);
    setup.cancel();
    resolveToken(Response.json(tokenResponse));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await assert.rejects(access(join(root, 'twitch-token.json')));
    assert.equal(setup.snapshot().activationUrl, undefined);
  } finally {
    setup.cancel();
    await rm(root, { recursive: true, force: true });
  }
});

test('rejected inherited Twitch settings preserve the previous private token', async () => {
  const { root, store } = await fixture();
  const priorToken = 'private recovery state';
  await writeFile(join(root, 'twitch-token.json'), priorToken);
  store.overrides.TWITCH_CHANNEL = 'invalid-channel!';
  const setup = new TwitchSetup(store, () => assert.fail('Rejected settings must not reconnect'), {
    pollMs: 1,
    fetch: async (input) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/device'))
        return Response.json({
          device_code: 'private-code',
          user_code: 'ABCD',
          verification_uri: 'https://www.twitch.tv/activate',
          interval: 5,
          expires_in: 120,
        });
      if (path.endsWith('/token')) return Response.json(tokenResponse);
      if (path.endsWith('/validate')) return Response.json(validation);
      return Response.json({ data: [] });
    },
  });
  try {
    await setup.start();
    await until(() => !setup.snapshot().busy);
    assert.match(setup.snapshot().message, /launch overrides/u);
    assert.equal(await readFile(join(root, 'twitch-token.json'), 'utf8'), priorToken);
    await assert.rejects(access(join(root, 'twitch.env')));
  } finally {
    setup.cancel();
    await rm(root, { recursive: true, force: true });
  }
});

test('canceling Twitch setup stops a stalled response even when transport ignores abort', async () => {
  const { root, store } = await fixture();
  let reading = false,
    canceled = false;
  const setup = new TwitchSetup(store, () => assert.fail('No credentials may be saved'), {
    fetch: async () =>
      new Response(
        new ReadableStream({
          pull() {
            reading = true;
          },
          cancel() {
            canceled = true;
            return new Promise(() => {});
          },
        }),
      ),
  });
  try {
    const result = assert.rejects(setup.start(), /could not start/u);
    await until(() => reading);
    setup.cancel();
    await result;
    assert(canceled);
    assert(!setup.snapshot().busy);
    await assert.rejects(access(join(root, 'twitch-token.json')));
  } finally {
    setup.cancel();
    await rm(root, { recursive: true, force: true });
  }
});

test('setup cancellation releases a stalled fetch and discards its late response', async () => {
  const { root, store } = await fixture();
  let resolveFetch!: (response: Response) => void;
  let canceled = false;
  const setup = new TwitchSetup(store, () => assert.fail('No credentials may be saved'), {
    fetch: async () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
  });
  try {
    const result = assert.rejects(setup.start(), /could not start/u);
    await until(() => !!resolveFetch);
    setup.cancel();
    await result;
    assert(!setup.snapshot().busy);
    resolveFetch(
      new Response(
        new ReadableStream({
          cancel() {
            canceled = true;
          },
        }),
      ),
    );
    await until(() => canceled);
    assert.equal(setup.snapshot().activationUrl, undefined);
    await assert.rejects(access(join(root, 'twitch-token.json')));
  } finally {
    setup.cancel();
    await rm(root, { recursive: true, force: true });
  }
});

test('explicit connect cannot race background Twitch authorization', async () => {
  const { root, store } = await fixture();
  store.saveTwitch({ clientId, channel: 'fixture', rewardTitle: 'Ask', rewardCost: 1000 });
  const runtime = new AppRuntime({
    management: store,
    twitchSetupFetch: async () =>
      Response.json({
        device_code: 'private-code',
        user_code: 'ABCD',
        verification_uri: 'https://www.twitch.tv/activate',
        interval: 5,
        expires_in: 120,
      }),
  });
  try {
    await runtime.twitchAction('authorize', {}, new AbortController().signal);
    assert(runtime.twitchSetup?.snapshot().busy);
    assert.throws(() => runtime.connectTwitch(), /Finish or cancel Twitch setup/u);
    assert.equal(runtime.twitch.snapshot().status, 'disconnected');
    assert(!store.twitchConnected);
  } finally {
    runtime.close();
    await rm(root, { recursive: true, force: true });
  }
});

test('conflicting reward overrides reject before contacting Twitch', async () => {
  const { root, store } = await fixture();
  store.saveTwitch({ clientId, channel: 'fixture', rewardTitle: 'Ask', rewardCost: 1000 });
  store.overrides.TWITCH_REWARD_COST = '1000';
  let calls = 0;
  const setup = new TwitchSetup(store, () => assert.fail('Rejected settings must not reconnect'), {
    fetch: async () => {
      calls++;
      throw new Error('No network expected');
    },
  });
  try {
    await assert.rejects(
      setup.reward({ title: 'Ask', cost: 500, cooldown: 60 }, new AbortController().signal),
      /launch overrides/u,
    );
    assert.equal(calls, 0);
    assert.equal(store.twitchConfig()?.rewardCost, 1000);
    assert(!setup.snapshot().busy);
  } finally {
    setup.cancel();
    await rm(root, { recursive: true, force: true });
  }
});

test('Twitch setup rejects oversized streaming responses before reading the remaining body', async () => {
  const { root, store } = await fixture();
  let reads = 0,
    canceled = false;
  const setup = new TwitchSetup(store, () => assert.fail('No credentials may be saved'), {
    fetch: async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            reads++;
            controller.enqueue(new Uint8Array(32769));
          },
          cancel() {
            canceled = true;
          },
        }),
      ),
  });
  try {
    await assert.rejects(setup.start(), /could not start/u);
    assert(canceled);
    assert(reads <= 3, 'Bounded reading must cancel the unending oversized stream');
    assert(!setup.snapshot().busy);
    await assert.rejects(access(join(root, 'twitch-token.json')));
  } finally {
    setup.cancel();
    await rm(root, { recursive: true, force: true });
  }
});

test('Twitch setup explains eligibility and declined or expired authorization without leaking errors', async () => {
  for (const scenario of [
    {
      path: '/custom_rewards',
      status: 403,
      message: 'secret-provider-body',
      expected: /Channel Points/u,
    },
    { path: '/token', status: 400, message: 'access_denied', expected: /declined/u },
    { path: '/token', status: 400, message: 'expired_token', expected: /expired/u },
    { path: '/token', status: 400, message: 'secret-provider-body', expected: /failed/u },
  ]) {
    const { root, store } = await fixture();
    const setup = new TwitchSetup(store, () => assert.fail('No credentials may be saved'), {
      pollMs: 1,
      fetch: async (input) => {
        const path = new URL(String(input)).pathname;
        if (path.endsWith(scenario.path))
          return Response.json({ message: scenario.message }, { status: scenario.status });
        if (path.endsWith('/device'))
          return Response.json({
            device_code: 'private-device-code',
            user_code: 'ABCD',
            verification_uri: 'https://www.twitch.tv/activate',
            interval: 5,
            expires_in: 120,
          });
        if (path.endsWith('/token')) return Response.json(tokenResponse);
        if (path.endsWith('/validate')) return Response.json(validation);
        assert.fail('Unexpected endpoint');
      },
    });
    try {
      await setup.start();
      await until(() => !setup.snapshot().busy);
      assert.match(setup.snapshot().message, scenario.expected);
      assert(!JSON.stringify(setup.snapshot()).includes('secret-provider-body'));
      assert.equal(setup.snapshot().activationUrl, undefined);
      await assert.rejects(access(join(root, 'twitch-token.json')));
    } finally {
      setup.cancel();
      await rm(root, { recursive: true, force: true });
    }
  }
});

test('reward availability follows reply intent/capacity, stream end stops intake and source recovery never replays', async () => {
  let callbacks!: TwitchCallbacks;
  const pauses: boolean[] = [];
  const runtime = new AppRuntime({
    pipeline: testPipeline(),
    settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
    twitch: { clientId, channel: 'fixture', rewardTitle: 'Ask', rewardCost: 1000 },
    redemptionStore: memoryRedemptionStore(),
    twitchTransport: (_config, handlers) => {
      callbacks = handlers;
      return {
        async start() {
          callbacks.connected('reward', true);
        },
        stop() {},
        async isLive() {
          return true;
        },
        async outstanding() {
          return [];
        },
        async status() {
          return 'UNFULFILLED';
        },
        async settle(_reward, _id, target) {
          return target;
        },
        async pauseReward(_reward, paused) {
          pauses.push(paused);
        },
      };
    },
  });
  try {
    runtime.connectTwitch();
    await until(() => runtime.twitch.snapshot().status === 'connected');
    assert(pauses.includes(true));
    const first = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      second = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    runtime.session.poll(first);
    runtime.session.setRepliesEnabled(true);
    await until(() => pauses.at(-1) === false);
    for (let i = 0; i < 3; i++)
      runtime.session.queue.submit('viewer' + i, 'Tyrone: A question', 'event' + i);
    await until(() => pauses.at(-1) === true);
    runtime.session.release(first);
    runtime.session.poll(second);
    assert(runtime.session.queue.snapshot().repliesEnabled);
    assert.equal(runtime.session.queue.snapshot().activeId, null);
    await until(() => pauses.at(-1) === false);
    callbacks.streamChanged(false);
    assert(!runtime.session.repliesRequested);
    callbacks.streamChanged(true);
    assert(!runtime.session.queue.snapshot().repliesEnabled);
    runtime.session.release(second);
    runtime.session.poll(first);
    assert(!runtime.session.queue.snapshot().repliesEnabled);
  } finally {
    runtime.close();
  }
});
