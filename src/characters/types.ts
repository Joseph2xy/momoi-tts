import type { CharacterInfo } from '../shared/protocol.ts';

export interface CharacterProfile extends CharacterInfo {
  prompt: string;
  voiceId?: string;
}
