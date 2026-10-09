import { startPlayback } from './playback.ts';
import type { PlaybackState, QueueState } from '../src/shared/protocol.ts';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const message = get('message');
const volume = get<HTMLInputElement>('volume');
const mute = get<HTMLButtonElement>('mute');

let state: PlaybackState | null = null;
let changingVolume = false;
let pending = false;
let connected = false;
let revision = 0;

let feedSignature = '';
let quitting = false;

let primary: boolean | null = null;
let pageActive = true;
let pollTimer: ReturnType<typeof setTimeout> | undefined;

async function command(route: string, body: unknown): Promise<boolean> {
  if (pending || !connected) return false;
  revision++;
  pending = true;
  if (state) render(state);
  try {
    const response = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    const result = (await response.json()) as PlaybackState & { error?: string };
    if (!response.ok) throw new Error(result.error ?? 'The command could not be completed.');
    message.textContent = '';
    state = result;
    if (route === '/api/app/quit') {
      quitting = true;
      connected = false;
      playback.stop();
    }
    return true;
  } catch (error) {
    message.textContent =
      error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError'
        ? error.message
        : 'Connection interrupted. Check the current state before trying again.';
    return false;
  } finally {
    revision++;
    pending = false;
    if (state) render(state);
  }
}
const statusLabels: Record<string, string> = {
  idle: 'Idle',
  waiting: 'Waiting',
  generating: 'Writing reply',
  synthesizing: 'Creating speech',
  ready: 'Ready',
  playing: 'Playing',
  blocked: 'Audio blocked',
  completed: 'Completed',
  skipped: 'Skipped',
  removed: 'Removed',
  expired: 'Expired',
  failed: 'Failed',
  paused: 'Paused',
  stopped: 'Stopped',
};
function renderFeed(queue: QueueState) {
  const signature = JSON.stringify([
    queue.requests,
    queue.waitingIds,
    queue.activeId,
    pending,
    connected,
  ]);
  if (signature === feedSignature) return;
  feedSignature = signature;
  const feed = get('feed');
  const order = [queue.activeId, ...queue.waitingIds];
  const ordered = [
    ...order.flatMap((id) => queue.requests.filter((entry) => entry.id === id)),
    ...queue.requests.filter((entry) => !order.includes(entry.id)).reverse(),
  ];
  const nodes = ordered.map((entry) => {
    const row = document.createElement('article');
    row.className = entry.id === queue.activeId ? 'request current' : 'request';
    const heading = document.createElement('div');
    heading.className = 'row';
    const name = document.createElement('strong');
    name.textContent = `${entry.characterName} · ${entry.viewer}${entry.replayOf ? ' · replay' : ''}`;
    const badge = document.createElement('span');
    badge.className = 'pill';
    badge.dataset.status = entry.status;
    badge.textContent =
      entry.status === 'waiting'
        ? `Up next · ${queue.waitingIds.indexOf(entry.id) + 1}`
        : (statusLabels[entry.status] ?? entry.status);
    heading.append(name, badge);
    const prompt = document.createElement('p');
    prompt.className = 'request-question';
    prompt.textContent = entry.question;
    row.append(heading, prompt);
    if (entry.dialogue) {
      const reply = document.createElement('details');
      reply.className = 'request-reply';
      const summary = document.createElement('summary');
      summary.textContent = 'View reply';
      const dialogue = document.createElement('blockquote');
      dialogue.textContent = entry.dialogue;
      reply.append(summary, dialogue);
      row.append(reply);
    }
    if (entry.error) {
      const error = document.createElement('p');
      error.className = 'error';
      error.textContent = entry.error;
      row.append(error);
    }
    if (entry.status === 'waiting' || entry.replayAvailable) {
      const action = document.createElement('button');
      action.className = 'secondary small';
      action.dataset.id = entry.id;
      action.dataset.action = entry.status === 'waiting' ? 'remove' : 'replay';
      action.textContent = entry.status === 'waiting' ? 'Remove' : 'Replay';
      action.disabled =
        !connected || pending || (entry.status !== 'waiting' && queue.waitingIds.length >= 2);
      row.append(action);
    }
    return row;
  });
  if (!nodes.length) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'No requests yet.';
    feed.replaceChildren(empty);
  } else feed.replaceChildren(...nodes);
}
function render(next: PlaybackState) {
  state = next;
  const twitch = next.twitch;

  get('twitch-detail').textContent = twitch?.channel
    ? `${twitch.channel} · ${twitch.rewardTitle} · ${twitch.message}`
    : 'Twitch setup is pending.';
  get('twitch-rejection').textContent = [
    twitch?.lastRejection ? `Latest redemption: ${twitch.lastRejection}` : '',
    twitch?.settlementMessage ?? '',
    twitch?.pendingUpdates
      ? `${twitch.pendingUpdates} reward update(s) awaiting confirmation.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  get<HTMLButtonElement>('twitch-connect').disabled =
    pending || !twitch || !['disconnected', 'error'].includes(twitch.status);
  get<HTMLButtonElement>('twitch-disconnect').disabled =
    pending || !twitch || !['connecting', 'connected', 'reconnecting'].includes(twitch.status);
  const queue = next.queue;
  const current = queue?.requests.find((entry) => entry.id === queue.activeId);
  get('connection').textContent = !connected
    ? 'Server offline'
    : primary === true
      ? 'Audio in this tab'
      : primary === false
        ? 'Audio in another tab'
        : 'Audio reconnecting';
  get('connection').dataset.connected = String(connected && primary === true);
  const phase = queue?.paused ? 'paused' : (current?.status ?? next.status);
  get('status').textContent = statusLabels[phase] ?? phase;
  get('status').dataset.status = phase;
  const twitchLabels: Record<string, string> = {
    disabled: 'Not set up',
    disconnected: 'Offline',
    connecting: 'Connecting',
    connected: 'Connected',
    reconnecting: 'Reconnecting',
    error: 'Needs attention',
  };
  get('twitch-status').textContent = twitchLabels[twitch?.status ?? 'disabled']!;
  get('twitch-status').dataset.status = twitch?.status ?? 'disabled';
  get('clip').textContent = current
    ? `${current.characterName} replies to ${current.viewer}`
    : 'No active response';
  get('detail').textContent = quitting
    ? 'App closed. Launch the app to start again.'
    : !connected
      ? 'Connection lost. Controls will return when the server reconnects.'
      : next.speechPaused
        ? next.message
        : next.status === 'blocked'
          ? next.message
          : current?.status === 'generating'
            ? `Writing ${current.characterName}’s reply…`
            : current?.status === 'synthesizing'
              ? 'Creating speech…'
              : !next.playerConnected
                ? 'Audio is reconnecting. Requests wait until this page connects.'
                : queue?.paused && !current
                  ? 'Queue paused. Click Resume when ready.'
                  : next.message;
  get('queue-note').textContent = queue?.paused
    ? 'Paused. Speech is held and waiting requests stay here until you resume.'
    : 'Responses play automatically, one at a time.';
  get('response-content').hidden = !current;
  get('current-question').textContent = current?.question ?? '';
  get('current-question').hidden = !current;
  get('current-dialogue').textContent = current?.dialogue ?? '';
  get('current-dialogue').hidden = !current?.dialogue;
  get('playback-progress').hidden =
    !next.progress || !['ready', 'playing', 'blocked'].includes(next.status);
  if (next.progress) {
    const progress = get<HTMLProgressElement>('progress');
    progress.max = next.progress.durationSeconds;
    progress.value = next.progress.elapsedSeconds;
    const time = (seconds: number) =>
      `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
    get('progress-time').textContent =
      `${time(next.progress.elapsedSeconds)} / ${time(next.progress.durationSeconds)}`;
  }
  get<HTMLButtonElement>('quit').disabled = pending || !next.canQuit;
  get<HTMLButtonElement>('skip').disabled = pending || !current;
  get<HTMLButtonElement>('clear').disabled = pending || !queue?.waitingIds.length;
  get<HTMLButtonElement>('stop-clear').disabled =
    pending || (!current && !queue?.waitingIds.length);
  const pause = get<HTMLButtonElement>('pause');
  pause.textContent = queue?.paused ? 'Resume' : 'Pause';
  pause.setAttribute('aria-pressed', String(!!queue?.paused));
  pause.disabled = pending || !queue;
  get('queue-count').textContent =
    `${queue?.activeId ? '1' : '0'} active · ${queue?.waitingIds.length ?? 0}/2 waiting${queue?.paused ? ' · paused' : ''}`;
  const mode = queue?.mode ?? 'disabled';
  get('mode').textContent =
    mode === 'live' ? 'Live mode' : mode === 'demo' ? 'Demo mode' : 'Setup needed';
  mute.textContent = next.muted ? 'Unmute' : 'Mute';
  mute.setAttribute('aria-pressed', String(next.muted));
  mute.disabled = pending;
  get<HTMLButtonElement>('enable').disabled =
    pending || !connected || primary !== true || next.speechPaused;
  volume.disabled = pending;
  if (!changingVolume) volume.value = String(Math.round(next.volume * 100));
  get('volume-value').textContent = `${volume.value}%`;
  if (queue) renderFeed(queue);
  if (!connected)
    document
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, #volume')
      .forEach((control) => {
        control.disabled = true;
      });
}
get('feed').addEventListener('click', (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>('button[data-action]')
      : null;
  if (button && !pending && !button.disabled)
    void command(`/api/requests/${button.dataset.action}`, { id: button.dataset.id });
});
get('pause').addEventListener('click', () => {
  void command(state?.queue?.paused ? '/api/playback/resume' : '/api/playback/pause', {});
});
get('quit').addEventListener('click', () => {
  void command('/api/app/quit', {});
});
get('skip').addEventListener('click', () => {
  void command('/api/queue/skip', {});
});
get('clear').addEventListener('click', () => {
  void command('/api/queue/clear', {});
});
get('stop-clear').addEventListener('click', () => {
  void command('/api/queue/stop', {});
});
get('twitch-connect').addEventListener('click', () => {
  if (!pending) void command('/api/twitch/connect', {});
});
get('twitch-disconnect').addEventListener('click', () => {
  if (!pending) void command('/api/twitch/disconnect', {});
});
mute.addEventListener('click', () => {
  if (state) void command('/api/settings', { muted: !state.muted, volume: state.volume });
});
volume.addEventListener('input', () => {
  changingVolume = true;
  get('volume-value').textContent = `${volume.value}%`;
});
volume.addEventListener('change', () => {
  if (!state) {
    changingVolume = false;
    return;
  }
  const settings = { muted: state.muted, volume: Number(volume.value) / 100 };
  void command('/api/settings', settings).finally(() => {
    changingVolume = false;
    if (state) render(state);
  });
});
async function poll() {
  if (quitting || !pageActive) return;
  const startedAt = revision;
  try {
    const response = await fetch('/api/state', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error();
    const next = (await response.json()) as PlaybackState;
    if (pageActive && startedAt === revision && !pending) {
      connected = true;
      render(next);
    }
  } catch {
    if (pageActive && startedAt === revision && !pending) {
      connected = false;
      if (state) render(state);
      else {
        get('connection').textContent = 'Server offline';
        document
          .querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, #volume')
          .forEach((control) => {
            control.disabled = true;
          });
      }
    }
  }
  if (!quitting && pageActive)
    pollTimer = setTimeout(() => {
      void poll();
    }, 500);
}
const playback = startPlayback((owner) => {
  primary = owner;
  if (state) render(state);
});
window.addEventListener('pagehide', () => {
  pageActive = false;
  revision++;
  clearTimeout(pollTimer);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !quitting) {
    pageActive = true;
    void poll();
  }
});
void poll();
