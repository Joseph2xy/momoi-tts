import { randomUUID } from 'node:crypto';
import type { QueueState, RequestEntry } from '../shared/protocol.ts';

import type { QueuePipeline, QueueSettings } from './contracts.ts';
import type { CharacterProfile } from '../characters/types.ts';
import { selectCharacter } from '../characters/input.ts';
import { RequestInputError } from '../shared/errors.ts';
interface QueueDependencies {
  pipeline?: QueuePipeline;
  playerReady(): boolean;
  play(id: string, audio: Buffer, label: string): void;
  stop(id: string): void;
  settings?: Partial<QueueSettings>;
  now?: () => number;
}
interface Job {
  pipeline?: QueuePipeline;
  fixedPipeline?: QueuePipeline;
  entry: RequestEntry;
  character: CharacterProfile;
  controller: AbortController;
  pausedAt?: number;
  pausedMs?: number;
}

// A slot spans generation, speech, and acknowledged browser playback.
export class RequestQueue {
  #deps: QueueDependencies;
  #now: () => number;
  #settings: QueueSettings;
  #paused = false;
  #active: Job | null = null;
  #waiting: Job[] = [];
  #history: RequestEntry[] = [];
  #events = new Map<string, { id: string; at: number }>();
  #viewers = new Map<string, number>();
  #lastAccepted = -Infinity;
  #finishedListeners = new Set<(entry: RequestEntry) => void>();
  constructor(deps: QueueDependencies) {
    this.#deps = deps;
    this.#now = deps.now ?? Date.now;
    this.#settings = {
      viewerCooldownMs: 10_000,
      globalCooldownMs: 1000,
      waitingExpiryMs: 180_000,
      ...deps.settings,
    };
    for (const [key, value] of Object.entries(this.#settings)) {
      if (
        !Number.isInteger(value) ||
        value < (key === 'waitingExpiryMs' ? 100 : 0) ||
        value > 3_600_000
      )
        throw new Error('Queue durations must be valid milliseconds.');
    }
  }
  snapshot(): QueueState {
    return {
      characters: this.#deps.pipeline?.characters.map(({ id, name }) => ({ id, name })) ?? [],
      mode: this.#deps.pipeline?.mode ?? 'disabled',
      paused: this.#paused,
      activeId: this.#active?.entry.id ?? null,
      waitingIds: this.#waiting.map((job) => job.entry.id),
      requests: this.#history.map((entry) => ({ ...entry })),
      ...this.#settings,
    };
  }
  onFinished(listener: (entry: RequestEntry) => void): () => void {
    this.#finishedListeners.add(listener);
    return () => {
      this.#finishedListeners.delete(listener);
    };
  }
  setPipeline(pipeline: QueuePipeline | undefined): void {
    this.#deps.pipeline = pipeline;
  }
  cancel(id: string): void {
    if (this.#active?.entry.id === id) {
      this.#cancelActive('skipped');
      this.#pump();
    } else if (this.#waiting.some((job) => job.entry.id === id)) this.remove(id);
  }
  submit(
    viewer: unknown,
    question: unknown,
    eventId: unknown,
    fixedPipeline?: QueuePipeline,
  ): string {
    const pipeline = fixedPipeline ?? this.#deps.pipeline;
    if (!pipeline) throw new RequestInputError('Question generation is unavailable in this mode.');
    if (
      typeof viewer !== 'string' ||
      !viewer.trim() ||
      viewer.trim().length > 40 ||
      /[\p{Cc}]/u.test(viewer)
    )
      throw new RequestInputError('Viewer name must contain 1–40 characters.');
    if (typeof eventId !== 'string' || !/^[a-z0-9_-]{1,128}$/iu.test(eventId))
      throw new RequestInputError('Invalid request event ID.');
    this.tick();
    const previous = this.#events.get(eventId);
    if (previous) return previous.id;
    const { character, question: text } = selectCharacter(question, pipeline.characters);
    const name = viewer.trim();
    this.#checkCapacity(name);
    const now = this.#now();
    const viewerLast = this.#viewers.get(name.toLowerCase()) ?? -Infinity;
    const wait = Math.max(
      this.#settings.viewerCooldownMs - (now - viewerLast),
      this.#settings.globalCooldownMs - (now - this.#lastAccepted),
    );
    if (wait > 0)
      throw new RequestInputError(
        `Cooldown: wait ${Math.ceil(wait / 1000)} seconds before submitting another question.`,
      );
    const entry: RequestEntry = {
      id: randomUUID(),
      viewer: name,
      question: text,
      characterId: character.id,
      characterName: character.name,
      status: 'waiting',
      createdAt: now,
    };
    this.#events.set(eventId, { id: entry.id, at: now });
    while (this.#events.size > 256) this.#events.delete(this.#events.keys().next().value!);
    this.#viewers.set(name.toLowerCase(), now);
    this.#lastAccepted = now;
    this.#enqueue({
      entry,
      character: Object.freeze({ ...character }),
      controller: new AbortController(),
      fixedPipeline,
    });
    return entry.id;
  }
  pause(): void {
    this.#paused = true;
  }
  setPlaybackPaused(paused: boolean): void {
    const job = this.#active;
    if (!job || !['ready', 'playing', 'blocked'].includes(job.entry.status)) return;
    if (paused && job.pausedAt === undefined) job.pausedAt = this.#now();
    else if (!paused && job.pausedAt !== undefined) {
      job.pausedMs = (job.pausedMs ?? 0) + this.#now() - job.pausedAt;
      job.pausedAt = undefined;
    }
  }
  resume(): void {
    this.#paused = false;
    this.tick();
  }
  skip(): void {
    this.#cancelActive('skipped');
    this.#pump();
  }
  clear(): void {
    for (const job of this.#waiting) {
      job.controller.abort();
      this.#finish(job.entry, 'removed');
    }
    this.#waiting = [];
  }
  stopAndClear(): void {
    this.#paused = true;
    this.clear();
    this.#cancelActive('skipped');
  }
  disconnect(): void {
    this.#paused = true;
    this.#cancelActive('skipped', 'Player disconnected; queue paused.');
  }
  remove(id: unknown): void {
    const index = this.#waiting.findIndex((job) => job.entry.id === id);
    if (index === -1) throw new RequestInputError('Only waiting requests can be removed.');
    const [job] = this.#waiting.splice(index, 1);
    if (job) {
      job.controller.abort();
      this.#finish(job.entry, 'removed');
    }
  }
  playbackEvent(id: string, event: 'playing' | 'blocked' | 'ended' | 'failed'): void {
    const job = this.#active;
    if (!job || job.entry.id !== id || !['ready', 'playing', 'blocked'].includes(job.entry.status))
      return;
    if (event === 'playing') job.entry.status = 'playing';
    else if (event === 'blocked') job.entry.status = 'blocked';
    else {
      this.#finish(
        job.entry,
        event === 'ended' ? 'completed' : 'failed',
        event === 'failed' ? 'Audio playback failed.' : undefined,
      );
      this.#active = null;
      this.#pump();
    }
  }
  tick(): void {
    const now = this.#now();
    this.#waiting = this.#waiting.filter((job) => {
      if (now - job.entry.createdAt <= this.#settings.waitingExpiryMs) return true;
      job.controller.abort();
      this.#finish(job.entry, 'expired');
      return false;
    });
    for (const [id, event] of this.#events) if (now - event.at > 600_000) this.#events.delete(id);
    while (this.#events.size > 256) this.#events.delete(this.#events.keys().next().value!);
    for (const [viewer, at] of this.#viewers)
      if (now - at >= this.#settings.viewerCooldownMs) this.#viewers.delete(viewer);
    while (this.#viewers.size > 256) this.#viewers.delete(this.#viewers.keys().next().value!);
    if (
      this.#active &&
      this.#active.pausedAt === undefined &&
      now - (this.#active.entry.startedAt ?? now) - (this.#active.pausedMs ?? 0) > 180_000
    )
      this.#cancelActive('failed', 'Request timed out.');
    this.#pump();
  }
  #checkCapacity(viewer: string): void {
    if (
      [this.#active, ...this.#waiting].some(
        (job) => job?.entry.viewer.toLowerCase() === viewer.toLowerCase(),
      )
    )
      throw new RequestInputError('This viewer already has an outstanding request.');
    if (this.#waiting.length >= 2)
      throw new RequestInputError(
        'Queue full: one active response and two waiting requests maximum.',
      );
  }
  #enqueue(job: Job): void {
    this.#waiting.push(job);
    this.#history.push(job.entry);
    while (this.#history.length > 23) {
      const index = this.#history.findIndex(
        (entry) =>
          !['waiting', 'generating', 'synthesizing', 'ready', 'playing', 'blocked'].includes(
            entry.status,
          ),
      );
      if (index === -1) break;
      this.#history.splice(index, 1);
    }
    this.#pump();
  }
  #pump(): void {
    if (
      this.#paused ||
      this.#active ||
      !this.#waiting.length ||
      !this.#deps.playerReady() ||
      !(this.#waiting[0]?.fixedPipeline ?? this.#deps.pipeline)
    )
      return;
    const job = this.#waiting.shift()!;
    job.pipeline = job.fixedPipeline ?? this.#deps.pipeline;
    // Keep the accepted character identity; apply its latest voice before work starts.
    const latest = job.pipeline!.characters.find((profile) => profile.id === job.character.id);
    if (latest) job.character = Object.freeze({ ...job.character, voiceId: latest.voiceId });
    this.#active = job;
    job.entry.startedAt = this.#now();
    void this.#run(job);
  }
  #current(job: Job): boolean {
    return this.#active === job && !job.controller.signal.aborted;
  }
  async #phase<T>(job: Job, operation: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const phase = new AbortController();
    const signal = AbortSignal.any([job.controller.signal, phase.signal]);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        Promise.resolve().then(() => {
          signal.throwIfAborted();
          return operation(signal);
        }),
        new Promise<never>((_resolve, reject) => {
          abort = () => reject(new Error('Cancelled.'));
          job.controller.signal.addEventListener('abort', abort, { once: true });
          if (job.controller.signal.aborted) abort();
          timer = setTimeout(() => {
            phase.abort();
            reject(new Error('Timed out.'));
          }, 45_000);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) job.controller.signal.removeEventListener('abort', abort);
    }
  }
  async #run(job: Job): Promise<void> {
    try {
      job.entry.status = 'generating';
      const dialogue = await this.#phase(job, (signal) =>
        job.pipeline!.generate(job.entry.question, signal, job.character),
      );
      if (!this.#current(job)) return;
      if (typeof dialogue !== 'string' || !dialogue.trim() || Buffer.byteLength(dialogue) > 4000)
        throw new Error('Invalid dialogue.');
      job.entry.dialogue = dialogue;
      job.entry.status = 'synthesizing';
      const audio = await this.#phase(job, (signal) =>
        job.pipeline!.synthesize(dialogue, signal, job.character),
      );
      if (!this.#current(job)) return;
      if (!Buffer.isBuffer(audio) || !audio.length || audio.length > 5_000_000)
        throw new Error('Invalid audio.');
      if (!this.#deps.playerReady()) {
        this.disconnect();
        return;
      }
      job.entry.status = 'ready';
      this.#deps.play(job.entry.id, audio, `${job.entry.characterName} · ${job.entry.viewer}`);
    } catch {
      if (!this.#current(job)) return;
      const message =
        job.entry.status === 'generating'
          ? 'Dialogue generation failed.'
          : job.entry.status === 'synthesizing'
            ? 'Speech generation failed.'
            : 'Response could not be played.';
      this.#finish(job.entry, 'failed', message);
      this.#active = null;
      this.#pump();
    }
  }
  #finish(entry: RequestEntry, status: RequestEntry['status'], error?: string): void {
    entry.status = status;
    entry.finishedAt = this.#now();
    if (error) entry.error = error;
    for (const listener of this.#finishedListeners) listener({ ...entry });
  }
  #cancelActive(status: 'skipped' | 'failed', error?: string): void {
    const job = this.#active;
    if (!job) return;
    this.#active = null;
    job.controller.abort();
    this.#finish(job.entry, status, error);
    this.#deps.stop(job.entry.id);
  }
}
