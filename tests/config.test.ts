import assert from 'node:assert/strict';
import { readConfig } from '../src/app/config.ts';
import { readGenerationConfig } from '../src/app/generation.ts';

const dummyKey = 'private-dummy-key';
const voiceId = '0123456789abcdef0123456789abcdef';
assert.equal(readConfig({}, []).fish, undefined);
assert.deepEqual(readConfig({ FISH_API_KEY: dummyKey, FISH_VOICE_ID: voiceId }, []).fish, {
  apiKey: dummyKey,
});
for (const env of [
  { FISH_API_KEY: dummyKey },
  { FISH_VOICE_ID: voiceId },
  { FISH_API_KEY: dummyKey, FISH_VOICE_ID: 'invalid' },
]) {
  assert.throws(
    () => readConfig(env, []),
    (error) =>
      error instanceof Error &&
      error.message.includes('FISH_API_KEY') &&
      !error.message.includes(dummyKey),
  );
  assert.equal(readConfig(env, ['--demo']).fish, undefined);
}
assert.throws(() => readConfig({}, ['--unknown']), /Unknown app option/u);
assert.throws(() => readConfig({ TYRONE_PLAYBACK_PORT: '999999' }, []), /App port/u);
assert.throws(() => readConfig({ TYRONE_WAITING_EXPIRY_MS: '0' }, []), /duration/u);
assert.deepEqual(readGenerationConfig({}), { provider: 'codex' });
assert.deepEqual(
  readGenerationConfig({ TYRONE_TEXT_PROVIDER: 'codex', OPENROUTER_API_KEY: dummyKey }),
  { provider: 'codex' },
);
const openRouter = {
  TYRONE_TEXT_PROVIDER: 'openrouter',
  OPENROUTER_API_KEY: dummyKey,
  OPENROUTER_MODEL: 'test/model:free',
};
assert.deepEqual(readConfig(openRouter, []).generation, {
  provider: 'openrouter',
  apiKey: dummyKey,
  model: 'test/model:free',
  maxTokens: 1024,
});
for (const env of [
  { TYRONE_TEXT_PROVIDER: 'unknown' },
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
    () => readConfig(env, []),
    (error) => error instanceof Error && !error.message.includes(dummyKey),
  );
  assert.equal(readConfig(env, ['--demo']).generation, undefined);
}
console.log(
  'Offline app configuration checks passed: partial credentials, redacted errors, mode isolation, port and duration bounds.',
);
