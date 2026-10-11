import type { CharacterProfile } from '../characters/types.ts';
import type { RequestEntry } from '../shared/protocol.ts';

export interface QueueRecord {
  phase: 'accepted' | 'generated' | 'finished';
  recordedAt: number;
  eventId: string;
  source: 'channel-points' | 'local';
  entry: RequestEntry;
  generation?: { provider: string; model?: string };
  promptHash: string;
}

export interface QueuePipeline {
  characters: readonly CharacterProfile[];
  mode: 'live';
  generation?: { provider: string; model?: string };
  generate(question: string, signal: AbortSignal, character: CharacterProfile): Promise<string>;
  synthesize(dialogue: string, signal: AbortSignal, character: CharacterProfile): Promise<Buffer>;
}

export interface QueueSettings {
  viewerCooldownMs: number;
  globalCooldownMs: number;
  waitingExpiryMs: number;
}
