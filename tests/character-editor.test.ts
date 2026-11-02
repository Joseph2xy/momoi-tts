import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { once } from 'node:events';
import { SettingsStore } from '../src/app/settings.ts';
import { createAppServer } from '../src/app/server.ts';
import { configuredPipeline } from '../src/app/provider-actions.ts';
import { RequestQueue } from '../src/queue/request-queue.ts';
import type { QueuePipeline } from '../src/queue/contracts.ts';

const voiceA = 'a'.repeat(32),
  voiceB = 'b'.repeat(32),
  voiceC = 'c'.repeat(32);
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'momoitts-character-editor-'));
  const catalogRoot = join(root, 'catalog');
  await mkdir(join(catalogRoot, 'prompts'), { recursive: true });
  await writeFile(join(catalogRoot, 'prompts', 'alpha.txt'), 'Original trusted prompt.');
  const catalog = pathToFileURL(join(catalogRoot, 'catalog.json'));
  await writeFile(
    catalog,
    JSON.stringify([
      {
        id: 'alpha',
        name: 'Alpha',
        promptFile: 'prompts/alpha.txt',
        voiceIdEnv: 'FISH_ALPHA_VOICE_ID',
      },
    ]),
  );
  await writeFile(
    join(root, 'generation.env'),
    'MOMOI_TTS_TEXT_PROVIDER=openrouter\nOPENROUTER_MODEL=test/model\nOPENROUTER_API_KEY=dummy-generation-private\n',
  );
  await writeFile(
    join(root, 'fish.env'),
    `FISH_API_KEY=dummy-speech-private\nFISH_ALPHA_VOICE_ID=${voiceA}\n`,
  );
  return { root, catalog, store: new SettingsStore({ privateRoot: root, catalog, env: {} }) };
}
async function flush() {
  for (let i = 0; i < 12; i++) await new Promise<void>((resolve) => setImmediate(resolve));
}

test('character editor privately persists bounded existing profiles without polling disclosure or package changes', async () => {
  const f = await fixture();
  try {
    assert.equal(f.store.characterEditor('alpha').prompt, 'Original trusted prompt.');
    const proof = f.store.proof('a'.repeat(64));
    f.store.saveCharacter('alpha', {
      prompt: 'Edited trusted instructions.\nAnswer briefly.',
      voiceId: voiceB,
    });
    assert.equal(f.store.profiles(true)[0]!.voiceId, voiceB);
    assert.equal(f.store.profiles()[0]!.prompt, 'Edited trusted instructions.\nAnswer briefly.');
    assert.notEqual(f.store.proof('a'.repeat(64)), proof);
    const loaded = new SettingsStore({ privateRoot: f.root, catalog: f.catalog, env: {} });
    assert.deepEqual(loaded.characterEditor('alpha'), f.store.characterEditor('alpha'));
    assert.equal(loaded.proof('a'.repeat(64)), f.store.proof('a'.repeat(64)));
    assert.equal(
      await readFile(join(f.root, 'catalog', 'prompts', 'alpha.txt'), 'utf8'),
      'Original trusted prompt.',
    );
    const state = JSON.stringify(f.store.snapshot());
    assert(!state.includes('Edited trusted'));
    assert(!state.includes(voiceB));
    assert(!state.includes('dummy-generation-private'));
    assert(!state.includes('dummy-speech-private'));
    const before = await readFile(join(f.root, 'characters.json'), 'utf8');
    for (const body of [
      { prompt: '', voiceId: voiceA },
      { prompt: 'x'.repeat(6001), voiceId: voiceA },
      { prompt: '\u0000bad', voiceId: voiceA },
      { prompt: 'Valid prompt', voiceId: 'invalid' },
      { prompt: 'Valid prompt', voiceId: voiceA, path: '../generation.env' },
    ])
      assert.throws(() => f.store.saveCharacter('alpha', body));
    for (const id of ['../alpha', 'unknown', '__proto__'])
      assert.throws(() => f.store.saveCharacter(id, { prompt: 'Valid prompt', voiceId: voiceA }));
    assert.equal(await readFile(join(f.root, 'characters.json'), 'utf8'), before);
    f.store.saveCharacter('alpha', { prompt: 'Retain instructions without a voice.', voiceId: '' });
    assert.equal(f.store.snapshot().characters[0]!.voiceConfigured, false);
    assert.equal(configuredPipeline(f.store), undefined);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('voice-only setup saves preserve the latest instructions and reject invalid mutations', async () => {
  const f = await fixture();
  try {
    const earlier = f.store.characterEditor('alpha');
    f.store.saveCharacter('alpha', {
      prompt: 'Latest saved personality.',
      voiceId: voiceA,
      available: false,
    });
    f.store.saveCharacter('alpha', { voiceId: voiceB, available: true });
    const saved = f.store.characterEditor('alpha');
    assert.notEqual(saved.prompt, earlier.prompt);
    assert.equal(saved.prompt, 'Latest saved personality.');
    assert.equal(saved.voiceId, voiceB);
    assert.equal(saved.available, true);
    const before = await readFile(join(f.root, 'characters.json'), 'utf8');
    for (const body of [
      { available: true },
      { voiceId: 'bad', available: true },
      { voiceId: '', available: true },
      { voiceId: voiceC, path: '../generation.env' },
    ])
      assert.throws(() => f.store.saveCharacter('alpha', body));
    assert.equal(await readFile(join(f.root, 'characters.json'), 'utf8'), before);
    const reopened = new SettingsStore({ privateRoot: f.root, catalog: f.catalog, env: {} });
    assert.deepEqual(reopened.characterEditor('alpha'), saved);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('environment voices take precedence without replacing saved fallback and failed writes preserve effective edits', async () => {
  const f = await fixture();
  try {
    f.store.saveCharacter('alpha', { prompt: 'Saved prompt.', voiceId: voiceB });
    const overridden = new SettingsStore({
      privateRoot: f.root,
      catalog: f.catalog,
      env: { FISH_ALPHA_VOICE_ID: voiceC },
    });
    assert.equal(overridden.characterEditor('alpha').voiceOverridden, true);
    assert.equal(overridden.characterEditor('alpha').voiceId, voiceC);
    assert.throws(
      () => overridden.saveCharacter('alpha', { prompt: 'Changed', voiceId: voiceA }),
      /launch environment/u,
    );
    overridden.saveCharacter('alpha', {
      prompt: 'Prompt changed with environment voice.',
      voiceId: voiceC,
    });
    const fallback = new SettingsStore({ privateRoot: f.root, catalog: f.catalog, env: {} });
    assert.equal(fallback.characterEditor('alpha').voiceId, voiceB);
    await rm(join(f.root, 'characters.json'));
    await mkdir(join(f.root, 'characters.json'));
    const before = fallback.characterEditor('alpha');
    const testsBeforeFailedWrite = fallback.snapshot().testRevision;
    assert.throws(
      () => fallback.saveCharacter('alpha', { prompt: 'Failed write', voiceId: voiceA }),
      /Previous settings were kept/u,
    );
    assert.deepEqual(fallback.characterEditor('alpha'), before);
    assert.equal(fallback.snapshot().testRevision, testsBeforeFailedWrite);
    assert.equal(fallback.snapshot().localReady, true);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});

test('editor HTTP routes reject cross-origin mutations and traversal, reveal only dedicated editor data, and disable superseded bulk saves', async () => {
  const f = await fixture();
  const server = createAppServer({ management: f.store, pipeline: configuredPipeline(f.store) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  const base = `http://127.0.0.1:${address.port}`;
  const body = { prompt: 'Browser trusted prompt.', voiceId: voiceB };
  try {
    const editor = await fetch(`${base}/api/characters/alpha`);
    assert.equal(editor.status, 200);
    const data = await editor.json();
    assert.equal(data.voiceId, voiceA);
    assert.equal(data.prompt, 'Original trusted prompt.');
    assert(!JSON.stringify(data).includes('dummy-'));
    assert.equal(
      (
        await fetch(`${base}/api/characters/alpha`, {
          headers: { Origin: 'https://outside.invalid' },
        })
      ).status,
      403,
    );
    assert.equal(
      (await fetch(`${base}/api/characters/alpha`, { headers: { 'Sec-Fetch-Site': 'cross-site' } }))
        .status,
      403,
    );
    assert.equal(
      (
        await fetch(`${base}/api/characters/alpha`, {
          method: 'POST',
          headers: { Origin: 'https://outside.invalid' },
          body: JSON.stringify(body),
        })
      ).status,
      403,
    );
    const save = await fetch(`${base}/api/characters/alpha`, {
      method: 'POST',
      headers: { Origin: base },
      body: JSON.stringify(body),
    });
    assert.equal(save.status, 200);
    const state = JSON.stringify(await save.json());
    assert(!state.includes(body.prompt));
    assert(!state.includes(voiceB));
    assert.equal((await fetch(`${base}/api/characters/%2e%2e%2falpha`)).status, 404);
    assert.equal((await fetch(`${base}/api/characters/unknown`)).status, 409);
    assert.equal(
      (
        await fetch(`${base}/api/config/characters`, {
          method: 'POST',
          headers: { Origin: base },
          body: '{}',
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`${base}/api/characters/alpha`, {
          method: 'POST',
          headers: { Origin: base },
          body: JSON.stringify({ prompt: 'x'.repeat(17000), voiceId: voiceA }),
        })
      ).status,
      413,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(f.root, { recursive: true, force: true });
  }
});

test('character edits retain accepted prompts and active voices, update waiting voices, and discard late canceled results', async () => {
  const f = await fixture();
  try {
    const seen: { prompt: string; voice: string | undefined }[] = [];
    const played: string[] = [];
    let release: (() => void) | undefined;
    const pipeline = (hold = false): QueuePipeline => ({
      mode: 'live',
      characters: f.store.profiles(true),
      async generate(_question, _signal, character) {
        seen.push({ prompt: character.prompt, voice: character.voiceId });
        if (hold)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        return 'Synthetic response.';
      },
      async synthesize() {
        return Buffer.from('ID3fixture');
      },
    });
    const queue = new RequestQueue({
      pipeline: pipeline(true),
      playerReady: () => true,
      play: (id) => played.push(id),
      stop: () => {},
      settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
    });
    queue.submit('One', 'Alpha: Active', 'active');
    queue.submit('Two', 'Alpha: Waiting', 'waiting');
    await flush();
    f.store.saveCharacter('alpha', { prompt: 'New trusted prompt.', voiceId: voiceB });
    queue.setPipeline(pipeline());
    queue.skip();
    await flush();
    release!();
    await flush();
    assert.deepEqual(seen, [
      { prompt: 'Original trusted prompt.', voice: voiceA },
      { prompt: 'Original trusted prompt.', voice: voiceB },
    ]);
    assert.equal(played.length, 1, 'Canceled generation must never play through its late result.');
    queue.playbackEvent(played[0]!, 'ended');
    queue.submit('Three', 'Alpha: New request', 'new');
    await flush();
    assert.deepEqual(seen[2], { prompt: 'New trusted prompt.', voice: voiceB });
    queue.setRepliesEnabled(false);
  } finally {
    await rm(f.root, { recursive: true, force: true });
  }
});
