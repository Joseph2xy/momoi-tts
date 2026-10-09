export {};
type Request = {
  viewer: string;
  question: string;
  reply: string;
  failed?: boolean;
  outcome?: string;
};
const sample: Request[] = [
  {
    viewer: 'pixelpilot',
    question: 'How do I stop tilting after a bad ranked game?',
    reply:
      'Take the headset off. Drink some water. You lost a match, not your entire bloodline. Queue again when you can blame yourself at least a little.',
  },
  {
    viewer: 'moonbyte',
    question: 'What would you do with one million channel points?',
    reply:
      'Save them. The moment you spend a million points, they add something better to the shop. That is how they get you.',
  },
  {
    viewer: 'softreset',
    question: 'Is a hot dog a sandwich?',
    reply:
      'It is lunch. Eat it before it gets cold. We can argue about the architecture afterwards.',
  },
];
let active: Request | undefined;
let waiting: Request[] = [];
let history: Request[] = [];
let paused = false;
let muted = false;
let volume = 80;
let elapsed = 5;
let phase = 'playing';
let testing = false;
let connected = false;
let simulatedTime = false;

const app = document.querySelector<HTMLDivElement>('#app')!;
let scenario = 'playing';
const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );
function notify(message: string) {
  document.querySelector('#feedback')!.textContent = message;
}
function reset() {
  active = { ...sample[0]! };
  waiting = sample.slice(1).map((r) => ({ ...r }));
  history = [
    {
      viewer: 'nightowl',
      question: 'Any advice for my first stream?',
      reply:
        'Talk even when nobody is watching. Especially then. You are practising for the people who will show up later.',
    },
  ];
  paused = false;
  muted = false;
  volume = 80;
  testing = false;
  elapsed = 5;
  phase = 'playing';
  simulatedTime = false;
  scenario = 'playing';
  render();
  notify('');
}
function icon(name: string) {
  const paths: Record<string, string> = {
    pause: '<path d="M8 5v14M16 5v14"/>',
    resume: '<path d="m8 5 11 7-11 7Z"/>',
    skip: '<path d="m4 5 10 7L4 19ZM19 5v14"/>',
    mute: '<path d="M4 9h4l5-4v14l-5-4H4ZM17 8l5 8m0-8-5 8"/>',
    sound: '<path d="M4 9h4l5-4v14l-5-4H4Zm13-1q5 4 0 8"/>',
  };
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
}
function header() {
  return `<header class="app-header"><h1>${testing ? 'Testing' : 'Activity'}</h1><span class="demo-label">Demo</span></header>`;
}
function transport() {
  return `<section class="transport" aria-label="Playback controls"><button data-action="pause" aria-pressed="${paused}">${icon(paused ? 'resume' : 'pause')}<span>${paused ? 'Resume' : 'Pause'}</span></button><button data-action="skip" ${active ? '' : 'disabled'}>${icon('skip')}<span>Skip current</span></button><button data-action="mute" aria-pressed="${muted}">${icon(muted ? 'sound' : 'mute')}<span>${muted ? 'Unmute' : 'Mute'}</span></button></section>`;
}
function toolbar() {
  return `<div class="toolbar"><div class="connection"><span class="connection-dot" data-connected="${connected}"></span><span>Twitch ${connected ? 'connected' : 'disconnected'}</span><button class="text-button" data-action="connect">${connected ? 'Disconnect' : 'Connect'}</button></div><div class="sound"><label for="volume">Volume</label><input id="volume" type="range" min="0" max="100" value="${volume}"><output for="volume">${volume}%</output></div><button class="text-button" data-action="testing">Testing</button><span class="queue-count">${paused ? 'Paused · ' : ''}${waiting.length}/2 waiting</span></div>`;
}
function row(r: Request, status: string, action?: string, index?: number) {
  const isCurrent =
    status === 'Playing' ||
    status === 'Paused' ||
    status === 'Preparing' ||
    status === 'Audio blocked';
  return `<article data-status="${escape(status)}" class="event ${isCurrent ? 'current' : ''} ${r.failed ? 'failed' : ''}"><div class="event-line"><span class="event-status">${status}</span><span class="character">Tyrone</span><strong class="viewer">${escape(r.viewer)}</strong><p class="question-preview">${escape(r.question)}</p>${action ? `<button class="text-button row-action" data-action="${action}" data-index="${index}" ${action === 'replay' && waiting.length >= 2 ? 'disabled' : ''}>${action === 'remove' ? 'Remove' : 'Replay'}</button>` : '<span></span>'}</div>${isCurrent && phase === 'playing' ? `<div class="progress-line"><progress max="20" value="${elapsed}" aria-label="Speech playback progress"></progress><span class="time">0:${String(elapsed).padStart(2, '0')} / 0:20</span></div>` : ''}<details class="event-details"><summary>${status === 'Next' || status === 'Waiting' ? 'View question' : 'View details'}</summary><div class="expanded"><p>${escape(r.question)}</p>${r.failed ? '<p class="failure-detail">The reply could not be played.</p>' : r.reply && status !== 'Next' && status !== 'Waiting' && phase !== 'preparing' ? `<blockquote>${escape(r.reply)}</blockquote>` : ''}</div></details>${isCurrent && phase === 'blocked' ? '<div class="inline-notice">Audio needs permission.<button data-action="enable">Enable audio</button></div>' : ''}${isCurrent && phase === 'preparing' ? '<button class="text-button" data-action="ready">Preview ready reply</button>' : ''}</article>`;
}
function feed() {
  const status = paused
    ? 'Paused'
    : phase === 'blocked'
      ? 'Audio blocked'
      : phase === 'preparing'
        ? 'Preparing'
        : 'Playing';
  return `<section class="feed" aria-label="Request activity">${active ? row(active, status) : '<p class="idle-note">' + (paused ? 'Queue paused.' : 'Ready for questions.') + '</p>'}${waiting.map((r, i) => row(r, i === 0 ? 'Next' : 'Waiting', 'remove', i)).join('')}${history.length ? '<div class="history-divider">Recent activity</div>' : ''}${history.map((r, i) => row(r, r.failed ? 'Failed' : (r.outcome ?? 'Played'), !r.failed && !r.outcome ? 'replay' : undefined, i)).join('')}</section>`;
}
function testPage() {
  return `<section class="testing"><h1>Try a question.</h1><p>Questions join the stream queue. Keep stream controls open for audio in the finished app.</p><form id="test-form"><label for="viewer">Viewer name</label><input id="viewer" name="viewer" value="Streamer" maxlength="40" required><label for="question">Personality: question</label><textarea id="question" name="question" maxlength="1042" placeholder="Tyrone: What’s your advice for a first stream?" required></textarea><p class="input-help">Available personality: Tyrone</p><button type="submit">Send question</button></form><p>Preview only. No generation or speech service is called.</p></section>`;
}
function render() {
  document
    .querySelectorAll<HTMLButtonElement>('[data-state]')
    .forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.state === scenario)));
  app.innerHTML = `<main class="shell">${header()}${testing ? '<button class="text-button" data-action="testing">Back to activity</button>' + testPage() : transport() + toolbar() + feed() + `<div class="secondary-controls"><button class="text-button" data-action="clear" ${waiting.length ? '' : 'disabled'}>Clear waiting</button><button class="text-button danger" data-action="stop" ${active || waiting.length ? '' : 'disabled'}>Stop and clear</button></div><footer class="app-footer"><span>Audio in this tab</span><label class="simulate"><input id="simulate" type="checkbox" ${simulatedTime ? 'checked' : ''}> Simulate playback</label><button class="text-button" data-action="quit">Quit app</button></footer>`}</main>`;
}
function advance() {
  active = waiting.shift();
  elapsed = 0;
  phase = 'playing';
}
app.addEventListener('click', (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>('[data-action]');
  if (!button || button.disabled) return;
  switch (button.dataset.action) {
    case 'pause':
      paused = !paused;
      if (!paused && !active && waiting.length) advance();
      notify(paused ? 'Queue paused.' : 'Queue resumed.');
      break;
    case 'skip':
      if (active) history.unshift({ ...active, outcome: 'Skipped' });
      advance();
      notify('Current reply skipped.');
      break;
    case 'stop':
      active = undefined;
      waiting = [];
      paused = true;
      notify('Stopped and cleared. Queue paused.');
      break;
    case 'clear':
      waiting = [];
      notify('Waiting questions cleared.');
      break;
    case 'remove': {
      const removed = waiting.splice(Number(button.dataset.index), 1)[0];
      if (removed) history.unshift({ ...removed, outcome: 'Removed' });
      notify('Question removed.');
      break;
    }
    case 'mute':
      muted = !muted;
      break;
    case 'testing':
      testing = !testing;
      break;
    case 'connect':
      connected = !connected;
      notify('Preview connection updated.');
      break;
    case 'ready':
    case 'enable':
      phase = 'playing';
      break;
    case 'replay': {
      const request = { ...history[Number(button.dataset.index)]! };
      if (!active && !paused) active = request;
      else waiting.push(request);
      elapsed = active === request ? 0 : elapsed;
      notify('Cached reply queued for replay.');
      break;
    }
    case 'quit':
      active = undefined;
      waiting = [];
      paused = true;
      notify('Preview stopped. The actual app is still running.');
      break;
  }
  const action = button.dataset.action;
  render();
  app.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)?.focus({ preventScroll: true });
});
app.addEventListener('input', (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === 'volume') {
    volume = Number(input.value);
    app.querySelector('output')!.textContent = `${volume}%`;
  }
});
app.addEventListener('change', (event) => {
  if ((event.target as HTMLInputElement).id === 'simulate')
    simulatedTime = (event.target as HTMLInputElement).checked;
});
app.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const data = new FormData(form);
  const text = String(data.get('question')).trim();
  const split = text.indexOf(':');
  if (
    split < 0 ||
    text.slice(0, split).trim().toLowerCase() !== 'tyrone' ||
    !text.slice(split + 1).trim()
  ) {
    notify('Use Tyrone: followed by your question.');
    return;
  }
  if (text.slice(split + 1).trim().length > 1000) {
    notify('Keep the question under 1,000 characters.');
    return;
  }
  const viewer = String(data.get('viewer')).trim();
  if (!viewer) {
    notify('Enter a viewer name.');
    return;
  }
  if (waiting.length >= 2) {
    notify('Queue full. Remove a waiting question or skip the current reply.');
    return;
  }
  if ([active, ...waiting].some((r) => r?.viewer.toLowerCase() === viewer.toLowerCase())) {
    notify('This viewer already has a question in the queue.');
    return;
  }
  const request = {
    viewer,
    question: text.slice(split + 1).trim(),
    reply:
      'This is a simulated reply. In the finished app, the selected character’s generated reply will appear here and play aloud.',
  };
  if (!active && !paused) {
    active = request;
    elapsed = 0;
    phase = 'playing';
  } else waiting.push(request);
  form.reset();
  notify('Question added to the preview queue.');
});
document.querySelector('#reset')!.addEventListener('click', reset);
document.querySelector('.preview-caption')!.addEventListener('click', (event) => {
  const b = (event.target as Element).closest<HTMLButtonElement>('[data-state]');
  if (!b) return;
  const selected = b.dataset.state!;
  reset();
  scenario = selected;
  phase = selected;
  if (selected === 'failed' && active)
    history.unshift({ ...active, failed: true, reply: 'The reply could not be played.' });
  if (selected === 'empty' || selected === 'failed') {
    active = undefined;
    waiting = [];
  }
  render();
});
setInterval(() => {
  if (!simulatedTime || paused || !active || phase !== 'playing') return;
  elapsed++;
  if (elapsed >= 20) {
    history.unshift(active);
    history = history.slice(0, 8);
    advance();
    if (!testing) render();
  } else if (!testing) {
    const progress = app.querySelector<HTMLProgressElement>('progress');
    if (progress) progress.value = elapsed;
    const time = app.querySelector('.time');
    if (time) time.textContent = `0:${String(elapsed).padStart(2, '0')} / 0:20`;
  }
}, 1000);
reset();
