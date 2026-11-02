export const redemptionScope = 'channel:manage:redemptions';
export interface TwitchConfig {
  clientId: string;
  channel: string;
  rewardTitle: string;
  rewardCost: number;
  rewardCooldown?: number;
  rewardId?: string;
}

export function validRewardSettings(
  config: Pick<TwitchConfig, 'rewardTitle' | 'rewardCost' | 'rewardCooldown'>,
): boolean {
  const cooldown = config.rewardCooldown ?? 60;
  return (
    !!config.rewardTitle.trim() &&
    config.rewardTitle.length <= 45 &&
    !/[\p{Cc}"\\]/u.test(config.rewardTitle) &&
    Number.isSafeInteger(config.rewardCost) &&
    config.rewardCost >= 1 &&
    config.rewardCost <= 1_000_000 &&
    Number.isSafeInteger(cooldown) &&
    (cooldown === 0 || (cooldown >= 60 && cooldown <= 604800))
  );
}

export function readTwitchConfig(env: NodeJS.ProcessEnv): TwitchConfig | undefined {
  const clientId = env.TWITCH_CLIENT_ID?.trim();
  const channel = env.TWITCH_CHANNEL?.trim().replace(/^#/u, '').toLowerCase();
  if (!clientId && !channel) return undefined;
  if (
    !clientId ||
    !/^[a-z0-9]{10,64}$/iu.test(clientId) ||
    !channel ||
    !/^[a-z0-9_]{1,25}$/u.test(channel)
  )
    throw new Error('Set a valid TWITCH_CLIENT_ID and TWITCH_CHANNEL in private configuration.');
  const rewardTitle = env.TWITCH_REWARD_TITLE?.trim() ?? 'Ask a character';
  const rewardCost = Number(env.TWITCH_REWARD_COST ?? '1000');
  if (!rewardTitle || rewardTitle.length > 45 || /\p{Cc}/u.test(rewardTitle))
    throw new Error('Reward title must contain 1–45 characters.');
  if (!Number.isSafeInteger(rewardCost) || rewardCost < 1 || rewardCost > 1_000_000)
    throw new Error('Reward cost must be 1–1000000 channel points.');
  const rewardCooldown = Number(env.TWITCH_REWARD_COOLDOWN ?? 60);
  const rewardId = env.TWITCH_REWARD_ID?.trim() || undefined;
  const config = {
    clientId,
    channel,
    rewardTitle,
    rewardCost,
    rewardCooldown,
    ...(rewardId ? { rewardId } : {}),
  };
  if (!validRewardSettings(config) || (rewardId && !/^[a-z0-9_-]{1,128}$/iu.test(rewardId)))
    throw new Error('Invalid Twitch reward configuration.');
  return config;
}
