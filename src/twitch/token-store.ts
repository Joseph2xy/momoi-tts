import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import type { AccessToken } from '@twurple/auth';
import { redemptionScope } from './config.ts';

export const tokenFile = new URL('../../.local/twitch-token.json', import.meta.url);
export interface SavedToken {
  clientId: string;
  userId: string;
  token: AccessToken;
}
export function parseSavedToken(input: unknown): SavedToken {
  if (!input || typeof input !== 'object') throw new Error('Invalid saved Twitch sign-in.');
  const value = input as Partial<SavedToken>;
  const token = value.token;
  if (
    typeof value.clientId !== 'string' ||
    typeof value.userId !== 'string' ||
    !/^\d+$/u.test(value.userId) ||
    !token ||
    typeof token.accessToken !== 'string' ||
    !token.accessToken ||
    typeof token.refreshToken !== 'string' ||
    !token.refreshToken ||
    !Array.isArray(token.scope) ||
    token.scope.some((scope) => typeof scope !== 'string') ||
    !token.scope.includes(redemptionScope) ||
    typeof token.expiresIn !== 'number' ||
    !Number.isFinite(token.expiresIn) ||
    token.expiresIn <= 0 ||
    typeof token.obtainmentTimestamp !== 'number' ||
    !Number.isFinite(token.obtainmentTimestamp)
  )
    throw new Error('Invalid saved Twitch sign-in.');
  return {
    clientId: value.clientId,
    userId: value.userId,
    token: {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      scope: [...token.scope],
      expiresIn: token.expiresIn,
      obtainmentTimestamp: token.obtainmentTimestamp,
    },
  };
}
export async function loadToken(file = tokenFile): Promise<SavedToken> {
  const text = await readFile(file, 'utf8');
  if (Buffer.byteLength(text) > 16_384) throw new Error('Invalid saved Twitch sign-in.');
  return parseSavedToken(JSON.parse(text));
}
export async function saveToken(value: SavedToken, file = tokenFile): Promise<void> {
  const validated = parseSavedToken(value);
  await mkdir(new URL('./', file), { recursive: true });
  const temporary = new URL(`${file.href}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, JSON.stringify(validated), { mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
