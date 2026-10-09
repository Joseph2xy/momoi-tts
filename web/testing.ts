import type { PlaybackState } from '../src/shared/protocol.ts';

const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = get<HTMLFormElement>('question-form');
const question = get<HTMLTextAreaElement>('question');
const viewer = get<HTMLInputElement>('viewer');
const kind = get<HTMLSelectElement>('test-mode');
const voice = get<HTMLSelectElement>('voice-character');
const submit = get<HTMLButtonElement>('submit');
const message = get('message');
const initial = new URLSearchParams(location.search).get('mode');
kind.value = initial === 'response' || initial === 'voice' ? initial : 'full';
let state: PlaybackState | null = null;
let connected = false,
  pending = false,
  active = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let controller: AbortController | null = null;
let submission: { signature: string; payload: Record<string, string> } | null = null;

function render() {
  const q = state?.queue,
    m = state?.management;
  const demo = m?.demo || q?.mode === 'demo';
  const profiles = m?.characters ?? q?.characters ?? [];
  get('mode').textContent = !connected ? 'Server offline' : demo ? 'Demo' : 'Saved providers';
  get('mode-note').textContent = demo
    ? 'Synthetic dialogue/audio. No provider usage.'
    : 'Running a test uses the saved providers and their allowance. Verify access and terms before connected tests.';
  get('viewer-field').hidden = kind.value !== 'full';
  get('question-field').hidden = kind.value === 'voice';
  get('voice-field').hidden = kind.value !== 'voice';
  get('characters').hidden = kind.value === 'voice';
  get('characters').textContent =
    `Available characters: ${profiles.map((p) => p.name).join(', ') || 'none'}. Use Name: question.`;
  const selected = voice.value;
  if (
    JSON.stringify([...voice.options].map((o) => [o.value, o.text])) !==
    JSON.stringify(profiles.map((p) => [p.id, p.name]))
  ) {
    voice.replaceChildren(...profiles.map((p) => new Option(p.name, p.id)));
    if (profiles.some((p) => p.id === selected)) voice.value = selected;
  }
  const ready =
    kind.value === 'full'
      ? q?.mode !== 'disabled'
      : kind.value === 'response'
        ? !!m && (demo || m.generation.ready)
        : !!m &&
          (demo ||
            (m.speech.ready &&
              m.characters.length > 0 &&
              m.characters.every((p) => p.voiceConfigured)));
  submit.disabled =
    !connected ||
    pending ||
    !ready ||
    (kind.value !== 'response' && (q?.waitingIds.length ?? 0) >= 2);
  kind.disabled = pending;
  get<HTMLButtonElement>('cancel').hidden = !pending || kind.value !== 'response';
  get('test-status').textContent = !ready
    ? 'Finish the required configuration in Settings.'
    : kind.value === 'response'
      ? 'Response tests do not play audio. Finish or clear queued work first.'
      : !state?.playerConnected
        ? 'Open Activity in another tab to connect audio.'
        : q?.paused
          ? 'Resume from Activity to hear queued tests.'
          : 'Tests play through Activity. Remove waiting work or Skip active work there to cancel.';
}
kind.addEventListener('change', () => {
  message.textContent = '';
  get('test-result').textContent = '';
  get('submission-status').textContent = '';
  render();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  if (submit.disabled || (kind.value !== 'voice' && !question.value.trim())) return;
  const test = kind.value;
  const payload: Record<string, string> =
    test === 'voice'
      ? { character: voice.value }
      : test === 'response'
        ? { question: question.value.trim() }
        : { viewer: viewer.value.trim() || 'Streamer', question: question.value.trim() };
  const signature = JSON.stringify([test, payload]);
  if (!submission || submission.signature !== signature)
    submission = {
      signature,
      payload: test === 'response' ? payload : { ...payload, eventId: crypto.randomUUID() },
    };
  const sent = submission.payload;
  message.textContent = '';
  get('test-result').textContent = '';
  get('submission-status').textContent = '';
  pending = true;
  controller = new AbortController();
  render();
  void (async () => {
    try {
      const response = await fetch(test === 'full' ? '/api/requests' : `/api/test/${test}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sent),
        signal: AbortSignal.any([
          controller!.signal,
          AbortSignal.timeout(test === 'response' ? 46000 : 5000),
        ]),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Test failed.');
      message.textContent = '';
      if (result.queue) state = result;
      get('test-result').textContent = test === 'response' ? result.dialogue : '';
      get('submission-status').textContent =
        test === 'response' ? 'Response received.' : 'Test queued. Follow playback in Activity.';
      if (test === 'full' && question.value.trim() === sent.question) question.value = '';
      submission = null;
    } catch (error) {
      message.textContent =
        error instanceof Error && error.name === 'AbortError'
          ? 'Test cancelled.'
          : error instanceof Error && error.name !== 'TypeError' && error.name !== 'TimeoutError'
            ? error.message
            : test === 'response'
              ? 'Connection interrupted or timed out. Check the provider before another test.'
              : 'Connection interrupted. Retry safely; the request ID prevents duplicates.';
      get('submission-status').textContent = '';
    } finally {
      pending = false;
      controller = null;
      if (active) render();
    }
  })();
});
get('cancel').addEventListener('click', () => controller?.abort());
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
  if (active) timer = setTimeout(() => void poll(), 500);
}
window.addEventListener('pagehide', () => {
  active = false;
  clearTimeout(timer);
  controller?.abort();
});
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    active = true;
    void poll();
  }
});
render();
void poll();
