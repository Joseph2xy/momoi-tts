import {
  configuredPipeline,
  obsTestPipeline,
  testSpeech,
  testVoiceId,
  testResponse,
  checkConnection,
} from './provider-actions.ts';
import type { QueuePipeline, QueueSettings } from '../queue/contracts.ts';
import { PlaybackSession } from '../playback/session.ts';
import { TwitchIntake, type TwitchTransportFactory } from '../twitch/intake.ts';
import { createTwurpleTransport } from '../twitch/transport.ts';
import type { TwitchConfig } from '../twitch/config.ts';
import type { RedemptionStore } from '../twitch/redemption-store.ts';
import type { SettingsStore } from './settings.ts';
import type { SettingsSection } from '../shared/protocol.ts';
import { RequestInputError } from '../shared/errors.ts';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileDialogueLog, type DialogueLog } from './dialogue-log.ts';
import { fileRedemptionStore } from '../twitch/redemption-store.ts';

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
  dialogueLog?: DialogueLog;
}

// Application lifetime and composition belong here, independently of HTTP serving.
export class AppRuntime {
  readonly session: PlaybackSession;
  readonly twitch: TwitchIntake;
  readonly canQuit: boolean;
  #options: RuntimeOptions;
  #timer: ReturnType<typeof setInterval>;
  #pendingFor: string | null = null;
  #providerTest: AbortController | undefined;
  #obsTestIds = new Set<string>();
  #obsTestEvents = new Map<string, { requestId: string; voiceId: string }>();
  #logFailed = false;
  #twitchConfigurationError: string | undefined;

  constructor(options: RuntimeOptions = {}) {
    this.#options = options;
    let twitchConfig: TwitchConfig | undefined;
    // Invalid Twitch setup must not block Settings or independent provider previews.
    try {
      twitchConfig = options.twitch ?? options.management?.twitchConfig();
    } catch {
      this.#twitchConfigurationError = 'Repair private Twitch configuration and restart.';
    }
    this.canQuit = !!options.onQuit;
    const log =
      options.dialogueLog ??
      (options.management
        ? fileDialogueLog(resolve(options.management.privateRoot, 'dialogue.jsonl'))
        : undefined);
    this.session = new PlaybackSession({
      ...options,
      record: log ? (record) => log.record(record) : undefined,
    });
    if (options.management) {
      this.session.state.volume = options.management.volume;
    }
    this.session.setRepliesEnabled(false);
    this.twitch = new TwitchIntake(
      twitchConfig,
      this.session.queue,
      options.twitchTransport ?? createTwurpleTransport,
      options.redemptionStore ??
        (options.management
          ? fileRedemptionStore(
              pathToFileURL(resolve(options.management.privateRoot, 'twitch-redemptions.json')),
            )
          : undefined),
      log
        ? (event, reason) => {
            try {
              log.record({
                phase: reason ? 'rejected' : 'received',
                source: 'channel-points',
                recordedAt: Date.now(),
                eventId: 'reward_' + event.id,
                viewer: event.userName.slice(0, 40),
                question: event.input.slice(0, 1100),
                reason,
              });
            } catch {
              this.#logFailed = true;
            }
          }
        : undefined,
    );
    if (options.management?.twitchConnected) this.twitch.connect();
    this.#timer = setInterval(() => this.session.sweep(), 500);
    this.#timer.unref();
  }

  snapshot() {
    const state = this.session.snapshot();
    if (this.#pendingFor !== state.queue?.activeId) this.#pendingFor = null;
    return {
      ...state,
      twitch: {
        ...this.twitch.snapshot(),
        ...(this.#twitchConfigurationError
          ? { status: 'error' as const, message: this.#twitchConfigurationError }
          : {}),
      },
      canQuit: this.canQuit,
      logging: {
        available: !!(this.#options.dialogueLog || this.#options.management),
        failed: this.#logFailed || this.session.queue.loggingFailed,
      },
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
  connectTwitch() {
    if (this.#twitchConfigurationError) throw new RequestInputError(this.#twitchConfigurationError);
    if (this.twitch.snapshot().status === 'disabled')
      throw new RequestInputError('Configure Twitch before connecting.');
    this.#options.management?.rememberTwitch(true);
    this.twitch.connect();
  }
  disconnectTwitch() {
    this.#options.management?.rememberTwitch(false);
    this.twitch.disconnect();
  }

  saveSettings(section: SettingsSection, body: Record<string, unknown>) {
    const store = this.#options.management;
    if (!store) throw new RequestInputError('Browser settings are unavailable in this session.');
    store.save(section, body);
    if (['generation', 'speech'].includes(section)) {
      this.#providerTest?.abort();
      this.#pendingFor = this.session.queue.snapshot().activeId;
      this.session.queue.setPipeline(configuredPipeline(store));
    }
    return this.snapshot();
  }
  characterEditor(id: string) {
    const store = this.#options.management;
    if (!store) throw new RequestInputError('Character editing is unavailable.');
    return store.characterEditor(id);
  }
  saveCharacter(id: string, body: Record<string, unknown>) {
    const store = this.#options.management;
    if (!store) throw new RequestInputError('Character editing is unavailable.');
    store.saveCharacter(id, body);
    this.#providerTest?.abort();
    this.#pendingFor = this.session.queue.snapshot().activeId;
    this.session.queue.setPipeline(configuredPipeline(store));
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
    this.#providerTest?.abort();
    this.session.stop('Restarting app.');
    this.session.setRepliesEnabled(false);
    this.twitch.disconnect();
    setImmediate(() => this.#options.onRestart!());
  }
  checkConnection(section: unknown, signal: AbortSignal = new AbortController().signal) {
    return this.#runProviderTest(signal, (store, combined) =>
      checkConnection(store, section, fetch, combined),
    );
  }
  refreshProfiles() {
    const store = this.#options.management;
    if (!store) throw new RequestInputError('Profile refresh is unavailable.');
    try {
      store.refreshProfiles();
    } catch {
      throw new RequestInputError('Check the character catalog and prompt files before reloading.');
    }
    this.#providerTest?.abort();
    this.#pendingFor = this.session.queue.snapshot().activeId;
    this.session.queue.setPipeline(configuredPipeline(store));
    return this.snapshot();
  }
  async #runProviderTest<T>(
    signal: AbortSignal,
    operation: (store: SettingsStore, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (!this.#options.management)
      throw new RequestInputError('Provider testing is unavailable in this session.');
    if (this.#providerTest)
      throw new RequestInputError(
        'Another provider check or test is already running. Wait or cancel it first.',
      );
    const cancel = new AbortController();
    this.#providerTest = cancel;
    let abort: (() => void) | undefined;
    let combined: AbortSignal | undefined;
    try {
      combined = AbortSignal.any([signal, cancel.signal, AbortSignal.timeout(45_000)]);
      combined.throwIfAborted();
      const result = await Promise.race([
        operation(this.#options.management, combined),
        new Promise<never>((_resolve, reject) => {
          abort = () => reject(new RequestInputError('Provider test cancelled or timed out.'));
          combined!.addEventListener('abort', abort, { once: true });
          if (combined!.aborted) abort();
        }),
      ]);
      combined.throwIfAborted();
      return result;
    } finally {
      if (abort) combined?.removeEventListener('abort', abort);
      this.#providerTest = undefined;
    }
  }
  testResponse(body: Record<string, unknown>, signal: AbortSignal) {
    return this.#runProviderTest(signal, async (store, combined) => ({
      dialogue: await testResponse(store, body, combined),
    }));
  }
  testSpeech(body: Record<string, unknown>, signal: AbortSignal) {
    return this.#runProviderTest(signal, (store, combined) => testSpeech(store, body, combined));
  }
  testObs(body: Record<string, unknown>) {
    const store = this.#options.management;
    if (!store) throw new RequestInputError('OBS output testing is unavailable.');
    if (typeof body.eventId !== 'string' || !/^[a-z0-9_-]{1,128}$/iu.test(body.eventId))
      throw new RequestInputError('Invalid OBS output test identifier.');
    const voiceId = testVoiceId(body.voiceId).toLowerCase();
    this.session.sweep();
    const previous = this.#obsTestEvents.get(body.eventId);
    if (previous) {
      if (previous.voiceId !== voiceId)
        throw new RequestInputError(
          'This test identifier belongs to a different voice. Start a new test.',
        );
      return { ...this.snapshot(), requestId: previous.requestId };
    }
    const queue = this.session.queue.snapshot();
    if (!this.session.state.playerConnected)
      throw new RequestInputError('Connect the OBS Browser audio source before testing output.');
    if (!queue.repliesEnabled)
      throw new RequestInputError('Turn replies on in Activity before testing OBS output.');
    if (queue.activeId || queue.waitingIds.length || this.session.busy)
      throw new RequestInputError('Finish or clear queued work before testing OBS output.');
    const requestId = this.session.queue.submit(
      'OBS output test',
      'OBS output: Test audio routing',
      body.eventId,
      obsTestPipeline(store, voiceId),
    );
    const accepted = this.session.queue.snapshot().requests.find((entry) => entry.id === requestId);
    if (accepted?.characterId !== 'obs-output' || accepted.viewer !== 'OBS output test')
      throw new RequestInputError('This test identifier is already in use. Start a new test.');
    this.#obsTestIds.add(requestId);
    this.#obsTestEvents.set(body.eventId, { requestId, voiceId });
    while (this.#obsTestIds.size > 256)
      this.#obsTestIds.delete(this.#obsTestIds.values().next().value!);
    while (this.#obsTestEvents.size > 256)
      this.#obsTestEvents.delete(this.#obsTestEvents.keys().next().value!);
    return { ...this.snapshot(), requestId };
  }
  cancelObsTest(body: Record<string, unknown>) {
    if (typeof body.requestId !== 'string' || !this.#obsTestIds.has(body.requestId))
      throw new RequestInputError('Unknown OBS output test.');
    // Cancel by identity: an old completion or repeated Stop cannot skip newer viewer work.
    this.session.queue.cancel(body.requestId);
    return this.snapshot();
  }

  configurationProof(nonce: string): string | undefined {
    return this.#options.configurationProof?.(nonce);
  }

  quit(): void {
    this.#providerTest?.abort();
    this.session.stop('App closed.');
    this.session.setRepliesEnabled(false);
    this.twitch.disconnect();
    if (this.#options.onQuit) setImmediate(this.#options.onQuit);
  }

  close(): void {
    this.#providerTest?.abort();
    clearInterval(this.#timer);
    this.twitch.disconnect();
    this.session.setRepliesEnabled(false);
  }
}
