import { setTimeout as delay } from 'node:timers/promises';
import type { QueuePipeline } from '../src/queue/contracts.ts';
import type { CharacterProfile } from '../src/characters/types.ts';
import { testCharacters } from './fixtures.ts';
import { testAudio } from './audio-fixture.ts';
export function testPipeline(
  characters: readonly CharacterProfile[] = testCharacters,
): QueuePipeline {
  return {
    characters,
    mode: 'live',
    generation: { provider: 'synthetic' },
    async generate(question, signal, character) {
      await delay(350, undefined, { signal });
      return 'Synthetic ' + character.name + ' reply: ' + question;
    },
    async synthesize(_text, signal) {
      await delay(350, undefined, { signal });
      signal.throwIfAborted();
      return testAudio();
    },
  };
}
