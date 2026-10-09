import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { SettingsStore } from '../src/app/settings.ts';
import { createAppServer } from '../src/app/server.ts';
import { RequestQueue } from '../src/queue/request-queue.ts';
import { testCharacters } from './fixtures.ts';
import type { QueuePipeline } from '../src/queue/contracts.ts';
const dir = await mkdtemp(join(tmpdir(), 'tyrone-management-'));
try {
  await writeFile(join(dir, 'fish.env'), '# Existing settings\nFISH_EXTRA_VOICE_ID=keep-me\n');
  const store = new SettingsStore({ privateRoot: dir, env: {} });
  assert.equal(store.snapshot().localReady, false);
  assert.equal(store.pipeline(), undefined);
  store.save('generation', {
    provider: 'openrouter',
    model: 'test/model:free',
    key: 'dummy-private-generation',
    maxTokens: 1024,
  });
  store.save('speech', { key: 'dummy-private-speech' });
  store.save('characters', { voices: { tyrone: '0123456789abcdef0123456789abcdef' } });
  assert.equal(store.snapshot().localReady, true);
  const publicState = JSON.stringify(store.snapshot());
  for (const secret of [
    'dummy-private-generation',
    'dummy-private-speech',
    '0123456789abcdef0123456789abcdef',
  ])
    assert(!publicState.includes(secret));
  assert((await readFile(join(dir, 'fish.env'), 'utf8')).includes('FISH_EXTRA_VOICE_ID=keep-me'));
  const previous = await readFile(join(dir, 'generation.env'), 'utf8');
  assert.throws(() =>
    store.save('generation', {
      provider: 'openrouter',
      model: 'test/new:free',
      key: 'new-key',
      maxTokens: 2,
    }),
  );
  assert.equal(await readFile(join(dir, 'generation.env'), 'utf8'), previous);
  store.save('generation', {
    provider: 'openrouter',
    model: 'test/new:free',
    key: '',
    maxTokens: 2048,
  });
  assert.equal(
    new SettingsStore({ privateRoot: dir, env: {} }).snapshot().generation.model,
    'test/new:free',
  );
  assert(
    (await readFile(join(dir, 'generation.env'), 'utf8')).includes('dummy-private-generation'),
  );
  const override = new SettingsStore({
    privateRoot: dir,
    env: { OPENROUTER_MODEL: 'test/override:free' },
  });
  override.save('generation', {
    provider: 'openrouter',
    model: 'test/saved:free',
    key: '',
    maxTokens: 1024,
  });
  assert.equal(override.snapshot().generation.model, 'test/override:free');
  assert(override.snapshot().overrides.includes('OPENROUTER_MODEL'));
  store.save('playback', { volume: 37 });
  assert.equal(new SettingsStore({ privateRoot: dir, env: {} }).volume, 0.37);
  assert.equal(
    new SettingsStore({ privateRoot: dir, env: { TYRONE_PLAYBACK_PORT: '3219' } }).port,
    3219,
  );
  const appBefore = await readFile(join(dir, 'app.json'), 'utf8');
  assert.throws(() => store.save('application', { port: 3219 }));
  assert.equal(await readFile(join(dir, 'app.json'), 'utf8'), appBefore);
  const codex = new SettingsStore({ privateRoot: dir, env: { TYRONE_TEXT_PROVIDER: 'codex' } });
  await assert.rejects(
    codex.checkConnection('generation', (async () => {
      throw new Error('Codex has no API-key connection check');
    }) as typeof fetch),
    /Check prerequisites/,
  );
  let calls = 0;
  const checked = await store.checkConnection('generation', (async (_url, init) => {
    calls++;
    assert.equal(init?.method, 'GET');
    assert.equal(
      new Headers(init?.headers).get('Authorization'),
      'Bearer dummy-private-generation',
    );
    return new Response('{"label":"sensitive-account-data"}', { status: 200 });
  }) as typeof fetch);
  assert.equal(calls, 1);
  assert(checked.ok);
  assert(!JSON.stringify(checked).includes('sensitive-account-data'));
  const failed = await store.checkConnection('speech', (async () => {
    throw new Error('dummy-private-speech');
  }) as typeof fetch);
  assert(!failed.ok);
  assert(!JSON.stringify(failed).includes('dummy-private-speech'));

  const demo = new SettingsStore({ privateRoot: dir, env: {}, demo: true });
  await demo.checkConnection('speech', (async () => {
    throw new Error('Demo must not call a provider');
  }) as typeof fetch);
  let restarted = 0;
  const server = createAppServer({
    pipeline: demo.pipeline(),
    management: demo,
    settings: { globalCooldownMs: 0, viewerCooldownMs: 0 },
    onRestart: () => {
      restarted++;
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const post = (route: string, body: unknown, origin = base) =>
    fetch(base + route, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  try {
    assert.equal(
      (await post('/api/config/speech', { key: 'new-private-key' }, 'https://evil.example')).status,
      403,
    );
    assert.equal((await post('/api/config/unexpected', {})).status, 404);
    assert.equal(
      (await post('/api/app/setup-action', { action: 'arbitrary-command', confirmed: true }))
        .status,
      404,
    );
    assert.equal((await post('/api/app/setup-action', { action: 'install-codex' })).status, 404);
    const result = await post('/api/config/speech', { key: 'new-private-key' });
    assert.equal(result.status, 200);
    assert(!(await result.text()).includes('new-private-key'));
    const initial = await (await fetch(base + '/api/state')).json();
    assert.equal(initial.queue.paused, true);
    assert.equal(initial.twitch.status, 'disabled');
    const session = '12345678-1234-1234-1234-123456789012';
    await post('/api/player/poll', { session });
    await post('/api/playback/resume', {});
    await post('/api/requests', {
      viewer: 'One',
      question: 'Tyrone: Keep original settings',
      eventId: 'settings-one',
    });
    await post('/api/requests', {
      viewer: 'Two',
      question: 'Tyrone: Waiting survives',
      eventId: 'settings-two',
    });
    const save = await (
      await post('/api/config/generation', {
        provider: 'openrouter',
        model: 'test/next:free',
        key: '',
        maxTokens: 1024,
      })
    ).json();
    assert.equal(save.management.pending, true);
    assert.equal(save.queue.waitingIds.length, 1);
    assert.equal((await post('/api/app/restart', {})).status, 409);
    assert.equal(restarted, 0);
    assert.equal((await post('/api/app/restart', { confirmed: true })).status, 200);
    assert.equal(restarted, 1);
    const after = await (await fetch(base + '/api/state')).json();
    assert.equal(after.queue.paused, true);
    assert.equal(after.queue.waitingIds.length, 0);
    assert.equal(after.queue.activeId, null);
    const response = await (
      await post('/api/test/response', { question: 'Tyrone: Demo question' })
    ).json();
    assert(response.dialogue.includes('Simulated Tyrone'));
    const voice = await post('/api/test/voice', { character: 'tyrone', eventId: 'voice-test' });
    assert.equal(voice.status, 200);
    const beforeRefresh = (await (await fetch(base + '/api/state')).json()).management.revision;
    const refreshed = await (await post('/api/app/refresh-profiles', {})).json();
    assert(refreshed.management.revision > beforeRefresh);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // Changing providers during generation must retain the original synthesis adapter.
  let finish!: (s: string) => void;
  const spoken: string[] = [];
  const old: QueuePipeline = {
    mode: 'live',
    characters: testCharacters,
    generate: () =>
      new Promise((r) => {
        finish = r;
      }),
    async synthesize(text, _signal, c) {
      spoken.push(`old:${text}:${c.voiceId}`);
      return Buffer.from('audio');
    },
  };
  const next: QueuePipeline = {
    mode: 'live',
    characters: testCharacters.map((c) => ({ ...c, voiceId: 'abcdef0123456789abcdef0123456789' })),
    async generate() {
      return 'Next reply';
    },
    async synthesize(text, _signal, c) {
      spoken.push(`next:${text}:${c.voiceId}`);
      return Buffer.from('audio');
    },
  };
  const queue = new RequestQueue({
    pipeline: old,
    playerReady: () => true,
    play() {},
    stop() {},
    settings: { globalCooldownMs: 0, viewerCooldownMs: 0 },
  });
  const first = queue.submit('One', 'Tyrone: First', 'first');
  await new Promise((r) => setTimeout(r, 0));
  queue.submit('Two', 'Tyrone: Second', 'second');
  queue.setPipeline(next);
  finish('Original reply');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(spoken.length, 1);
  assert(spoken[0]!.startsWith('old:Original reply:'));
  queue.playbackEvent(first, 'playing');
  queue.playbackEvent(first, 'ended');
  await new Promise((r) => setTimeout(r, 10));
  assert(spoken[1]!.startsWith('next:Next reply:abcdef'));
  queue.stopAndClear();
  console.log(
    'Browser management passed: private persistence, rejected-save recovery, environment precedence, redacted checks, demo isolation, removed installer route, pending settings, restart cancellation, explicit test separation, and whole-request adapter snapshots. No live providers or installations.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
