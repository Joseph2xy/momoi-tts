import type { RequestQueue } from '../queue/request-queue.ts';
import { RequestInputError } from '../shared/errors.ts';
import type { TwitchState } from '../shared/protocol.ts';
import type { TwitchConfig } from './config.ts';
import {
  fileRedemptionStore,
  type PendingRedemption,
  type RedemptionStore,
  type RedemptionTarget,
} from './redemption-store.ts';

export interface RedemptionEvent {
  broadcasterId: string;
  broadcasterName: string;
  userName: string;
  id: string;
  rewardId: string;
  input: string;
  status: string;
  redemptionDate: Date;
}
export interface TwitchCallbacks {
  connected(rewardId: string, live: boolean): void;
  streamChanged(live: boolean): void;
  reconnecting(): void;
  failed(): void;
  redemption(event: RedemptionEvent): void;
  updated(event: RedemptionEvent): void;
}
export interface TwitchTransport {
  start(signal: AbortSignal): Promise<void>;
  stop(): void;
  status(rewardId: string, id: string): Promise<string>;
  settle(rewardId: string, id: string, target: RedemptionTarget): Promise<string>;
  outstanding(rewardId: string): Promise<{ id: string; rewardId: string }[]>;
  isLive(): Promise<boolean>;
}
export type TwitchTransportFactory = (
  config: TwitchConfig,
  callbacks: TwitchCallbacks,
) => TwitchTransport;

export class TwitchIntake {
  #config: TwitchConfig | undefined;
  #factory: TwitchTransportFactory;
  #queue: RequestQueue;
  #store: RedemptionStore;
  #state: TwitchState;
  #pending = new Map<string, PendingRedemption>();
  #requests = new Map<string, string>();
  #seen = new Set<string>();
  #resolved = new Set<string>();
  #loaded = false;
  #connection: {
    transport: TwitchTransport;
    controller: AbortController;
    since: number;
    revision: number;
    rewardId?: string;
  } | null = null;
  #work: Promise<void> = Promise.resolve();
  #flushing = false;
  #scheduled = 0;
  #retry?: ReturnType<typeof setInterval>;
  #liveSince = Infinity;
  #onRecord: ((event: RedemptionEvent, reason?: string) => void) | undefined;
  constructor(
    config: TwitchConfig | undefined,
    queue: RequestQueue,
    factory: TwitchTransportFactory,
    store: RedemptionStore = fileRedemptionStore(),
    onRecord?: (event: RedemptionEvent, reason?: string) => void,
  ) {
    this.#config = config;
    this.#queue = queue;
    this.#factory = factory;
    this.#store = store;
    this.#onRecord = onRecord;
    this.#state = {
      status: config ? 'disconnected' : 'disabled',
      channel: config?.channel ?? null,
      rewardTitle: config?.rewardTitle ?? 'Ask a character',
      message: config ? 'Ready to connect.' : 'Twitch setup is pending.',
      accepted: 0,
      lastRejection: null,
      pendingUpdates: 0,
      settlementMessage: null,
      live: null,
    };
    queue.onFinished((entry) => {
      const id = [...this.#requests].find(([, requestId]) => requestId === entry.id)?.[0];
      if (!id) return;
      this.#requests.delete(id);
      const pending = this.#pending.get(id);
      if (!pending) return;
      pending.target = entry.status === 'completed' ? 'FULFILLED' : 'CANCELED';
      this.#schedule(async () => {
        await this.#persist();
        await this.#flush();
      });
    });
  }
  #owner(): string {
    return this.#config!.clientId + ':' + this.#config!.channel;
  }
  snapshot(): TwitchState {
    return {
      ...this.#state,
      pendingUpdates: [...this.#pending.keys()].filter((id) => !this.#requests.has(id)).length,
    };
  }
  #schedule(operation: () => Promise<void>, controller?: AbortController, revision?: number): void {
    if (this.#scheduled >= 256) {
      this.disconnect();
      this.#state.status = 'error';
      this.#state.message = 'Too many Twitch events. Reconnect to reconcile rewards.';
      return;
    }
    this.#scheduled++;
    this.#work = this.#work
      .then(operation)
      .catch(() => {
        if (controller && this.#connection?.controller !== controller) return;
        if (revision !== undefined && this.#connection?.revision !== revision) return;
        this.#state.settlementMessage =
          'Reward synchronization failed. Check Twitch access and private storage; points may need review in Twitch.';
        this.disconnect();
        this.#state.status = 'error';
      })
      .finally(() => {
        this.#scheduled--;
      });
  }
  async #persist(): Promise<void> {
    await this.#store.save(
      this.#owner(),
      [...this.#pending.values()].map((entry) => ({ ...entry })),
    );
  }
  connect(): void {
    if (!this.#config || this.#connection) return;
    const controller = new AbortController();
    const current = () => this.#connection?.controller === controller && !controller.signal.aborted;
    const fail = () => {
      if (!current()) return;
      this.disconnect();
      this.#state.status = 'error';
      this.#state.message = 'Twitch connection failed. Check broadcaster sign-in and reward setup.';
    };
    const transport = this.#factory(this.#config, {
      connected: (rewardId, live) => {
        if (!current()) return;
        const connection = this.#connection!;
        const revision = connection.revision;
        const ready = () => current() && connection.revision === revision;
        connection.rewardId = rewardId;
        this.#setLive(live);
        this.#schedule(
          async () => {
            if (!ready()) return;
            await this.#flush();
            if (!ready()) return;
            // Recover old/unseen redemptions on startup and socket reconnect, never replay them.
            const outstanding = await transport.outstanding(rewardId);
            if (!ready()) return;
            for (const entry of outstanding) {
              if (!this.#pending.has(entry.id)) {
                if (this.#pending.size >= 256) throw new Error('Too many outstanding rewards.');
                this.#pending.set(entry.id, { ...entry, target: 'CANCELED' });
              }
            }
            await this.#persist();
            await this.#flush();
            if (ready()) {
              this.#state.status = 'connected';
              this.#state.message = 'Listening for channel-point messages.';
            }
          },
          controller,
          revision,
        );
      },
      streamChanged: (live) => {
        if (current()) this.#setLive(live);
      },
      reconnecting: () => {
        if (current()) {
          this.#connection!.revision++;
          // Cancel work during a gap: a missed moderator rejection must never play later.
          this.#state.status = 'reconnecting';
          this.#state.live = null;
          this.#liveSince = Infinity;
          this.#state.message = 'Twitch disconnected; reconnecting…';
          for (const requestId of [...this.#requests.values()]) this.#queue.cancel(requestId);
        }
      },
      failed: fail,
      redemption: (event) => {
        if (current())
          this.#schedule(async () => {
            if (current()) await this.#receive(event);
          }, controller);
      },
      updated: (event) => {
        if (
          !current() ||
          event.broadcasterName.toLowerCase() !== this.#config!.channel ||
          event.rewardId !== this.#connection?.rewardId
        )
          return;
        const requestId = this.#requests.get(event.id);
        if (event.status !== 'UNFULFILLED') {
          this.#resolved.add(event.id);
          while (this.#resolved.size > 256)
            this.#resolved.delete(this.#resolved.values().next().value!);
        }
        if (requestId && event.status !== 'UNFULFILLED') this.#queue.cancel(requestId);
        if (event.status !== 'UNFULFILLED')
          this.#schedule(async () => {
            await this.#flush();
          });
      },
    });
    this.#connection = { transport, controller, since: Date.now(), revision: 0 };
    this.#state.status = 'connecting';
    this.#state.message = 'Connecting and reconciling rewards…';
    this.#schedule(async () => {
      if (!this.#loaded) {
        for (const entry of await this.#store.load(this.#owner()))
          this.#pending.set(entry.id, entry);
        this.#loaded = true;
      }
      if (!current()) return;
      try {
        await transport.start(controller.signal);
      } catch {
        fail();
      }
    }, controller);
    this.#retry = setInterval(() => {
      if (current() && !this.#flushing && !this.#scheduled)
        this.#schedule(async () => {
          await this.#flush();
        }, controller);
    }, 5000);
    this.#retry.unref();
  }
  disconnect(): void {
    const previous = this.#connection;
    this.#connection = null;
    if (this.#retry) clearInterval(this.#retry);
    this.#retry = undefined;
    previous?.controller.abort();
    previous?.transport.stop();
    this.#state.live = null;
    this.#liveSince = Infinity;
    for (const requestId of [...this.#requests.values()]) this.#queue.cancel(requestId);
    this.#state.status = this.#config ? 'disconnected' : 'disabled';
    this.#state.message = this.#config
      ? 'Disconnected. Unfinished rewards will be refunded on reconnect.'
      : 'Twitch setup is pending.';
  }
  #setLive(live: boolean): void {
    if (live && this.#state.live !== true) this.#liveSince = Date.now();
    if (!live) {
      this.#liveSince = Infinity;
      for (const requestId of [...this.#requests.values()]) this.#queue.cancel(requestId);
    }
    this.#state.live = live;
  }
  async #receive(event: RedemptionEvent): Promise<void> {
    const connection = this.#connection;
    const revision = connection?.revision;
    if (
      !connection?.rewardId ||
      event.broadcasterName.toLowerCase() !== this.#config!.channel ||
      event.rewardId !== connection.rewardId ||
      event.status !== 'UNFULFILLED' ||
      !/^[a-z0-9_-]{1,128}$/iu.test(event.id) ||
      this.#seen.has(event.id) ||
      this.#pending.has(event.id)
    )
      return;
    if (this.#pending.size >= 256) throw new Error('Reward bookkeeping full.');
    const remoteStatus = await connection.transport.status(event.rewardId, event.id);
    if (
      connection !== this.#connection ||
      connection.revision !== revision ||
      remoteStatus !== 'UNFULFILLED'
    )
      return;
    this.#pending.set(event.id, { id: event.id, rewardId: event.rewardId, target: 'CANCELED' });
    await this.#persist(); // A crash from here refunds the unfinished request on restart.
    this.#seen.add(event.id);
    this.#onRecord?.(event);
    while (this.#seen.size > 256) this.#seen.delete(this.#seen.values().next().value!);
    const live = await connection.transport.isLive();
    const current = connection === this.#connection && connection.revision === revision;
    if (current) this.#setLive(live);
    if (
      current &&
      !this.#resolved.has(event.id) &&
      this.#state.status === 'connected' &&
      event.redemptionDate.getTime() >= Math.max(connection.since, this.#liveSince) &&
      live &&
      this.#state.live === true
    ) {
      try {
        const requestId = this.#queue.submit(event.userName, event.input, 'reward_' + event.id);
        this.#requests.set(event.id, requestId);
        this.#state.accepted++;
        this.#state.lastRejection = null;
      } catch (error) {
        this.#state.lastRejection =
          error instanceof RequestInputError ? error.message : 'Reward could not be accepted.';
      }
    } else if (connection === this.#connection) {
      this.#state.lastRejection = live
        ? 'Request arrived outside the current live session.'
        : 'Channel is offline. This request will be refunded.';
    }
    if (
      connection === this.#connection &&
      !this.#requests.has(event.id) &&
      this.#state.lastRejection
    )
      this.#onRecord?.(event, this.#state.lastRejection);
    await this.#flush();
  }
  async #flush(): Promise<void> {
    const connection = this.#connection;
    if (!connection?.rewardId || this.#flushing) return;
    this.#flushing = true;
    try {
      for (const [id, entry] of [...this.#pending]) {
        if (connection !== this.#connection) return;
        if (this.#requests.has(id)) continue;
        try {
          const result = await connection.transport.settle(entry.rewardId, id, entry.target);
          if (!['FULFILLED', 'CANCELED'].includes(result)) throw new Error('Unconfirmed status.');
          this.#pending.delete(id);
          try {
            await this.#persist();
          } catch {
            this.#pending.set(id, entry);
            throw new Error('Persistence failed.');
          }
          if (result !== entry.target)
            this.#state.settlementMessage =
              'A reward was already resolved differently in Twitch. Its existing outcome was preserved.';
        } catch {
          this.#state.settlementMessage =
            'Twitch reward updates are pending. The app will retry; points are not yet confirmed.';
          break;
        }
      }
      if (
        ![...this.#pending.keys()].some((id) => !this.#requests.has(id)) &&
        this.#state.settlementMessage?.startsWith('Twitch reward updates')
      )
        this.#state.settlementMessage = null;
    } finally {
      this.#flushing = false;
    }
  }
}
