import assert from 'node:assert/strict';
import { SettingsStore } from '../src/app/settings.ts';
import { launchMode } from '../src/app/launch-mode.ts';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readGenerationConfig } from '../src/app/generation.ts';

const dummyKey = 'private-dummy-key';
const store = (env: NodeJS.ProcessEnv = {}) =>
  new SettingsStore({ privateRoot: join(tmpdir(), 'momoitts-nonexistent-config'), env });
assert.equal(store().snapshot().localReady, false);
assert.throws(() => launchMode(['--unknown']), /Unknown app option/u);
assert.throws(() => store({ MOMOI_TTS_PLAYBACK_PORT: '999999' }).port, /App port/u);
assert.equal(store({ MOMOI_TTS_WAITING_EXPIRY_MS: '0' }).queueSettings().waitingExpiryMs, 180000);
assert.throws(() => readGenerationConfig({}), /PROVIDER/u);
const openRouter = {
  MOMOI_TTS_TEXT_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: dummyKey,
  OPENROUTER_MODEL: 'test/model:free',
};
assert.deepEqual(readGenerationConfig(openRouter), {
  provider: 'openrouter',
  apiKey: dummyKey,
  model: 'test/model:free',
  maxTokens: 1024,
});
for (const env of [
  // Existing unsupported selections never silently adopt an API billing route.
  { ...openRouter, MOMOI_TTS_TEXT_PROVIDER: 'codex' },
  { MOMOI_TTS_TEXT_PROVIDER: 'unknown' },
  { OPENROUTER_API_KEY: dummyKey },
  { ...openRouter, OPENROUTER_API_KEY: '' },
  { ...openRouter, OPENROUTER_MODEL: '' },
  ...[
    'openrouter/auto',
    '@preset',
    'test/model:online',
    'test/model,other/model',
    'test/model?key=secret',
  ].map((OPENROUTER_MODEL) => ({ ...openRouter, OPENROUTER_MODEL })),
  { ...openRouter, OPENROUTER_MAX_TOKENS: '0' },
  { ...openRouter, OPENROUTER_MAX_TOKENS: '999999' },
]) {
  assert.throws(
    () => readGenerationConfig(env),
    (error) => error instanceof Error && !error.message.includes(dummyKey),
  );
}
console.log(
  'Offline app configuration checks passed: partial credentials, redacted errors, port and duration bounds.',
);
