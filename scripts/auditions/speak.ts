import { mkdir, writeFile } from 'node:fs/promises';
import { synthesizeSpeech } from '../../src/providers/fish/synthesize-speech.ts';
import { generateConfiguredDialogue, readGenerationConfig } from '../../src/app/generation.ts';
import { readCharacters } from '../../src/characters/catalog.ts';
import { selectCharacter } from '../../src/characters/input.ts';

const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
const args = process.argv.slice(2);
const generate = args[0] === '--question';
const root = new URL('../../.generated/auditions/', import.meta.url);
try {
  const apiKey = process.env.FISH_API_KEY ?? '';
  const { character, question } = selectCharacter(
    (generate ? args.slice(1) : args).join(' '),
    readCharacters(process.env),
  );
  const voiceId = character.voiceId;
  if (!apiKey || !voiceId)
    throw new Error('Set FISH_API_KEY and the character’s voice ID in .local/fish.env.');
  let text = question;
  let generationMs: number | undefined;
  if (generate) {
    const result = await generateConfiguredDialogue(readGenerationConfig(process.env), {
      character: character.prompt,
      question: text,
      signal: controller.signal,
    });
    text = result.dialogue;
    generationMs = result.elapsedMs;
  }
  const result = await synthesizeSpeech({ text, apiKey, voiceId, signal: controller.signal });
  controller.signal.throwIfAborted();
  await mkdir(root, { recursive: true });
  const { audio, ...metadata } = result;
  await writeFile(new URL('fish-test.mp3', root), audio);
  await writeFile(
    new URL('fish-test.json', root),
    JSON.stringify({ date: new Date().toISOString(), text, generationMs, ...metadata }, null, 2),
  );
  console.log(text);
  console.log(
    `Saved .generated/auditions/fish-test.mp3 · first audio ${(result.firstAudioMs / 1000).toFixed(2)} s · complete ${(result.elapsedMs / 1000).toFixed(2)} s · ${audio.length} bytes · free model`,
  );
} catch (error) {
  console.error(
    controller.signal.aborted
      ? 'Cancelled.'
      : error instanceof Error
        ? error.message
        : 'Speech failed.',
  );
  process.exitCode = 1;
}
