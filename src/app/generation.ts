import { generateDialogue as codexDialogue } from '../providers/codex/generate-dialogue.ts';
import { generateDialogue as openRouterDialogue } from '../providers/openrouter/generate-dialogue.ts';
import { validateOpenRouterConfig, type OpenRouterConfig } from '../providers/openrouter/config.ts';
import type { DialogueInput } from '../providers/dialogue.ts';

export type GenerationConfig =
  { provider: 'codex'; codexBin?: string; codexLauncher?: string } | OpenRouterConfig;

export function readGenerationConfig(env: NodeJS.ProcessEnv): GenerationConfig {
  const provider = env.TYRONE_TEXT_PROVIDER;
  if (
    provider === 'codex' ||
    (!provider && !env.OPENROUTER_API_KEY && !env.OPENROUTER_MODEL && !env.OPENROUTER_MAX_TOKENS)
  )
    return {
      provider: 'codex',
      ...(env.TYRONE_CODEX_BIN ? { codexBin: env.TYRONE_CODEX_BIN } : {}),
      ...(env.TYRONE_CODEX_LAUNCHER ? { codexLauncher: env.TYRONE_CODEX_LAUNCHER } : {}),
    };
  if (provider !== 'openrouter')
    throw new Error(
      'Set TYRONE_TEXT_PROVIDER to codex or openrouter in private generation configuration.',
    );
  const config: OpenRouterConfig = {
    provider,
    apiKey: env.OPENROUTER_API_KEY ?? '',
    model: env.OPENROUTER_MODEL ?? '',
    maxTokens: Number(env.OPENROUTER_MAX_TOKENS ?? 1024),
  };
  validateOpenRouterConfig(config);
  return config;
}

export function generateConfiguredDialogue(config: GenerationConfig, input: DialogueInput) {
  return config.provider === 'openrouter'
    ? openRouterDialogue(config, input)
    : codexDialogue(input, {
        ...process.env,
        ...(config.codexBin ? { TYRONE_CODEX_BIN: config.codexBin } : {}),
        ...(config.codexLauncher ? { TYRONE_CODEX_LAUNCHER: config.codexLauncher } : {}),
      });
}
