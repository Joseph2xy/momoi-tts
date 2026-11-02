import { testPipeline } from './pipeline-fixture.ts';
import { configuredPipeline, checkConnection } from '../src/app/provider-actions.ts';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { SettingsStore } from '../src/app/settings.ts';
import { createAppServer } from '../src/app/server.ts';
import { AppRuntime } from '../src/app/runtime.ts';
import { RequestQueue } from '../src/queue/request-queue.ts';
import { testCharacters } from './fixtures.ts';
import type { QueuePipeline } from '../src/queue/contracts.ts';
const dir = await mkdtemp(join(tmpdir(), 'tyrone-management-'));
try {
  await writeFile(join(dir, 'fish.env'), '# Existing settings\nFISH_EXTRA_VOICE_ID=keep-me\n');
  const store = new SettingsStore({ privateRoot: dir, env: {} });
  assert.equal(store.snapshot().localReady, false);
  assert.equal(store.snapshot().setupSeen, false);
  assert.equal(store.snapshot().speech.model, 's2.1-pro-free');
  assert.equal(configuredPipeline(store), undefined);
  store.save('generation', {
    provider: 'openrouter',
    model: 'test/model:free',
    key: 'dummy-private-generation',
    maxTokens: 1024,
  });
  store.save('speech', { key: 'dummy-private-speech' });
  const initialTestRevision = store.snapshot().testRevision;
  assert.match(initialTestRevision!, /^[a-f0-9-]{36}$/u);
  store.save('speech', { key: 'dummy-private-speech' });
  assert.notEqual(
    store.snapshot().testRevision,
    initialTestRevision,
    'Even replacement with an identical key invalidates previous browser test evidence.',
  );
  assert.equal(store.snapshot().speech.model, 's2.1-pro-free');
  store.save('speech', { key: '', model: 's2.1-pro' });
  store.save('speech', { key: '' });
  assert.equal(
    store.snapshot().speech.model,
    's2.1-pro',
    'Saving a key retains an explicit speech model.',
  );
  assert.equal(
    new SettingsStore({ privateRoot: dir, env: {} }).snapshot().speech.model,
    's2.1-pro',
  );
  const speechBeforeInvalid = await readFile(join(dir, 'fish.env'), 'utf8');
  const testsBeforeInvalid = store.snapshot().testRevision;
  assert.throws(() => store.save('speech', { key: '', model: 'misspelled-model' }));
  assert.equal(store.snapshot().testRevision, testsBeforeInvalid);
  assert.equal(await readFile(join(dir, 'fish.env'), 'utf8'), speechBeforeInvalid);
  store.saveCharacter('tyrone', {
    prompt: store.characterEditor('tyrone').prompt,
    voiceId: '0123456789abcdef0123456789abcdef',
  });
  assert.notEqual(store.snapshot().testRevision, testsBeforeInvalid);
  const testsBeforeReload = store.snapshot().testRevision;
  store.refreshProfiles();
  assert.notEqual(store.snapshot().testRevision, testsBeforeReload);
  assert.equal(store.snapshot().localReady, true);
  assert.equal(
    store.snapshot().setupSeen,
    false,
    'Saving provider setup does not silently finish onboarding.',
  );
  const testsBeforeAppSave = store.snapshot().testRevision;
  store.save('application', { setupSeen: true });
  assert.equal(store.snapshot().testRevision, testsBeforeAppSave);
  assert.notEqual(
    new SettingsStore({ privateRoot: dir, env: {} }).snapshot().testRevision,
    testsBeforeAppSave,
    'Restarted settings require fresh browser test evidence.',
  );
  assert.equal(new SettingsStore({ privateRoot: dir, env: {} }).snapshot().setupSeen, true);
  assert.equal(
    new SettingsStore({ privateRoot: dir, env: {} }).proof('a'.repeat(64)),
    store.proof('a'.repeat(64)),
    'Completing first-time setup must preserve the same launcher proof after reloading settings.',
  );
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
  const testsBeforeGeneration = store.snapshot().testRevision;
  store.save('generation', {
    provider: 'openrouter',
    model: 'test/new:free',
    key: '',
    maxTokens: 2048,
  });
  assert.notEqual(store.snapshot().testRevision, testsBeforeGeneration);
  assert(
    !(await readFile(join(dir, 'generation.env'), 'utf8')).includes(store.snapshot().testRevision!),
    'The opaque browser test revision is never persisted with private settings.',
  );
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
  const testsBeforePlayback = store.snapshot().testRevision;
  store.save('playback', { volume: 37 });
  assert.equal(store.snapshot().testRevision, testsBeforePlayback);
  assert.equal(new SettingsStore({ privateRoot: dir, env: {} }).volume, 0.37);
  assert.equal(
    new SettingsStore({ privateRoot: dir, env: { MOMOI_TTS_PLAYBACK_PORT: '3219' } }).port,
    3219,
  );
  const appBefore = await readFile(join(dir, 'app.json'), 'utf8');
  assert.throws(() => store.save('application', { port: 3219 }));
  assert.equal(await readFile(join(dir, 'app.json'), 'utf8'), appBefore);
  const unsupported = new SettingsStore({
    privateRoot: dir,
    env: { MOMOI_TTS_TEXT_PROVIDER: 'codex' },
  });
  assert.equal(unsupported.snapshot().generation.ready, false);
  assert.equal(configuredPipeline(unsupported), undefined);
  assert.throws(() => store.save('generation', { provider: 'codex' }), /use OpenRouter/);
  await assert.rejects(
    checkConnection(unsupported, 'generation', (async () => {
      assert.fail('Unsupported retained provider settings must not dispatch any request.');
    }) as typeof fetch),
    /Save OpenRouter configuration/,
  );
  let calls = 0;
  const checked = await checkConnection(store, 'generation', (async (_url, init) => {
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
  const failed = await checkConnection(store, 'speech', (async () => {
    throw new Error('dummy-private-speech');
  }) as typeof fetch);
  assert(!failed.ok);
  assert(!JSON.stringify(failed).includes('dummy-private-speech'));

  // Removing a credential preserves configuration, removes every duplicate entry,
  // and never defeats an inherited launch credential.
  const keyDir = await mkdtemp(join(tmpdir(), 'momoitts-key-removal-'));
  try {
    await writeFile(
      join(keyDir, 'generation.env'),
      'MOMOI_TTS_TEXT_PROVIDER=openrouter\nOPENROUTER_MODEL=test/model\nOPENROUTER_MAX_TOKENS=1024\nOPENROUTER_API_KEY=first-dummy\nexport OPENROUTER_API_KEY=second-dummy\n',
    );
    await writeFile(join(keyDir, 'fish.env'), 'FISH_API_KEY=dummy-speech\nFISH_MODEL=s2.1-pro\n');
    const keys = new SettingsStore({ privateRoot: keyDir, env: {} });
    const beforeRemoval = keys.snapshot().testRevision;
    assert.throws(() => keys.save('generation', { removeKey: true, key: 'replacement' }));
    keys.save('generation', { removeKey: true });
    assert.notEqual(keys.snapshot().testRevision, beforeRemoval);
    assert.equal(keys.snapshot().generation.model, 'test/model');
    assert.equal(keys.snapshot().generation.keyConfigured, false);
    assert.equal(keys.snapshot().generation.ready, false);
    assert.equal(keys.snapshot().speech.keyConfigured, true);
    assert(
      !(await readFile(join(keyDir, 'generation.env'), 'utf8')).includes('OPENROUTER_API_KEY'),
    );
    const beforeSpeechRemoval = keys.snapshot().testRevision;
    keys.save('speech', { removeKey: true });
    assert.notEqual(keys.snapshot().testRevision, beforeSpeechRemoval);
    assert.equal(keys.snapshot().speech.model, 's2.1-pro');
    assert.equal(
      new SettingsStore({ privateRoot: keyDir, env: {} }).snapshot().speech.keyConfigured,
      false,
    );
    const inherited = new SettingsStore({
      privateRoot: keyDir,
      env: { FISH_API_KEY: 'dummy-inherited' },
    });
    assert.throws(() => inherited.save('speech', { removeKey: true }), /launch environment/);
    assert.equal(inherited.snapshot().speech.keyConfigured, true);
  } finally {
    await rm(keyDir, { recursive: true, force: true });
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://openrouter.ai/')) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return new Response(
        JSON.stringify({
          choices: [
            { message: { role: 'assistant', content: 'Offline response.' }, finish_reason: 'stop' },
          ],
        }),
      );
    }
    if (url.startsWith('https://api.fish.audio/'))
      return new Response(new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0]));
    return originalFetch(input, init);
  };
  let restarted = 0;
  const server = createAppServer({
    pipeline: testPipeline(),
    management: store,
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
      (
        await post(
          '/api/config/speech',
          { key: 'new-private-key', model: 's2.1-pro' },
          'https://evil.example',
        )
      ).status,
      403,
    );
    assert.equal((await post('/api/config/unexpected', {})).status, 404);
    assert.equal(
      (await post('/api/app/setup-action', { action: 'arbitrary-command', confirmed: true }))
        .status,
      404,
    );
    assert.equal((await post('/api/app/prerequisites', {})).status, 404);
    const result = await post('/api/config/speech', { key: 'new-private-key', model: 's2.1-pro' });
    assert.equal(result.status, 200);
    assert(!(await result.text()).includes('new-private-key'));
    const initial = await (await fetch(base + '/api/state')).json();
    assert.equal(initial.queue.repliesEnabled, false);
    assert.equal(initial.twitch.status, 'disabled');
    const session = '12345678-1234-1234-1234-123456789012';
    await post('/api/player/poll', { session });
    await post('/api/replies/on', {});
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
    assert.equal(after.queue.repliesEnabled, false);
    assert.equal(after.queue.waitingIds.length, 0);
    assert.equal(after.queue.activeId, null);
    const response = await (await post('/api/test/response', { text: 'Demo question' })).json();
    assert.equal(response.dialogue, 'Offline response.');
    assert.equal(
      (await post('/api/test/voice', { character: 'tyrone', eventId: 'voice-test' })).status,
      404,
    );
    const beforeRefresh = (await (await fetch(base + '/api/state')).json()).management.revision;
    const refreshed = await (await post('/api/app/refresh-profiles', {})).json();
    assert(refreshed.management.revision > beforeRefresh);
  } finally {
    globalThis.fetch = originalFetch;
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
  queue.setRepliesEnabled(false);
  console.log(
    'Browser management passed: private persistence, rejected-save recovery, environment precedence, redacted checks, removed installer route, pending settings, restart cancellation, explicit test separation, and whole-request adapter snapshots. No live providers or installations.',
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}

// Standalone response tests belong to application lifetime as well as the HTTP caller.
const originalFetch = globalThis.fetch;
try {
  for (const action of ['quit', 'restart', 'close'] as const) {
    const responseStore = new SettingsStore({
      privateRoot: join(tmpdir(), `tyrone-missing-response-settings-${process.pid}`),
      env: {
        MOMOI_TTS_TEXT_PROVIDER: 'openrouter',
        OPENROUTER_API_KEY: 'dummy-response-key',
        OPENROUTER_MODEL: 'test/model:free',
      },
    });
    const runtime = new AppRuntime({ management: responseStore, onRestart() {} });
    let providerSignal: AbortSignal | null | undefined;
    globalThis.fetch = async (_url, init) => {
      providerSignal = init?.signal;
      return new Response(new ReadableStream());
    };
    try {
      const pending = runtime.testResponse(
        { text: 'Cancel on exit' },
        new AbortController().signal,
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert(providerSignal);
      await assert.rejects(
        runtime.testResponse({ text: 'Duplicate test' }, new AbortController().signal),
        /already running/u,
      );
      if (action === 'restart') runtime.restart(true);
      else runtime[action]();
      assert(providerSignal.aborted);
      await assert.rejects(pending, /cancelled or timed out/u);
    } finally {
      runtime.close();
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}
