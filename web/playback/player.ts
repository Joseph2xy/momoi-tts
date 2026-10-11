import type { PlayerState } from '../../src/shared/protocol.ts';

export function startPlayback() {
  const session = crypto.randomUUID();
  let audio: HTMLAudioElement | null = null;
  let currentId: string | null = null;
  let attemptedId: string | null = null;
  let stopped = false;
  let blocked = false;
  let starting = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let lifecycle = 0;

  function reset() {
    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.onpause = null;
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      audio.remove();
    }
    audio = null;
    currentId = null;
    blocked = false;
    starting = false;
  }
  async function request<T>(route: string, body: unknown): Promise<T> {
    const response = await fetch(route, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(1800),
    });
    if (!response.ok) throw new Error('Player request failed.');
    return (await response.json()) as T;
  }
  async function report(id: string, event: string): Promise<boolean> {
    try {
      await request('/api/player/event', { session, id, event });
      return true;
    } catch {
      return false;
    }
  }
  async function start() {
    const target = audio;
    const id = currentId;
    if (!target || !id || starting) return;
    starting = true;
    try {
      // OBS normally allows autoplay; Interact can supply a gesture if it is blocked.
      await target.play();
      if (audio !== target || currentId !== id) {
        target.pause();
        return;
      }
      blocked = false;

      if (!(await report(id, 'playing')) && audio === target && !target.ended) reset();
    } catch (error) {
      if (audio !== target || currentId !== id) return;
      if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name)) {
        blocked = true;

        if (!(await report(id, 'blocked')) && audio === target) reset();
      } else {
        await report(id, 'failed');
        if (audio === target) reset();
      }
    } finally {
      if (audio === target) starting = false;
    }
  }
  const unlock = () => {
    if (blocked) void start();
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  async function poll() {
    if (stopped) return;
    const generation = lifecycle;
    try {
      const progress =
        audio && currentId && Number.isFinite(audio.duration) && audio.duration > 0
          ? { id: currentId, elapsedSeconds: audio.currentTime, durationSeconds: audio.duration }
          : undefined;
      const state = await request<PlayerState>('/api/player/poll', { session, progress });
      if (stopped || generation !== lifecycle) return;

      if (!state.primary) {
        reset();
      } else {
        const playable = ['ready', 'playing', 'blocked'].includes(state.status);
        if (!playable || !state.clip) reset();
        else {
          if (audio && currentId !== state.clip.id) reset();

          if (!audio && attemptedId !== state.clip.id) {
            const id = state.clip.id;
            attemptedId = id;
            currentId = id;
            const target = new Audio(state.clip.url);
            target.preload = 'auto';
            target.muted = state.muted;
            target.volume = state.volume;
            // Polling retries completion until the server confirms it in its state.
            // Keep the ended element so a lost acknowledgement cannot replay it.
            target.onpause = () => {
              if (audio === target && currentId === id && !target.ended && target.paused) {
                blocked = true;

                void report(id, 'blocked');
              }
            };
            target.onerror = () => {
              if (audio === target && currentId === id) {
                void report(id, 'failed');
                reset();
              }
            };
            audio = target;
            document.body.append(target);
            void start();
          } else if (!audio && attemptedId === state.clip.id) {
            // A disconnected or failed response must never start again by itself.
            await report(state.clip.id, 'failed');
          }
          if (audio) {
            audio.muted = state.muted;
            audio.volume = state.volume;
            if (audio.ended && currentId) {
              // A very short clip can finish before the playing report arrives.
              if (state.status !== 'playing') await report(currentId, 'playing');
              await report(currentId, 'ended');
            }
          }
        }
      }
    } catch {
      if (stopped || generation !== lifecycle) return;
      reset();
    }
    if (!stopped && generation === lifecycle)
      pollTimer = setTimeout(() => {
        void poll();
      }, 400);
  }
  function stop() {
    stopped = true;
    lifecycle++;
    reset();
    clearTimeout(pollTimer);
    navigator.sendBeacon(
      '/api/player/release',
      new Blob([JSON.stringify({ session })], { type: 'application/json' }),
    );
  }
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && stopped) {
      stopped = false;
      void poll();
    }
  });
  void poll();
}
