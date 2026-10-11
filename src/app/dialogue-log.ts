import { closeSync, fsyncSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';
import type { QueueRecord } from '../queue/contracts.ts';

export interface DialogueLog {
  record(record: DialogueRecord): void;
}
export type DialogueRecord =
  | QueueRecord
  | {
      phase: 'received' | 'rejected';
      source: 'channel-points';
      recordedAt: number;
      eventId: string;
      viewer: string;
      question: string;
      reason?: string;
    };

// Private, append-only review data. Never read for replay, generation, or HTTP delivery.
export function fileDialogueLog(file: string): DialogueLog {
  return {
    record(record) {
      mkdirSync(dirname(file), { recursive: true });
      const descriptor = openSync(file, 'a', 0o600);
      try {
        const bytes = Buffer.from(JSON.stringify({ version: 1, ...record }) + '\n');
        let offset = 0;
        while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    },
  };
}
