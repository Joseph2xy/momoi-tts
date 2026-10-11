// Fish substitutes its default for unknown model headers; fail closed on unsupported choices.
export const fishModels = ['s1', 's2-pro', 's2.1-pro', 's2.1-pro-free', 'drama-3-preview'] as const;
export type FishModel = (typeof fishModels)[number];
export const defaultFishModel: FishModel = 's2.1-pro-free';

export function validateFishModel(model: unknown): asserts model is FishModel {
  if (typeof model !== 'string' || !(fishModels as readonly string[]).includes(model))
    throw new Error('Choose a supported Fish Audio model explicitly.');
}
