import { testCharacters } from './fixtures.ts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { createAppServer } from '../src/app/server.ts';
import type { PlaybackState, PlayerState } from '../src/shared/protocol.ts';
import { PlaybackSession } from '../src/playback/session.ts';
import { AppRuntime } from '../src/app/runtime.ts';

const audio = Buffer.from('ID3synthetic-offline-audio');
const pipeline = {
  characters: testCharacters,
  mode: 'live' as const,
  async generate() {
    return 'Synthetic reply';
  },
  async synthesize() {
    return audio;
  },
};
const flush = async () => {
  for (let n = 0; n < 10; n++) await new Promise<void>((resolve) => setImmediate(resolve));
};
// Application disposal owns cancellation even without an HTTP request or page release.
{
  let finish!: (text: string) => void;
  let speechCalls = 0;
  const runtime = new AppRuntime({
    pipeline: {
      ...pipeline,
      async generate() {
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
      async synthesize() {
        speechCalls++;
        return audio;
      },
    },
  });
  try {
    runtime.session.poll('runtime-owner');
    runtime.session.setRepliesEnabled(true);
    runtime.session.queue.submit('Viewer', 'Tyrone: Cancel on disposal', 'runtime-close');
    await flush();
    runtime.close();
    finish('A late response after application shutdown');
    await flush();
    assert.equal(runtime.snapshot().queue?.repliesEnabled, false);
    assert.equal(runtime.snapshot().queue?.activeId, null);
    assert.equal(runtime.snapshot().queue?.requests[0]?.status, 'skipped');
    assert.equal(runtime.snapshot().clip, null);
    assert.equal(speechCalls, 0);
  } finally {
    runtime.close();
  }
}
// Refresh/close cancels all work and requires explicitly enabling fresh replies.
{
  let finish: ((text: string) => void) | undefined;
  const page = new PlaybackSession({
    pipeline: {
      ...pipeline,
      async generate() {
        return new Promise<string>((resolve) => {
          finish = resolve;
        });
      },
    },
    settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
  });
  page.poll('original');
  page.queue.submit('First', 'Tyrone: Active before refresh', 'refresh-active');
  await flush();
  page.queue.submit('Next', 'Tyrone: Waiting before refresh', 'refresh-waiting');
  page.release('secondary');
  assert.equal(page.queue.snapshot().repliesEnabled, true);
  page.release('original');
  finish!('Late reply after refresh');
  await flush();
  assert.equal(page.queue.snapshot().requests[0]?.status, 'skipped');
  assert.equal(page.state.clip, null);
  assert.equal(page.poll('reopened').primary, true);
  assert.equal(page.queue.snapshot().repliesEnabled, false);
  assert.equal(page.queue.snapshot().activeId, null);
  assert.equal(page.queue.snapshot().waitingIds.length, 0);
  page.release('original');
  assert.equal(page.state.playerConnected, true);
  page.setRepliesEnabled(true);
  page.queue.submit('Fresh', 'Tyrone: Fresh after reconnect', 'refresh-fresh');
  await flush();
  finish!('Reply after enabling fresh replies');
  await flush();
  assert.equal(page.queue.snapshot().requests[2]?.status, 'ready');
  const clip = page.state.clip!;
  page.release('reopened');
  assert.equal(page.playbackEvent('reopened', clip.id, 'playing'), 'stale');
  assert.equal(page.audio(clip.url), null);
  assert.equal(page.queue.snapshot().repliesEnabled, false);
}
// Turning replies off during generation cancels both active and waiting work.
{
  let complete!: (text: string) => void;
  const session = new PlaybackSession({
    pipeline: {
      ...pipeline,
      async generate() {
        return new Promise<string>((resolve) => {
          complete = resolve;
        });
      },
    },
    settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
  });
  session.poll('primary');
  session.queue.submit('First', 'Tyrone: Active', 'off-active');
  await flush();
  session.queue.submit('Next', 'Tyrone: Waiting', 'off-waiting');
  session.setRepliesEnabled(false);
  complete('Late generation must never play');
  await flush();
  assert.equal(session.queue.snapshot().activeId, null);
  assert.deepEqual(session.queue.snapshot().waitingIds, []);
  assert.equal(session.state.clip, null);
  assert.throws(
    () => session.queue.submit('Fresh', 'Tyrone: Rejected', 'off-rejected'),
    /Replies are off/u,
  );
  session.setRepliesEnabled(true);
  assert.equal(session.queue.snapshot().activeId, null);
}

// Turning replies off stops audible speech, removes waiting work and rejects stale events.
{
  const session = new PlaybackSession({
    pipeline,
    settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
  });
  session.poll('playing-owner');
  const id = session.queue.submit('First', 'Tyrone: Speaking', 'off-playing');
  await flush();
  const clip = session.state.clip!;
  assert.equal(session.playbackEvent('playing-owner', id, 'playing'), 'ok');
  session.queue.submit('Next', 'Tyrone: Waiting', 'off-playing-next');
  session.setRepliesEnabled(false);
  assert.equal(session.state.status, 'stopped');
  assert.equal(session.audio(clip.url), null);
  assert.equal(session.playbackEvent('playing-owner', id, 'ended'), 'stale');
  assert.deepEqual(session.queue.snapshot().waitingIds, []);
  session.setRepliesEnabled(true);
  assert.equal(session.queue.snapshot().activeId, null);
}

const server = createAppServer({
  pipeline,
  settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
});
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = 'http://127.0.0.1:' + address.port;
  const post = (route: string, body: unknown) =>
    fetch(base + route, {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const state = async () => (await (await fetch(base + '/api/state')).json()) as PlaybackState;
  const a = randomUUID(),
    b = randomUUID();
  assert.equal((await post('/api/player/release', {})).status, 400);
  assert.equal((await post('/api/player/poll', { session: '-'.repeat(36) })).status, 400);
  assert.equal((await post('/api/replies/off', {})).status, 200);
  assert.equal((await state()).queue?.repliesEnabled, false);
  assert.equal((await post('/api/replies/on', {})).status, 409);
  assert.equal((await state()).queue?.repliesEnabled, false);
  assert.equal((await post('/api/app/quit', {})).status, 409);
  assert.equal((await fetch(base + '/api/queue/skip', { method: 'POST', body: '{}' })).status, 403);
  assert.equal(
    (
      await fetch(base + '/api/queue/skip', {
        method: 'POST',
        headers: { Origin: 'https://example.com' },
        body: '{}',
      })
    ).status,
    403,
  );
  assert.equal((await fetch(base + '/.local/fish.env')).status, 404);
  const primary = (await (await post('/api/player/poll', { session: a })).json()) as PlayerState;
  assert(primary.primary);
  assert.equal((await post('/api/replies/on', {})).status, 200);
  const duplicate = (await (await post('/api/player/poll', { session: b })).json()) as PlayerState;
  assert.equal(duplicate.primary, false);
  assert.equal(duplicate.clip, null);
  await post('/api/requests', { viewer: 'Viewer', question: 'Tyrone: Question', eventId: 'http1' });
  await flush();
  const play = await state();
  assert.equal(play.status, 'ready');
  assert(play.clip);
  const oldId = play.clip.id;
  await post('/api/player/event', { session: a, id: oldId, event: 'playing' });
  await post('/api/player/poll', {
    session: a,
    progress: { id: oldId, elapsedSeconds: 1, durationSeconds: 10 },
  });
  await post('/api/player/poll', {
    session: b,
    progress: { id: oldId, elapsedSeconds: 8, durationSeconds: 10 },
  });
  assert.deepEqual((await state()).progress, { elapsedSeconds: 1, durationSeconds: 10 });
  assert.equal(
    (
      await post('/api/player/poll', {
        session: a,
        progress: { id: oldId, elapsedSeconds: -1, durationSeconds: 10 },
      })
    ).status,
    400,
  );
  const expectedAudio = Buffer.from(audio);
  audio.write('ID3changed');
  assert.deepEqual(
    Buffer.from(await (await fetch(base + play.clip.url)).arrayBuffer()),
    expectedAudio,
  );
  const range = await fetch(base + play.clip.url, { headers: { Range: 'bytes=0-2' } });
  assert.equal(range.status, 206);
  assert.equal(await range.text(), 'ID3');
  assert.equal(
    (await fetch(base + play.clip.url, { headers: { Range: 'bytes=999-1000' } })).status,
    416,
  );
  assert.equal(
    (await post('/api/player/event', { session: b, id: oldId, event: 'playing' })).status,
    409,
  );
  await post('/api/queue/skip', {});
  assert.equal(
    (await post('/api/player/event', { session: a, id: oldId, event: 'playing' })).status,
    409,
  );
  assert.equal((await fetch(base + play.clip.url)).status, 404);
  assert.equal((await state()).progress, null);
  assert.equal((await state()).queue?.repliesEnabled, true); // Skip preserves replies on.
  await post('/api/replies/on', {});
  await post('/api/requests', {
    viewer: 'Viewer',
    question: 'Tyrone: Question again',
    eventId: 'http2',
  });
  await flush();
  const second = await state();
  assert(second.clip);
  assert.notEqual(second.clip.id, oldId);
  await post('/api/settings', { muted: true, volume: 0.35 });
  assert.equal((await state()).muted, true);
  assert.equal((await state()).volume, 0.35);
  await post('/api/player/event', { session: a, id: second.clip.id, event: 'playing' });
  await post('/api/player/event', { session: a, id: second.clip.id, event: 'ended' });
  assert.equal(
    (await post('/api/player/event', { session: a, id: second.clip.id, event: 'ended' })).status,
    200,
  );
  assert.equal(
    (await post('/api/player/event', { session: b, id: second.clip.id, event: 'ended' })).status,
    409,
  );
  assert.equal((await state()).status, 'completed');
  assert.equal((await fetch(base + second.clip.url)).status, 404);
  assert.equal((await post('/api/requests/replay', { id: second.clip.id })).status, 404);
  const completedEntry = (await state()).queue?.requests.at(-1);
  assert(completedEntry);
  assert(!Object.hasOwn(completedEntry, 'replayAvailable'));
  assert(!Object.hasOwn(completedEntry, 'replayOf'));
  await post('/api/requests', {
    viewer: 'Viewer',
    question: 'Tyrone: Disconnect during playback',
    eventId: 'http3',
  });
  await flush();
  const third = await state();
  assert(third.clip);
  assert.notEqual(third.clip.id, second.clip.id);
  await post('/api/player/event', { session: a, id: third.clip.id, event: 'playing' });
  await new Promise((resolve) => setTimeout(resolve, 3200));
  assert.equal((await post('/api/replies/on', {})).status, 409);
  assert.equal((await state()).queue?.repliesEnabled, false);
  const replacement = (await (
    await post('/api/player/poll', { session: b })
  ).json()) as PlayerState;
  assert(replacement.primary);
  assert.equal((await state()).queue?.repliesEnabled, false);
  assert.equal(replacement.status, 'stopped');
  await post('/api/player/release', { session: a });
  assert((await state()).playerConnected);
  await post('/api/player/release', { session: b });
  assert.equal((await state()).playerConnected, false);
  console.log(
    'Offline playback passed: replies off cancellation, late-result discard, skip, player ownership/progress, immutable audio/ranges, unavailable completed audio/replay route, completion retry, and disconnect.',
  );
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}
