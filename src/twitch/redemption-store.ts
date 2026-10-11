import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

export type RedemptionTarget = 'FULFILLED' | 'CANCELED';
export interface PendingRedemption {
  id: string;
  rewardId: string;
  target: RedemptionTarget;
}
export interface RedemptionStore {
  load(owner: string): Promise<PendingRedemption[]>;
  save(owner: string, entries: PendingRedemption[]): Promise<void>;
}
// Only identifiers and intended outcomes are persisted, never viewer input or credentials.
export function fileRedemptionStore(
  file = new URL('../../.local/twitch-redemptions.json', import.meta.url),
): RedemptionStore {
  return {
    async load(owner) {
      let raw: string;
      try {
        raw = await readFile(file, 'utf8');
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw new Error('Reward bookkeeping unavailable.');
      }
      if (Buffer.byteLength(raw) > 100_000) throw new Error('Reward bookkeeping unavailable.');
      const value = JSON.parse(raw) as { owner?: unknown; entries?: unknown };
      if (!Array.isArray(value.entries) || value.entries.length > 256)
        throw new Error('Reward bookkeeping unavailable.');
      if (value.owner !== owner) {
        if (!value.entries.length) return [];
        throw new Error('Reward bookkeeping belongs to another Twitch configuration.');
      }
      const ids = new Set<string>();
      return value.entries.map((entry: PendingRedemption) => {
        if (
          !entry ||
          typeof entry.id !== 'string' ||
          typeof entry.rewardId !== 'string' ||
          !/^[a-z0-9_-]{1,128}$/iu.test(entry.id) ||
          !/^[a-z0-9_-]{1,128}$/iu.test(entry.rewardId) ||
          !['FULFILLED', 'CANCELED'].includes(entry.target) ||
          ids.has(entry.id)
        )
          throw new Error('Reward bookkeeping unavailable.');
        ids.add(entry.id);
        return { id: entry.id, rewardId: entry.rewardId, target: entry.target };
      });
    },
    async save(owner, entries) {
      if (entries.length > 256) throw new Error('Reward bookkeeping full.');
      await mkdir(new URL('./', file), { recursive: true });
      const temporary = new URL(`${file.href}.${randomUUID()}.tmp`);
      try {
        await writeFile(temporary, JSON.stringify({ owner, entries }), { mode: 0o600 });
        await rename(temporary, file);
      } finally {
        await rm(temporary, { force: true });
      }
    },
  };
}
