import { readTwitchConfig } from '../twitch/config.ts';
import { createHmac } from 'node:crypto';
import { readGenerationConfig } from './generation.ts';
import { readCharacters } from '../characters/catalog.ts';

export function readConfig(
  env: NodeJS.ProcessEnv = process.env,
  args: readonly string[] = process.argv.slice(2),
) {
  const port = Number(env.TYRONE_PLAYBACK_PORT ?? 3210);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('App port must be 1024–65535.');
  const demo = args.includes('--demo');
  if (args.some((arg) => !['--demo', '--no-open'].includes(arg)))
    throw new Error('Unknown app option.');
  const characters = readCharacters(env, demo);
  const fish = !demo && env.FISH_API_KEY ? { apiKey: env.FISH_API_KEY } : undefined;
  function duration(name: string, fallback: number): number {
    const value = Number(env[name] ?? fallback);
    if (
      !Number.isInteger(value) ||
      value < (name === 'TYRONE_WAITING_EXPIRY_MS' ? 100 : 0) ||
      value > 3_600_000
    )
      throw new Error('Queue duration configuration must be valid milliseconds.');
    return value;
  }
  return {
    port,
    demo,
    fish,
    characters,
    generation: demo ? undefined : readGenerationConfig(env),
    codexBin: demo ? undefined : env.TYRONE_CODEX_BIN,
    twitch: readTwitchConfig(env),
    settings: {
      viewerCooldownMs: duration('TYRONE_VIEWER_COOLDOWN_MS', 10_000),
      globalCooldownMs: duration('TYRONE_GLOBAL_COOLDOWN_MS', 1000),
      waitingExpiryMs: duration('TYRONE_WAITING_EXPIRY_MS', 180_000),
    },
  };
}

// A fresh launcher challenge checks settings without publishing them or a stable credential hash.
export function configurationProof(config: unknown, nonce: string): string {
  return createHmac('sha256', JSON.stringify(config)).update(nonce).digest('hex');
}
