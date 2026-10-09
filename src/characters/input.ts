import type { CharacterInfo } from '../shared/protocol.ts';

import { RequestInputError } from '../shared/errors.ts';

export function selectCharacter<T extends CharacterInfo>(
  input: unknown,
  characters: readonly T[],
): { character: T; question: string } {
  if (typeof input !== 'string' || !input.trim() || input.trim().length > 1042)
    throw new RequestInputError('Question must contain 1–1000 characters.');
  const separator = input.indexOf(':');
  if (separator < 1)
    throw new RequestInputError('Include a personality name: Name: your question.');
  const character = characters.find(
    (profile) => profile.name.toLowerCase() === input.slice(0, separator).trim().toLowerCase(),
  );
  if (!character)
    throw new RequestInputError(
      'Personality name is missing or unrecognized. Use an available name: Name: your question.',
    );
  const question = input.slice(separator + 1).trim();
  if (!question || question.length > 1000)
    throw new RequestInputError(
      'Question must contain 1–1000 characters after the personality name.',
    );
  return { character, question };
}
