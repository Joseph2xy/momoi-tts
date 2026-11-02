import { ApiClient, type HelixCustomRewardRedemption } from '@twurple/api';
import { RefreshingAuthProvider, getTokenInfo } from '@twurple/auth';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { loadToken, saveToken, tokenFile } from './token-store.ts';
import type { TwitchTransportFactory } from './intake.ts';
import { redemptionScope } from './config.ts';
import { findReward } from './reward.ts';

// Twurple intentionally leaves fetch options open for the host runtime.
declare module '@twurple/api-call' {
  interface TwitchApiCallFetchOptions {
    signal?: AbortSignal;
  }
}

// SDK diagnostics can contain request URLs or payloads. Expose fixed application status instead.
const logger = { custom: () => {} };
const statusOf = (entry: HelixCustomRewardRedemption): string =>
  entry.isFulfilled ? 'FULFILLED' : entry.isCanceled ? 'CANCELED' : 'UNFULFILLED';
export function twurpleTransport(file = tokenFile): TwitchTransportFactory {
  return (config, callbacks) => {
    let listener: EventSubWsListener | null = null;
    let validationTimer: ReturnType<typeof setInterval> | undefined;
    let connectingTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    let validating = false;
    let writes: Promise<void> = Promise.resolve();
    let api: ApiClient | null = null;
    let broadcasterId = '';
    let rewardId = '';
    let live = false;
    let streamRevision = 0;
    let socketRevision = 0;
    const stop = () => {
      stopped = true;
      if (validationTimer) clearInterval(validationTimer);
      if (connectingTimer) clearTimeout(connectingTimer);
      listener?.stop();
      listener = null;
    };
    const failed = () => {
      if (!stopped) {
        stop();
        callbacks.failed();
      }
    };
    return {
      stop,
      async pauseReward(reward, paused, prompt) {
        if (stopped || !api) throw new Error('Twitch disconnected.');
        await api.asUser(broadcasterId, (client) =>
          client.channelPoints.updateCustomReward(broadcasterId, reward, {
            isPaused: paused,
            ...(prompt ? { prompt } : {}),
          }),
        );
      },
      async isLive() {
        if (stopped || !api) throw new Error('Twitch disconnected.');
        const revision = streamRevision;
        const stream = await api.asUser(broadcasterId, (client) =>
          client.streams.getStreamByUserId(broadcasterId),
        );
        if (stopped) throw new Error('Twitch disconnected.');
        if (revision === streamRevision) live = !!stream;
        return live;
      },
      async status(reward, id) {
        if (stopped || !api) throw new Error('Twitch disconnected.');
        const result = await api.asUser(broadcasterId, (client) =>
          client.channelPoints.getRedemptionById(broadcasterId, reward, id),
        );
        if (!result) throw new Error('Reward status unavailable.');
        return statusOf(result);
      },
      async settle(reward, id, target) {
        if (stopped || !api) throw new Error('Twitch disconnected.');
        // Re-read first: retries and moderator races must never overwrite a final outcome.
        const current = await api.asUser(broadcasterId, (client) =>
          client.channelPoints.getRedemptionById(broadcasterId, reward, id),
        );
        if (!current) throw new Error('Reward status unavailable.');
        if (statusOf(current) !== 'UNFULFILLED') return statusOf(current);
        try {
          const result = await api.asUser(broadcasterId, (client) =>
            client.channelPoints.updateRedemptionStatusByIds(broadcasterId, reward, [id], target),
          );
          if (!result[0]) throw new Error('Reward update unconfirmed.');
          return statusOf(result[0]);
        } catch {
          const result = await api.asUser(broadcasterId, (client) =>
            client.channelPoints.getRedemptionById(broadcasterId, reward, id),
          );
          if (!result || statusOf(result) === 'UNFULFILLED')
            throw new Error('Reward update unconfirmed.');
          return statusOf(result);
        }
      },
      async outstanding(reward) {
        if (stopped || !api) throw new Error('Twitch disconnected.');
        const result: { id: string; rewardId: string }[] = [];
        let after: string | undefined;
        do {
          const page = await api.asUser(broadcasterId, (client) =>
            client.channelPoints.getRedemptionsForBroadcaster(
              broadcasterId,
              reward,
              'UNFULFILLED',
              { limit: 50, after },
            ),
          );
          result.push(...page.data.map((entry) => ({ id: entry.id, rewardId: reward })));
          if (result.length > 256)
            throw new Error('Review outstanding rewards in Twitch before reconnecting.');
          after = page.cursor;
        } while (after);
        return result;
      },
      async start(signal) {
        signal.addEventListener('abort', stop, { once: true });
        connectingTimer = setTimeout(failed, 20_000);
        const check = () => {
          signal.throwIfAborted();
          if (stopped) throw new Error('Twitch connection stopped.');
        };
        check();
        const saved = await loadToken(file);
        check();
        if (saved.clientId !== config.clientId)
          throw new Error('Twitch sign-in belongs to another app.');
        const auth = new RefreshingAuthProvider({ clientId: config.clientId });
        auth.onRefresh((userId, token) => {
          if (stopped) return;
          writes = writes.then(async () => {
            if (stopped) return;
            await saveToken({ clientId: config.clientId, userId, token }, file, signal);
          });
          void writes.catch(failed);
        });
        auth.onRefreshFailure(failed);
        const userId = await auth.addUserForToken(saved.token);
        check();
        if (userId !== saved.userId) throw new Error('Unexpected Twitch account.');
        async function validate() {
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            await Promise.race([
              (async () => {
                const token = await auth.getAccessTokenForUser(userId);
                check();
                if (!token) throw new Error('Twitch sign-in is unavailable.');
                const info = await getTokenInfo(token.accessToken, config.clientId);
                check();
                if (
                  info.userId !== userId ||
                  info.clientId !== config.clientId ||
                  !info.scopes.includes(redemptionScope)
                )
                  throw new Error('Twitch sign-in lacks reward access.');
                await writes;
                check();
              })(),
              new Promise<never>((_resolve, reject) => {
                timer = setTimeout(() => reject(new Error('Twitch validation timed out.')), 15_000);
              }),
            ]);
          } finally {
            if (timer) clearTimeout(timer);
          }
        }
        await validate();
        check();
        api = new ApiClient({
          authProvider: auth,
          logger,
          fetchOptions: {
            get signal() {
              return AbortSignal.any([signal, AbortSignal.timeout(15_000)]);
            },
          },
        });
        const channel = await api.asUser(userId, (client) =>
          client.users.getUserByName(config.channel),
        );
        check();
        if (!channel || channel.id !== userId)
          throw new Error('Sign in as the configured broadcaster.');
        broadcasterId = channel.id;
        const reward = await findReward(api, userId, config);
        check();
        if (!reward) throw new Error('Create the configured character reward first.');
        rewardId = reward.id;
        listener = new EventSubWsListener({ apiClient: api, logger });
        const subscriptions = new Set<string>();
        listener.onUserSocketDisconnect(() => {
          if (stopped) return;
          subscriptions.clear();
          socketRevision++;
          callbacks.reconnecting();
          if (connectingTimer) clearTimeout(connectingTimer);
          connectingTimer = setTimeout(failed, 20_000);
        });
        listener.onSubscriptionCreateSuccess((subscription) => {
          if (stopped) return;
          subscriptions.add(subscription.id);
          if (subscriptions.size === 4) {
            if (connectingTimer) clearTimeout(connectingTimer);
            const revision = streamRevision;
            const connectedSocket = socketRevision;
            void api!
              .asUser(broadcasterId, (client) => client.streams.getStreamByUserId(broadcasterId))
              .then((stream) => {
                if (stopped || socketRevision !== connectedSocket) return;
                if (revision === streamRevision) live = !!stream;
                callbacks.connected(rewardId, live);
              })
              .catch(() => {
                if (socketRevision === connectedSocket) failed();
              });
          }
        });
        listener.onSubscriptionCreateFailure(failed);
        listener.onRevoke(failed);
        listener.onStreamOnline(channel.id, () => {
          if (stopped) return;
          streamRevision++;
          live = true;
          callbacks.streamChanged(true);
        });
        listener.onStreamOffline(channel.id, () => {
          if (stopped) return;
          streamRevision++;
          live = false;
          callbacks.streamChanged(false);
        });
        listener.onChannelRedemptionAddForReward(channel.id, rewardId, (event) => {
          if (!stopped) callbacks.redemption(event);
        });
        listener.onChannelRedemptionUpdateForReward(channel.id, rewardId, (event) => {
          if (!stopped) callbacks.updated(event);
        });
        listener.start();
        // Twitch requires token validation at startup and at least hourly, even while idle.
        validationTimer = setInterval(() => {
          if (stopped || validating) return;
          validating = true;
          void validate()
            .catch(failed)
            .finally(() => {
              validating = false;
            });
        }, 55 * 60_000);
        validationTimer.unref();
      },
    };
  };
}
export const createTwurpleTransport = twurpleTransport();
