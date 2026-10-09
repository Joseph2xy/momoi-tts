import { testCharacters } from './fixtures.ts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { RequestQueue } from '../src/queue/request-queue.ts';
import type { QueuePipeline } from '../src/queue/contracts.ts';
import { createAppServer } from '../src/app/server.ts';
import { subscriptionEnv } from '../src/providers/codex/runtime.ts';
import type { PlaybackState } from '../src/shared/protocol.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
// Speech pause excludes held time from the watchdog, without pausing queue admission.
let pauseClock = 1000,
  pauseCalls = 0;
const pauseQueue = new RequestQueue({
  now: () => pauseClock,
  playerReady: () => true,
  play() {},
  stop() {},
  settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
  pipeline: {
    characters: testCharacters,
    mode: 'demo',
    async generate() {
      pauseCalls++;
      return 'Reply';
    },
    async synthesize() {
      return Buffer.from('ID3demo');
    },
  },
});
const heldId = pauseQueue.submit('Viewer', 'Tyrone: First', 'held-first');
await flush();
pauseQueue.playbackEvent(heldId, 'playing');
pauseQueue.setPlaybackPaused(true);
pauseClock += 300_000;
pauseQueue.tick();
assert.equal(pauseQueue.snapshot().activeId, heldId);
pauseQueue.setPlaybackPaused(false);
pauseQueue.tick();
assert.equal(pauseQueue.snapshot().activeId, heldId);
pauseQueue.playbackEvent(heldId, 'ended');
pauseQueue.pause();
const sameViewerQuestion = pauseQueue.submit('Viewer', 'Tyrone: Second', 'held-second');
const sameViewerReplay = pauseQueue.replay(heldId);
assert.deepEqual(pauseQueue.snapshot().waitingIds, [sameViewerQuestion, sameViewerReplay]);
assert.throws(() => pauseQueue.replay(heldId), /Queue full/u);
pauseQueue.remove(sameViewerQuestion);
// A streamer replay does not prevent the viewer from submitting one new question.
pauseQueue.submit('Viewer', 'Tyrone: Third', 'held-third');
pauseQueue.remove(pauseQueue.snapshot().waitingIds[1]);
pauseQueue.resume();
await flush();
assert.equal(pauseCalls, 1);
pauseQueue.setPlaybackPaused(true);
pauseQueue.skip();
pauseClock += 300_000;
pauseQueue.tick();
assert.equal(pauseQueue.snapshot().activeId, null);
assert.equal(
  pauseQueue.snapshot().requests.find((entry) => entry.id === sameViewerReplay)?.status,
  'skipped',
);
pauseQueue.stopAndClear();
// Skipping before the provider's microtask starts must avoid the call altogether.
let prematureCalls = 0;
const cancelledBeforeStart = new RequestQueue({
  playerReady: () => true,
  play() {},
  stop() {},
  pipeline: {
    characters: testCharacters,
    mode: 'demo',
    async generate() {
      prematureCalls++;
      return 'Unused reply';
    },
    async synthesize() {
      prematureCalls++;
      return Buffer.from('Unused');
    },
  },
});
cancelledBeforeStart.submit('Viewer', 'Tyrone: Cancel immediately', 'cancel-before-start');
cancelledBeforeStart.skip();
await flush();
assert.equal(prematureCalls, 0);
const generators: Array<{ signal: AbortSignal; task: ReturnType<typeof deferred<string>> }> = [];
const speakers: Array<{ signal: AbortSignal; task: ReturnType<typeof deferred<Buffer>> }> = [];
const plays: string[] = [];
const pipeline: QueuePipeline = {
  characters: testCharacters,
  mode: 'demo',
  generate(_question, signal) {
    const task = deferred<string>();
    generators.push({ signal, task });
    return task.promise;
  },
  synthesize(_dialogue, signal) {
    const task = deferred<Buffer>();
    speakers.push({ signal, task });
    return task.promise;
  },
};
let now = 1000;
let ready = true;
const audio = Buffer.from('ID3synthetic-queue-audio');
const queue = new RequestQueue({
  pipeline,
  now: () => now,
  settings: { viewerCooldownMs: 0, globalCooldownMs: 0, waitingExpiryMs: 5000 },
  playerReady: () => ready,
  play(id) {
    plays.push(id);
    ready = false;
  },
  stop() {
    ready = true;
  },
});
const status = (id: string) => queue.snapshot().requests.find((entry) => entry.id === id)?.status;
const finish = (id: string) => {
  queue.playbackEvent(id, 'playing');
  ready = true;
  queue.playbackEvent(id, 'ended');
};

const a = queue.submit('Alice', 'Tyrone: Question A', 'event-a');
await flush();
const b = queue.submit('Bob', 'Tyrone: Question B', 'event-b');
const c = queue.submit('Carol', 'Tyrone: Question C', 'event-c');
assert.equal(queue.snapshot().activeId, a);
assert.equal(queue.snapshot().waitingIds.length, 2);
assert.equal(queue.submit('Alice', 'Tyrone: Question A', 'event-a'), a);
assert.throws(() => queue.submit('Dave', 'Tyrone: Question D', 'event-d'), /Queue full/u);
assert.throws(() => queue.submit('ALICE', 'Tyrone: Another question', 'event-a2'), /outstanding/u);
assert.equal(generators.length, 1);
queue.skip();
await flush();
assert(generators[0]!.signal.aborted);
assert.equal(status(a), 'skipped');
assert.equal(queue.snapshot().activeId, b);
generators[0]!.task.resolve('A late result must never play.');
await flush();
assert.equal(speakers.length, 0);
generators[1]!.task.resolve('Reply B');
await flush();
queue.pause();
speakers[0]!.task.resolve(audio);
await flush();
assert.deepEqual(plays, [b]);
assert.equal(status(b), 'ready');
finish(b);
await flush();
assert.equal(status(b), 'completed');
assert.equal(generators.length, 2);
assert.equal(status(c), 'waiting');
const queuedReplay = queue.replay(b);
assert.equal(queue.snapshot().waitingIds.length, 2);
queue.resume();
await flush();
assert.equal(queue.snapshot().activeId, c);
queue.clear();
assert.equal(status(queuedReplay), 'removed');
assert.equal(status(c), 'generating');
queue.skip();
generators[2]!.task.resolve('C late reply');
await flush();
assert.equal(plays.length, 1);
const replay = queue.replay(b);
await flush();
assert.equal(generators.length, 3);
assert.equal(speakers.length, 1);
assert.equal(plays.at(-1), replay);
finish(replay);

const d = queue.submit('Dave', 'Tyrone: Failure test', 'event-fail');
await flush();
const e = queue.submit('Eve', 'Tyrone: Following failure', 'event-follow');
generators[3]!.task.resolve('Reply D');
await flush();
speakers[1]!.task.reject(new Error('PRIVATE_PROVIDER_SECRET'));
await flush();
assert.equal(status(d), 'failed');
assert.equal(queue.snapshot().activeId, e);
assert(!JSON.stringify(queue.snapshot()).includes('PRIVATE_PROVIDER_SECRET'));
queue.disconnect();
assert.equal(queue.snapshot().paused, true);
assert.equal(status(e), 'skipped');
generators[4]!.task.resolve('E late reply');
await flush();
const f = queue.submit('Frank', 'Tyrone: Expiry test', 'event-expire');
now += 5001;
queue.tick();
assert.equal(status(f), 'expired');

queue.resume();
const h = queue.submit('Hank', 'Tyrone: Speech cancellation', 'event-h');
await flush();
generators[5]!.task.resolve('Reply H');
await flush();
const i = queue.submit('Ivy', 'Tyrone: Cleared waiting request', 'event-i');
queue.stopAndClear();
assert.equal(status(h), 'skipped');
assert.equal(status(i), 'removed');
assert(speakers[2]!.signal.aborted);
const beforeLateSpeech = plays.length;
speakers[2]!.task.resolve(audio);
await flush();
assert.equal(plays.length, beforeLateSpeech);
queue.resume();
let lastReplay = replay;
for (let index = 0; index < 25; index++) {
  lastReplay = queue.replay(lastReplay);
  await flush();
  finish(lastReplay);
}
assert(queue.snapshot().requests.length <= 23);
assert(queue.snapshot().requests.filter((entry) => entry.replayAvailable).length <= 5);
assert.equal(generators.length, 6);
assert.equal(speakers.length, 3);

const limited = new RequestQueue({
  pipeline,
  now: () => now,
  playerReady: () => false,
  play() {},
  stop() {},
});
const limitedA = limited.submit('Alice', 'Tyrone: Cooldown test', 'limit-a');
assert.throws(() => limited.submit('Bob', 'Tyrone: Cooldown test', 'limit-b'), /Cooldown/u);
limited.remove(limitedA);
now += 1001;
assert.throws(() => limited.submit('Alice', 'Tyrone: Cooldown test', 'limit-a2'), /Cooldown/u);
now += 10_000;
limited.submit('Alice', 'Tyrone: Cooldown test', 'limit-a3');
assert.throws(() => limited.submit('Bob', '', 'bad-input'), /Question/u);
limited.stopAndClear();
const keyBefore = process.env.FISH_API_KEY;
process.env.FISH_API_KEY = 'dummy-should-not-reach-codex';
try {
  assert(!Object.hasOwn(subscriptionEnv(), 'FISH_API_KEY'));
} finally {
  if (keyBefore === undefined) delete process.env.FISH_API_KEY;
  else process.env.FISH_API_KEY = keyBefore;
}
const timed = queue.submit('Timer', 'Tyrone: Request timeout', 'event-timeout');
await flush();
now += 180_001;
queue.tick();
assert.equal(status(timed), 'failed');
assert(generators[6]!.signal.aborted);
const playCountAtTimeout = plays.length;
generators[6]!.task.resolve('Late timeout result');
await flush();
assert.equal(plays.length, playCountAtTimeout);

// Exercise the HTTP routes and queue-to-player bridge with synthetic providers.
let generated = 0,
  spoken = 0;
const server = createAppServer({
  settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
  pipeline: {
    characters: testCharacters,
    mode: 'demo',
    async generate(question) {
      generated++;
      return `Synthetic reply: ${question}`;
    },
    async synthesize() {
      spoken++;
      return audio;
    },
  },
});
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown) =>
    fetch(`${base}${route}`, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const state = async () => (await (await fetch(`${base}/api/state`)).json()) as PlaybackState;
  const session = '12345678-1234-1234-1234-123456789012';
  await post('/api/player/poll', { session });
  await post('/api/requests', {
    viewer: '<img src=x onerror=alert(1)>',
    question: 'Tyrone: <script>untrusted</script>',
    eventId: 'http-a',
  });
  await flush();
  const first = await state();
  assert.equal(first.status, 'ready');
  assert(first.clip);
  assert.equal(first.queue?.requests[0]?.dialogue, 'Synthetic reply: <script>untrusted</script>');
  assert.equal((await fetch(`${base}${first.clip.url}`)).headers.get('Content-Type'), 'audio/mpeg');
  await post('/api/playback/pause', {});
  await post('/api/requests', {
    viewer: 'Bob',
    question: 'Tyrone: Next question',
    eventId: 'http-b',
  });
  await post('/api/requests', {
    viewer: 'Bob',
    question: 'Tyrone: Next question',
    eventId: 'http-b',
  });
  await post('/api/player/event', { session, id: first.clip.id, event: 'playing' });
  await post('/api/player/event', { session, id: first.clip.id, event: 'ended' });
  assert.equal((await state()).queue?.waitingIds.length, 1);
  assert.equal(generated, 1);
  assert.equal(spoken, 1);
  await post('/api/playback/resume', {});
  await flush();
  assert.equal(generated, 2);
  assert.equal(spoken, 2);
  await post('/api/queue/stop', {});
  assert.equal((await state()).queue?.activeId, null);
  assert.equal((await state()).queue?.paused, true);
  assert.equal(
    (await post('/api/player/event', { session, id: first.clip.id, event: 'ended' })).status,
    409,
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  queue.stopAndClear();
}
console.log(
  'Queue checks passed: bounds, viewer limits, duplicate events, cooldowns, expiry, sequential playback, pause/resume, remove/clear, stop, late generation/TTS discard, failure recovery, disconnect, cached replay, bounded history/cache, and HTTP/player integration. Simulated providers only.',
);
