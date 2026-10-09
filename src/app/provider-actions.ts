import type { SettingsStore } from './settings.ts';
import type { QueuePipeline } from '../queue/contracts.ts';
import { readGenerationConfig, generateConfiguredDialogue } from './generation.ts';
import { synthesizeSpeech } from '../providers/fish/synthesize-speech.ts';
import { selectCharacter } from '../characters/input.ts';
import { demoPipeline, livePipeline } from './pipeline.ts';
import { RequestInputError } from '../shared/errors.ts';

// Provider composition and explicit checks/tests; private persistence stays in SettingsStore.
export function configuredPipeline(store: SettingsStore): QueuePipeline | undefined {
  try {
    if (store.demo) return demoPipeline(store.profiles());
    if (!store.snapshot().localReady) return undefined;
    const env = store.env();
    return livePipeline(env.FISH_API_KEY!, store.profiles(true), readGenerationConfig(env));
  } catch {
    return undefined;
  }
}
export function voiceTestPipeline(store: SettingsStore): QueuePipeline {
  if (store.demo) return demoPipeline(store.profiles());
  const state = store.snapshot();
  if (
    !state.speech.ready ||
    state.characters.some((p) => !p.voiceConfigured) ||
    !state.characters.length
  )
    throw new RequestInputError('Configure speech and character voices before testing.');
  const env = store.env();
  return {
    mode: 'live',
    characters: store.profiles(true),
    async generate() {
      return 'This is a voice test. Your character is ready to speak.';
    },
    async synthesize(text, signal, character) {
      return (
        await synthesizeSpeech({
          text,
          signal,
          apiKey: env.FISH_API_KEY!,
          voiceId: character.voiceId!,
        })
      ).audio;
    },
  };
}
export async function testResponse(store: SettingsStore, question: unknown, signal: AbortSignal) {
  const character = selectCharacter(question, store.profiles());
  if (store.demo)
    return await demoPipeline(store.profiles()).generate(
      character.question,
      signal,
      character.character,
    );
  if (!store.snapshot().generation.ready)
    throw new RequestInputError('Configure generation before testing.');
  try {
    return (
      await generateConfiguredDialogue(readGenerationConfig(store.env()), {
        question: character.question,
        character: character.character.prompt,
        signal,
      })
    ).dialogue;
  } catch {
    throw new RequestInputError(
      'Response test failed or timed out. Check provider access and the saved model settings.',
    );
  }
}
export async function checkConnection(
  store: SettingsStore,
  section: unknown,
  fetcher: typeof fetch = fetch,
) {
  if (section !== 'generation' && section !== 'speech')
    throw new RequestInputError('Unknown connection check.');
  const env = store.env();
  if (section === 'generation' && env.TYRONE_TEXT_PROVIDER !== 'openrouter')
    throw new RequestInputError(
      'For Codex, use Check prerequisites. Choose OpenRouter for an API-key connection check.',
    );
  if (store.demo)
    return { ok: true, message: 'Demo check only. No connected provider was contacted.' };
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
        signal: AbortSignal.timeout(10000),
      },
    );
    await response.body?.cancel();
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
