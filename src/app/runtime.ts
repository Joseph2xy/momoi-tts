import type { QueuePipeline, QueueSettings } from '../queue/contracts.ts';
import { PlaybackSession } from '../playback/session.ts';
import { TwitchIntake, type TwitchTransportFactory } from '../twitch/intake.ts';
import { createTwurpleTransport } from '../twitch/transport.ts';
import type { TwitchConfig } from '../twitch/config.ts';
import type { RedemptionStore } from '../twitch/redemption-store.ts';

export interface RuntimeOptions {
  pipeline?: QueuePipeline;
  settings?: Partial<QueueSettings>;
  twitch?: TwitchConfig;
  twitchTransport?: TwitchTransportFactory;
  redemptionStore?: RedemptionStore;
  onQuit?: () => void;
  configurationProof?: (nonce: string) => string;
}

// Application lifetime and composition belong here, independently of HTTP serving.
export class AppRuntime {
  readonly session: PlaybackSession;
  readonly twitch: TwitchIntake;
  readonly canQuit: boolean;
  #options: RuntimeOptions;
  #timer: ReturnType<typeof setInterval>;

  constructor(options: RuntimeOptions = {}) {
    this.#options = options;
    this.canQuit = !!options.onQuit;
    this.session = new PlaybackSession(options);
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
    return { ...this.session.snapshot(), twitch: this.twitch.snapshot(), canQuit: this.canQuit };
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
