import type { PlayerState } from '../src/shared/protocol.ts';

export function startPlayback(onOwnership: (primary: boolean | null) => void) {
  const session = crypto.randomUUID();
  const status = document.querySelector<HTMLElement>('#playback-note')!;
  const enable = document.querySelector<HTMLButtonElement>('#enable')!;
  let audio: HTMLAudioElement | null = null;
  let currentId: string | null = null;
  let attemptedId: string | null = null;
  let stopped = false;
  let blocked = false;
  let starting = false;
  let held = false;
  let hasPlayed = false;
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
    held = false;
    hasPlayed = false;
    enable.hidden = true;
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
    if (!target || !id || starting || held) return;
    starting = true;
    try {
      // Called directly by the Enable button when a user gesture is required.
      await target.play();
      if (audio !== target || currentId !== id) {
        target.pause();
        return;
      }
      hasPlayed = true;
      if (held) {
        target.pause();
        return;
      }
      blocked = false;
      enable.hidden = true;
      if (!(await report(id, 'playing')) && audio === target && !target.ended) reset();
    } catch (error) {
      if (audio !== target || currentId !== id) return;
      if (held && error instanceof DOMException && error.name === 'AbortError') return;
      if (error instanceof DOMException && ['NotAllowedError', 'AbortError'].includes(error.name)) {
        blocked = true;
        enable.hidden = false;
        status.textContent = 'Click Enable audio to allow playback.';
        if (!(await report(id, 'blocked')) && audio === target) reset();
      } else {
        await report(id, 'failed');
        if (audio === target) reset();
      }
    } finally {
      if (audio === target) starting = false;
    }
  }
  enable.addEventListener('click', () => {
    if (blocked) void start();
  });

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
      onOwnership(state.primary);
      if (!state.primary) {
        reset();
        status.textContent = 'Another app tab owns audio playback. This tab is silent.';
      } else {
        status.textContent =
          blocked && !state.speechPaused ? 'Click Enable audio to allow playback.' : '';
        const playable = ['ready', 'playing', 'blocked'].includes(state.status);
        if (!playable || !state.clip) reset();
        else {
          if (audio && currentId !== state.clip.id) reset();
          held = state.speechPaused;
          enable.hidden = held || !blocked;
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
            target.onended = () => {
              if (audio === target && currentId === id) status.textContent = 'Finishing playback…';
            };
            target.onpause = () => {
              if (audio === target && currentId === id && !target.ended && target.paused && !held) {
                blocked = true;
                enable.hidden = false;
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
            if (!held) void start();
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
            } else if (held) audio.pause();
            else if (audio.paused && !blocked && !starting) {
              // An intentional pause retains this element and its playback position.
              if (hasPlayed || state.status === 'ready' || state.status === 'playing') void start();
            }
          }
        }
      }
    } catch {
      if (stopped || generation !== lifecycle) return;
      reset();
      onOwnership(null);
      status.textContent =
        'Audio disconnected. Current playback stopped; resume after reconnecting.';
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

  return { stop };
}
