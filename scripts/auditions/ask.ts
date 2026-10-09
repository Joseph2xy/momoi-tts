import { generateConfiguredDialogue, readGenerationConfig } from '../../src/app/generation.ts';
import { readCharacters } from '../../src/characters/catalog.ts';
import { selectCharacter } from '../../src/characters/input.ts';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
try {
  const { character, question } = selectCharacter(
    process.argv.slice(2).join(' '),
    readCharacters({}, true),
  );
  const result = await generateConfiguredDialogue(readGenerationConfig(process.env), {
    character: character.prompt,
    question,
    signal: controller.signal,
  });
  console.log(result.dialogue);
  console.error(
    `\n${(result.elapsedMs / 1000).toFixed(1)} seconds · ${result.words} words · ${result.provider}`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Generation failed.');
  process.exitCode = 1;
}
