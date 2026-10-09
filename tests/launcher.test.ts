import { testCharacters } from './fixtures.ts';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { stat } from 'node:fs/promises';
import { createAppServer } from '../src/app/server.ts';
import { configurationProof, readConfig } from '../src/app/config.ts';

const run = promisify(execFile);
// Explicit dummy settings override private environment files in the spawned processes.
const env: NodeJS.ProcessEnv = {
  ...process.env,
  TYRONE_TEXT_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: 'dummy-launch-key',
  OPENROUTER_MODEL: 'test/model-a:free',
  OPENROUTER_MAX_TOKENS: '1024',
  FISH_API_KEY: 'dummy-fish-key',
  FISH_VOICE_ID: '0123456789abcdef0123456789abcdef',
  TWITCH_CLIENT_ID: '',
  TWITCH_CHANNEL: '',
  TYRONE_CODEX_BIN: '',
  TYRONE_VIEWER_COOLDOWN_MS: '10000',
  TYRONE_GLOBAL_COOLDOWN_MS: '1000',
  TYRONE_WAITING_EXPIRY_MS: '180000',
};
let config: ReturnType<typeof readConfig>;
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
  configurationProof: (nonce) => configurationProof(config, nonce),
});
const root = new URL('../', import.meta.url);
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  env.TYRONE_PLAYBACK_PORT = String(address.port);
  config = readConfig(env, []);
  const base = `http://127.0.0.1:${address.port}`;
  const plain = await (await fetch(`${base}/api/health`)).json();
  assert.deepEqual(plain, { app: 'tyrone', mode: 'live' });
  const nonce = randomBytes(32).toString('hex');
  const challenged = await (
    await fetch(`${base}/api/health`, { headers: { 'X-Tyrone-Launch-Nonce': nonce } })
  ).json();
  assert.equal(challenged.configurationProof, configurationProof(config, nonce));
  assert(!JSON.stringify(challenged).includes('dummy'));
  assert(!JSON.stringify(challenged).includes('model-a'));
  const launcher = (overrides: NodeJS.ProcessEnv = {}) =>
    run(process.execPath, ['scripts/launch/launch.ts', '--no-open'], {
      cwd: root,
      env: { ...env, ...overrides },
      windowsHide: true,
      timeout: 15_000,
    });
  assert((await launcher()).stdout.includes('Tyrone ready'));
  for (const change of [
    { OPENROUTER_MODEL: 'test/model-b:free' },
    { OPENROUTER_API_KEY: 'different-dummy-key' },
    { OPENROUTER_MAX_TOKENS: '2048' },
    { TYRONE_TEXT_PROVIDER: 'codex' },
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
const base = `http://127.0.0.1:${env.TYRONE_PLAYBACK_PORT}`;
try {
  assert(cold.stdout.includes('Tyrone ready'));
  const nonce = randomBytes(32).toString('hex');
  const health = await (
    await fetch(`${base}/api/health`, { headers: { 'X-Tyrone-Launch-Nonce': nonce } })
  ).json();
  assert.equal(health.configurationProof, configurationProof(readConfig(env, []), nonce));
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
  assert(reused.stdout.includes('Tyrone ready'));
  assert.equal((await stat(browserIndex)).mtimeMs, beforeReuse);
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
