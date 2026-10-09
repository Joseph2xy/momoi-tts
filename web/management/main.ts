import { startPlayback } from '../playback/player.ts';
import { get } from '../shared/dom.ts';
import { createActivityFeed, statusLabels } from './activity.ts';
import { createSettings } from './settings.ts';
import { route } from './navigation.ts';
import { bindPlaybackControls } from './controls.ts';
import type { PlaybackState, SettingsSection } from '../../src/shared/protocol.ts';
let state: PlaybackState | null = null,
  connected = false,
  pending = false,
  owner: boolean | null = null;
let quitting = false,
  pageActive = true,
  revision = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
async function command(route: string, body: unknown, timeout = 5000): Promise<any> {
  if (pending || !connected)
    throw new Error('Wait for the current action or reconnect to the server.');
  pending = true;
  revision++;
  try {
    const response = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The action could not be completed.');
    get('message').textContent = '';
    if (result.queue) {
      state = result;
      render(result);
    }
    return result;
  } catch (error) {
    const text =
      error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError'
        ? error.message
        : 'Connection interrupted. Check the current state before trying again.';
    get('message').textContent = text;
    throw new Error(text);
  } finally {
    pending = false;
    revision++;
    if (state) render(state);
  }
}
function render(next: PlaybackState) {
  state = next;
  get('connection').textContent = !connected
    ? 'Server offline'
    : owner === true
      ? 'Audio in this tab'
      : owner === false
        ? 'Audio in another tab'
        : 'Audio connecting';
  const q = next.queue,
    active = q?.requests.find((r) => r.id === q.activeId);
  get<HTMLButtonElement>('pause').textContent = q?.paused ? 'Resume' : 'Pause';
  get('pause').setAttribute('aria-pressed', String(!!q?.paused));
  get<HTMLButtonElement>('pause').disabled = pending || !connected || !q;
  get<HTMLButtonElement>('skip').disabled = pending || !connected || !active;
  get<HTMLButtonElement>('clear').disabled = pending || !connected || !q?.waitingIds.length;
  get<HTMLButtonElement>('stop-clear').disabled =
    pending || !connected || (!active && !q?.waitingIds.length);
  get<HTMLButtonElement>('mute').textContent = next.muted ? 'Unmute' : 'Mute';
  get('mute').setAttribute('aria-pressed', String(next.muted));
  get<HTMLButtonElement>('mute').disabled = pending || !connected;
  if (document.activeElement !== get('volume'))
    get<HTMLInputElement>('volume').value = String(Math.round(next.volume * 100));
  get('volume-value').textContent = `${get<HTMLInputElement>('volume').value}%`;
  get('mode').textContent =
    q?.mode === 'demo'
      ? 'Demo — simulated replies and test audio'
      : q?.mode === 'live'
        ? 'Configured providers — explicit tests use their allowance'
        : 'Local setup incomplete';
  get('detail').textContent = active
    ? `${statusLabels[active.status] || active.status}${q?.paused ? ' — paused' : ''}`
    : q?.paused
      ? 'Queue paused.'
      : '';
  get('playback-progress').hidden = !next.progress;
  if (next.progress) {
    get<HTMLProgressElement>('progress').max = next.progress.durationSeconds;
    get<HTMLProgressElement>('progress').value = next.progress.elapsedSeconds;
    get('progress-time').textContent =
      `${Math.round(next.progress.elapsedSeconds)} / ${Math.round(next.progress.durationSeconds)}s`;
  }
  renderFeed(next);
  settings.render(next);
  get<HTMLButtonElement>('quit').disabled = pending || !next.canQuit;
}
const renderFeed = createActivityFeed();
const settings = createSettings(command, render, route);
bindPlaybackControls(command, () => state);

document.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLElement>('button, [data-target]');
  if (!button || (button as HTMLButtonElement).disabled) return;
  if (button.dataset.page) {
    route(button.dataset.page);
    return;
  }
  if (button.dataset.target) {
    button.dataset.target === 'connections'
      ? route('connections')
      : route('settings', button.dataset.target);
    return;
  }
  if (button.dataset.discard && state?.management) {
    settings.discard(button.dataset.discard as SettingsSection, state.management);
    return;
  }
  if (button.dataset.remove) {
    void command('/api/requests/remove', { id: button.dataset.remove }).catch(() => {});
    return;
  }
  if (button.dataset.check) {
    const section = button.dataset.check;
    if (
      !confirm(
        'Check the saved connection? This contacts the provider without generating dialogue or speech.',
      )
    )
      return;
    void command('/api/check/connection', { section }, 12000)
      .then((r) => {
        document.querySelector(`[data-check-result="${section}"]`)!.textContent = r.message;
      })
      .catch((e) => {
        document.querySelector(`[data-check-result="${section}"]`)!.textContent = e.message;
      });
    return;
  }
  const action = button.dataset.action;
  if (action === 'setup') route('setup');
  else if (action === 'prerequisites')
    void command('/api/app/prerequisites', {})
      .then((r) => (get('prerequisite-result').textContent = r.message))
      .catch(() => {});
  else if (action === 'refresh-profiles')
    void command('/api/app/refresh-profiles', {})
      .then((r) => {
        if (r.management) settings.refreshCharacters(r.management);
      })
      .catch(() => {});
  else if (action === 'restart' || action === 'quit') {
    if (
      !confirm(
        action === 'restart'
          ? 'Restart the app? Active work is cancelled, waiting requests are cleared, and you must Resume afterward.'
          : 'Shut down the app? Active and waiting work will be cancelled.',
      )
    )
      return;
    void command(action === 'restart' ? '/api/app/restart' : '/api/app/quit', { confirmed: true })
      .then(() => {
        quitting = true;
        playback.stop();
        get('message').textContent =
          action === 'restart'
            ? 'Restarting. The launcher will reopen the browser.'
            : 'App shut down. Use the desktop shortcut to reopen.';
      })
      .catch(() => {});
  }
});
const playback = startPlayback((primary) => {
  owner = primary;
  get('connection').textContent = !connected
    ? 'Server offline'
    : primary === true
      ? 'Audio in this tab'
      : primary === false
        ? 'Audio in another tab'
        : 'Audio connecting';
});
async function poll() {
  if (quitting || !pageActive) return;
  const at = revision;
  try {
    const r = await fetch('/api/state', { signal: AbortSignal.timeout(2000) });
    if (!r.ok) throw new Error();
    const next = (await r.json()) as PlaybackState;
    if (at === revision && !pending && pageActive) {
      connected = true;
      render(next);
    }
  } catch {
    if (at === revision && !pending) {
      connected = false;
      get('connection').textContent = 'Server offline';
    }
  }
  if (pageActive && !quitting) timer = setTimeout(() => void poll(), 500);
}
window.addEventListener('pagehide', () => {
  pageActive = false;
  revision++;
  clearTimeout(timer);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !quitting) {
    pageActive = true;
    void poll();
  }
});
route('activity');
void poll();
