import type { PendingRedemption, RedemptionStore } from '../src/twitch/redemption-store.ts';

export const testCharacters = Object.freeze([
  Object.freeze({
    id: 'tyrone',
    name: 'Tyrone',
    prompt: 'Synthetic character instructions.',
    voiceId: '0123456789abcdef0123456789abcdef',
  }),
]);
export function memoryRedemptionStore(): RedemptionStore {
  let saved: PendingRedemption[] = [];
  let savedOwner = '';
  return {
    async load(owner) {
      return owner === savedOwner ? structuredClone(saved) : [];
    },
    async save(owner, entries) {
      savedOwner = owner;
      saved = structuredClone(entries);
    },
  };
}
