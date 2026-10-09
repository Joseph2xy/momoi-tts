export interface OpenRouterConfig {
  provider: 'openrouter';
  apiKey: string;
  model: string;
  maxTokens: number;
}

export function validateOpenRouterConfig({ apiKey, model, maxTokens }: OpenRouterConfig): void {
  if (typeof apiKey !== 'string' || !apiKey || /[^\x21-\x7e]/u.test(apiKey))
    throw new Error('Set a valid OPENROUTER_API_KEY in private generation configuration.');
  // Exact model IDs only: no presets, automatic routers, or :online search activation.
  if (
    typeof model !== 'string' ||
    model.length > 200 ||
    !/^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*(?::free)?$/u.test(model) ||
    model.startsWith('openrouter/')
  )
    throw new Error(
      'Set OPENROUTER_MODEL to an exact model ID (organization/model, optionally :free).',
    );
  if (!Number.isInteger(maxTokens) || maxTokens < 64 || maxTokens > 16_384)
    throw new Error('OPENROUTER_MAX_TOKENS must be 64–16384.');
}
