import { validateOpenRouterConfig, type OpenRouterConfig } from '../providers/openrouter/config.ts';

export type GenerationConfig = OpenRouterConfig;

export function readGenerationConfig(env: NodeJS.ProcessEnv): GenerationConfig {
  const provider = env.MOMOI_TTS_TEXT_PROVIDER;
  if (provider !== 'openrouter')
    throw new Error(
      'Set MOMOI_TTS_TEXT_PROVIDER to openrouter in private generation configuration.',
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
