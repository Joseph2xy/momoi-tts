import assert from 'node:assert/strict';
import { createServerState, type ServerView } from '../web/shared/server-state.ts';
import type { PlaybackState } from '../src/shared/protocol.ts';

const initial: PlaybackState = {
  status: 'idle',
  clip: null,
  playerConnected: false,
  progress: null,
  muted: false,
  volume: 1,
  message: '',
  queue: {
    characters: [],
    mode: 'live',
    repliesEnabled: false,
    activeId: null,
    waitingIds: [],
    requests: [],
    viewerCooldownMs: 0,
    globalCooldownMs: 0,
    waitingExpiryMs: 1000,
  },
};
const updated = { ...initial, volume: 0.4 };
const json = (value: unknown) =>
  new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const flush = async () => {
  for (let i = 0; i < 8; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};

// Fetch-status/cache notifications must not rerender management when its public
// state is unchanged. Pending commands still publish both UI transitions.
{
  const views: ServerView[] = [];
  const controller = createServerState(
    (view) => views.push(view),
    async () => json(initial),
  );
  controller.start();
  await flush();
  const before = views.length;
  await controller.command('/api/settings', { muted: false, volume: 1 });
  await flush();
  assert.equal(views.length, before + 2);
  assert.equal(views[before]?.pending, true);
  assert.equal(views[before + 1]?.pending, false);
  assert.equal(views[before]?.state, views[before + 1]?.state);
  controller.suspend();
}

// A pre-command GET must not replace a completed command, even if its transport
// ignores cancellation. A second click must not send a concurrent command.
{
  let latest: ServerView | undefined;
  let getCount = 0,
    postCount = 0;
  let finishOld!: (response: Response) => void;
  let finishCommand!: (response: Response) => void;
  let oldSignal: AbortSignal | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.method === 'POST') {
      postCount++;
      return new Promise<Response>((resolve) => {
        finishCommand = resolve;
      });
    }
    getCount++;
    if (getCount === 2) {
      oldSignal = init?.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        finishOld = resolve;
      });
    }
    return json(getCount === 1 ? initial : updated);
  };
  const controller = createServerState((view) => {
    latest = view;
  }, fetcher);
  controller.start();
  await flush();
  assert(latest?.connected);
  controller.suspend();
  controller.start();
  await flush();
  assert.equal(getCount, 2);
  const action = controller.command('/api/settings', { muted: false, volume: 0.4 });
  await flush();
  assert(oldSignal?.aborted);
  await assert.rejects(controller.command('/api/queue/skip', {}), /Wait for the current action/);
  assert.equal(postCount, 1);
  finishCommand(json(updated));
  await action;
  await flush();
  finishOld(json(initial));
  await flush();
  assert.equal(latest?.state?.volume, 0.4);
  assert.equal(latest?.pending, false);
  controller.suspend();
}

// Network failures neither retry commands nor expose transport details. Offline
// state prevents new commands; departure aborts an in-flight command.
{
  let latest: ServerView | undefined;
  let offline = false,
    postCount = 0;
  let commandSignal: AbortSignal | undefined;
  let hang = false;
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.method === 'POST') {
      postCount++;
      if (hang)
        return new Promise<Response>((_resolve, reject) => {
          commandSignal = init.signal ?? undefined;
          commandSignal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      throw new TypeError('private-transport-detail');
    }
    if (offline) throw new TypeError('private-transport-detail');
    return json(initial);
  };
  const controller = createServerState((view) => {
    latest = view;
  }, fetcher);
  controller.start();
  await flush();
  await assert.rejects(controller.command('/api/settings', {}), /Connection interrupted/);
  assert.equal(postCount, 1);
  assert(!JSON.stringify(latest).includes('private-transport-detail'));
  offline = true;
  controller.suspend();
  controller.start();
  await flush();
  assert.equal(latest?.connected, false);
  await assert.rejects(controller.command('/api/queue/skip', {}), /reconnect/);
  offline = false;
  controller.suspend();
  controller.start();
  await flush();
  hang = true;
  const action = controller.command('/api/settings', {});
  const rejected = assert.rejects(action, /Connection interrupted/);
  await flush();
  controller.suspend();
  await rejected;
  assert(commandSignal?.aborted);
}
// Explicit cancellation must reject a late successful transport response, even
// when fetch ignores its signal, and leave the page usable after a fresh poll.
{
  let latest: ServerView | undefined;
  let finish!: (response: Response) => void;
  let commandSignal: AbortSignal | undefined;
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.method === 'POST') {
      commandSignal = init.signal ?? undefined;
      return new Promise<Response>((resolve) => {
        finish = resolve;
      });
    }
    return json(initial);
  };
  const controller = createServerState((view) => {
    latest = view;
  }, fetcher);
  controller.start();
  await flush();
  const action = controller.command('/api/test/response', {});
  const rejected = assert.rejects(action, /Connection interrupted/);
  await flush();
  controller.cancelCommand();
  assert(commandSignal?.aborted);
  finish(json(updated));
  await rejected;
  assert.equal(latest?.state?.volume, initial.volume);
  assert.equal(latest?.pending, false);
  controller.suspend();
  controller.start();
  await flush();
  assert.equal(latest?.connected, true);
  controller.suspend();
}

// Departure during the pre-command cancellation await must prevent dispatch.
{
  let postCount = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    if (init?.method === 'POST') postCount++;
    return json(initial);
  };
  const controller = createServerState(() => {}, fetcher);
  controller.start();
  await flush();
  const action = controller.command('/api/test/response', {});
  const rejected = assert.rejects(action, /Connection interrupted/);
  controller.suspend();
  await rejected;
  assert.equal(postCount, 0);
}
console.log(
  'Public state cancellation, serialized commands, offline gating, departure aborts and transport redaction passed. No providers.',
);
