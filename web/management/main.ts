import { createRoot } from 'react-dom/client';
import { createElement } from 'react';
import { startPlayback } from '../playback/player.ts';
import { get } from '../shared/dom.ts';
import { Activity } from './activity.tsx';
import { createSettings } from './settings.ts';
import { createServerState } from './server-state.ts';
import { route } from './navigation.ts';
import type { PlaybackState, SettingsSection } from '../../src/shared/protocol.ts';
import './style.css';

let state: PlaybackState | null = null;
let connected = false,
  pending = false,
  owner: boolean | null = null;
let quitting = false;
const root = createRoot(get('activity-root'));
const server = createServerState((view) => {
  connected = view.connected;
  pending = view.pending;
  get('message').textContent = view.message;
  if (view.state) render(view.state);
  else renderActivity();
  renderConnection();
});
const command = server.command;
function renderActivity() {
  root.render(
    createElement(Activity, {
      state,
      connected,
      pending,
      command,
      openSettings: () => route('settings'),
    }),
  );
}
function renderConnection() {
  get('connection').textContent = !connected
    ? 'Server offline'
    : owner === true
      ? 'Audio in this tab'
      : owner === false
        ? 'Audio in another tab'
        : 'Audio connecting';
}
function render(next: PlaybackState) {
  state = next;
  renderActivity();
  settings.render(next);
  get<HTMLButtonElement>('quit').disabled = pending || !next.canQuit;
  get('mode').textContent =
    next.queue?.mode === 'demo'
      ? 'Demo — simulated replies and test audio'
      : next.queue?.mode === 'live'
        ? 'Configured providers — explicit tests use their allowance'
        : 'Local setup incomplete';
}
const settings = createSettings(command, render, route);
document.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLElement>('button, [data-target]');
  if (!button || (button as HTMLButtonElement).disabled) return;
  if (button.dataset.page) {
    route(button.dataset.page);
    return;
  }
  if (button.dataset.target) {
    route('settings', button.dataset.target);
    return;
  }
  if (button.dataset.discard && state?.management) {
    settings.discard(button.dataset.discard as SettingsSection, state.management);
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
        server.suspend();
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
  renderConnection();
});
window.addEventListener('pagehide', () => server.suspend());
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !quitting) server.start();
});
route('activity');
renderActivity();
server.start();
