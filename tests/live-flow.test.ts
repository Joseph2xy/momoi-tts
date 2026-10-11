import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AppRuntime } from '../src/app/runtime.ts';
import { SettingsStore } from '../src/app/settings.ts';
import { fileDialogueLog, type DialogueRecord } from '../src/app/dialogue-log.ts';
import { RequestQueue } from '../src/queue/request-queue.ts';
import type { QueuePipeline } from '../src/queue/contracts.ts';
import type {
  RedemptionEvent,
  TwitchCallbacks,
  TwitchTransportFactory,
} from '../src/twitch/intake.ts';
import { memoryRedemptionStore } from './fixtures.ts';
import { testCharacters } from './fixtures.ts';

const player = '12345678-1234-1234-1234-123456789012';
const pipeline: QueuePipeline = {
  characters: testCharacters,
  mode: 'live',
  generation: { provider: 'synthetic', model: 'test' },
  async generate(question) {
    return 'Reply to ' + question;
  },
  async synthesize() {
    return Buffer.from('ID3synthetic');
  },
};
async function until(check: () => boolean) {
  const deadline = Date.now() + 3000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Local flow did not reach the expected state.');
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}
function mockTwitch() {
  const sessions: TwitchCallbacks[] = [];
  const remote = new Map<string, string>();
  let live = true;
  const factory: TwitchTransportFactory = (_config, callbacks) => {
    sessions.push(callbacks);
    return {
      async start() {
        callbacks.connected('reward1', live);
      },
      stop() {},
      async isLive() {
        return live;
      },
      async status(_reward, id) {
        return remote.get(id) ?? 'UNFULFILLED';
      },
      async outstanding() {
        return [...remote]
          .filter(([, status]) => status === 'UNFULFILLED')
          .map(([id]) => ({ id, rewardId: 'reward1' }));
      },
      async settle(_reward, id, target) {
        const result = remote.get(id) ?? 'UNFULFILLED';
        if (result !== 'UNFULFILLED') return result;
        remote.set(id, target);
        return target;
      },
    };
  };
  const event = (id: string, input = 'Tyrone: A question'): RedemptionEvent => ({
    id,
    input,
    userName: id,
    rewardId: 'reward1',
    broadcasterId: '123',
    broadcasterName: 'testchannel',
    status: 'UNFULFILLED',
    redemptionDate: new Date(),
  });
  return {
    factory,
    sessions,
    remote,
    event,
    setLive(value: boolean) {
      live = value;
      sessions.at(-1)!.streamChanged(value);
    },
  };
}

test('normal runtime connects explicitly, logs dialogue durably, and remembers connection with replies off', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tyrone-live-flow-'));
  const fake = mockTwitch();
  const runtimes: AppRuntime[] = [];
  try {
    await writeFile(
      join(dir, 'twitch.env'),
      'TWITCH_CLIENT_ID=dummyclient12345\nTWITCH_CHANNEL=testchannel\n',
    );
    const create = () => {
      const runtime = new AppRuntime({
        management: new SettingsStore({ privateRoot: dir, env: {} }),
        pipeline,
        twitchTransport: fake.factory,
        redemptionStore: memoryRedemptionStore(),
        settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
      });
      runtimes.push(runtime);
      return runtime;
    };
    const app = create();
    assert.equal(fake.sessions.length, 0);
    assert.equal(app.snapshot().twitch.status, 'disconnected');
    app.connectTwitch();
    await until(() => app.snapshot().twitch.status === 'connected');
    assert.equal(app.snapshot().queue?.repliesEnabled, false);
    fake.sessions[0]!.redemption(fake.event('paused'));
    await until(() => fake.remote.get('paused') === 'CANCELED');
    assert.equal(app.snapshot().queue?.requests.length, 0);
    app.session.poll(player);
    app.session.setRepliesEnabled(true);
    const accepted = fake.event('complete', 'Tyrone: <script>literal</script>');
    fake.sessions[0]!.redemption(accepted);
    fake.sessions[0]!.redemption(accepted);
    await until(() => app.session.state.status === 'ready');
    const id = app.session.state.clip!.id;
    // The answer is already on disk before playback completes.
    const beforeCompletion = await readFile(join(dir, 'dialogue.jsonl'), 'utf8');
    assert(beforeCompletion.includes('Reply to <script>literal</script>'));
    assert.equal(app.session.playbackEvent(player, id, 'playing'), 'ok');
    assert.equal(app.session.playbackEvent(player, id, 'ended'), 'ok');
    await until(() => fake.remote.get('complete') === 'FULFILLED');
    fake.sessions[0]!.redemption(fake.event('skip'));
    await until(() => app.session.state.clip?.id !== id && app.session.state.status === 'ready');
    app.session.queue.skip();
    await until(() => fake.remote.get('skip') === 'CANCELED');
    fake.sessions[0]!.redemption(fake.event('stream-end'));
    await until(() => app.session.state.status === 'ready');
    fake.setLive(false);
    await until(() => fake.remote.get('stream-end') === 'CANCELED');
    assert.equal(app.session.state.status, 'stopped');
    fake.sessions[0]!.redemption(fake.event('offline'));
    await until(() => fake.remote.get('offline') === 'CANCELED');
    const logs = (await readFile(join(dir, 'dialogue.jsonl'), 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as DialogueRecord);
    assert.equal(
      logs.filter((record) => record.eventId === 'reward_complete' && record.phase === 'accepted')
        .length,
      1,
    );
    const completed = logs.find(
      (record) => record.eventId === 'reward_complete' && record.phase === 'finished',
    );
    assert(completed && completed.phase === 'finished');
    assert.equal(completed.entry.status, 'completed');
    assert.equal(completed.generation?.provider, 'synthetic');
    assert.match(completed.promptHash, /^[a-f0-9]{64}$/);
    assert(
      logs.some(
        (record) =>
          record.eventId === 'reward_skip' &&
          record.phase === 'finished' &&
          record.entry.status === 'skipped',
      ),
    );
    assert(
      logs.some((record) => record.eventId === 'reward_offline' && record.phase === 'rejected'),
    );
    assert(!JSON.stringify(logs).includes(testCharacters[0]!.prompt));
    assert(!JSON.stringify(app.snapshot()).includes('dummyclient12345'));
    app.close();
    const restarted = create();
    await until(() => restarted.snapshot().twitch.status === 'connected');
    assert.equal(restarted.snapshot().queue?.repliesEnabled, false);
    assert.equal(restarted.snapshot().queue?.requests.length, 0);
    assert.equal(fake.sessions.length, 2);
    restarted.disconnectTwitch();
    restarted.close();
    const disconnected = create();
    assert.equal(disconnected.snapshot().twitch.status, 'disconnected');
    assert.equal(fake.sessions.length, 2);
  } finally {
    runtimes.forEach((runtime) => runtime.close());
    await rm(dir, { recursive: true, force: true });
  }
});

test('dialogue logs survive reopening and capture removed, expired, failed, and late-cancelled work', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'tyrone-log-'));
  try {
    const file = join(dir, 'dialogue.jsonl');
    let now = Date.now();
    let release!: (text: string) => void;
    let played = false;
    const queue = new RequestQueue({
      pipeline: {
        ...pipeline,
        generate: () =>
          new Promise((resolve) => {
            release = resolve;
          }),
      },
      playerReady: () => true,
      play() {
        played = true;
      },
      stop() {},
      now: () => now,
      record: (record) => fileDialogueLog(file).record(record),
      settings: { globalCooldownMs: 0, viewerCooldownMs: 0, waitingExpiryMs: 100 },
    });
    const active = queue.submit('active', 'Tyrone: Test', 'active');
    await until(() => !!release);
    const removed = queue.submit('removed', 'Tyrone: Remove', 'removed');
    queue.remove(removed);
    queue.submit('expired', 'Tyrone: Expire', 'expired');
    now += 101;
    queue.tick();
    queue.cancel(active);
    release('Late reply');
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(played, false);
    queue.setPipeline({
      ...pipeline,
      async generate() {
        throw new Error('private-provider-secret');
      },
    });
    queue.setRepliesEnabled(true);
    queue.submit('failed', 'Tyrone: Fail', 'failed');
    await until(() => queue.snapshot().requests.at(-1)?.status === 'failed');
    const records = (await readFile(file, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    for (const [eventId, status] of [
      ['removed', 'removed'],
      ['expired', 'expired'],
      ['active', 'skipped'],
      ['failed', 'failed'],
    ])
      assert(
        records.some(
          (record) =>
            record.eventId === eventId &&
            record.phase === 'finished' &&
            record.entry.status === status,
        ),
      );
    assert(!JSON.stringify(records).includes('Late reply'));
    assert(!JSON.stringify(records).includes('private-provider-secret'));
    const broken = new AppRuntime({
      pipeline,
      dialogueLog: {
        record() {
          throw new Error('private-path');
        },
      },
    });
    try {
      broken.session.setRepliesEnabled(true);
      broken.session.queue.submit('viewer', 'Tyrone: Test', 'broken');
      assert.equal(broken.snapshot().logging.failed, true);
      broken.session.queue.setRepliesEnabled(false);
      assert.equal(broken.snapshot().queue?.waitingIds.length, 0);
      assert(!JSON.stringify(broken.snapshot()).includes('private-path'));
    } finally {
      broken.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
