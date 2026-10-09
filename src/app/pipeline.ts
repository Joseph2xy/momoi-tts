import { setTimeout as delay } from 'node:timers/promises';
import { generateConfiguredDialogue, type GenerationConfig } from './generation.ts';
import { synthesizeSpeech } from '../providers/fish/synthesize-speech.ts';
import type { QueuePipeline } from '../queue/contracts.ts';
import { demoAudio } from './demo-audio.ts';
import { readCharacters } from '../characters/catalog.ts';
import type { CharacterProfile } from '../characters/types.ts';

export function livePipeline(
  apiKey: string,
  characters: readonly CharacterProfile[],
  generation: GenerationConfig,
): QueuePipeline {
  if (!characters.length || characters.some((character) => !character.voiceId))
    throw new Error('Every character needs an assigned voice.');
  return {
    characters,
    mode: 'live',
    async generate(question, signal, character) {
      signal.throwIfAborted();
      return (
        await generateConfiguredDialogue(generation, {
          character: character.prompt,
          question,
          signal,
        })
      ).dialogue;
    },
    async synthesize(text, signal, character) {
      return (await synthesizeSpeech({ text, apiKey, voiceId: character.voiceId!, signal })).audio;
    },
  };
}
export function demoPipeline(
  characters: readonly CharacterProfile[] = readCharacters({}, true),
): QueuePipeline {
  return {
    characters,
    mode: 'demo',
    async generate(question, signal, character) {
      await delay(350, undefined, { signal });
      return `Simulated ${character.name} reply for queue testing. Your question was: ${question}`;
    },
    async synthesize(_text, signal) {
      await delay(350, undefined, { signal });
      signal.throwIfAborted();
      return demoAudio();
    },
  };
}
