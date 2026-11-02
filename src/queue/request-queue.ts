import { randomUUID, createHash } from 'node:crypto';
import type { QueueState, RequestEntry } from '../shared/protocol.ts';

import type { QueuePipeline, QueueSettings, QueueRecord } from './contracts.ts';
import type { CharacterProfile } from '../characters/types.ts';
import { selectCharacter } from '../characters/input.ts';
import { RequestInputError, SpeechFailure, OperationTimeoutError } from '../shared/errors.ts';
interface QueueDependencies {
  pipeline?: QueuePipeline;
  playerReady(): boolean;
  play(id: string, audio: Buffer): void;
  stop(id: string): void;
  settings?: Partial<QueueSettings>;
  now?: () => number;
  record?(record: QueueRecord): void;
}
interface Job {
  setupTest: boolean;
  pipeline?: QueuePipeline;
  fixedPipeline?: QueuePipeline;
  entry: RequestEntry;
  character: CharacterProfile;
  controller: AbortController;
  eventId: string;
}

// A slot spans generation, speech, and acknowledged browser playback.
export class RequestQueue {
  #deps: QueueDependencies;
  #now: () => number;
  #settings: QueueSettings;
  #repliesEnabled = true;
  #active: Job | null = null;
  #waiting: Job[] = [];
  #history: RequestEntry[] = [];
  #events = new Map<string, { id: string; at: number }>();
  #viewers = new Map<string, number>();
  #lastAccepted = -Infinity;
  #finishedListeners = new Set<(entry: RequestEntry) => void>();
  #loggingFailed = false;
  get loggingFailed() {
    return this.#loggingFailed;
  }
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
      repliesEnabled: this.#repliesEnabled,
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
  submit(viewer: unknown, question: unknown, eventId: unknown): string {
    return this.#submit(viewer, question, eventId, undefined, false);
  }
  // Only trusted local setup actions may use the existing playback queue with intake off.
  submitSetupTest(
    viewer: string,
    question: string,
    eventId: string,
    pipeline: QueuePipeline,
  ): string {
    return this.#submit(viewer, question, eventId, pipeline, true);
  }
  #submit(
    viewer: unknown,
    question: unknown,
    eventId: unknown,
    fixedPipeline: QueuePipeline | undefined,
    setupTest: boolean,
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
    if (setupTest && this.#repliesEnabled)
      throw new RequestInputError('Turn replies off before testing setup audio.');
    if (setupTest && (this.#active || this.#waiting.length))
      throw new RequestInputError('Finish or clear queued work before testing setup audio.');
    if (!setupTest && !this.#repliesEnabled)
      throw new RequestInputError('Replies are off. This request will be refunded.');
    const { character, question: text } = selectCharacter(question, pipeline.characters);
    const name = viewer.trim();
    this.#checkCapacity(name);
    const now = this.#now();
    if (!setupTest) {
      const viewerLast = this.#viewers.get(name.toLowerCase()) ?? -Infinity;
      const wait = Math.max(
        this.#settings.viewerCooldownMs - (now - viewerLast),
        this.#settings.globalCooldownMs - (now - this.#lastAccepted),
      );
      if (wait > 0)
        throw new RequestInputError(
          `Cooldown: wait ${Math.ceil(wait / 1000)} seconds before submitting another question.`,
        );
    }
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
    if (!setupTest) {
      this.#viewers.set(name.toLowerCase(), now);
      this.#lastAccepted = now;
    }
    this.#enqueue({
      setupTest,
      entry,
      character: Object.freeze({ ...character }),
      controller: new AbortController(),
      fixedPipeline,
      eventId,
    });
    return entry.id;
  }
  setRepliesEnabled(enabled: boolean): void {
    // Starting viewer intake must not leave a setup test playing or queued.
    if (enabled) {
      if (this.#active?.setupTest) this.#cancelActive('skipped', 'Setup test stopped.');
      for (const job of [...this.#waiting]) if (job.setupTest) this.remove(job.entry.id);
    }
    this.#repliesEnabled = enabled;
    if (enabled) this.tick();
    else {
      this.clear();
      this.#cancelActive('skipped', 'Replies turned off.');
    }
  }
  skip(): void {
    this.#cancelActive('skipped');
    this.#pump();
  }
  clear(): void {
    const waiting = this.#waiting;
    this.#waiting = [];
    for (const job of waiting) {
      job.controller.abort();
      this.#finish(job, 'removed');
    }
  }
  disconnect(): void {
    this.setRepliesEnabled(false);
  }
  remove(id: unknown): void {
    const index = this.#waiting.findIndex((job) => job.entry.id === id);
    if (index === -1) throw new RequestInputError('Only waiting requests can be removed.');
    const [job] = this.#waiting.splice(index, 1);
    if (job) {
      job.controller.abort();
      this.#finish(job, 'removed');
    }
  }
  playbackEvent(id: string, event: 'playing' | 'blocked' | 'ended' | 'failed'): void {
    const job = this.#active;
    if (!job || job.entry.id !== id || !['ready', 'playing', 'blocked'].includes(job.entry.status))
      return;
    if (event === 'playing') job.entry.status = 'playing';
    else if (event === 'blocked') job.entry.status = 'blocked';
    else {
      this.#active = null;
      this.#finish(
        job,
        event === 'ended' ? 'completed' : 'failed',
        event === 'failed' ? 'Audio playback failed.' : undefined,
      );
      this.#pump();
    }
  }
  tick(): void {
    const now = this.#now();
    const expired: Job[] = [];
    this.#waiting = this.#waiting.filter((job) => {
      if (now - job.entry.createdAt <= this.#settings.waitingExpiryMs) return true;
      expired.push(job);
      return false;
    });
    // Release ownership before callbacks, which may cancel other queued requests.
    for (const job of expired) {
      job.controller.abort();
      this.#finish(job, 'expired');
    }
    for (const [id, event] of this.#events) if (now - event.at > 600_000) this.#events.delete(id);
    while (this.#events.size > 256) this.#events.delete(this.#events.keys().next().value!);
    for (const [viewer, at] of this.#viewers)
      if (now - at >= this.#settings.viewerCooldownMs) this.#viewers.delete(viewer);
    while (this.#viewers.size > 256) this.#viewers.delete(this.#viewers.keys().next().value!);
    if (this.#active && now - (this.#active.entry.startedAt ?? now) > 180_000)
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
    this.#record(job, 'accepted');
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
      (!this.#repliesEnabled && !this.#waiting[0]?.setupTest) ||
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
    if (!latest) {
      job.controller.abort();
      this.#finish(job, 'failed', 'Selected character is no longer available.');
      this.#pump();
      return;
    }
    job.character = Object.freeze({ ...job.character, voiceId: latest.voiceId });
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
            reject(new OperationTimeoutError());
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
      this.#record(job, 'generated');
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
      this.#deps.play(job.entry.id, audio);
    } catch (error) {
      if (!this.#current(job)) return;
      const message =
        job.entry.status === 'generating'
          ? 'Dialogue generation failed.'
          : job.entry.status === 'synthesizing'
            ? error instanceof SpeechFailure
              ? error.publicMessage
              : error instanceof OperationTimeoutError
                ? 'Speech generation timed out.'
                : 'Speech generation failed.'
            : 'Response could not be played.';
      this.#active = null;
      this.#finish(job, 'failed', message);
      this.#pump();
    }
  }
  #finish(job: Job, status: RequestEntry['status'], error?: string): void {
    const entry = job.entry;
    entry.status = status;
    entry.finishedAt = this.#now();
    if (error) entry.error = error;
    this.#record(job, 'finished');
    for (const listener of this.#finishedListeners) listener({ ...entry });
  }
  #record(job: Job, phase: QueueRecord['phase']): void {
    if (!this.#deps.record) return;
    try {
      const pipeline = job.pipeline ?? job.fixedPipeline ?? this.#deps.pipeline;
      this.#deps.record({
        phase,
        recordedAt: this.#now(),
        eventId: job.eventId,
        source: job.eventId.startsWith('reward_') ? 'channel-points' : 'local',
        entry: { ...job.entry },
        generation: pipeline?.generation,
        promptHash: createHash('sha256').update(job.character.prompt).digest('hex'),
      });
    } catch {
      // Logging cannot prevent cancellation or points settlement.
      this.#loggingFailed = true;
    }
  }
  #cancelActive(status: 'skipped' | 'failed', error?: string): void {
    const job = this.#active;
    if (!job) return;
    this.#active = null;
    job.controller.abort();
    this.#finish(job, status, error);
    this.#deps.stop(job.entry.id);
  }
}
