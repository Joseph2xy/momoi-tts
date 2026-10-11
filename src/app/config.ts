import { createHmac } from 'node:crypto';

// A fresh launcher challenge checks settings without publishing them or a stable credential hash.
export function configurationProof(config: unknown, nonce: string): string {
  return createHmac('sha256', JSON.stringify(config)).update(nonce).digest('hex');
}
