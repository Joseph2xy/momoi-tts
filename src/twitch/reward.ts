import type { ApiClient } from '@twurple/api';
import type { TwitchConfig } from './config.ts';

export async function findReward(api: ApiClient, userId: string, config: TwitchConfig) {
  const rewards = await api.asUser(userId, (client) =>
    client.channelPoints.getCustomRewards(userId, true),
  );
  const reward = rewards.find((entry) => entry.title === config.rewardTitle);
  if (reward && (!reward.userInputRequired || reward.autoFulfill))
    throw new Error('Reward must require text and stay unfulfilled until playback.');
  return reward;
}
export async function createReward(api: ApiClient, userId: string, config: TwitchConfig) {
  const existing = await findReward(api, userId, config);
  if (existing) return existing;
  return api.asUser(userId, (client) =>
    client.channelPoints.createCustomReward(userId, {
      title: config.rewardTitle,
      cost: config.rewardCost,
      prompt:
        'Use Name: your question (for example, Tyrone: How do I improve?). Missing or unknown names and unplayed requests return your points.',
      userInputRequired: true,
      autoFulfill: false,
      globalCooldown: 60,
    }),
  );
}
