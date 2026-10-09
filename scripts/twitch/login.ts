import { startDeviceCodeFlow, exchangeDeviceCode, getTokenInfo } from '@twurple/auth';
import { setTimeout as delay } from 'node:timers/promises';
import { readTwitchConfig, redemptionScope } from '../../src/twitch/config.ts';
import { saveToken } from '../../src/twitch/token-store.ts';

const scopes = [redemptionScope];
const controller = new AbortController();
process.once('SIGINT', () => controller.abort());
async function bounded<T>(operation: () => Promise<T>): Promise<T> {
  controller.signal.throwIfAborted();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new Error('Cancelled.'));
        controller.signal.addEventListener('abort', abort, { once: true });
        timer = setTimeout(() => reject(new Error('Twitch request timed out.')), 15_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (abort) controller.signal.removeEventListener('abort', abort);
  }
}
try {
  const config = readTwitchConfig(process.env);
  if (!config) throw new Error('Missing Twitch configuration.');
  const device = await bounded(() => startDeviceCodeFlow(config.clientId, scopes));
  controller.signal.throwIfAborted();
  const uri = new URL(device.verificationUri);
  if (uri.protocol !== 'https:' || uri.hostname !== 'www.twitch.tv' || uri.pathname !== '/activate')
    throw new Error('Invalid activation URL.');
  console.log(
    `Open ${uri.href} and authorize reward management as the broadcaster for ${config.channel}.`,
  );
  console.log(`Activation code: ${device.userCode}. Access and refresh tokens stay private.`);
  const expires = Date.now() + Math.min(device.expiresIn, 1800) * 1000;
  let interval = Math.max(device.interval, 5) * 1000;
  let authorized = false;
  while (Date.now() < expires && !authorized) {
    await delay(interval, undefined, { signal: controller.signal });
    try {
      const token = await bounded(() =>
        exchangeDeviceCode(config.clientId, device.deviceCode, scopes),
      );
      controller.signal.throwIfAborted();
      const info = await bounded(() => getTokenInfo(token.accessToken, config.clientId));
      controller.signal.throwIfAborted();
      if (
        !info.userId ||
        info.clientId !== config.clientId ||
        info.userName?.toLowerCase() !== config.channel ||
        !info.scopes.includes(redemptionScope)
      )
        throw new Error('Invalid authorization.');
      await saveToken({ clientId: config.clientId, userId: info.userId, token });
      console.log(
        'Broadcaster sign-in saved privately. Run npm run twitch:reward once to create the reward, then connect in the app.',
      );
      authorized = true;
    } catch (error) {
      // Twurple's HTTP error body is inspected only for known polling states, never printed.
      const body =
        error && typeof error === 'object' && 'body' in error && typeof error.body === 'string'
          ? error.body
          : '';
      let message: unknown;
      try {
        message = (JSON.parse(body) as { message?: unknown }).message;
      } catch {}
      if (message === 'authorization_pending') continue;
      if (message === 'slow_down') {
        interval += 5000;
        continue;
      }
      throw new Error('Twitch sign-in failed.');
    }
  }
  if (!authorized) throw new Error('Twitch sign-in expired.');
} catch {
  console.error(
    controller.signal.aborted
      ? 'Twitch sign-in cancelled.'
      : 'Twitch sign-in failed. Check the Public app client ID and retry.',
  );
  process.exitCode = 1;
} finally {
  // SDK OAuth helpers do not accept AbortSignal. Bound lingering network work
  // after cancellation/timeout; no late response can reach token persistence.
  setTimeout(() => process.exit(process.exitCode ?? 0), 1000).unref();
}
