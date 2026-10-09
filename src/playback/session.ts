import type { PlaybackState } from '../shared/protocol.ts';
import { RequestQueue } from '../queue/request-queue.ts';
import type { QueuePipeline, QueueSettings } from '../queue/contracts.ts';

const active = new Set(['ready', 'playing', 'blocked']);
const leaseMs = 3000;

// Owns the player lease and audio snapshot. The queue owns the request lifecycle.
export class PlaybackSession {
  readonly queue: RequestQueue;
  readonly state: PlaybackState = {
    status: 'idle',
    clip: null,
    playerConnected: false,
    speechPaused: false,
    progress: null,
    muted: false,
    volume: 1,
    message: 'Keep this page open for playback.',
  };
  #owner: { session: string; seen: number } | null = null;
  #audio: Buffer | null = null;
  #clipStarted = 0;
  #pausedAt: number | null = null;
  constructor(options: { pipeline?: QueuePipeline; settings?: Partial<QueueSettings> }) {
    this.queue = new RequestQueue({
      ...options,
      playerReady: () =>
        !!this.#owner && Date.now() - this.#owner.seen <= leaseMs && !active.has(this.state.status),
      play: (id, audio, label) => {
        this.#begin(id, label, audio);
        this.state.status = 'ready';
        this.state.message = 'Waiting for player.';
        if (this.queue.snapshot().paused) this.setSpeechPaused(true);
      },
      stop: (id) => {
        if (this.state.clip?.id === id) this.stop('Response skipped.');
      },
    });
  }
  snapshot(): PlaybackState {
    return {
      ...this.state,
      message: this.state.speechPaused
        ? 'Speech paused. Resume to continue from this position.'
        : this.state.message,
      progress: this.state.progress ? { ...this.state.progress } : null,
      queue: this.queue.snapshot(),
    };
  }
  get busy(): boolean {
    return active.has(this.state.status);
  }
  pause(): void {
    this.queue.pause();
    this.setSpeechPaused(true);
  }
  resume(): void {
    this.setSpeechPaused(false);
    this.queue.resume();
  }
  audio(path: string): Buffer | null {
    return this.busy && path === this.state.clip?.url ? this.#audio : null;
  }
  stop(message: string): void {
    if (this.busy) this.state.status = 'stopped';
    this.setSpeechPaused(false);
    this.state.progress = null;
    this.state.message = message;
    this.#audio = null;
  }
  setSpeechPaused(paused: boolean): boolean {
    if (!['ready', 'playing', 'blocked'].includes(this.state.status)) {
      if (paused) return false;
    }
    if (paused === this.state.speechPaused) return true;
    if (paused) this.#pausedAt = Date.now();
    else if (this.#pausedAt !== null) {
      this.#clipStarted += Date.now() - this.#pausedAt;
      this.#pausedAt = null;
    }
    this.state.speechPaused = paused;
    this.queue.setPlaybackPaused(paused);
    return true;
  }
  sweep(): void {
    if (this.#owner && Date.now() - this.#owner.seen > leaseMs) {
      this.#owner = null;
      this.state.playerConnected = false;
      this.stop('Player disconnected. Queue paused; resume when ready.');
      this.queue.disconnect();
    }
    if (this.busy && !this.state.speechPaused && Date.now() - this.#clipStarted > 120_000) {
      this.state.status = 'failed';
      this.state.message = 'Playback timed out.';
      this.#audio = null;
      if (this.state.clip) this.queue.playbackEvent(this.state.clip.id, 'failed');
    }
    this.queue.tick();
  }
  poll(
    session: string,
    progress?: { id: string; elapsedSeconds: number; durationSeconds: number },
  ) {
    if (!this.#owner) this.#owner = { session, seen: Date.now() };
    const primary = this.#owner.session === session;
    if (primary) {
      this.#owner.seen = Date.now();
      this.state.playerConnected = true;
      if (progress && progress.id === this.state.clip?.id && this.busy)
        this.state.progress = {
          elapsedSeconds: progress.elapsedSeconds,
          durationSeconds: progress.durationSeconds,
        };
    }
    this.queue.tick();
    return { ...this.snapshot(), clip: primary ? this.state.clip : null, primary };
  }
  release(session: unknown): void {
    if (!this.#owner || this.#owner.session !== session) return;
    this.#owner = null;
    this.state.playerConnected = false;
    this.stop('Page closed or refreshed. Queue paused; resume when ready.');
    this.queue.disconnect();
  }
  playbackEvent(session: unknown, id: unknown, event: unknown): 'ok' | 'stale' | 'invalid' {
    if (!this.#owner || this.#owner.session !== session || id !== this.state.clip?.id)
      return 'stale';
    // A completion acknowledgement may be lost; repeating it must be harmless.
    if (event === 'ended' && this.state.status === 'completed') return 'ok';
    if (!this.busy) return 'stale';
    if (event === 'playing') {
      this.state.status = 'playing';
      this.state.message = 'Playing.';
    } else if (event === 'blocked') {
      this.state.status = 'blocked';
      this.state.message = 'Click Enable audio on this page.';
    } else if (event === 'ended' && this.state.status === 'playing') {
      this.state.status = 'completed';
      this.state.message = 'Playback completed.';
    } else if (event === 'failed') {
      this.state.status = 'failed';
      this.state.message = 'The player could not play this audio. Check browser audio access.';
    } else return 'invalid';
    if (event === 'ended' || event === 'failed') {
      this.setSpeechPaused(false);
      this.#audio = null;
    }
    this.queue.playbackEvent(this.state.clip!.id, event);
    return 'ok';
  }
  #begin(id: string, label: string, content: Buffer): void {
    this.state.speechPaused = false;
    this.#pausedAt = null;
    this.state.progress = null;
    const extension = content.toString('ascii', 0, 4) === 'RIFF' ? 'wav' : 'mp3';
    this.state.clip = { id, label, url: `/audio/${id}.${extension}` };
    this.#audio = Buffer.from(content);
    this.#clipStarted = Date.now();
  }
}
