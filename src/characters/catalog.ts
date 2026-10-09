import { readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CharacterProfile } from './types.ts';

// Trusted local configuration only; viewer input can never select a file or voice ID.
export function readCharacters(
  env: NodeJS.ProcessEnv = {},
  demo = false,
  catalogUrl = new URL('../../characters/catalog.json', import.meta.url),
): readonly CharacterProfile[] {
  const invalid = () =>
    new Error('Invalid character catalog. Check characters/catalog.json and its prompt files.');
  try {
    const catalog: unknown = JSON.parse(readFileSync(catalogUrl, 'utf8'));
    if (!Array.isArray(catalog) || catalog.length < 1 || catalog.length > 32) throw invalid();
    const root = dirname(fileURLToPath(catalogUrl));
    const promptRoot = realpathSync(resolve(root, 'prompts'));
    const ids = new Set<string>(),
      names = new Set<string>();
    return Object.freeze(
      catalog.map((value: unknown) => {
        if (!value || typeof value !== 'object') throw invalid();
        const entry = value as Record<string, unknown>;
        if (
          Object.keys(entry).some(
            (key) => !['id', 'name', 'promptFile', 'voiceIdEnv'].includes(key),
          ) ||
          typeof entry.id !== 'string' ||
          !/^[a-z][a-z0-9_-]{0,31}$/u.test(entry.id) ||
          typeof entry.name !== 'string' ||
          !entry.name.trim() ||
          entry.name !== entry.name.trim() ||
          entry.name.length > 40 ||
          /[:\p{Cc}]/u.test(entry.name) ||
          typeof entry.promptFile !== 'string' ||
          !/^prompts\/[a-z0-9_/-]+\.txt$/iu.test(entry.promptFile) ||
          typeof entry.voiceIdEnv !== 'string' ||
          !/^FISH_[A-Z0-9_]*VOICE_ID$/u.test(entry.voiceIdEnv) ||
          ids.has(entry.id) ||
          names.has(entry.name.toLowerCase())
        )
          throw invalid();
        ids.add(entry.id);
        names.add(entry.name.toLowerCase());
        const promptPath = realpathSync(resolve(root, entry.promptFile));
        const within = relative(promptRoot, promptPath);
        if (!within || isAbsolute(within) || within === '..' || within.startsWith('..' + sep))
          throw invalid();
        const prompt = readFileSync(promptPath, 'utf8');
        if (!prompt.trim() || prompt.length > 8000) throw invalid();
        const voiceId = demo ? undefined : env[entry.voiceIdEnv];
        if (
          !demo &&
          (env.FISH_API_KEY || voiceId) &&
          (!env.FISH_API_KEY ||
            /\s/u.test(env.FISH_API_KEY) ||
            !/^[a-f0-9]{32}$/iu.test(voiceId ?? ''))
        )
          throw new Error(
            'Set FISH_API_KEY and every character’s valid voice ID in private configuration.',
          );
        return Object.freeze({
          id: entry.id,
          name: entry.name,
          prompt,
          ...(voiceId ? { voiceId } : {}),
        });
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Set FISH_API_KEY')) throw error;
    throw invalid();
  }
}
