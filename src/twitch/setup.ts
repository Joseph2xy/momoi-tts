import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import type { SettingsStore } from '../app/settings.ts';
import type { TwitchSetupState } from '../shared/protocol.ts';
import { RequestInputError } from '../shared/errors.ts';
import { redemptionScope, validRewardSettings, type TwitchConfig } from './config.ts';
import { loadToken, saveToken, parseSavedToken, type SavedToken } from './token-store.ts';
import { characterRewardPrompt } from './reward.ts';

// Only fixed Twitch endpoints are used. Device/access/refresh tokens never enter public state.
export class TwitchSetup {
  #store: SettingsStore;
  #fetch: typeof fetch;
  #controller?: AbortController;
  #message = '';
  #activation?: { url: string; code: string };
  #changed: () => void;
  #pollMs?: number;
  #tokenFile: URL;
  constructor(
    store: SettingsStore,
    changed: () => void,
    options: { fetch?: typeof fetch; pollMs?: number } = {},
  ) {
    this.#store = store;
    this.#changed = changed;
    this.#fetch = options.fetch ?? fetch;
    this.#pollMs = options.pollMs;
    this.#tokenFile = pathToFileURL(resolve(store.privateRoot, 'twitch-token.json'));
  }
  #config(): TwitchConfig | undefined {
    try {
      return this.#store.twitchConfig();
    } catch {
      return undefined;
    }
  }
  snapshot(): TwitchSetupState {
    const config = this.#config();
    const registrationReady = !!this.#store.twitchClientId();
    const authorized = !!config && existsSync(this.#tokenFile);
    return {
      registrationReady,
      authorized,
      channel: config?.channel ?? null,
      rewardId: config?.rewardId ?? null,
      rewardTitle: config?.rewardTitle ?? 'Ask a character',
      rewardCost: config?.rewardCost ?? 1000,
      rewardCooldown: config?.rewardCooldown ?? 60,
      busy: !!this.#controller,
      ...(this.#activation
        ? { activationUrl: this.#activation.url, userCode: this.#activation.code }
        : {}),
      message: registrationReady
        ? this.#message ||
          (authorized
            ? config.rewardId
              ? 'Broadcaster authorization and reward are saved. Check the Twitch connection status below.'
              : 'Broadcaster authorization saved. Prepare generation, speech, a character and OBS, then create your reward here.'
            : '')
        : 'This build is awaiting the MomoiTTS Twitch app registration. Ask the maintainer for a configured release.',
    };
  }
  cancel(): void {
    if (this.#controller) this.#message = 'Twitch setup canceled. Saved settings were kept.';
    this.#controller?.abort();
    this.#controller = undefined;
    this.#activation = undefined;
  }
  async #json(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<{ response: Response; data: Record<string, any> }> {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(15000)]);
    combined.throwIfAborted();
    let cancelFetch: (() => void) | undefined;
    let response: Response;
    try {
      response = await Promise.race([
        this.#fetch(url, {
          ...init,
          redirect: 'error',
          signal: combined,
        }).then((result) => {
          if (combined.aborted) void result.body?.cancel().catch(() => {});
          combined.throwIfAborted();
          return result;
        }),
        new Promise<never>((_resolve, reject) => {
          cancelFetch = () => reject(combined.reason);
          combined.addEventListener('abort', cancelFetch, { once: true });
          if (combined.aborted) cancelFetch();
        }),
      ]);
    } finally {
      if (cancelFetch) combined.removeEventListener('abort', cancelFetch);
    }
    combined.throwIfAborted();
    if (!response.body) throw new Error('Empty Twitch response.');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const abort = () => {
      void reader.cancel().catch(() => {});
    };
    combined.addEventListener('abort', abort, { once: true });
    if (combined.aborted) abort();
    try {
      while (true) {
        const { value, done } = await reader.read();
        combined.throwIfAborted();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 65536) throw new Error('Twitch response too large.');
        chunks.push(value);
      }
    } catch (error) {
      abort();
      throw error;
    } finally {
      combined.removeEventListener('abort', abort);
      reader.releaseLock();
    }
    const data: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid Twitch response.');
    return { response, data: data as Record<string, any> };
  }
  async start(): Promise<void> {
    if (this.#controller)
      throw new RequestInputError('Finish or cancel the current Twitch setup action first.');
    const clientId = this.#store.twitchClientId();
    if (!clientId) throw new RequestInputError(this.snapshot().message);
    const controller = new AbortController();
    this.#controller = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(1800000)]);
    try {
      const { response, data } = await this.#json(
        'https://id.twitch.tv/oauth2/device',
        {
          method: 'POST',
          body: new URLSearchParams({ client_id: clientId, scopes: redemptionScope }),
        },
        signal,
      );
      if (
        !response.ok ||
        typeof data.device_code !== 'string' ||
        !data.device_code ||
        typeof data.user_code !== 'string' ||
        !/^[a-z0-9-]{1,32}$/iu.test(data.user_code) ||
        typeof data.expires_in !== 'number' ||
        data.expires_in <= 0 ||
        typeof data.interval !== 'number' ||
        data.interval < 0
      )
        throw new Error();
      const url = new URL(data.verification_uri);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'www.twitch.tv' ||
        url.pathname !== '/activate' ||
        url.username ||
        url.password
      )
        throw new Error();
      signal.throwIfAborted();
      url.searchParams.set('device-code', data.user_code);
      url.searchParams.set('public', 'true');
      this.#activation = { url: url.href, code: data.user_code };
      this.#message =
        'Waiting for approval on Twitch. Click Activate, approve MomoiTTS, then return here.';
      void this.#poll(
        clientId,
        data.device_code,
        Math.min(data.expires_in, 1800),
        Math.max(5, data.interval),
        controller,
        signal,
      );
    } catch {
      if (this.#controller === controller) {
        this.cancel();
        this.#message = 'Twitch sign-in could not start. Retry or check the app registration.';
      }
      throw new RequestInputError(
        'Twitch sign-in could not start. Retry or check the app registration.',
      );
    }
  }
  async #poll(
    clientId: string,
    deviceCode: string,
    expires: number,
    interval: number,
    controller: AbortController,
    signal: AbortSignal,
  ): Promise<void> {
    const deadline = Date.now() + expires * 1000;
    try {
      while (Date.now() < deadline) {
        await delay(this.#pollMs ?? interval * 1000, undefined, { signal });
        const { response, data } = await this.#json(
          'https://id.twitch.tv/oauth2/token',
          {
            method: 'POST',
            body: new URLSearchParams({
              client_id: clientId,
              scopes: redemptionScope,
              device_code: deviceCode,
              grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            }),
          },
          signal,
        );
        if (!response.ok && data.message === 'authorization_pending') continue;
        if (!response.ok && data.message === 'slow_down') {
          interval += 5;
          continue;
        }
        if (!response.ok)
          throw new RequestInputError(
            data.message === 'access_denied'
              ? 'Twitch authorization was declined. Connect again when you are ready.'
              : data.message === 'expired_token' || data.message === 'invalid device code'
                ? 'Twitch authorization expired. Connect again to get a new code.'
                : 'Twitch authorization failed. Check your connection and try again.',
          );
        const { response: validation, data: info } = await this.#json(
          'https://id.twitch.tv/oauth2/validate',
          { headers: { Authorization: `OAuth ${data.access_token}` } },
          signal,
        );
        if (
          !validation.ok ||
          info.client_id !== clientId ||
          !/^\d+$/u.test(info.user_id) ||
          !/^[a-z0-9_]{1,25}$/u.test(info.login) ||
          !Array.isArray(info.scopes) ||
          !info.scopes.includes(redemptionScope)
        )
          throw new Error();
        const token = parseSavedToken({
          clientId,
          userId: info.user_id,
          token: {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            scope: data.scope,
            expiresIn: data.expires_in,
            obtainmentTimestamp: Date.now(),
          },
        });
        // Eligibility is checked without creating a reward or consuming inference.
        await this.#helix(
          token,
          'channel_points/custom_rewards?broadcaster_id=' +
            info.user_id +
            '&only_manageable_rewards=true',
          {},
          signal,
        );
        signal.throwIfAborted();
        if (this.#controller !== controller) return;
        const prior = this.#config();
        if (prior && (prior.clientId !== clientId || prior.channel !== info.login))
          throw new Error('Account change requires separate setup.');
        const configured = {
          clientId,
          channel: info.login,
          rewardTitle: prior?.rewardTitle ?? 'Ask a character',
          rewardCost: prior?.rewardCost ?? 1000,
          rewardCooldown: prior?.rewardCooldown ?? 60,
          rewardId: prior?.rewardId,
        };
        this.#store.validateTwitchSave(configured);
        await saveToken(token, this.#tokenFile, signal);
        signal.throwIfAborted();
        this.#store.saveTwitch(configured);
        this.#message =
          'Broadcaster connected. Review the reward settings and create it when OBS is ready.';
        this.#changed();
        return;
      }
      throw new RequestInputError('Twitch authorization expired. Connect again to get a new code.');
    } catch (error) {
      if (this.#controller === controller)
        this.#message =
          error instanceof RequestInputError
            ? error.message
            : 'Twitch authorization failed or timed out. Check your connection and try again.';
    } finally {
      if (this.#controller === controller) {
        this.#controller = undefined;
        this.#activation = undefined;
      }
    }
  }
  async #helix(token: SavedToken, path: string, init: RequestInit, signal: AbortSignal) {
    const { response, data } = await this.#json(
      'https://api.twitch.tv/helix/' + path,
      {
        ...init,
        headers: {
          'Client-Id': token.clientId,
          Authorization: `Bearer ${token.token.accessToken}`,
          'Content-Type': 'application/json',
        },
      },
      signal,
    );
    if (!response.ok)
      throw new RequestInputError(
        response.status === 403
          ? 'Twitch denied Channel Points access. Check that Channel Points are enabled for this broadcaster and that MomoiTTS owns the reward.'
          : response.status === 401
            ? 'Twitch authorization is no longer valid. Authorize your broadcaster account again.'
            : response.status === 429
              ? 'Twitch is limiting requests. Wait a moment before trying again.'
              : 'Twitch reward request failed. Check your connection and try again.',
      );
    if (!Array.isArray(data.data)) throw new Error();
    return data.data as Record<string, any>[];
  }
  async #freshToken(config: TwitchConfig, signal: AbortSignal): Promise<SavedToken> {
    let token = await loadToken(this.#tokenFile);
    if (token.clientId !== config.clientId) throw new Error();
    const { response, data: info } = await this.#json(
      'https://id.twitch.tv/oauth2/validate',
      { headers: { Authorization: `OAuth ${token.token.accessToken}` } },
      signal,
    );
    if (!response.ok) {
      if (response.status !== 401) throw new Error();
      const result = await this.#json(
        'https://id.twitch.tv/oauth2/token',
        {
          method: 'POST',
          body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: token.token.refreshToken!,
            client_id: config.clientId,
          }),
        },
        signal,
      );
      if (!result.response.ok) throw new Error();
      const data = result.data;
      token = parseSavedToken({
        ...token,
        token: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresIn: data.expires_in,
          scope: data.scope,
          obtainmentTimestamp: Date.now(),
        },
      });
      signal.throwIfAborted();
      await saveToken(token, this.#tokenFile, signal);
      const validated = await this.#json(
        'https://id.twitch.tv/oauth2/validate',
        { headers: { Authorization: `OAuth ${token.token.accessToken}` } },
        signal,
      );
      if (!validated.response.ok) throw new Error();
      Object.assign(info, validated.data);
    }
    if (
      info.client_id !== config.clientId ||
      info.user_id !== token.userId ||
      info.login !== config.channel ||
      !info.scopes?.includes(redemptionScope)
    )
      throw new Error();
    return token;
  }
  async reward(body: Record<string, unknown>, signal: AbortSignal): Promise<void> {
    if (this.#controller)
      throw new RequestInputError('Finish or cancel Twitch authorization first.');
    const config = this.#config();
    const desired = {
      ...config!,
      rewardTitle: body.title,
      rewardCost: body.cost,
      rewardCooldown: body.cooldown,
    };
    if (
      !config ||
      typeof desired.rewardTitle !== 'string' ||
      typeof desired.rewardCost !== 'number' ||
      typeof desired.rewardCooldown !== 'number' ||
      !validRewardSettings({
        rewardTitle: desired.rewardTitle,
        rewardCost: desired.rewardCost,
        rewardCooldown: desired.rewardCooldown,
      })
    )
      throw new RequestInputError(
        'Enter a reward name, price and cooldown (0 or 60–604800 seconds).',
      );
    this.#store.validateTwitchSave({
      ...config,
      rewardTitle: desired.rewardTitle,
      rewardCost: desired.rewardCost,
      rewardCooldown: desired.rewardCooldown,
    });
    const controller = new AbortController();
    this.#controller = controller;
    const combined = AbortSignal.any([signal, controller.signal, AbortSignal.timeout(45000)]);
    try {
      const token = await this.#freshToken(config, combined);
      const rewards = await this.#helix(
        token,
        'channel_points/custom_rewards?broadcaster_id=' +
          token.userId +
          '&only_manageable_rewards=true',
        {},
        combined,
      );
      const existing = rewards.find((reward) =>
        config.rewardId
          ? reward.id === config.rewardId
          : reward.title === config.rewardTitle || reward.title === desired.rewardTitle,
      );
      if (config.rewardId && !existing) throw new Error('Owned reward missing.');
      const names = this.#store
        .snapshot()
        .characters.filter((character) => character.available)
        .map((character) => character.name)
        .join(', ');
      if (!names || !this.#store.snapshot().localReady)
        throw new RequestInputError(
          'Configure at least one available character and both providers before creating the reward.',
        );
      const prompt = characterRewardPrompt(
        this.#store
          .snapshot()
          .characters.filter((character) => character.available)
          .map((character) => character.name),
      );
      const updated = await this.#helix(
        token,
        'channel_points/custom_rewards?broadcaster_id=' +
          token.userId +
          (existing ? '&id=' + encodeURIComponent(existing.id) : ''),
        {
          method: existing ? 'PATCH' : 'POST',
          body: JSON.stringify({
            title: desired.rewardTitle,
            cost: desired.rewardCost,
            prompt,
            is_user_input_required: true,
            should_redemptions_skip_request_queue: false,
            is_enabled: existing ? true : false,
            ...(existing ? { is_paused: true } : {}),
            is_global_cooldown_enabled: desired.rewardCooldown > 0,
            global_cooldown_seconds: desired.rewardCooldown || 60,
          }),
        },
        combined,
      );
      combined.throwIfAborted();
      const reward = updated[0];
      if (!reward || typeof reward.id !== 'string') throw new Error();
      this.#store.saveTwitch({
        ...config,
        rewardTitle: desired.rewardTitle,
        rewardCost: desired.rewardCost,
        rewardCooldown: desired.rewardCooldown,
        rewardId: reward.id,
      });
      // Creation is disabled until this explicit pause/enable transition completes.
      if (!existing)
        await this.#helix(
          token,
          'channel_points/custom_rewards?broadcaster_id=' +
            token.userId +
            '&id=' +
            encodeURIComponent(reward.id),
          { method: 'PATCH', body: JSON.stringify({ is_enabled: true, is_paused: true }) },
          combined,
        );
      combined.throwIfAborted();
      this.#store.rememberTwitch(true);
      this.#message =
        'Reward saved. It stays paused until the channel is live and replies are ready.';
      this.#changed();
    } catch (error) {
      throw error instanceof RequestInputError
        ? error
        : new RequestInputError(
            'Reward setup failed. Check broadcaster authorization, eligibility and reward ownership, then retry.',
          );
    } finally {
      if (this.#controller === controller) this.#controller = undefined;
    }
  }
}
