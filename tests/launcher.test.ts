import { testCharacters } from './fixtures.ts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { access, readdir, stat, unlink } from 'node:fs/promises';
import { ensureBrowserBuild } from '../scripts/build/browser.ts';
import { createAppServer } from '../src/app/server.ts';
import { SettingsStore } from '../src/app/settings.ts';

const run = promisify(execFile);
// Shared chunks and fonts are indirect dependencies, absent from HTML asset links.
await ensureBrowserBuild();
assert.equal(await ensureBrowserBuild(), false);
const assetRoot = new URL('../.generated/web/assets/', import.meta.url);
const font = (await readdir(assetRoot)).find((name) => name.endsWith('.woff2'));
assert(font, 'The browser build must include a local font.');
await unlink(new URL(font, assetRoot));
assert.equal(await ensureBrowserBuild(), true, 'Missing indirect assets must rebuild.');
await access(new URL(font, assetRoot));
assert.equal(await ensureBrowserBuild(), false);
// Explicit dummy settings override private environment files in the spawned processes.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  MOMOI_TTS_TEXT_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'dummy-launch-key',
  OPENROUTER_MODEL: 'test/model-a:free',
  OPENROUTER_MAX_TOKENS: '1024',
  FISH_API_KEY: 'dummy-fish-key',
  FISH_MODEL: 's2.1-pro',
  FISH_VOICE_ID: '0123456789abcdef0123456789abcdef',
  TWITCH_CLIENT_ID: '',
  TWITCH_CHANNEL: '',
  MOMOI_TTS_VIEWER_COOLDOWN_MS: '10000',
  MOMOI_TTS_GLOBAL_COOLDOWN_MS: '1000',
  MOMOI_TTS_WAITING_EXPIRY_MS: '180000',
};
let config: SettingsStore;
const server = createAppServer({
  pipeline: {
    characters: testCharacters,
    mode: 'live',
    async generate() {
      throw new Error('No generation in launcher tests.');
    },
    async synthesize() {
      throw new Error('No speech in launcher tests.');
    },
  },
  configurationProof: (nonce) => config.proof(nonce),
});
const root = new URL('../', import.meta.url);
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  env.MOMOI_TTS_PLAYBACK_PORT = String(address.port);
  config = new SettingsStore({ env });
  const base = `http://127.0.0.1:${address.port}`;
  const plain = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(plain, { app: 'momoitts', mode: 'live' });
  const nonce = randomBytes(32).toString('hex');
  const challenged = await (
    await fetch(`${base}/api/health`, { headers: { 'X-MomoiTTS-Launch-Nonce': nonce } })
  ).json();
  assert.equal(challenged.configurationProof, config.proof(nonce));
  assert(!JSON.stringify(challenged).includes('dummy'));
  assert(!JSON.stringify(challenged).includes('model-a'));
  const launcher = (overrides: NodeJS.ProcessEnv = {}) =>
    run(process.execPath, ['scripts/launch/launch.ts', '--no-open'], {
      cwd: root,
      env: { ...env, ...overrides },
      windowsHide: true,
      timeout: 15_000,
    });
  assert((await launcher()).stdout.includes('MomoiTTS ready'));
  for (const change of [
    { OPENROUTER_MODEL: 'test/model-b:free' },
    { OPENROUTER_API_KEY: 'different-dummy-key' },
    { OPENROUTER_MAX_TOKENS: '2048' },
    { FISH_VOICE_ID: 'abcdef0123456789abcdef0123456789' },
  ]) {
    await assert.rejects(launcher(change), (error) => {
      const result = error as Error & { stderr?: string };
      return (
        /different settings/u.test(result.stderr ?? '') &&
        !/dummy-key|model-b/u.test(result.stderr ?? '')
      );
    });
  }
} finally {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

// Cold background launch uses the same provider configuration as the launcher.
// No input/player is submitted; startup must not call any provider.
const cold = await run(process.execPath, ['scripts/launch/launch.ts', '--no-open'], {
  cwd: root,
  env,
  windowsHide: true,
  timeout: 20_000,
});
const base = `http://127.0.0.1:${env.MOMOI_TTS_PLAYBACK_PORT}`;
try {
  assert(cold.stdout.includes('MomoiTTS ready'));
  const nonce = randomBytes(32).toString('hex');
  const health = await (
    await fetch(`${base}/api/health`, { headers: { 'X-MomoiTTS-Launch-Nonce': nonce } })
  ).json();
  assert.equal(health.configurationProof, new SettingsStore({ env }).proof(nonce));
  const state = await (await fetch(`${base}/api/state`)).json();
  assert.equal(state.queue.mode, 'live');
  assert.equal(state.queue.requests.length, 0);
  assert.equal(state.twitch.status, 'disabled');
  assert(!JSON.stringify(state).includes('dummy-launch-key'));
  const browserIndex = new URL('../.generated/web/index.html', import.meta.url);
  const beforeReuse = (await stat(browserIndex)).mtimeMs;
  const reused = await run(process.execPath, ['scripts/launch/launch.ts', '--no-open'], {
    cwd: root,
    env,
    windowsHide: true,
    timeout: 15_000,
  });
  assert(reused.stdout.includes('MomoiTTS ready'));
  assert.equal((await stat(browserIndex)).mtimeMs, beforeReuse);
  // Exercise the real bounded restart helper without opening a browser or sending requests.
  await fetch(`${base}/api/settings`, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ muted: true, volume: 0.25 }),
  });
  const restart = await fetch(`${base}/api/app/restart`, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: '{}',
  });
  assert.equal(restart.status, 200);
  let restarted = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    try {
      const next = await (
        await fetch(`${base}/api/state`, { signal: AbortSignal.timeout(500) })
      ).json();
      if (
        !next.queue.repliesEnabled &&
        next.queue.requests.length === 0 &&
        next.management &&
        !next.muted
      ) {
        restarted = true;
        break;
      }
    } catch {
      /* Server closes before the launcher starts its replacement. */
    }
  }
  assert(
    restarted,
    'Restart must reopen a local server with replies off within the bounded handoff.',
  );
} finally {
  await fetch(`${base}/api/app/quit`, {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: '{}',
  });
}
console.log(
  'Launcher offline checks passed: configuration-matched reuse, provider/model/key/budget/voice switching refusal, private health proof, and cold child propagation. No provider calls.',
);
