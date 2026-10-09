import { dialogueInstructions, validateDialogueInput, type DialogueInput } from '../dialogue.ts';
import { validateOpenRouterConfig, type OpenRouterConfig } from './config.ts';

class GenerationError extends Error {}
const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function providerError(status: number): GenerationError {
  const reason =
    status === 401 || status === 403
      ? 'Check API key and model access.'
      : status === 402
        ? 'Free access or account allowance is unavailable. No paid fallback was attempted.'
        : status === 429
          ? 'Account allowance or rate limit reached.'
          : status === 400 || status === 404 || status === 422
            ? 'The selected model or request parameters are unavailable.'
            : status === 408 || status === 504
              ? 'Provider timed out.'
              : 'Provider is unavailable or rejected the request.';
  return new GenerationError(`OpenRouter generation failed: ${reason}`);
}

export async function generateDialogue(config: OpenRouterConfig, input: DialogueInput) {
  validateOpenRouterConfig(config);
  validateDialogueInput(input);
  const { character, question, maxWords = 60, timeoutMs = 45_000, signal } = input;
  if (signal?.aborted) throw new GenerationError('Generation cancelled.');
  const deadline = new AbortController();
  const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  const timer = setTimeout(() => deadline.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal: combined,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        stream: false,
        max_tokens: config.maxTokens,
        messages: [
          { role: 'system', content: dialogueInstructions(character, maxWords) },
          { role: 'user', content: JSON.stringify({ viewer_question: question }) },
        ],
        // No tools, plugins, executors, model substitution, or paid routes.
        provider: {
          require_parameters: true,
          allow_fallbacks: false,
          max_price: { prompt: 0, completion: 0, request: 0 },
        },
      }),
    });
    combined.throwIfAborted();
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      throw providerError(response.status);
    }
    if (!response.body) throw new GenerationError('OpenRouter returned no dialogue.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    // Enforce the deadline even if a test/custom transport ignores fetch's abort.
    const abort = () => {
      void reader.cancel().catch(() => {});
    };
    combined.addEventListener('abort', abort, { once: true });
    if (combined.aborted) abort();
    try {
      while (true) {
        const { value, done } = await reader.read();
        combined.throwIfAborted();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1_000_000)
          throw new GenerationError('OpenRouter response exceeded the size limit.');
        chunks.push(value);
      }
    } catch (error) {
      void reader.cancel().catch(() => {});
      throw error;
    } finally {
      combined.removeEventListener('abort', abort);
      reader.releaseLock();
    }
    combined.throwIfAborted();
    let data: Record<string, unknown> | undefined;
    try {
      data = record(JSON.parse(Buffer.concat(chunks).toString('utf8')));
    } catch {
      throw new GenerationError('OpenRouter returned an invalid response.');
    }
    if (!data) throw new GenerationError('OpenRouter returned an invalid response.');
    if (data.error !== undefined) throw providerError(Number(record(data.error)?.code));
    if (!Array.isArray(data.choices) || data.choices.length !== 1)
      throw new GenerationError('OpenRouter returned an invalid response.');
    const choice = record(data.choices[0]);
    const message = record(choice?.message);
    if (choice?.error !== undefined) throw providerError(Number(record(choice.error)?.code));
    if (
      (message?.tool_calls != null &&
        (!Array.isArray(message.tool_calls) || message.tool_calls.length > 0)) ||
      message?.function_call != null ||
      choice?.finish_reason === 'tool_calls'
    )
      throw new GenerationError('OpenRouter returned tool calls. Dialogue was discarded.');
    if (choice?.finish_reason !== 'stop')
      throw new GenerationError('OpenRouter returned incomplete or blocked dialogue.');
    if (
      message?.role !== 'assistant' ||
      typeof message.content !== 'string' ||
      !message.content.trim()
    )
      throw new GenerationError('OpenRouter returned no dialogue.');
    // Only final content reaches speech; reasoning and provider metadata are ignored.
    const dialogue = message.content.trim();
    if (Buffer.byteLength(dialogue) > 4000)
      throw new GenerationError('Dialogue exceeded the response size limit.');
    const words = dialogue.split(/\s+/u).length;
    if (words > maxWords) throw new GenerationError('Dialogue exceeded the response limit.');
    return {
      dialogue,
      words,
      elapsedMs: Math.round(performance.now() - started),
      provider: 'openrouter' as const,
      model: config.model,
    };
  } catch (error) {
    if (signal?.aborted) throw new GenerationError('Generation cancelled.');
    if (deadline.signal.aborted) throw new GenerationError('Generation timed out.');
    if (error instanceof GenerationError) throw error;
    throw new GenerationError('OpenRouter request failed. Check your connection and API access.');
  } finally {
    clearTimeout(timer);
  }
}
