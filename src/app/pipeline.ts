import type { GenerationConfig } from './generation.ts';
import { generateDialogue } from '../providers/openrouter/generate-dialogue.ts';
import { synthesizeSpeech } from '../providers/fish/synthesize-speech.ts';
import { validateFishModel } from '../providers/fish/config.ts';
import type { QueuePipeline } from '../queue/contracts.ts';
import type { CharacterProfile } from '../characters/types.ts';

export function livePipeline(
  apiKey: string,
  characters: readonly CharacterProfile[],
  generation: GenerationConfig,
  speechModel: string,
): QueuePipeline {
  validateFishModel(speechModel);
  if (!characters.length || characters.some((character) => !character.voiceId))
    throw new Error('Every character needs an assigned voice.');
  return {
    characters,
    mode: 'live',
    generation: {
      provider: generation.provider,
      model: generation.model,
    },
    async generate(question, signal, character) {
      signal.throwIfAborted();
      return (
        await generateDialogue(generation, {
          character: character.prompt,
          question,
          signal,
        })
      ).dialogue;
    },
    async synthesize(text, signal, character) {
      return (
        await synthesizeSpeech({
          text,
          apiKey,
          voiceId: character.voiceId!,
          model: speechModel,
          signal,
        })
      ).audio;
    },
  };
}
