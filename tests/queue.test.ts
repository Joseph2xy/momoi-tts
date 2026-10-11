import { testCharacters } from './fixtures.ts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { RequestQueue } from '../src/queue/request-queue.ts';
import type { QueuePipeline } from '../src/queue/contracts.ts';
import { createAppServer } from '../src/app/server.ts';
import type { PlaybackState } from '../src/shared/protocol.ts';
import { SpeechFailure, OperationTimeoutError } from '../src/shared/errors.ts';

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

// Integration completion callbacks can synchronously cancel other requests.
// Detach terminal jobs before notifying so every request finishes exactly once.
{
  let clock = 0;
  const reentrantQueue = new RequestQueue({
    pipeline: {
      characters: testCharacters,
      mode: 'live',
      async generate() {
        return 'Reply';
      },
      async synthesize() {
        return Buffer.from('ID3fixture');
      },
    },
    now: () => clock,
    playerReady: () => false,
    play() {},
    stop() {},
    settings: { viewerCooldownMs: 0, globalCooldownMs: 0, waitingExpiryMs: 1000 },
  });
  const first = reentrantQueue.submit('First', 'Tyrone: First', 'reentrant-clear-first');
  const second = reentrantQueue.submit('Second', 'Tyrone: Second', 'reentrant-clear-second');
  const finished: string[] = [];
  let cancelledAgain = false;
  const unsubscribe = reentrantQueue.onFinished((entry) => {
    finished.push(entry.id);
    if (entry.id === first && !cancelledAgain) {
      cancelledAgain = true;
      reentrantQueue.cancel(first);
    }
  });
  reentrantQueue.clear();
  assert.deepEqual(finished, [first, second]);
  assert(reentrantQueue.snapshot().requests.every((entry) => entry.status === 'removed'));
  unsubscribe();

  const expires = reentrantQueue.submit('First', 'Tyrone: Expires', 'reentrant-expiry-first');
  clock = 500;
  const waiting = reentrantQueue.submit('Second', 'Tyrone: Waiting', 'reentrant-expiry-second');
  reentrantQueue.onFinished((entry) => {
    finished.push(entry.id);
    if (entry.id === expires) reentrantQueue.clear();
  });
  clock = 1001;
  reentrantQueue.tick();
  assert.deepEqual(finished, [first, second, expires, waiting]);
  assert.equal(
    reentrantQueue.snapshot().requests.find((entry) => entry.id === expires)?.status,
    'expired',
  );
  assert.equal(
    reentrantQueue.snapshot().requests.find((entry) => entry.id === waiting)?.status,
    'removed',
  );
  assert.deepEqual(reentrantQueue.snapshot().waitingIds, []);
}
{
  const completionQueue = new RequestQueue({
    pipeline: {
      characters: testCharacters,
      mode: 'live',
      async generate() {
        return 'Reply';
      },
      async synthesize() {
        return Buffer.from('ID3fixture');
      },
    },
    playerReady: () => true,
    play() {},
    stop() {},
  });
  const finished: string[] = [];
  completionQueue.onFinished((entry) => {
    finished.push(entry.status);
    completionQueue.disconnect();
  });
  const id = completionQueue.submit('Viewer', 'Tyrone: Complete once', 'reentrant-complete');
  await flush();
  completionQueue.playbackEvent(id, 'playing');
  completionQueue.playbackEvent(id, 'ended');
  assert.deepEqual(finished, ['completed']);
  assert.equal(completionQueue.snapshot().requests[0]?.status, 'completed');
  assert.equal(completionQueue.snapshot().activeId, null);
}
// Show only application-owned speech diagnostics, including in durable records.
for (const failure of [
  new SpeechFailure('http', 402),
  new SpeechFailure('timeout'),
  new OperationTimeoutError(),
  new Error('Fish Audio PRIVATE_SECRET'),
]) {
  const records: unknown[] = [];
  const expected =
    failure instanceof SpeechFailure
      ? failure.publicMessage
      : failure instanceof OperationTimeoutError
        ? 'Speech generation timed out.'
        : 'Speech generation failed.';
  failure.message = 'PRIVATE_SECRET';
  const diagnosticQueue = new RequestQueue({
    pipeline: {
      characters: testCharacters,
      mode: 'live',
      async generate() {
        return 'Voice check';
      },
      async synthesize() {
        throw failure;
      },
    },
    playerReady: () => true,
    play() {
      assert.fail('Failed speech must never play.');
    },
    stop() {},
    record(record) {
      records.push(record);
    },
  });
  const id = diagnosticQueue.submit('Viewer', 'Tyrone: Voice check', 'diagnostic');
  await flush();
  const entry = diagnosticQueue.snapshot().requests.find((item) => item.id === id);
  assert.equal(entry?.status, 'failed');
  assert.equal(entry?.error, expected);
  assert(!JSON.stringify([diagnosticQueue.snapshot(), records]).includes('PRIVATE_SECRET'));
  diagnosticQueue.setRepliesEnabled(false);
}
// Replies off cancels work and rejects fresh intake; enabling starts with an empty queue.
const offQueue = new RequestQueue({
  pipeline: {
    characters: testCharacters,
    mode: 'live',
    async generate() {
      return 'Reply';
    },
    async synthesize() {
      return Buffer.from('ID3fixture');
    },
  },
  playerReady: () => true,
  play() {},
  stop() {},
  settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
});
const offActive = offQueue.submit('First', 'Tyrone: Active', 'off-active');
await flush();
const offWaiting = offQueue.submit('Next', 'Tyrone: Waiting', 'off-waiting');
offQueue.setRepliesEnabled(false);
assert.equal(offQueue.snapshot().activeId, null);
assert.deepEqual(offQueue.snapshot().waitingIds, []);
assert.equal(
  offQueue.snapshot().requests.find((entry) => entry.id === offActive)?.status,
  'skipped',
);
assert.equal(
  offQueue.snapshot().requests.find((entry) => entry.id === offWaiting)?.status,
  'removed',
);
assert.throws(() => offQueue.submit('Fresh', 'Tyrone: Off', 'off-rejected'), /Replies are off/u);
offQueue.setRepliesEnabled(true);
assert.equal(offQueue.snapshot().activeId, null);
const freshId = offQueue.submit('Fresh', 'Tyrone: On', 'off-fresh');
await flush();
assert.equal(offQueue.snapshot().activeId, freshId);
offQueue.setRepliesEnabled(false);
// Skipping before the provider's microtask starts must avoid the call altogether.
let prematureCalls = 0;
const cancelledBeforeStart = new RequestQueue({
  playerReady: () => true,
  play() {},
  stop() {},
  pipeline: {
    characters: testCharacters,
    mode: 'live',
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
  mode: 'live',
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
speakers[0]!.task.resolve(audio);
await flush();
assert.deepEqual(plays, [b]);
assert.equal(status(b), 'ready');
finish(b);
await flush();
assert.equal(status(b), 'completed');
assert.equal(generators.length, 3);
assert.equal(status(c), 'generating');
const clearedWaiting = queue.submit('Waiting', 'Tyrone: Clear this question', 'event-clear');
assert.equal(queue.snapshot().waitingIds.length, 1);
queue.setRepliesEnabled(true);
await flush();
assert.equal(queue.snapshot().activeId, c);
queue.clear();
assert.equal(status(clearedWaiting), 'removed');
assert.equal(status(c), 'generating');
queue.skip();
generators[2]!.task.resolve('C late reply');
await flush();
assert.equal(plays.length, 1);

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
assert.equal(queue.snapshot().repliesEnabled, false);
assert.equal(status(e), 'skipped');
generators[4]!.task.resolve('E late reply');
await flush();
queue.setRepliesEnabled(true);
ready = false;
const f = queue.submit('Frank', 'Tyrone: Expiry test', 'event-expire');
now += 5001;
queue.tick();
assert.equal(status(f), 'expired');
ready = true;

queue.setRepliesEnabled(true);
const h = queue.submit('Hank', 'Tyrone: Speech cancellation', 'event-h');
await flush();
generators[5]!.task.resolve('Reply H');
await flush();
const i = queue.submit('Ivy', 'Tyrone: Cleared waiting request', 'event-i');
queue.setRepliesEnabled(false);
assert.equal(status(h), 'skipped');
assert.equal(status(i), 'removed');
assert(speakers[2]!.signal.aborted);
const beforeLateSpeech = plays.length;
speakers[2]!.task.resolve(audio);
await flush();
assert.equal(plays.length, beforeLateSpeech);
queue.setRepliesEnabled(true);
const historyQueue = new RequestQueue({
  pipeline: {
    characters: testCharacters,
    mode: 'live',
    async generate() {
      return 'Synthetic history reply';
    },
    async synthesize() {
      return audio;
    },
  },
  playerReady: () => true,
  play() {},
  stop() {},
  settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
});
for (let index = 0; index < 25; index++) {
  const id = historyQueue.submit('Viewer', 'Tyrone: History question', `history-${index}`);
  await flush();
  historyQueue.playbackEvent(id, 'playing');
  historyQueue.playbackEvent(id, 'ended');
}
assert.equal(historyQueue.snapshot().requests.length, 23);
assert(historyQueue.snapshot().requests.every((entry) => entry.status === 'completed'));
historyQueue.setRepliesEnabled(false);
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
limited.setRepliesEnabled(false);
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
    mode: 'live',
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
  await post('/api/replies/on', {});
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
  assert.equal((await state()).queue?.waitingIds.length, 1);
  await post('/api/player/event', { session, id: first.clip.id, event: 'playing' });
  await post('/api/player/event', { session, id: first.clip.id, event: 'ended' });
  await flush();
  assert.equal(generated, 2);
  assert.equal(spoken, 2);
  await post('/api/replies/off', {});
  assert.equal((await state()).queue?.activeId, null);
  assert.equal((await state()).queue?.repliesEnabled, false);
  assert.equal(
    (await post('/api/player/event', { session, id: first.clip.id, event: 'ended' })).status,
    409,
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  queue.setRepliesEnabled(false);
}
console.log(
  'Queue checks passed: bounds, viewer limits, duplicate events, cooldowns, expiry, sequential playback, replies on/off, remove/clear, stop, late generation/TTS discard, failure recovery, disconnect, bounded read-only history, and HTTP/player integration. Simulated providers only.',
);
