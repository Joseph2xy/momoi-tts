import type { SettingsStore } from './settings.ts';
import type { QueuePipeline } from '../queue/contracts.ts';
import { readGenerationConfig } from './generation.ts';
import { synthesizeSpeech } from '../providers/fish/synthesize-speech.ts';
import { livePipeline } from './pipeline.ts';
import { RequestInputError, SpeechFailure } from '../shared/errors.ts';
import { generateDialogue, GenerationError } from '../providers/openrouter/generate-dialogue.ts';

// Provider composition and explicit checks/tests; private persistence stays in SettingsStore.
export function configuredPipeline(store: SettingsStore): QueuePipeline | undefined {
  try {
    if (!store.snapshot().localReady) return undefined;
    const env = store.env();
    return livePipeline(
      env.FISH_API_KEY!,
      store.profiles(true),
      readGenerationConfig(env),
      env.FISH_MODEL!,
    );
  } catch {
    return undefined;
  }
}
export function testText(value: unknown, maxCharacters = 1000): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > maxCharacters ||
    Buffer.byteLength(value.trim(), 'utf8') > 4000 ||
    /[\p{Cc}&&[^\n\r\t]]/v.test(value)
  )
    throw new RequestInputError(
      `Enter text containing 1–${maxCharacters} characters (at most 4000 UTF-8 bytes).`,
    );
  return value.trim();
}
export function testVoiceId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{32}$/iu.test(value.trim()))
    throw new RequestInputError('Enter a voice ID containing 32 hexadecimal characters.');
  return value.trim();
}
export async function testSpeech(
  store: SettingsStore,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const text = testText(body.text, 4000);
  const voiceId = testVoiceId(body.voiceId);
  if (!store.snapshot().speech.ready)
    throw new RequestInputError(
      'Save a Fish Audio API key and valid speech engine before testing.',
    );
  const env = store.env();
  try {
    return (
      await synthesizeSpeech({
        text,
        voiceId,
        signal,
        apiKey: env.FISH_API_KEY!,
        model: env.FISH_MODEL!,
      })
    ).audio;
  } catch (error) {
    throw new RequestInputError(
      signal.aborted
        ? 'Speech test cancelled or timed out.'
        : error instanceof SpeechFailure
          ? error.publicMessage
          : 'Speech test failed. Check saved speech settings.',
    );
  }
}
export function obsTestPipeline(store: SettingsStore, voiceId: unknown): QueuePipeline {
  const voice = testVoiceId(voiceId);
  if (!store.snapshot().speech.ready)
    throw new RequestInputError('Save speech settings before testing OBS output.');
  const env = store.env();
  return {
    mode: 'live',
    characters: [
      { id: 'obs-output', name: 'OBS output', prompt: 'Fixed OBS output test.', voiceId: voice },
    ],
    async generate() {
      return 'This is the MomoiTTS OBS output test.';
    },
    async synthesize(text, signal, character) {
      return (
        await synthesizeSpeech({
          text,
          signal,
          apiKey: env.FISH_API_KEY!,
          voiceId: character.voiceId!,
          model: env.FISH_MODEL!,
        })
      ).audio;
    },
  };
}
export async function testResponse(
  store: SettingsStore,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const question = testText(body.text);
  let prompt =
    'You are a helpful conversational assistant. Answer briefly in natural spoken dialogue.';
  if (body.character !== undefined) {
    if (typeof body.character !== 'string')
      throw new RequestInputError('Select a known character or leave it unselected.');
    const profile = store.profiles().find((profile) => profile.id === body.character);
    if (!profile) throw new RequestInputError('Unknown character.');
    prompt = profile.prompt;
  }
  if (!store.snapshot().generation.ready)
    throw new RequestInputError('Configure generation before testing.');
  try {
    return (
      await generateDialogue(readGenerationConfig(store.env()), {
        question,
        character: prompt,
        signal,
      })
    ).dialogue;
  } catch (error) {
    throw new RequestInputError(
      signal.aborted
        ? 'Response test cancelled or timed out.'
        : error instanceof GenerationError
          ? error.publicMessage
          : 'Response test failed or timed out. Check provider access and the saved model settings.',
    );
  }
}
export async function checkConnection(
  store: SettingsStore,
  section: unknown,
  fetcher: typeof fetch = fetch,
  signal: AbortSignal = new AbortController().signal,
) {
  if (section !== 'generation' && section !== 'speech')
    throw new RequestInputError('Unknown connection check.');
  const env = store.env();
  if (section === 'generation' && env.MOMOI_TTS_TEXT_PROVIDER !== 'openrouter')
    throw new RequestInputError('Save OpenRouter configuration before checking its connection.');
  const key = section === 'generation' ? env.OPENROUTER_API_KEY : env.FISH_API_KEY;
  if (!key) throw new RequestInputError('Configure the saved API key first.');
  try {
    const response = await fetcher(
      section === 'generation'
        ? 'https://openrouter.ai/api/v1/key'
        : 'https://api.fish.audio/wallet/self/api-credit',
      {
        method: 'GET',
        redirect: 'error',
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      },
    );
    void response.body?.cancel().catch(() => {});
    return {
      ok: response.ok,
      message: response.ok
        ? 'Saved API key authenticated. No generation or speech was requested; model/voice access and allowance remain separate checks.'
        : 'Connection check failed. Verify the saved key and provider access.',
    };
  } catch {
    return {
      ok: false,
      message: 'Connection check failed or timed out. Verify provider access and try again.',
    };
  }
}
