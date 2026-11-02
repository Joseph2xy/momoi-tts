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
import { createTwurpleTransport, twurpleTransport } from '../twitch/transport.ts';
import { TwitchSetup } from '../twitch/setup.ts';
import { characterRewardPrompt } from '../twitch/reward.ts';
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
  twitchSetupFetch?: typeof fetch;
  twitchSetupPollMs?: number;
}

// Application lifetime and composition belong here, independently of HTTP serving.
export class AppRuntime {
  readonly session: PlaybackSession;
  readonly twitch: TwitchIntake;
  readonly canQuit: boolean;
  readonly twitchSetup?: TwitchSetup;
  #options: RuntimeOptions;
  #timer: ReturnType<typeof setInterval>;
  #pendingFor: string | null = null;
  #providerTest: AbortController | undefined;
  #obsTestIds = new Set<string>();
  #obsTestEvents = new Map<string, { requestId: string; voiceId: string; revision: string }>();
  #cancelledObsEvents = new Set<string>();
  #logFailed = false;
  #twitchConfigurationError: string | undefined;
  #exiting = false;
  #setupBusy = false;
  #setupEpoch = 0;
  #nextReconnect = 0;
  get exiting() {
    return this.#exiting;
  }

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
      options.twitchTransport ??
        (options.management
          ? twurpleTransport(
              pathToFileURL(resolve(options.management.privateRoot, 'twitch-token.json')),
            )
          : createTwurpleTransport),
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
      () => this.session.setRepliesEnabled(false),
    );
    if (options.management)
      this.twitchSetup = new TwitchSetup(
        options.management,
        () => {
          this.#twitchConfigurationError = undefined;
          this.twitch.reconfigure(options.management!.twitchConfig());
          if (options.management!.twitchConnected && options.management!.twitchConfig()?.rewardId)
            this.twitch.connect();
        },
        { fetch: options.twitchSetupFetch, pollMs: options.twitchSetupPollMs },
      );
    if (options.management?.twitchConnected) this.twitch.connect();
    this.#timer = setInterval(() => this.#sync(), 500);
    this.#timer.unref();
  }

  snapshot() {
    const state = this.session.snapshot();
    if (this.#pendingFor !== state.queue?.activeId) this.#pendingFor = null;
    return {
      ...state,
      repliesRequested: this.session.repliesRequested,
      twitchSetup: this.twitchSetup?.snapshot(),
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
  #sync(): void {
    if (this.#exiting) {
      this.twitch.setAvailable(false);
      return;
    }
    this.session.sweep();
    const twitch = this.twitch.snapshot();
    if (
      !this.#setupBusy &&
      !this.twitchSetup?.snapshot().busy &&
      this.#options.management?.twitchConnected &&
      ['disconnected', 'error'].includes(twitch.status) &&
      Date.now() >= this.#nextReconnect
    ) {
      this.#nextReconnect = Date.now() + 30000;
      this.twitch.connect();
    }
    const state = this.session.snapshot();
    if (this.#options.management) {
      try {
        this.twitch.setPrompt(
          characterRewardPrompt(
            this.#options.management
              .snapshot()
              .characters.filter((character) => character.available)
              .map((character) => character.name),
          ),
        );
      } catch {
        this.twitch.setAvailable(false);
        return;
      }
    }
    this.twitch.setAvailable(
      !!state.queue?.repliesEnabled &&
        state.playerConnected &&
        state.queue.mode !== 'disabled' &&
        state.queue.waitingIds.length < 2,
    );
  }
  async twitchAction(
    action: string,
    body: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<unknown> {
    if (!this.twitchSetup) throw new RequestInputError('Twitch setup is unavailable.');
    if (action === 'cancel') {
      this.#setupEpoch++;
      this.twitchSetup.cancel();
      return this.snapshot();
    }
    if (this.#setupBusy) throw new RequestInputError('Another Twitch setup action is running.');
    const queue = this.session.queue.snapshot();
    if (
      this.session.repliesRequested ||
      queue.activeId ||
      queue.waitingIds.length ||
      this.twitch.snapshot().pendingUpdates
    )
      throw new RequestInputError(
        'Turn replies off and settle pending refunds before changing Twitch setup.',
      );
    this.#setupBusy = true;
    const epoch = this.#setupEpoch;
    try {
      await this.twitch.shutdown();
      if (this.#exiting || epoch !== this.#setupEpoch || signal.aborted)
        throw new RequestInputError('Twitch setup canceled.');
      if (action === 'authorize') await this.twitchSetup.start();
      else if (action === 'reward') {
        if (!this.session.state.playerConnected)
          throw new RequestInputError('Connect the OBS audio source before creating the reward.');
        await this.twitchSetup.reward(body, signal);
      } else throw new RequestInputError('Unknown Twitch setup action.');
      return this.snapshot();
    } finally {
      this.#setupBusy = false;
    }
  }
  connectTwitch() {
    if (this.#exiting) throw new RequestInputError('MomoiTTS is exiting.');
    if (this.#setupBusy || this.twitchSetup?.snapshot().busy)
      throw new RequestInputError('Finish or cancel Twitch setup before connecting.');
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
      this.#cancelSetupOutput();
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
    this.#cancelSetupOutput();
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
    this.#cancelSetupOutput();
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
  #cancelSetupOutput(): void {
    const activeId = this.session.queue.snapshot().activeId;
    if (activeId && this.#obsTestIds.has(activeId)) this.session.queue.cancel(activeId);
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
    if (this.#cancelledObsEvents.has(body.eventId))
      throw new RequestInputError('OBS output test cancelled. Start a new test.');
    const voiceId = testVoiceId(body.voiceId).toLowerCase();
    this.session.sweep();
    const previous = this.#obsTestEvents.get(body.eventId);
    if (previous) {
      if (previous.revision !== store.snapshot().testRevision)
        throw new RequestInputError(
          'Settings changed since this OBS output test. Start a new test.',
        );
      if (previous.voiceId !== voiceId)
        throw new RequestInputError(
          'This test identifier belongs to a different voice. Start a new test.',
        );
      return { ...this.snapshot(), requestId: previous.requestId };
    }
    const queue = this.session.queue.snapshot();
    if (!this.session.state.playerConnected)
      throw new RequestInputError('Connect the OBS Browser audio source before testing output.');
    if (this.session.repliesRequested || queue.repliesEnabled)
      throw new RequestInputError('Turn replies off before testing OBS output.');
    if (queue.activeId || queue.waitingIds.length || this.session.busy)
      throw new RequestInputError('Finish or clear queued work before testing OBS output.');
    const requestId = this.session.queue.submitSetupTest(
      'OBS output test',
      'OBS output: Test audio routing',
      body.eventId,
      obsTestPipeline(store, voiceId),
    );
    const accepted = this.session.queue.snapshot().requests.find((entry) => entry.id === requestId);
    if (accepted?.characterId !== 'obs-output' || accepted.viewer !== 'OBS output test')
      throw new RequestInputError('This test identifier is already in use. Start a new test.');
    this.#obsTestIds.add(requestId);
    this.#obsTestEvents.set(body.eventId, {
      requestId,
      voiceId,
      revision: store.snapshot().testRevision,
    });
    while (this.#obsTestIds.size > 256)
      this.#obsTestIds.delete(this.#obsTestIds.values().next().value!);
    while (this.#obsTestEvents.size > 256)
      this.#obsTestEvents.delete(this.#obsTestEvents.keys().next().value!);
    return { ...this.snapshot(), requestId };
  }
  cancelObsTest(body: Record<string, unknown>) {
    if (body.eventId !== undefined) {
      if (
        typeof body.eventId !== 'string' ||
        !/^[a-z0-9_-]{1,128}$/iu.test(body.eventId) ||
        body.requestId !== undefined
      )
        throw new RequestInputError('Invalid OBS output test identifier.');
      // Departure may arrive before submit or before its response reveals the request ID.
      this.#cancelledObsEvents.add(body.eventId);
      while (this.#cancelledObsEvents.size > 256)
        this.#cancelledObsEvents.delete(this.#cancelledObsEvents.values().next().value!);
      const accepted = this.#obsTestEvents.get(body.eventId);
      if (accepted) this.session.queue.cancel(accepted.requestId);
      return this.snapshot();
    }
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
    if (this.#exiting) return;
    this.#exiting = true;
    this.#setupEpoch++;
    this.#providerTest?.abort();
    this.session.stop('App closed.');
    this.session.setRepliesEnabled(false);
    this.twitchSetup?.cancel();
    void this.twitch.shutdown().finally(() => {
      if (this.#options.onQuit) setImmediate(this.#options.onQuit);
    });
  }

  close(): void {
    this.#setupEpoch++;
    this.twitchSetup?.cancel();
    this.#providerTest?.abort();
    clearInterval(this.#timer);
    this.twitch.disconnect();
    this.session.setRepliesEnabled(false);
  }
}
