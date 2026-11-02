import type { PlaybackState } from '../shared/protocol.ts';
import { RequestQueue } from '../queue/request-queue.ts';
import type { QueuePipeline, QueueSettings, QueueRecord } from '../queue/contracts.ts';

const active = new Set(['ready', 'playing', 'blocked']);
const leaseMs = 3000;

// Owns the player lease and audio snapshot. The queue owns the request lifecycle.
export class PlaybackSession {
  readonly queue: RequestQueue;
  readonly state: PlaybackState = {
    status: 'idle',
    clip: null,
    playerConnected: false,
    progress: null,
    muted: false,
    volume: 1,
    message: 'Keep the OBS audio source active for playback.',
  };
  #owner: { session: string; seen: number } | null = null;
  #audio: Buffer | null = null;
  #clipStarted = 0;
  #repliesRequested = false;
  get repliesRequested() {
    return this.#repliesRequested;
  }
  constructor(options: {
    pipeline?: QueuePipeline;
    settings?: Partial<QueueSettings>;
    record?(record: QueueRecord): void;
  }) {
    this.queue = new RequestQueue({
      ...options,
      playerReady: () =>
        !!this.#owner && Date.now() - this.#owner.seen <= leaseMs && !active.has(this.state.status),
      play: (id, audio) => {
        this.#begin(id, audio);
        this.state.status = 'ready';
        this.state.message = 'Waiting for player.';
      },
      stop: (id) => {
        if (this.state.clip?.id === id) this.stop('Response skipped.');
      },
    });
  }
  snapshot(): PlaybackState {
    return {
      ...this.state,
      progress: this.state.progress ? { ...this.state.progress } : null,
      queue: this.queue.snapshot(),
    };
  }
  get busy(): boolean {
    return active.has(this.state.status);
  }
  setRepliesEnabled(enabled: boolean): void {
    this.#repliesRequested = enabled;
    this.queue.setRepliesEnabled(enabled);
    if (!enabled) this.stop('Replies are off. Turn on to accept fresh requests.');
  }
  audio(path: string): Buffer | null {
    return this.busy && path === this.state.clip?.url ? this.#audio : null;
  }
  stop(message: string): void {
    if (this.busy) this.state.status = 'stopped';
    this.state.progress = null;
    this.state.message = message;
    this.#audio = null;
  }
  sweep(): void {
    if (this.#owner && Date.now() - this.#owner.seen > leaseMs) {
      this.#owner = null;
      this.state.playerConnected = false;
      this.stop(
        'Player disconnected. Interrupted work is canceled; waiting for the source to return.',
      );
      this.queue.disconnect();
    }
    if (this.busy && Date.now() - this.#clipStarted > 120_000) {
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
      if (this.#repliesRequested && !this.queue.snapshot().repliesEnabled)
        this.queue.setRepliesEnabled(true);
      if (progress && progress.id === this.state.clip?.id && this.busy)
        this.state.progress = {
          elapsedSeconds: progress.elapsedSeconds,
          durationSeconds: progress.durationSeconds,
        };
    }
    this.queue.tick();
    return {
      primary,
      status: this.state.status,
      clip: primary ? this.state.clip : null,
      muted: this.state.muted,
      volume: this.state.volume,
    };
  }
  release(session: unknown): void {
    if (!this.#owner || this.#owner.session !== session) return;
    this.#owner = null;
    this.state.playerConnected = false;
    this.stop(
      'Audio source closed or refreshed. Interrupted work is canceled; waiting for the source to return.',
    );
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
      this.state.message = 'Audio blocked. Click the blank player in OBS Interact to enable audio.';
    } else if (event === 'ended' && this.state.status === 'playing') {
      this.state.status = 'completed';
      this.state.message = 'Playback completed.';
    } else if (event === 'failed') {
      this.state.status = 'failed';
      this.state.message = 'The player could not play this audio. Check browser audio access.';
    } else return 'invalid';
    if (event === 'ended' || event === 'failed') this.#audio = null;
    this.queue.playbackEvent(this.state.clip!.id, event);
    return 'ok';
  }
  #begin(id: string, content: Buffer): void {
    this.state.progress = null;
    const extension = content.toString('ascii', 0, 4) === 'RIFF' ? 'wav' : 'mp3';
    this.state.clip = { id, url: `/audio/${id}.${extension}` };
    this.#audio = Buffer.from(content);
    this.#clipStarted = Date.now();
  }
}
