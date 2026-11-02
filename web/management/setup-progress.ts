export type SetupPosition = { step: number; prepare: number; characterId: string | null };

// Resume navigation only. Provider access and audible playback are never inferred from this.
export function readSetupPosition(value: string | null): SetupPosition {
  const fallback = { step: 0, prepare: 0, characterId: null };
  try {
    const saved = JSON.parse(value ?? 'null');
    if (saved?.version !== 1) return fallback;
    return {
      step: Number.isInteger(saved.step) ? Math.max(0, Math.min(4, saved.step)) : 0,
      prepare: Number.isInteger(saved.prepare) ? Math.max(0, Math.min(3, saved.prepare)) : 0,
      characterId:
        typeof saved.characterId === 'string' && /^[a-z0-9_-]{1,100}$/iu.test(saved.characterId)
          ? saved.characterId
          : null,
    };
  } catch {
    return fallback;
  }
}

export function preparationLimit(
  generationReady: boolean,
  speechReady: boolean,
  characterReady: boolean,
) {
  return !generationReady ? 0 : !speechReady ? 1 : !characterReady ? 2 : 3;
}

export function setupLimit(
  authorized: boolean,
  privateReplyHeard: boolean,
  obsHeard: boolean,
  rewardReady: boolean,
) {
  return !authorized ? 0 : !privateReplyHeard ? 1 : !obsHeard ? 2 : !rewardReady ? 3 : 4;
}
