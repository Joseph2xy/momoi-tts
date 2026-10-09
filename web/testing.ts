import type { PlaybackState } from '../src/shared/protocol.ts';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = get<HTMLFormElement>('question-form');
const question = get<HTMLTextAreaElement>('question');
const viewer = get<HTMLInputElement>('viewer');
const submit = get<HTMLButtonElement>('submit');
const message = get('message');
let state: PlaybackState | null = null;
let connected = false;
let pending = false;
let active = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let submission: { viewer: string; question: string; eventId: string } | null = null;

function render() {
  const queue = state?.queue;
  const mode = queue?.mode ?? 'disabled';
  get('mode').textContent = !connected
    ? 'Server offline'
    : mode === 'demo'
      ? 'Demo mode'
      : mode === 'live'
        ? 'Live mode'
        : 'Setup needed';
  get('mode-note').textContent =
    mode === 'demo'
      ? 'Simulated replies and a short test tone. No generation or speech provider usage.'
      : mode === 'live'
        ? 'Live test: submitting uses your configured generation and speech services and their allowance.'
        : 'Generation is not configured. Configure providers or launch the demo.';
  get('characters').textContent = queue?.characters.length
    ? `Available personalities: ${queue.characters.map((character) => character.name).join(', ')}.`
    : 'No personalities available.';
  get('queue-rules').textContent =
    `One outstanding request per viewer · ${((queue?.viewerCooldownMs ?? 10000) / 1000).toFixed(0)}s viewer cooldown · ${((queue?.globalCooldownMs ?? 1000) / 1000).toFixed(0)}s global cooldown`;
  get('test-status').textContent = !connected
    ? 'Server offline. Launch the app to test.'
    : !state?.playerConnected
      ? 'Open the stream controls in another tab to connect audio.'
      : queue?.paused
        ? 'Queue paused. Resume from the stream controls to hear responses.'
        : 'Audio connected. Responses play in the stream controls.';
  submit.disabled =
    !connected || pending || mode === 'disabled' || (queue?.waitingIds.length ?? 0) >= 2;
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (submit.disabled || !question.value.trim()) return;
  const data = { viewer: viewer.value.trim() || 'Streamer', question: question.value.trim() };
  if (!submission || submission.viewer !== data.viewer || submission.question !== data.question)
    submission = { ...data, eventId: crypto.randomUUID() };
  const payload = submission;
  pending = true;
  render();
  void (async () => {
    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      const result = (await response.json()) as PlaybackState & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'The question could not be submitted.');
      state = result;
      message.textContent = '';
      if (question.value.trim() === payload.question) question.value = '';
      submission = null;
      get('submission-status').textContent =
        'Question submitted. Follow its response in the stream controls.';
    } catch (error) {
      message.textContent =
        error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError'
          ? error.message
          : 'Connection interrupted. Retry this question safely; its request ID prevents duplicates.';
      get('submission-status').textContent = '';
    } finally {
      pending = false;
      render();
    }
  })();
});

async function poll() {
  if (!active) return;
  try {
    const response = await fetch('/api/state', { signal: AbortSignal.timeout(2000) });
    if (!response.ok) throw new Error();
    const next = (await response.json()) as PlaybackState;
    if (active && !pending) {
      state = next;
      connected = true;
      render();
    }
  } catch {
    if (active && !pending) {
      connected = false;
      render();
    }
  }
  if (active)
    timer = setTimeout(() => {
      void poll();
    }, 500);
}
window.addEventListener('pagehide', () => {
  active = false;
  clearTimeout(timer);
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    active = true;
    void poll();
  }
});
void poll();
