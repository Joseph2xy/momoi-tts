import type { QueuePipeline, QueueSettings } from '../queue/contracts.ts';
import { PlaybackSession } from '../playback/session.ts';
import { TwitchIntake, type TwitchTransportFactory } from '../twitch/intake.ts';
import { createTwurpleTransport } from '../twitch/transport.ts';
import type { TwitchConfig } from '../twitch/config.ts';
import type { RedemptionStore } from '../twitch/redemption-store.ts';
import type { SettingsStore } from './settings.ts';
import type { SettingsSection } from '../shared/protocol.ts';
import { RequestInputError } from '../shared/errors.ts';
import { checkPrerequisites } from './setup-actions.ts';

export interface RuntimeOptions {
  pipeline?: QueuePipeline;
  settings?: Partial<QueueSettings>;
  twitch?: TwitchConfig;
  twitchTransport?: TwitchTransportFactory;
  redemptionStore?: RedemptionStore;
  onQuit?: () => void;
  configurationProof?: (nonce: string) => string;
  management?: SettingsStore;
  onRestart?: () => void;
}

// Application lifetime and composition belong here, independently of HTTP serving.
export class AppRuntime {
  readonly session: PlaybackSession;
  readonly twitch: TwitchIntake;
  readonly canQuit: boolean;
  #options: RuntimeOptions;
  #timer: ReturnType<typeof setInterval>;
  #pendingFor: string | null = null;
  #testing = false;

  constructor(options: RuntimeOptions = {}) {
    this.#options = options;
    this.canQuit = !!options.onQuit;
    this.session = new PlaybackSession(options);
    if (options.management) {
      this.session.state.volume = options.management.volume;
      this.session.pause();
    }
    this.twitch = new TwitchIntake(
      options.twitch,
      this.session.queue,
      options.twitchTransport ?? createTwurpleTransport,
      options.redemptionStore,
    );
    this.#timer = setInterval(() => this.session.sweep(), 500);
    this.#timer.unref();
  }

  snapshot() {
    const state = this.session.snapshot();
    if (this.#pendingFor !== state.queue?.activeId) this.#pendingFor = null;
    return {
      ...state,
      twitch: this.twitch.snapshot(),
      canQuit: this.canQuit,
      ...(this.#options.management
        ? {
            management: {
              ...this.#options.management.snapshot(),
              pending: !!this.#pendingFor,
            },
          }
        : {}),
    };
  }

  saveSettings(section: SettingsSection, body: Record<string, unknown>) {
    const store = this.#options.management;
    if (!store) throw new RequestInputError('Browser settings are unavailable in this session.');
    store.save(section, body);
    if (['generation', 'speech', 'characters'].includes(section)) {
      this.#pendingFor = this.session.queue.snapshot().activeId;
      this.session.queue.setPipeline(store.pipeline());
    }
    return this.snapshot();
  }
  restart(confirmed: boolean) {
    if (!this.#options.onRestart)
      throw new RequestInputError('Restart is unavailable in this session.');
    const queue = this.session.queue.snapshot();
    if ((queue.activeId || queue.waitingIds.length) && !confirmed)
      throw new RequestInputError(
        'Restart cancels active work and clears waiting requests. Confirm to proceed.',
      );
    this.session.stop('Restarting app.');
    this.session.queue.stopAndClear();
    this.twitch.disconnect();
    setImmediate(() => this.#options.onRestart!());
  }
  prerequisites() {
    return checkPrerequisites(this.#options.management?.env());
  }
  checkConnection(section: unknown) {
    if (!this.#options.management)
      throw new RequestInputError('Connection checks are unavailable.');
    return this.#options.management.checkConnection(section);
  }
  refreshProfiles() {
    const store = this.#options.management;
    if (!store) throw new RequestInputError('Profile refresh is unavailable.');
    try {
      store.refreshProfiles();
    } catch {
      throw new RequestInputError('Check the character catalog and prompt files before reloading.');
    }
    this.#pendingFor = this.session.queue.snapshot().activeId;
    this.session.queue.setPipeline(store.pipeline());
    return this.snapshot();
  }
  async testResponse(question: unknown, signal: AbortSignal) {
    if (!this.#options.management || this.#testing)
      throw new RequestInputError('Response testing is unavailable or already running.');
    const queue = this.session.queue.snapshot();
    if (queue.activeId || queue.waitingIds.length)
      throw new RequestInputError(
        'Finish or clear queued work before running a response-only test.',
      );
    this.#testing = true;
    try {
      return { dialogue: await this.#options.management.testResponse(question, signal) };
    } finally {
      this.#testing = false;
    }
  }
  testVoice(body: Record<string, unknown>) {
    const store = this.#options.management;
    if (!store || typeof body.character !== 'string')
      throw new RequestInputError('Select a configured character.');
    const profile = store.profiles().find((p) => p.id === body.character);
    if (!profile) throw new RequestInputError('Unknown character.');
    this.session.queue.submit(
      'Voice test',
      `${profile.name}: Voice test`,
      body.eventId,
      store.voicePipeline(),
    );
    return this.snapshot();
  }

  configurationProof(nonce: string): string | undefined {
    return this.#options.configurationProof?.(nonce);
  }

  quit(): void {
    this.session.stop('App closed.');
    this.session.queue.stopAndClear();
    this.twitch.disconnect();
    if (this.#options.onQuit) setImmediate(this.#options.onQuit);
  }

  close(): void {
    clearInterval(this.#timer);
    this.twitch.disconnect();
    this.session.queue.stopAndClear();
  }
}
