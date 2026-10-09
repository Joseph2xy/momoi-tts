import { generateDialogue as codexDialogue } from '../providers/codex/generate-dialogue.ts';
import { generateDialogue as openRouterDialogue } from '../providers/openrouter/generate-dialogue.ts';
import { validateOpenRouterConfig, type OpenRouterConfig } from '../providers/openrouter/config.ts';
import type { DialogueInput } from '../providers/dialogue.ts';

export type GenerationConfig = { provider: 'codex' } | OpenRouterConfig;

export function readGenerationConfig(env: NodeJS.ProcessEnv): GenerationConfig {
  const provider = env.TYRONE_TEXT_PROVIDER;
  if (
    provider === 'codex' ||
    (!provider && !env.OPENROUTER_API_KEY && !env.OPENROUTER_MODEL && !env.OPENROUTER_MAX_TOKENS)
  )
    return { provider: 'codex' }; // Preserve the existing Codex launch path.
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
    : codexDialogue(input);
}
