// Sidebar browser mockup. Dark mode is confirmed; theme and UI refinement are deferred.
// Synthetic state only: no application APIs, providers, storage, or audio.
export {};
type Page = 'activity' | 'connections' | 'settings';
type Section = 'generation' | 'speech' | 'characters' | 'playback' | 'app';
interface Request {
  id: string;
  viewer: string;
  question: string;
  response?: string;
  outcome?: string;
}
const samples: Request[] = [
  {
    id: 'one',
    viewer: 'pixelpilot',
    question: 'How do I stop tilting after a bad ranked game?',
    response:
      'Take five minutes away from the game. Get some water. Come back when you can name one thing to improve instead of five teammates to blame.',
  },
  {
    id: 'two',
    viewer: 'moonbyte',
    question: 'What would you do with a million channel points?',
    response:
      'Save them until something good appears. Spending them just because you have them is how you end up paying a million points for a sound effect.',
  },
  {
    id: 'three',
    viewer: 'softreset',
    question: 'Is a hot dog a sandwich?',
    response: 'It is lunch. Eat it while it is warm. We can debate the construction afterwards.',
  },
];
let current: Request | undefined = { ...samples[0]! };
let waiting = samples.slice(1).map((r) => ({ ...r }));
let history: Request[] = [
  {
    id: 'past-one',
    viewer: 'nightowl',
    question: 'Any advice for my first stream?',
    response:
      'Keep talking, even when nobody is there yet. You are practising for the people who arrive later.',
    outcome: 'Answered',
  },
  {
    id: 'past-two',
    viewer: 'heyitskai',
    question: 'How do I get better at aiming?',
    response:
      'Practise a little every day. Keep the sensitivity steady. A new mouse will not fix the habit of panicking.',
    outcome: 'Answered',
  },
];
let page: Page = 'activity';
let paused = false;
let muted = false;
let connected = false;
let authorized = false;
let reward = false;
let volume = 80;
let setupStep: number | undefined;
let generationConfigured = false;
let speechConfigured = false;
let voiceConfigured = false;
let pendingSettings = false;
let stopped = false;
const draft: Record<string, string> = {
  provider: 'openrouter',
  model: '',
  generationKey: '',
  speechKey: '',
  voice: '',
  playback: '80',
};
const pages: Page[] = ['activity', 'connections', 'settings'];
const sections: Section[] = ['generation', 'speech', 'characters', 'playback', 'app'];
const labels: Record<string, string> = {
  activity: 'Activity',
  connections: 'Connections',
  settings: 'Settings',
  generation: 'Generation',
  speech: 'Speech',
  characters: 'Characters',
  playback: 'Playback',
  app: 'Application',
};
const app = document.querySelector<HTMLElement>('#app')!;
const feedback = document.querySelector<HTMLElement>('#feedback')!;
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
function icon(name: string, size = 18) {
  const paths: Record<string, string> = {
    activity: '<path d="M3 12h4l3-7 4 14 3-7h4"/>',
    connections: '<path d="M8 3v4m8-4v4M6 7h12v3a6 6 0 0 1-12 0ZM12 16v5"/>',
    settings: '<path d="M4 7h16M4 17h16M9 4v6m6 4v6"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>',
    skip: '<path d="m4 5 10 7L4 19ZM19 5v14"/>',
    mute: '<path d="M3 9h4l5-4v14l-5-4H3ZM17 8l5 8m0-8-5 8"/>',
    sound: '<path d="M3 9h4l5-4v14l-5-4H3Zm14-1q5 4 0 8"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>',
  };
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? ''}</svg>`;
}
function button(action: string, text: string, extra = '') {
  return `<button type="button" data-action="${action}" ${extra}>${text}</button>`;
}
function notify(text: string) {
  feedback.textContent = text;
}
function state(label: string, ready: boolean) {
  return `<span class="connection-state ${ready ? 'ready' : ''}"><span class="dot"></span>${label}</span>`;
}
function navigation() {
  return `<nav class="navigation" aria-label="Main navigation">${pages.map((p) => button(`page-${p}`, `${icon(p)}<span>${labels[p]}</span>`, `aria-current="${page === p && setupStep === undefined ? 'page' : 'false'}"`)).join('')}</nav>`;
}
function row(request: Request, status: string, kind: 'current' | 'waiting' | 'past') {
  const response = kind === 'waiting' ? undefined : request.response;
  const line = `<span class="${response ? 'chevron' : 'chevron-space'}" aria-hidden="true"></span><span class="character">Tyrone</span><strong class="viewer">${escape(request.viewer)}</strong><span class="question">${escape(request.question)}</span><span class="status">${status}</span>`;
  return `<article class="request ${kind}">${response ? `<details data-request-id="${request.id}"><summary class="request-line">${line}</summary><div class="expanded"><p>${escape(response)}</p></div></details>` : `<div class="request-line">${line}</div>`}${kind === 'waiting' ? button('remove', icon('close', 16), `class="remove" data-id="${request.id}" aria-label="Remove question from ${escape(request.viewer)}"`) : ''}</article>`;
}
function transport() {
  return `<section class="transport" aria-label="Playback controls"><div class="transport-main">${button('pause', `${icon(paused ? 'play' : 'pause')}<span>${paused ? 'Resume' : 'Pause'}</span>`, `class="primary" aria-pressed="${paused}"`)}${button('skip', `${icon('skip')}<span>Skip current</span>`, current ? '' : 'disabled')}${button('mute', `${icon(muted ? 'sound' : 'mute')}<span>${muted ? 'Unmute' : 'Mute'}</span>`, `aria-pressed="${muted}"`)}</div><details class="menu" id="options"><summary>Options</summary><div class="menu-panel"><label class="volume" for="volume">Volume <output>${volume}%</output></label><input id="volume" type="range" min="0" max="100" value="${volume}">${button('clear', 'Clear waiting', waiting.length ? '' : 'disabled')}${button('stop', 'Stop and clear', `class="danger" ${current || waiting.length ? '' : 'disabled'}`)}</div></details></section>`;
}
function activity() {
  return `<div class="activity-layout">${transport()}<div class="activity-feed"><section class="feed" aria-label="Current and waiting requests">${current ? row(current, paused ? 'Held' : 'Speaking', 'current') : `<p class="empty">${paused ? 'Queue paused. Resume when you’re ready.' : 'Ready for viewer questions.'}</p>`}${waiting.map((r, i) => row(r, i === 0 ? 'Next' : 'Waiting', 'waiting')).join('')}</section><h2 class="history-label">Earlier</h2><section class="feed history" aria-label="Earlier questions and responses">${history.map((r) => row(r, r.outcome ?? 'Answered', 'past')).join('')}</section></div></div>`;
}
function field(name: string, label: string, placeholder: string, type = 'text') {
  return `<label class="field" for="${name}"><span>${label}</span><input id="${name}" name="${name}" type="${type}" value="${escape(draft[name] ?? '')}" placeholder="${placeholder}" autocomplete="off"></label>`;
}
function generation() {
  return `<section class="setting-section" id="generation"><div class="section-heading"><h2>Generation</h2>${state(generationConfigured ? 'Configured' : 'Not configured', generationConfigured)}</div><p class="hint">Choose what writes the reply. Speech is configured separately.</p><label class="field" for="provider"><span>Provider</span><select id="provider" name="provider"><option value="openrouter" ${draft.provider === 'openrouter' ? 'selected' : ''}>OpenRouter</option><option value="codex" ${draft.provider === 'codex' ? 'selected' : ''}>Codex CLI</option></select></label>${draft.provider === 'openrouter' ? `<div class="field-grid">${field('model', 'Model ID', 'Enter an exact model ID')}${field('generationKey', generationConfigured ? 'Replace API key' : 'API key', generationConfigured ? 'Leave blank to keep configured key' : 'Placeholder key only', 'password')}</div><p class="hint">The initial connected trial requires verified free access. No model is selected for you.</p>` : '<p class="inline-note">Uses an existing supported CLI sign-in. Account authorization is a separate action.</p>'}<div class="actions">${button('save-generation', 'Save', 'class="primary"')}${button('check-generation', 'Check connection', generationConfigured ? '' : 'disabled')}${button('test-generation', 'Test response', generationConfigured ? '' : 'disabled')}</div></section>`;
}
function speech() {
  return `<section class="setting-section" id="speech"><div class="section-heading"><h2>Speech</h2>${state(speechConfigured ? 'Configured' : 'Not configured', speechConfigured)}</div><p class="hint">Turn replies into audio using each character’s assigned voice.</p><div class="field-grid"><label class="field" for="speech-provider"><span>Provider</span><select id="speech-provider"><option>Fish Audio</option></select></label>${field('speechKey', speechConfigured ? 'Replace API key' : 'API key', speechConfigured ? 'Leave blank to keep configured key' : 'Placeholder key only', 'password')}</div><div class="actions">${button('save-speech', 'Save', 'class="primary"')}${button('check-speech', 'Check connection', speechConfigured ? '' : 'disabled')}</div></section>`;
}
function characters() {
  return `<section class="setting-section" id="characters"><div class="section-heading"><h2>Characters</h2><span class="subtle">1 profile</span></div><p class="hint">Viewers enter <strong>Name: question</strong>. Each character uses its assigned voice.</p><div class="profile"><span class="profile-mark">T</span><div><h3>Tyrone</h3><p class="hint">Existing development profile</p></div></div>${field('voice', 'Assigned voice ID', 'Placeholder voice ID only')}<div class="actions">${button('save-voice', 'Save', 'class="primary"')}${button('test-voice', 'Test voice', speechConfigured && voiceConfigured ? '' : 'disabled')}</div></section>`;
}
function playback() {
  return `<section class="setting-section" id="playback"><h2>Playback</h2><p class="hint">Default volume when opening the app.</p><label class="field" for="playback-volume"><span>Volume (%)</span><input id="playback-volume" name="playback" type="number" min="0" max="100" value="${escape(draft.playback!)}"></label><div class="actions">${button('save-playback', 'Save', 'class="primary"')}</div></section>`;
}
function application() {
  return `<section class="setting-section" id="app-settings"><h2>Application</h2><div class="application-row"><div><h3>Guided setup</h3><p class="hint">Walk through generation, speech, and Twitch.</p></div>${button('setup', 'Open setup')}</div><div class="application-row"><div><h3>Shut down</h3><p class="hint">Stop playback and close the local server.</p></div>${button('shutdown', 'Shut down app', 'class="danger"')}</div></section>`;
}
function connections() {
  return `<div class="connections-layout"><section class="setting-section"><div class="section-heading"><h2>Twitch</h2>${state(connected ? 'Connected' : authorized ? 'Authorized' : 'Not connected', connected)}</div><p class="hint">Receive questions through one shared Channel Points reward.</p><div class="account-line"><span class="account-icon">${icon('connections', 24)}</span><div><h3>${authorized ? 'Sample channel' : 'Authorize your channel'}</h3><p class="hint">${authorized ? 'Example authorization for this mockup.' : 'Sign in through Twitch to authorize access.'}</p></div></div><div class="actions">${!authorized ? button('authorize', 'Authorize Twitch', 'class="primary"') : button('connect', connected ? 'Disconnect' : 'Connect', 'class="primary"')}${button('check-twitch', 'Check connection', authorized ? '' : 'disabled')}</div></section><section class="setting-section reward"><div class="section-heading"><h2>Channel Points reward</h2>${state(reward ? 'Ready' : 'Not set up', reward)}</div><p class="hint">Viewers choose a character with <strong>Name: question</strong>. Missing or unknown names are rejected and refunded.</p><div class="reward-example"><span class="character">Tyrone</span><span>Tyrone: Any advice for my first stream?</span></div><p class="hint">Reward title, cost, and cooldown are still to be decided. Connecting never creates a reward.</p><div class="actions">${button('reward', reward ? 'Check reward' : 'Set up reward', authorized ? '' : 'disabled')}</div></section></div>`;
}
function settings() {
  const contents: Record<Section, () => string> = {
    generation,
    speech,
    characters,
    playback,
    app: application,
  };
  return `<p class="settings-note">Save validates and stores settings. Changes take effect before the next request; waiting questions stay queued.${pendingSettings ? '<strong> Changes pending for the next request.</strong>' : ''}</p><div class="settings-layout"><nav class="settings-index" aria-label="Settings sections">${sections.map((s) => `<a href="#${s === 'app' ? 'app-settings' : s}">${labels[s]}</a>`).join('')}</nav><div class="settings-content">${sections.map((s) => contents[s]()).join('')}</div></div>`;
}
const setupLabels = ['Generation', 'Speech & voice', 'Twitch'];
function setup() {
  return `<div class="setup"><div class="setup-heading"><div><h1>Set up your stream</h1><p class="hint">Configure once. Come back here whenever you need.</p></div>${button('leave-setup', 'Exit setup')}</div><ol class="setup-steps">${setupLabels.map((label, i) => `<li>${button(`step-${i}`, `<span>${i + 1}</span>${label}`, `aria-current="${setupStep === i ? 'step' : 'false'}"`)}</li>`).join('')}</ol><div class="setup-content">${setupStep === 0 ? generation() : setupStep === 1 ? speech() + characters() : connections()}</div><footer class="setup-footer">${button('setup-back', 'Back', setupStep === 0 ? 'disabled' : '')}<span>Step ${(setupStep ?? 0) + 1} of 3</span>${button('setup-next', setupStep === 2 ? 'Go to Activity' : 'Continue', 'class="primary"')}</footer></div>`;
}
function render() {
  const expanded = new Set(
    [...app.querySelectorAll<HTMLDetailsElement>('details[open]')].map(
      (d) => d.dataset.requestId ?? d.id,
    ),
  );
  const content = stopped
    ? `<div class="empty shutdown-preview"><h1>App shut down</h1><p>This is a preview of the shutdown screen. The mockup server is still running.</p>${button('reopen', 'Return to mockup')}</div>`
    : setupStep !== undefined
      ? setup()
      : `<header class="page-heading"><h1>${labels[page]}</h1>${page === 'activity' ? button('page-connections', state(connected ? 'Twitch connected' : 'Twitch disconnected', connected), 'class="status-link"') : ''}</header>${page === 'activity' ? activity() : page === 'connections' ? connections() : settings()}`;
  const brand = `<div class="brand"><span class="brand-symbol" aria-hidden="true">${icon('activity', 25)}</span><span>Stream controls</span></div>`;
  app.innerHTML = `<div class="sidebar-shell"><aside class="sidebar">${brand}${navigation()}<div class="sidebar-footer"><span class="dot"></span>Local app</div></aside><main class="workspace">${content}</main></div>`;
  app.querySelectorAll<HTMLDetailsElement>('details').forEach((d) => {
    d.open = expanded.has(d.dataset.requestId ?? d.id);
  });
}
function advance() {
  current = paused ? undefined : waiting.shift();
  if (current) pendingSettings = false;
}
function finish(outcome: string) {
  if (current) history.unshift({ ...current, response: undefined, outcome });
  history = history.slice(0, 8);
  advance();
}
function save(kind: string) {
  if (kind === 'generation') {
    if (
      draft.provider === 'openrouter' &&
      (!draft.model!.trim() || (!generationConfigured && !draft.generationKey!.trim()))
    ) {
      notify('Enter a model ID and placeholder API key before saving.');
      return false;
    }
    generationConfigured = true;
    draft.generationKey = '';
  } else if (kind === 'speech') {
    if (!speechConfigured && !draft.speechKey!.trim()) {
      notify('Enter a placeholder speech key before saving.');
      return false;
    }
    speechConfigured = true;
    draft.speechKey = '';
  } else if (kind === 'voice') {
    if (!draft.voice!.trim()) {
      notify('Enter a placeholder voice ID before saving.');
      return false;
    }
    voiceConfigured = true;
  } else if (kind === 'playback') {
    const value = Number(draft.playback);
    if (!draft.playback!.trim() || !Number.isFinite(value) || value < 0 || value > 100) {
      notify('Volume must be between 0 and 100.');
      return false;
    }
  }
  pendingSettings = !!current;
  notify(
    `Saved in mockup memory only.${current ? ' Current request keeps its original settings; changes apply before the next request.' : ''}`,
  );
  return true;
}
document.addEventListener('click', (event) => {
  const target = event.target as Element;
  const control = target.closest<HTMLButtonElement>('button[data-action]');
  if (!control || control.disabled) {
    app.querySelectorAll<HTMLDetailsElement>('.menu[open]').forEach((menu) => {
      if (!menu.contains(target)) menu.open = false;
    });
    return;
  }
  const action = control.dataset.action!;
  if (action.startsWith('page-')) {
    page = action.slice(5) as Page;
    setupStep = undefined;
  } else if (action.startsWith('step-')) setupStep = Number(action.slice(5));
  else if (action.startsWith('save-')) {
    if (!save(action.slice(5))) return;
  } else if (action.startsWith('check-'))
    notify('Simulated connection check passed. No network request was made.');
  else if (action.startsWith('test-'))
    notify(
      action === 'test-voice'
        ? 'Voice test preview only. No speech request or audio playback.'
        : 'Sample response: Take a short break, then come back with one thing to improve. No generation request was made.',
    );
  else
    switch (action) {
      case 'pause':
        paused = !paused;
        if (!paused && !current) advance();
        break;
      case 'mute':
        muted = !muted;
        break;
      case 'skip':
        finish('Skipped');
        notify('Sample request skipped.');
        break;
      case 'remove': {
        const request = waiting.find((r) => r.id === control.dataset.id);
        waiting = waiting.filter((r) => r.id !== control.dataset.id);
        if (request) history.unshift({ ...request, response: undefined, outcome: 'Removed' });
        history = history.slice(0, 8);
        break;
      }
      case 'clear':
        waiting = [];
        break;
      case 'stop':
        current = undefined;
        waiting = [];
        paused = true;
        pendingSettings = false;
        break;
      case 'authorize':
        authorized = true;
        notify('Sample channel authorized. No Twitch sign-in was opened.');
        break;
      case 'connect':
        connected = !connected;
        notify('Sample connection changed. Reward setup remains separate.');
        break;
      case 'reward':
        reward = true;
        notify('Sample reward is ready. No Twitch reward was created.');
        break;
      case 'setup':
        setupStep = 0;
        break;
      case 'leave-setup':
        setupStep = undefined;
        page = 'settings';
        notify('Setup closed. Only explicitly saved mockup settings are configured.');
        break;
      case 'setup-back':
        setupStep = Math.max(0, (setupStep ?? 0) - 1);
        break;
      case 'setup-next':
        if (setupStep === 2) {
          setupStep = undefined;
          page = 'activity';
        } else setupStep = (setupStep ?? 0) + 1;
        break;
      case 'shutdown':
        stopped = true;
        break;
      case 'reopen':
        stopped = false;
        break;
    }
  render();
  const focus =
    app.querySelector<HTMLElement>(`[data-action="${action}"]`) ??
    app.querySelector<HTMLElement>('h1');
  if (focus?.tagName === 'H1') focus.setAttribute('tabindex', '-1');
  focus?.focus({ preventScroll: true });
});
app.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'volume') {
    volume = Number(input.value);
    app.querySelector('output')!.textContent = `${volume}%`;
  } else if (input.name) {
    draft[input.name] = input.value;
    if (input.name === 'voice') voiceConfigured = false;
  }
});
app.addEventListener('change', (event) => {
  const input = event.target as HTMLSelectElement;
  if (input.id === 'provider') {
    draft.provider = input.value;
    generationConfigured = false;
    draft.generationKey = '';
    render();
    app.querySelector<HTMLElement>('#provider')?.focus();
  }
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    const menu = app.querySelector<HTMLDetailsElement>('.menu[open]');
    if (menu) {
      menu.open = false;
      menu.querySelector<HTMLElement>('summary')?.focus();
    }
  }
});
render();
