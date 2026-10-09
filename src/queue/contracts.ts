import type { CharacterProfile } from '../characters/types.ts';

export interface QueuePipeline {
  characters: readonly CharacterProfile[];
  mode: 'live' | 'demo';
  generate(question: string, signal: AbortSignal, character: CharacterProfile): Promise<string>;
  synthesize(dialogue: string, signal: AbortSignal, character: CharacterProfile): Promise<Buffer>;
}

export interface QueueSettings {
  viewerCooldownMs: number;
  globalCooldownMs: number;
  waitingExpiryMs: number;
}
