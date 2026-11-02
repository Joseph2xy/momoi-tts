import type { ApiClient } from '@twurple/api';
import type { TwitchConfig } from './config.ts';
import { RequestInputError } from '../shared/errors.ts';

export function characterRewardPrompt(names: string[]): string {
  const prompt = `Use Name: question. Available: ${names.join(', ') || 'none'}. Unplayed requests return your points.`;
  if (prompt.length > 200)
    throw new RequestInputError(
      'Available character names exceed Twitch’s 200-character reward description. Reduce the available list.',
    );
  return prompt;
}

export async function findReward(api: ApiClient, userId: string, config: TwitchConfig) {
  const rewards = await api.asUser(userId, (client) =>
    client.channelPoints.getCustomRewards(userId, true),
  );
  const reward = rewards.find((entry) =>
    config.rewardId ? entry.id === config.rewardId : entry.title === config.rewardTitle,
  );
  if (reward && (!reward.userInputRequired || reward.autoFulfill))
    throw new Error('Reward must require text and stay unfulfilled until playback.');
  return reward;
}
