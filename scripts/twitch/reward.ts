import { ApiClient } from '@twurple/api';
import { RefreshingAuthProvider, getTokenInfo } from '@twurple/auth';
import { redemptionScope } from '../../src/twitch/config.ts';
import { readTwitchConfig } from '../../src/twitch/config.ts';
import { loadToken, saveToken, tokenFile } from '../../src/twitch/token-store.ts';
import { createReward } from '../../src/twitch/reward.ts';

// Explicit setup only. App startup/connect never creates or edits a reward.
const deadline = AbortSignal.timeout(45_000);
const watchdog = setTimeout(() => {
  console.error('Reward setup timed out. Retry setup to check whether the reward was created.');
  process.exit(1);
}, 46_000);
watchdog.unref();
try {
  if (process.argv.length > 2) throw new Error('Unknown setup option.');
  const config = readTwitchConfig(process.env);
  const file = tokenFile;
  if (!config) throw new Error();
  const saved = await loadToken(file);
  if (saved.clientId !== config.clientId) throw new Error();
  const auth = new RefreshingAuthProvider({ clientId: config.clientId });
  let writes = Promise.resolve();
  auth.onRefresh((userId, token) => {
    writes = writes.then(() => saveToken({ clientId: config.clientId, userId, token }, file));
    void writes.catch(() => {}); // The awaited chain below reports a fixed error.
  });
  const userId = await auth.addUserForToken(saved.token);
  const token = await auth.getAccessTokenForUser(userId);
  if (!token) throw new Error();
  const info = await getTokenInfo(token.accessToken, config.clientId);
  deadline.throwIfAborted();
  await writes;
  if (
    info.userId !== userId ||
    info.userName?.toLowerCase() !== config.channel ||
    !info.scopes.includes(redemptionScope)
  )
    throw new Error();
  const api = new ApiClient({
    authProvider: auth,
    logger: { custom: () => {} },
    fetchOptions: {
      get signal() {
        return AbortSignal.any([deadline, AbortSignal.timeout(15_000)]);
      },
    },
  });
  const reward = await createReward(api, userId, config);
  await writes;
  console.log(
    `Reward ready: ${reward.title} (${reward.cost} channel points). Existing reward settings are preserved.`,
  );
} catch {
  console.error(
    'Reward setup failed. Check broadcaster sign-in, channel-points eligibility, and whether another reward already has that title.',
  );
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  setTimeout(() => process.exit(process.exitCode ?? 0), 1000).unref();
}
