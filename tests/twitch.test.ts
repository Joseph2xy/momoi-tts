import { testCharacters } from './fixtures.ts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RequestQueue } from '../src/queue/request-queue.ts';
import {
  TwitchIntake,
  type RedemptionEvent,
  type TwitchCallbacks,
  type TwitchTransportFactory,
} from '../src/twitch/intake.ts';
import { readTwitchConfig } from '../src/twitch/config.ts';
import { parseSavedToken } from '../src/twitch/token-store.ts';
import { fileRedemptionStore, memoryRedemptionStore } from '../src/twitch/redemption-store.ts';
import { createAppServer } from '../src/app/server.ts';
import type { PlaybackState } from '../src/shared/protocol.ts';

const config = {
  clientId: 'testclient123456',
  channel: 'lacari',
  rewardTitle: 'Ask Tyrone',
  rewardCost: 1000,
};
assert.equal(readTwitchConfig({}), undefined);
assert.equal(
  readTwitchConfig({ TWITCH_CLIENT_ID: config.clientId, TWITCH_CHANNEL: '#Lacari' })?.channel,
  'lacari',
);
assert.throws(() => readTwitchConfig({ TWITCH_CHANNEL: 'lacari' }));
assert.throws(() =>
  readTwitchConfig({
    TWITCH_CLIENT_ID: config.clientId,
    TWITCH_CHANNEL: 'lacari',
    TWITCH_REWARD_COST: '0',
  }),
);
assert.throws(() => parseSavedToken({ token: { accessToken: 'private-token' } }), /Invalid saved/u);
const remote = new Map<string, string>();
const calls: { id: string; target: string }[] = [];
let failUpdates = false;
let rejectStatus: ((error: Error) => void) | undefined;
const sessions: { callbacks: TwitchCallbacks; stopped: boolean; signal?: AbortSignal }[] = [];
const factory: TwitchTransportFactory = (_config, callbacks) => {
  const session = { callbacks, stopped: false, signal: undefined as AbortSignal | undefined };
  sessions.push(session);
  return {
    async start(signal) {
      session.signal = signal;
      callbacks.connected('reward1');
    },
    stop() {
      session.stopped = true;
    },
    async status(_reward, id) {
      if (id === 'stale-error')
        return new Promise<string>((_resolve, reject) => {
          rejectStatus = reject;
        });
      return remote.get(id) ?? 'UNFULFILLED';
    },
    async outstanding() {
      return [...remote]
        .filter(([, status]) => status === 'UNFULFILLED')
        .map(([id]) => ({ id, rewardId: 'reward1' }));
    },
    async settle(_reward, id, target) {
      if (failUpdates) throw new Error('private upstream failure');
      const status = remote.get(id) ?? 'UNFULFILLED';
      if (status !== 'UNFULFILLED') return status;
      calls.push({ id, target });
      remote.set(id, target);
      return target;
    },
  };
};
const flush = async () => {
  for (let n = 0; n < 20; n++) await new Promise<void>((resolve) => setImmediate(resolve));
};
async function until(check: () => boolean) {
  const deadline = Date.now() + 6000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error('Timed out');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
const event = (
  id: string,
  userName = 'viewer',
  input = 'Tyrone: Test question',
): RedemptionEvent => ({
  broadcasterId: '123',
  broadcasterName: 'lacari',
  userName,
  id,
  rewardId: 'reward1',
  input,
  status: 'UNFULFILLED',
  redemptionDate: new Date(),
});
const store = memoryRedemptionStore();
let now = Date.now();
const queue = new RequestQueue({
  pipeline: {
    characters: testCharacters,
    mode: 'demo',
    async generate() {
      return 'Reply';
    },
    async synthesize() {
      return Buffer.from('ID3demo');
    },
  },
  playerReady: () => false,
  play() {},
  stop() {},
  now: () => now,
  settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
});
const intake = new TwitchIntake(config, queue, factory, store);
intake.connect();
intake.connect();
await until(() => intake.snapshot().status === 'connected');
assert.equal(sessions.length, 1);
const callbacks = sessions[0]!.callbacks;
callbacks.redemption({ ...event('wrong-channel'), broadcasterName: 'other' });
callbacks.redemption({ ...event('wrong-reward'), rewardId: 'other' });
callbacks.redemption({ ...event('old-event'), redemptionDate: new Date(0) });
await flush();
assert.equal(queue.snapshot().requests.length, 0);
assert.equal(remote.get('old-event'), 'CANCELED');
callbacks.redemption(event('first'));
callbacks.redemption(event('first'));
await flush();
assert.equal(queue.snapshot().requests.length, 1);
assert.equal(intake.snapshot().accepted, 1);
callbacks.redemption(event('same-viewer', 'VIEWER'));
await flush();
assert.match(intake.snapshot().lastRejection!, /outstanding/u);
assert.equal(remote.get('same-viewer'), 'CANCELED');
callbacks.redemption(event('second', 'bob'));
await flush();
callbacks.redemption(event('overflow', 'carol'));
await flush();
assert.equal(queue.snapshot().waitingIds.length, 2);
assert.equal(remote.get('overflow'), 'CANCELED');
remote.set('first', 'CANCELED');
callbacks.updated({ ...event('first'), status: 'CANCELED' });
await flush();
assert.equal(queue.snapshot().requests[0]?.status, 'removed');
now += 180001;
queue.tick();
await flush();
assert.equal(remote.get('second'), 'CANCELED');
// Empty text is rejected and refunded, without submitting a generation request.
callbacks.redemption(event('empty', 'newviewer', ''));
await flush();
assert.equal(remote.get('empty'), 'CANCELED');
// Missing/unknown personality names and missing questions are refunded through the same durable outcome path.
const requestsBeforeInvalid = queue.snapshot().requests.length;
for (const [id, input] of [
  ['no-personality', 'Question without a name'],
  ['unknown-personality', 'Unknown: Question'],
  ['no-question', 'Tyrone:'],
]) {
  callbacks.redemption(event(id!, 'newviewer', input));
  await flush();
  assert.equal(remote.get(id!), 'CANCELED');
}
assert.equal(queue.snapshot().requests.length, requestsBeforeInvalid);
// A terminal update received while async admission is queued prevents playback.
callbacks.redemption(event('racing', 'race'));
remote.set('racing', 'CANCELED');
callbacks.updated({ ...event('racing', 'race'), status: 'CANCELED' });
await flush();
assert(!queue.snapshot().requests.some((entry) => entry.viewer === 'race'));
// Failed outcome stays pending, then reconciles after reconnect.
failUpdates = true;
callbacks.redemption(event('retry', 'retry', ''));
await flush();
assert.equal(intake.snapshot().pendingUpdates, 1);
assert.match(intake.snapshot().settlementMessage!, /pending/u);
intake.disconnect();
assert(sessions[0]!.stopped);
assert(sessions[0]!.signal?.aborted);
failUpdates = false;
intake.connect();
await until(() => intake.snapshot().status === 'connected');
assert.equal(remote.get('retry'), 'CANCELED');
assert.equal(intake.snapshot().pendingUpdates, 0);
// Automatic retry while staying connected, without a reconnect or manual acknowledgement.
failUpdates = true;
sessions.at(-1)!.callbacks.redemption(event('automatic-retry', 'auto', ''));
await flush();
assert.equal(intake.snapshot().pendingUpdates, 1);
failUpdates = false;
await until(() => remote.get('automatic-retry') === 'CANCELED');
await until(() => intake.snapshot().pendingUpdates === 0);
callbacks.redemption(event('after-stop', 'late'));
callbacks.failed();
await flush();
assert.equal(intake.snapshot().status, 'connected');
assert(!queue.snapshot().requests.some((entry) => entry.viewer === 'late'));
// A failing old network call cannot disconnect a replacement connection.
sessions.at(-1)!.callbacks.redemption(event('stale-error'));
await until(() => !!rejectStatus);
intake.disconnect();
intake.connect();
rejectStatus!(new Error('dummy private upstream error'));
await until(() => intake.snapshot().status === 'connected');
intake.disconnect();

// Completion, active cancellation, late results, restart recovery, and durable outbox.
const root = await mkdtemp(path.join(tmpdir(), 'tyrone-rewards-'));
try {
  const ledger = fileRedemptionStore(pathToFileURL(path.join(root, 'ledger.json')));
  let played: string | undefined;
  let stopped = 0;
  let finishGeneration: ((text: string) => void) | undefined;
  let defer = false;
  const activeQueue = new RequestQueue({
    pipeline: {
      characters: testCharacters,
      mode: 'demo',
      async generate() {
        return defer
          ? new Promise<string>((resolve) => {
              finishGeneration = resolve;
            })
          : 'Reply';
      },
      async synthesize() {
        return Buffer.from('ID3demo');
      },
    },
    playerReady: () => true,
    play(id) {
      played = id;
    },
    stop() {
      stopped++;
    },
    settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
  });
  const active = new TwitchIntake(config, activeQueue, factory, ledger);
  active.connect();
  await until(() => active.snapshot().status === 'connected');
  let cb = sessions.at(-1)!.callbacks;
  cb.redemption(event('complete'));
  await until(() => !!played);
  assert.equal(remote.get('complete'), undefined);
  failUpdates = true;
  activeQueue.playbackEvent(played!, 'ended');
  await until(() => active.snapshot().pendingUpdates === 1);
  await flush();
  let disk = '';
  await until(() => active.snapshot().settlementMessage?.includes('pending') === true);
  disk = await readFile(path.join(root, 'ledger.json'), 'utf8');
  assert(disk.includes('FULFILLED'));
  assert(!disk.includes('Test question'));
  assert(!disk.includes('Reply'));
  active.disconnect();
  failUpdates = false;
  // A new app instance replays no audio and preserves the completed target.
  const freshQueue = new RequestQueue({
    playerReady: () => true,
    play() {
      throw new Error('Must not play');
    },
    stop() {},
  });
  const fresh = new TwitchIntake(config, freshQueue, factory, ledger);
  remote.set('missed-offline', 'UNFULFILLED');
  fresh.connect();
  await until(() => fresh.snapshot().status === 'connected');
  assert.equal(remote.get('complete'), 'FULFILLED');
  assert.equal(remote.get('missed-offline'), 'CANCELED');
  assert.equal(freshQueue.snapshot().requests.length, 0);
  fresh.disconnect();
  active.connect();
  await until(() => active.snapshot().status === 'connected');
  cb = sessions.at(-1)!.callbacks;
  played = undefined;
  defer = true;
  cb.redemption(event('late-provider', 'lateprovider'));
  await until(() => !!finishGeneration);
  remote.set('late-provider', 'CANCELED');
  cb.updated({ ...event('late-provider'), status: 'CANCELED' });
  finishGeneration!('Late reply');
  await flush();
  assert.equal(played, undefined);
  assert(stopped >= 1);
  // Disconnecting a queued/active request cancels it; recovery cannot replay it.
  finishGeneration = undefined;
  cb.redemption(event('disconnect-active', 'disconnect'));
  await until(() => !!finishGeneration);
  active.disconnect();
  finishGeneration!('Another late reply');
  await flush();
  assert.equal(played, undefined);
  active.connect();
  await until(() => active.snapshot().status === 'connected');
  assert.equal(remote.get('disconnect-active'), 'CANCELED');
  active.disconnect();
  activeQueue.stopAndClear();
  assert.equal(calls.filter((call) => call.id === 'complete').length, 1);
} finally {
  await rm(root, { recursive: true, force: true });
}

// HTTP bridge and privacy, with fake transport and no real accounts.
const server = createAppServer({
  twitch: config,
  twitchTransport: factory,
  redemptionStore: memoryRedemptionStore(),
  pipeline: {
    characters: testCharacters,
    mode: 'demo',
    async generate(question) {
      return 'Reply to ' + question;
    },
    async synthesize() {
      return Buffer.from('ID3demo');
    },
  },
});
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  const post = (route: string) =>
    fetch(base + route, { method: 'POST', headers: { Origin: base }, body: '{}' });
  const state = async () => (await (await fetch(base + '/api/state')).json()) as PlaybackState;
  assert.equal((await state()).twitch?.status, 'disconnected');
  assert.equal(
    (await fetch(base + '/api/twitch/connect', { method: 'POST', body: '{}' })).status,
    403,
  );
  await post('/api/twitch/connect');
  await until(() => sessions.at(-1)?.signal !== undefined);
  await flush();
  sessions
    .at(-1)!
    .callbacks.redemption(event('http-message', 'viewer', 'Tyrone: <script>untrusted</script>'));
  await flush();
  assert.equal((await state()).queue?.requests[0]?.question, '<script>untrusted</script>');
  const publicState = JSON.stringify(await state());
  assert(!publicState.includes(config.clientId));
  assert(!publicState.includes('accessToken'));
  await post('/api/twitch/disconnect');
  await flush();
  assert.equal((await state()).queue?.requests[0]?.status, 'removed');
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
console.log(
  'Channel-points intake passed: reward/channel filtering, deduplication, bounds, refunds, moderation cancellation, late results, durable retry/restart recovery, HTTP bridge, and privacy.',
);
