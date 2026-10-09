import { startPlayback } from './playback.ts';
import type {
  PlaybackState,
  ManagementState,
  SettingsSection,
  RequestEntry,
} from '../src/shared/protocol.ts';
const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
let state: PlaybackState | null = null,
  connected = false,
  pending = false,
  owner: boolean | null = null;
let quitting = false,
  pageActive = true,
  initialized = false,
  revision = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let lastSettingsRevision = -1;
const dirty = new Set<SettingsSection>();
const saved = new Set<SettingsSection>();
const edits = new Map<SettingsSection, number>();
let feedSignature = '';
const forms = () => [...document.querySelectorAll<HTMLFormElement>('form[data-section]')];
function feedback(section: string, text: string) {
  const node = document.querySelector<HTMLElement>(`[data-feedback="${section}"]`);
  if (node) node.textContent = text;
}
function route(page: string, section?: string) {
  document
    .querySelectorAll<HTMLElement>('[data-view]')
    .forEach((n) => (n.hidden = n.dataset.view !== page));
  get('heading').textContent =
    page === 'setup' ? 'Setup checklist' : page[0]!.toUpperCase() + page.slice(1);
  document
    .querySelectorAll<HTMLElement>('.navigation [data-page]')
    .forEach((n) => n.setAttribute('aria-current', n.dataset.page === page ? 'page' : 'false'));
  if (section) get(section).scrollIntoView({ block: 'start' });
}
function fill(section: SettingsSection, m: ManagementState) {
  if (section === 'generation') {
    get<HTMLSelectElement>('provider').value = m.generation.provider;
    get<HTMLInputElement>('model').value = m.generation.model;
    get<HTMLInputElement>('tokens').value = String(m.generation.maxTokens);
    get<HTMLInputElement>('generation-key').value = '';
    providerFields();
  } else if (section === 'speech') get<HTMLInputElement>('speech-key').value = '';
  else if (section === 'characters') {
    get('voices').innerHTML = m.characters
      .map(
        (p) =>
          `<label class="field" for="voice-${esc(p.id)}"><span>${esc(p.name)} — ${p.voiceConfigured ? 'Voice configured' : 'Voice not configured'}</span><input id="voice-${esc(p.id)}" data-character="${esc(p.id)}" autocomplete="off" placeholder="${p.voiceConfigured ? 'Leave blank to keep assigned voice' : '32-character voice ID'}"></label>`,
      )
      .join('');
  } else if (section === 'playback')
    get<HTMLInputElement>('default-volume').value = String(m.volume);
}
function providerFields() {
  const provider = get<HTMLSelectElement>('provider').value;
  get('openrouter-fields').hidden = provider !== 'openrouter';
  get('codex-fields').hidden = provider !== 'codex';
  get('generation-check').hidden = provider !== 'openrouter';
}
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
const statusLabels: Record<string, string> = {
  waiting: 'Waiting',
  generating: 'Writing reply',
  synthesizing: 'Creating speech',
  ready: 'Ready',
  playing: 'Speaking',
  blocked: 'Audio blocked',
  completed: 'Answered',
  skipped: 'Skipped',
  removed: 'Removed',
  expired: 'Expired',
  failed: 'Failed',
};
function row(entry: RequestEntry, kind: string) {
  const line = `<span class="${entry.dialogue ? 'chevron' : 'chevron-space'}" aria-hidden="true"></span><span class="character">${esc(entry.characterName)}</span><strong class="viewer">${esc(entry.viewer)}</strong><span class="question">${esc(entry.question)}</span><span class="status">${state?.queue?.paused && kind === 'current' ? 'Held' : statusLabels[entry.status] || esc(entry.status)}</span>`;
  return `<article class="request ${kind}">${entry.dialogue ? `<details data-request-id="${entry.id}"><summary class="request-line">${line}</summary><div class="expanded"><p>${esc(entry.dialogue)}</p></div></details>` : `<div class="request-line">${line}</div>`}${entry.error ? `<p class="error request-error">${esc(entry.error)}</p>` : ''}${kind === 'waiting' ? `<button class="remove" data-remove="${entry.id}" aria-label="Remove question from ${esc(entry.viewer)}">×</button>` : ''}</article>`;
}
function renderFeed() {
  const q = state?.queue;
  if (!q) return;
  const signature = JSON.stringify([q.requests, q.activeId, q.waitingIds, q.paused]);
  if (signature === feedSignature) return;
  feedSignature = signature;
  const expanded = new Set(
    [...get('feed').querySelectorAll<HTMLDetailsElement>('details[open]')].map(
      (n) => n.dataset.requestId,
    ),
  );
  const current = q.requests.find((r) => r.id === q.activeId);
  const waiting = q.waitingIds.flatMap((id) => q.requests.filter((r) => r.id === id));
  const history = q.requests
    .filter((r) => r.id !== q.activeId && !q.waitingIds.includes(r.id))
    .reverse();
  get('feed').innerHTML =
    `${current ? row(current, 'current') : `<p class="empty">${q.paused ? 'Queue paused. Resume when ready.' : 'Waiting for questions.'}</p>`}${waiting.map((r) => row(r, 'waiting')).join('')}${history.length ? '<h2 class="history-label">Earlier</h2>' + history.map((r) => row(r, 'past')).join('') : ''}`;
  get('feed')
    .querySelectorAll<HTMLDetailsElement>('details')
    .forEach((n) => (n.open = expanded.has(n.dataset.requestId)));
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
  renderFeed();
  const m = next.management;
  if (!m) return;
  if (lastSettingsRevision !== m.revision) {
    for (const form of forms()) {
      const section = form.dataset.section as SettingsSection;
      if (!dirty.has(section)) fill(section, m);
    }
    lastSettingsRevision = m.revision;
  }
  if (!initialized) {
    initialized = true;
    forms().forEach((f) => fill(f.dataset.section as SettingsSection, m));
    route(m.setupSeen ? 'activity' : 'setup');
    if (!m.setupSeen) void command('/api/config/application', { setupSeen: true }).catch(() => {});
  }
  get('generation-status').textContent =
    `${m.generation.ready ? 'Configured' : 'Not configured'}${m.generation.provider === 'openrouter' ? ' · Key ' + (m.generation.keyConfigured ? 'configured' : 'not configured') : ''}`;
  get('speech-status').textContent =
    `Key ${m.speech.keyConfigured ? 'configured' : 'not configured'}`;
  get('overrides').textContent = m.overrides.length
    ? `Environment overrides: ${m.overrides.join(', ')}. Saving a file value does not replace an environment override.`
    : '';
  get('readiness').textContent =
    q?.mode === 'demo'
      ? ''
      : m.localReady
        ? ''
        : 'Finish provider and voice configuration in Settings to run full local response tests.';
  get('diagnostics').textContent = Object.values(m.errors).filter(Boolean).join(' ');
  for (const f of forms()) {
    const section = f.dataset.section as SettingsSection;
    if (!dirty.has(section) && saved.has(section))
      feedback(
        section,
        m.overrides.some((name) =>
          section === 'generation'
            ? name.startsWith('OPENROUTER_') || name === 'TYRONE_TEXT_PROVIDER'
            : section === 'speech'
              ? name === 'FISH_API_KEY'
              : section === 'characters'
                ? name.endsWith('VOICE_ID')
                : false,
        )
          ? 'Saved locally — environment overrides remain active'
          : m.pending && ['generation', 'speech', 'characters'].includes(section)
            ? 'Saved — applies after the current request'
            : section === 'playback'
              ? 'Saved — default for the next launch'
              : 'Saved and active',
      );
  }
  get('checklist').innerHTML = [
    ['Generation', m.generation.ready, 'generation'],
    ['Speech', m.speech.ready, 'speech'],
    [
      'Character voices',
      m.characters.length > 0 && m.characters.every((p) => p.voiceConfigured),
      'characters',
    ],
    ['Playback preferences', true, 'playback-settings'],
    ['Twitch and reward — later phase', false, 'connections'],
  ]
    .map(
      ([label, ready, target]) =>
        `<button class="checklist-item" data-target="${target}">${label}<span>${ready ? 'Configured locally' : target === 'connections' ? 'Deferred' : 'Needs configuration'}</span></button>`,
    )
    .join('');
  get<HTMLButtonElement>('quit').disabled = pending || !next.canQuit;
}
forms().forEach((form) => {
  const section = form.dataset.section as SettingsSection;
  form.addEventListener('input', () => {
    dirty.add(section);
    edits.set(section, (edits.get(section) ?? 0) + 1);
    const check = document.querySelector(`[data-check-result="${section}"]`);
    if (check) check.textContent = '';
    feedback(section, 'Unsaved changes');
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    let body: Record<string, unknown>;
    if (section === 'generation')
      body = {
        provider: get<HTMLSelectElement>('provider').value,
        model: get<HTMLInputElement>('model').value,
        key: get<HTMLInputElement>('generation-key').value,
        maxTokens: Number(get<HTMLInputElement>('tokens').value),
      };
    else if (section === 'speech') body = { key: get<HTMLInputElement>('speech-key').value };
    else if (section === 'characters')
      body = {
        voices: Object.fromEntries(
          [...get('voices').querySelectorAll<HTMLInputElement>('input[data-character]')].map(
            (n) => [n.dataset.character!, n.value],
          ),
        ),
      };
    else body = { volume: Number(get<HTMLInputElement>('default-volume').value) };
    const submittedEdit = edits.get(section);
    void command(`/api/config/${section}`, body)
      .then((result) => {
        saved.add(section);
        const check = document.querySelector(`[data-check-result="${section}"]`);
        if (check) check.textContent = '';
        if (edits.get(section) === submittedEdit) {
          dirty.delete(section);
          if (result.management) fill(section, result.management);
        }
        render(result);
      })
      .catch((error) => {
        if (edits.get(section) === submittedEdit) feedback(section, error.message);
      });
  });
});
get('provider').addEventListener('change', providerFields);
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
    const s = button.dataset.discard as SettingsSection;
    edits.set(s, (edits.get(s) ?? 0) + 1);
    dirty.delete(s);
    fill(s, state.management);
    feedback(s, 'Changes discarded');
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
        if (r.management && !dirty.has('characters')) fill('characters', r.management);
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
get('pause').addEventListener(
  'click',
  () =>
    void command(state?.queue?.paused ? '/api/playback/resume' : '/api/playback/pause', {}).catch(
      () => {},
    ),
);
get('skip').addEventListener('click', () => void command('/api/queue/skip', {}).catch(() => {}));
get('clear').addEventListener('click', () => void command('/api/queue/clear', {}).catch(() => {}));
get('stop-clear').addEventListener(
  'click',
  () => void command('/api/queue/stop', {}).catch(() => {}),
);
get('mute').addEventListener('click', () => {
  if (state)
    void command('/api/settings', { muted: !state.muted, volume: state.volume }).catch(() => {});
});
get('volume').addEventListener(
  'input',
  () => (get('volume-value').textContent = `${get<HTMLInputElement>('volume').value}%`),
);
get('volume').addEventListener('change', () => {
  if (state)
    void command('/api/settings', {
      muted: state.muted,
      volume: Number(get<HTMLInputElement>('volume').value) / 100,
    }).catch(() => {});
});
window.addEventListener('beforeunload', (event) => {
  if (dirty.size) {
    event.preventDefault();
    event.returnValue = '';
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
