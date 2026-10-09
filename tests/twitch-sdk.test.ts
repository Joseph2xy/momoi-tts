import { testCharacters } from './fixtures.ts';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WebSocketServer, type WebSocket } from 'ws';
import { ApiClient } from '@twurple/api';
import { RefreshingAuthProvider } from '@twurple/auth';
import { saveToken, loadToken } from '../src/twitch/token-store.ts';
import { twurpleTransport } from '../src/twitch/transport.ts';
import { TwitchIntake } from '../src/twitch/intake.ts';
import { memoryRedemptionStore } from '../src/twitch/redemption-store.ts';
import { createReward } from '../src/twitch/reward.ts';
import { RequestQueue } from '../src/queue/request-queue.ts';

const clientId = 'testclient123456';
const config = { clientId, channel: 'lacari', rewardTitle: 'Ask Tyrone', rewardCost: 1000 };
const root = await mkdtemp(path.join(tmpdir(), 'tyrone-twitch-'));
const file = pathToFileURL(path.join(root, 'token.json'));
const previousMockPort = process.env.TWURPLE_MOCK_API_PORT;
const originalSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = ((
  handler: (...args: unknown[]) => void,
  delay?: number,
  ...args: unknown[]
) => {
  const timer = originalSetTimeout(handler, delay, ...args);
  if (delay === 600_000) timer.unref();
  return timer;
}) as typeof setTimeout;
let refreshed = 0,
  connections = 0,
  validationCalls = 0,
  rewardCreates = 0;
let rewardExists = false;
let socket: WebSocket | undefined;
const subscriptions: Record<string, unknown>[] = [];
const unexpected: string[] = [];
const statuses = new Map<string, string>();
let loseNextPatch = false;
const reward = {
  id: 'reward1',
  broadcaster_id: '123',
  broadcaster_login: 'lacari',
  broadcaster_name: 'Lacari',
  title: 'Ask Tyrone',
  cost: 1000,
  prompt: 'Ask',
  is_enabled: true,
  is_user_input_required: true,
  should_redemptions_skip_request_queue: false,
  global_cooldown_setting: { is_enabled: true, global_cooldown_seconds: 60 },
  max_per_stream_setting: { is_enabled: false, max_per_stream: 0 },
  max_per_user_per_stream_setting: { is_enabled: false, max_per_user_per_stream: 0 },
  is_paused: false,
  is_in_stock: true,
};
const redemption = (id: string) => ({
  id,
  broadcaster_id: '123',
  broadcaster_login: 'lacari',
  broadcaster_name: 'Lacari',
  user_id: '77',
  user_login: 'viewer',
  user_name: 'Viewer',
  user_input: 'Tyrone: Test through the real SDK',
  status: statuses.get(id) ?? 'UNFULFILLED',
  redeemed_at: new Date().toISOString(),
  reward: { id: 'reward1', title: 'Ask Tyrone', cost: 1000, prompt: 'Ask' },
});
const server = createServer((request, response) => {
  response.setHeader('Ratelimit-Limit', '800');
  response.setHeader('Ratelimit-Remaining', '799');
  response.setHeader('Ratelimit-Reset', String(Math.floor(Date.now() / 1000) + 60));
  void (async () => {
    const url = new URL(request.url!, 'http://localhost');
    let result: unknown;
    if (url.pathname === '/auth/token') {
      assert.equal(url.searchParams.get('grant_type'), 'refresh_token');
      assert.equal(url.searchParams.get('client_secret'), null);
      refreshed++;
      result = {
        access_token: 'dummy-new-access',
        refresh_token: 'dummy-new-refresh',
        expires_in: 3600,
        scope: ['channel:manage:redemptions'],
        token_type: 'bearer',
      };
    } else if (url.pathname === '/auth/validate') {
      validationCalls++;
      result = {
        client_id: clientId,
        login: 'lacari',
        user_id: '123',
        scopes: ['channel:manage:redemptions'],
        expires_in: 3600,
      };
    } else if (url.pathname === '/mock/users') {
      result = { data: [{ id: '123', login: 'lacari', display_name: 'Lacari' }] };
    } else if (url.pathname === '/mock/channel_points/custom_rewards') {
      if (request.method === 'POST') {
        let raw = '';
        for await (const chunk of request) raw += String(chunk);
        const body = JSON.parse(raw);
        assert.equal(body.title, 'Ask Tyrone');
        assert.equal(body.is_user_input_required, true);
        assert.equal(body.should_redemptions_skip_request_queue, false);
        assert.equal(body.global_cooldown_seconds, 60);
        rewardCreates++;
        rewardExists = true;
      }
      result = { data: rewardExists ? [reward] : [] };
    } else if (url.pathname === '/mock/channel_points/custom_rewards/redemptions') {
      const id = url.searchParams.get('id');
      if (request.method === 'PATCH') {
        let raw = '';
        for await (const chunk of request) raw += String(chunk);
        const body = JSON.parse(raw);
        assert(id);
        statuses.set(id, body.status);
        if (loseNextPatch) {
          loseNextPatch = false;
          response.statusCode = 500;
          response.end('{}');
          return;
        }
      }
      result = {
        data: id
          ? [redemption(id)]
          : [...statuses]
              .filter(([, status]) => status === 'UNFULFILLED')
              .map(([key]) => redemption(key)),
        pagination: {},
      };
    } else if (url.pathname === '/eventsub/subscriptions' && request.method === 'POST') {
      let raw = '';
      for await (const chunk of request) raw += String(chunk);
      const created = JSON.parse(raw) as Record<string, unknown>;
      const subscription = {
        ...created,
        id: 'subscription-' + (subscriptions.length + 1),
        status: 'enabled',
        cost: 1,
        created_at: new Date().toISOString(),
      };
      subscriptions.push(subscription);
      result = { data: [subscription], total: 2, total_cost: 2, max_total_cost: 10 };
    } else {
      unexpected.push(request.method + ' ' + url.pathname);
      result = { error: 'Unexpected mock endpoint' };
      response.statusCode = 404;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(result));
  })().catch(() => {
    unexpected.push('Mock request handler failed');
    response.statusCode = 500;
    response.end('{}');
  });
});
const ws = new WebSocketServer({ server, path: '/ws' });
ws.on('connection', (client) => {
  connections++;
  socket = client;
  client.send(
    JSON.stringify({
      metadata: {
        message_id: 'welcome-' + connections,
        message_type: 'session_welcome',
        message_timestamp: new Date().toISOString(),
      },
      payload: {
        session: {
          id: 'mock-session-' + connections,
          status: 'connected',
          keepalive_timeout_seconds: 60,
        },
      },
    }),
  );
});
let played: string | undefined;
const queue = new RequestQueue({
  pipeline: {
    characters: testCharacters,
    mode: 'demo',
    async generate() {
      return 'Reply';
    },
    async synthesize() {
      return Buffer.from('ID3mock');
    },
  },
  playerReady: () => true,
  play(id) {
    played = id;
  },
  stop() {},
  settings: { viewerCooldownMs: 0, globalCooldownMs: 0 },
});
const intake = new TwitchIntake(config, queue, twurpleTransport(file), memoryRedemptionStore());
async function until(predicate: () => boolean, timeout = 5000): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error(
        'Mock SDK check timed out: ' +
          JSON.stringify({ state: intake.snapshot(), subscriptions, unexpected }),
      );
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}
function send(id: string, type: string, event: unknown) {
  const subscription = [...subscriptions].reverse().find((entry) => entry.type === type);
  assert(socket && subscription);
  const apiEvent = event as Record<string, unknown>;
  const eventSubEvent = {
    ...apiEvent,
    broadcaster_user_id: '123',
    broadcaster_user_login: 'lacari',
    broadcaster_user_name: 'Lacari',
  };
  socket.send(
    JSON.stringify({
      metadata: {
        message_id: id,
        message_type: 'notification',
        message_timestamp: new Date().toISOString(),
        subscription_type: type,
        subscription_version: '1',
      },
      payload: { subscription, event: eventSubEvent },
    }),
  );
}
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert(address && typeof address !== 'string');
  process.env.TWURPLE_MOCK_API_PORT = String(address.port);
  await saveToken(
    {
      clientId,
      userId: '123',
      token: {
        accessToken: 'dummy-old-access',
        refreshToken: 'dummy-old-refresh',
        scope: ['channel:manage:redemptions'],
        expiresIn: 1,
        obtainmentTimestamp: 0,
      },
    },
    file,
  );
  // Explicit reward setup is idempotent. No reward is created by application connect.
  const auth = new RefreshingAuthProvider({ clientId });
  await auth.addUserForToken((await loadToken(file)).token);
  const setupApi = new ApiClient({ authProvider: auth, logger: { custom: () => {} } });
  await createReward(setupApi, '123', config);
  await createReward(setupApi, '123', config);
  assert.equal(rewardCreates, 1);
  intake.connect();
  await until(() => intake.snapshot().status === 'connected');
  assert(refreshed >= 1);
  assert(validationCalls >= 2);
  assert.equal(rewardCreates, 1);
  assert.equal((await loadToken(file)).token.refreshToken, 'dummy-new-refresh');
  assert.equal(subscriptions.length, 2);
  for (const subscription of subscriptions) {
    assert.deepEqual(subscription.condition, { broadcaster_user_id: '123', reward_id: 'reward1' });
    assert.deepEqual(subscription.transport, { method: 'websocket', session_id: 'mock-session-1' });
  }
  assert.deepEqual(subscriptions.map((entry) => entry.type).sort(), [
    'channel.channel_points_custom_reward_redemption.add',
    'channel.channel_points_custom_reward_redemption.update',
  ]);
  const addType = 'channel.channel_points_custom_reward_redemption.add';
  const updateType = 'channel.channel_points_custom_reward_redemption.update';
  statuses.set('redemption1', 'UNFULFILLED');
  send('delivery1', addType, redemption('redemption1'));
  await until(() => !!played);
  assert.equal(queue.snapshot().requests[0]?.question, 'Test through the real SDK');
  send('delivery2', addType, redemption('redemption1'));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(queue.snapshot().requests.length, 1);
  assert.equal(intake.snapshot().accepted, 1);
  // Lost response after a successful Twitch PATCH is reconciled without another charge/refund.
  loseNextPatch = true;
  queue.playbackEvent(played!, 'ended');
  await until(() => statuses.get('redemption1') === 'FULFILLED');
  await until(() => intake.snapshot().pendingUpdates === 0);
  played = undefined;
  statuses.set('redemption2', 'UNFULFILLED');
  send('delivery3', addType, redemption('redemption2'));
  await until(() => !!played);
  statuses.set('redemption2', 'CANCELED');
  send('moderation', updateType, redemption('redemption2'));
  await until(() => queue.snapshot().requests[1]?.status === 'skipped');
  socket!.terminate();
  await until(() => subscriptions.length === 4 && intake.snapshot().status === 'connected', 10_000);
  assert.equal(connections, 2);
  socket!.send(
    JSON.stringify({
      metadata: {
        message_id: 'revoke',
        message_type: 'revocation',
        message_timestamp: new Date().toISOString(),
      },
      payload: { subscription: { ...subscriptions.at(-1), status: 'authorization_revoked' } },
    }),
  );
  await until(() => intake.snapshot().status === 'error');
  assert.deepEqual(unexpected, []);
  console.log(
    'Actual Twurple SDK passed against a local mock: reward setup, broadcaster auth/refresh, both redemption subscriptions, completion reconciliation, moderation cancellation, reconnect, and revocation. No Twitch access.',
  );
} finally {
  intake.disconnect();
  queue.stopAndClear();
  if (previousMockPort === undefined) delete process.env.TWURPLE_MOCK_API_PORT;
  else process.env.TWURPLE_MOCK_API_PORT = previousMockPort;
  globalThis.setTimeout = originalSetTimeout;
  for (const client of ws.clients) client.terminate();
  await new Promise<void>((resolve) => ws.close(() => resolve()));
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await rm(root, { recursive: true, force: true });
}
