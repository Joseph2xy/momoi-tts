export interface CharacterEdit {
  prompt: string;
  voiceId: string;
}

export function validCharacterEdit(value: unknown): value is CharacterEdit {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const edit = value as Record<string, unknown>;
  return (
    Object.keys(edit).length === 2 &&
    Object.keys(edit).every((key) => key === 'prompt' || key === 'voiceId') &&
    typeof edit.prompt === 'string' &&
    !!edit.prompt.trim() &&
    Buffer.byteLength(edit.prompt, 'utf8') <= 6000 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(edit.prompt) &&
    typeof edit.voiceId === 'string' &&
    /^(?:[a-f0-9]{32})?$/iu.test(edit.voiceId)
  );
}

export function readCharacterEdits(value: unknown): Record<string, CharacterEdit> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid private character settings.');
  const edits = Object.entries(value);
  if (
    edits.length > 32 ||
    edits.some(([id, edit]) => !/^[a-z][a-z0-9_-]{0,31}$/u.test(id) || !validCharacterEdit(edit))
  )
    throw new Error('Invalid private character settings.');
  return Object.fromEntries(edits);
}
