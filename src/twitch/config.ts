export const redemptionScope = 'channel:manage:redemptions';
export interface TwitchConfig {
  clientId: string;
  channel: string;
  rewardTitle: string;
  rewardCost: number;
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
  const rewardTitle = env.TWITCH_REWARD_TITLE?.trim() ?? 'Ask Tyrone';
  const rewardCost = Number(env.TWITCH_REWARD_COST ?? '1000');
  if (!rewardTitle || rewardTitle.length > 45 || /\p{Cc}/u.test(rewardTitle))
    throw new Error('Reward title must contain 1–45 characters.');
  if (!Number.isSafeInteger(rewardCost) || rewardCost < 1 || rewardCost > 1_000_000)
    throw new Error('Reward cost must be 1–1000000 channel points.');
  return { clientId, channel, rewardTitle, rewardCost };
}
