import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { randomUUID } from 'node:crypto';
import { readConfig, configurationProof } from './config.ts';
import { readGenerationConfig } from './generation.ts';
import { generateConfiguredDialogue } from './generation.ts';
import { synthesizeSpeech } from '../providers/fish/synthesize-speech.ts';
import { selectCharacter } from '../characters/input.ts';
import { readCharacters } from '../characters/catalog.ts';
import { demoPipeline, livePipeline } from './pipeline.ts';
import { RequestInputError } from '../shared/errors.ts';
import type { ManagementState, SettingsSection } from '../shared/protocol.ts';
import type { QueuePipeline } from '../queue/contracts.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = ['generation.env', 'fish.env'] as const;
const generationNames = [
  'TYRONE_TEXT_PROVIDER',
  'OPENROUTER_MODEL',
  'OPENROUTER_MAX_TOKENS',
  'OPENROUTER_API_KEY',
];
interface AppSettings {
  volume: number;
  setupSeen: boolean;
}

// Only fixed local paths are accepted. Secrets never enter the public settings contract.
export class SettingsStore {
  readonly privateRoot: string;
  readonly overrides: NodeJS.ProcessEnv;
  readonly demo: boolean;
  #values: Record<string, string> = {};
  #app: AppSettings = { volume: 100, setupSeen: false };
  #readError = false;
  #revision = 0;
  #catalog: URL;
  constructor(
    options: { privateRoot?: string; env?: NodeJS.ProcessEnv; demo?: boolean; catalog?: URL } = {},
  ) {
    this.privateRoot = options.privateRoot ?? resolve(root, '.local');
    this.overrides = { ...(options.env ?? process.env) };
    this.demo = !!options.demo;
    this.#catalog = options.catalog ?? new URL('../../characters/catalog.json', import.meta.url);
    try {
      for (const file of files) {
        const path = resolve(this.privateRoot, file);
        if (existsSync(path)) Object.assign(this.#values, parseEnv(readFileSync(path, 'utf8')));
      }
      const path = resolve(this.privateRoot, 'app.json');
      if (existsSync(path)) {
        const app = JSON.parse(readFileSync(path, 'utf8')) as AppSettings;
        if (
          !Number.isInteger(app.volume) ||
          app.volume < 0 ||
          app.volume > 100 ||
          typeof app.setupSeen !== 'boolean'
        )
          throw new Error();
        this.#app = { volume: app.volume, setupSeen: app.setupSeen };
      }
    } catch {
      this.#readError = true;
    }
  }
  env(values = this.#values): NodeJS.ProcessEnv {
    return {
      ...values,
      ...this.overrides,
    };
  }
  get port() {
    const value = Number(this.env().TYRONE_PLAYBACK_PORT ?? 3210);
    if (!Number.isInteger(value) || value < 1024 || value > 65535)
      throw new Error('App port must be 1024–65535.');
    return value;
  }
  get volume() {
    return this.#app.volume / 100;
  }
  get revision() {
    return this.#revision;
  }
  queueSettings() {
    const env = this.env();
    const duration = (key: string, fallback: number) => {
      const value = Number(env[key] ?? fallback);
      return Number.isInteger(value) &&
        value >= (key === 'TYRONE_WAITING_EXPIRY_MS' ? 100 : 0) &&
        value <= 3_600_000
        ? value
        : fallback;
    };
    return {
      viewerCooldownMs: duration('TYRONE_VIEWER_COOLDOWN_MS', 10000),
      globalCooldownMs: duration('TYRONE_GLOBAL_COOLDOWN_MS', 1000),
      waitingExpiryMs: duration('TYRONE_WAITING_EXPIRY_MS', 180000),
    };
  }
  profiles() {
    return readCharacters({}, true, this.#catalog);
  }
  refreshProfiles() {
    this.profiles();
    this.#revision++;
  }
  #catalogEntries(): { id: string; voiceIdEnv: string }[] {
    this.profiles();
    return JSON.parse(readFileSync(this.#catalog, 'utf8'));
  }
  snapshot(): ManagementState {
    const env = this.env();
    const errors: Partial<Record<SettingsSection, string>> = {};
    let generationReady = false,
      speechReady = false,
      charactersReady = false;
    try {
      if (!env.TYRONE_TEXT_PROVIDER) throw new Error('Choose a generation provider.');
      readGenerationConfig(env);
      generationReady = true;
    } catch {
      errors.generation =
        'Choose a provider and supply its required settings. No connection has been checked.';
    }
    speechReady = !!env.FISH_API_KEY && !/\s/u.test(env.FISH_API_KEY);
    if (!speechReady) errors.speech = 'Configure a valid speech API key.';
    let characters: ManagementState['characters'] = [];
    try {
      characters = this.#catalogEntries().map(({ id, voiceIdEnv }) => ({
        id,
        name: this.profiles().find((p) => p.id === id)!.name,
        voiceConfigured: /^[a-f0-9]{32}$/iu.test(env[voiceIdEnv] ?? ''),
      }));
      charactersReady = characters.length > 0 && characters.every((p) => p.voiceConfigured);
      if (!charactersReady)
        errors.characters = 'Assign a valid voice to every file-based character.';
    } catch {
      errors.characters = 'Check the character catalog and prompt files.';
    }
    if (this.#readError)
      errors.application =
        'Private settings could not be read. Repair the local configuration before saving.';
    return {
      revision: this.#revision,
      pending: false,
      setupSeen: this.#app.setupSeen,
      demo: this.demo,
      generation: {
        provider:
          env.TYRONE_TEXT_PROVIDER === 'codex'
            ? 'codex'
            : env.TYRONE_TEXT_PROVIDER === 'openrouter'
              ? 'openrouter'
              : '',
        model: env.OPENROUTER_MODEL ?? '',
        maxTokens: Number(env.OPENROUTER_MAX_TOKENS ?? 1024),
        keyConfigured: !!env.OPENROUTER_API_KEY,
        ready: generationReady,
      },
      speech: { provider: 'fish', keyConfigured: !!env.FISH_API_KEY, ready: speechReady },
      characters,
      volume: this.#app.volume,
      localReady: generationReady && speechReady && charactersReady && !this.#readError,
      errors,
      overrides: Object.keys(this.overrides).filter(
        (name) =>
          generationNames.includes(name) ||
          name === 'FISH_API_KEY' ||
          /^FISH_[A-Z0-9_]*VOICE_ID$/u.test(name) ||
          name === 'TYRONE_PLAYBACK_PORT',
      ),
    };
  }
  pipeline(): QueuePipeline | undefined {
    try {
      if (this.demo) return demoPipeline(this.profiles());
      if (!this.snapshot().localReady) return undefined;
      const env = this.env();
      return livePipeline(
        env.FISH_API_KEY!,
        readCharacters(env, false, this.#catalog),
        readGenerationConfig(env),
      );
    } catch {
      return undefined;
    }
  }
  voicePipeline(): QueuePipeline {
    if (this.demo) return demoPipeline(this.profiles());
    const state = this.snapshot();
    if (
      !state.speech.ready ||
      state.characters.some((p) => !p.voiceConfigured) ||
      !state.characters.length
    )
      throw new RequestInputError('Configure speech and character voices before testing.');
    const env = this.env();
    return {
      mode: 'live',
      characters: readCharacters(env, false, this.#catalog),
      async generate() {
        return 'This is a voice test. Your character is ready to speak.';
      },
      async synthesize(text, signal, character) {
        return (
          await synthesizeSpeech({
            text,
            signal,
            apiKey: env.FISH_API_KEY!,
            voiceId: character.voiceId!,
          })
        ).audio;
      },
    };
  }
  async testResponse(question: unknown, signal: AbortSignal) {
    const character = selectCharacter(question, this.profiles());
    if (this.demo)
      return await demoPipeline(this.profiles()).generate(
        character.question,
        signal,
        character.character,
      );
    if (!this.snapshot().generation.ready)
      throw new RequestInputError('Configure generation before testing.');
    try {
      return (
        await generateConfiguredDialogue(readGenerationConfig(this.env()), {
          question: character.question,
          character: character.character.prompt,
          signal,
        })
      ).dialogue;
    } catch {
      throw new RequestInputError(
        'Response test failed or timed out. Check provider access and the saved model settings.',
      );
    }
  }
  async checkConnection(section: unknown, fetcher: typeof fetch = fetch) {
    if (section !== 'generation' && section !== 'speech')
      throw new RequestInputError('Unknown connection check.');
    const env = this.env();
    if (section === 'generation' && env.TYRONE_TEXT_PROVIDER !== 'openrouter')
      throw new RequestInputError(
        'For Codex, use Check prerequisites. Choose OpenRouter for an API-key connection check.',
      );
    if (this.demo)
      return { ok: true, message: 'Demo check only. No connected provider was contacted.' };
    const key = section === 'generation' ? env.OPENROUTER_API_KEY : env.FISH_API_KEY;
    if (!key) throw new RequestInputError('Configure the saved API key first.');
    try {
      const response = await fetcher(
        section === 'generation'
          ? 'https://openrouter.ai/api/v1/key'
          : 'https://api.fish.audio/wallet/self/api-credit',
        {
          method: 'GET',
          redirect: 'error',
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(10000),
        },
      );
      await response.body?.cancel();
      return {
        ok: response.ok,
        message: response.ok
          ? 'Saved API key authenticated. No generation or speech was requested; model/voice access and allowance remain separate checks.'
          : 'Connection check failed. Verify the saved key and provider access.',
      };
    } catch {
      return {
        ok: false,
        message: 'Connection check failed or timed out. Verify provider access and try again.',
      };
    }
  }
  proof(nonce: string): string {
    // Retain compatibility with existing launcher proofs where configuration is complete.
    const env = this.env();
    try {
      return configurationProof(
        readConfig(
          { ...env, TWITCH_CLIENT_ID: '', TWITCH_CHANNEL: '' },
          this.demo ? ['--demo'] : [],
        ),
        nonce,
      );
    } catch {
      return configurationProof(
        {
          demo: this.demo,
          port: this.port,
          values: this.#values,
          overrides: this.overrides,
          app: this.#app,
        },
        nonce,
      );
    }
  }
  #write(file: string, value: string) {
    mkdirSync(this.privateRoot, { recursive: true });
    const path = resolve(this.privateRoot, file),
      temp = `${path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temp, value, { encoding: 'utf8', mode: 0o600 });
      renameSync(temp, path);
    } catch {
      if (existsSync(temp)) unlinkSync(temp);
      throw new RequestInputError('Settings could not be stored. Previous settings were kept.');
    }
  }
  save(section: SettingsSection, body: Record<string, unknown>): void {
    if (this.#readError)
      throw new RequestInputError('Repair unreadable private settings before saving.');
    const values = { ...this.#values };
    const fail = (message: string): never => {
      throw new RequestInputError(message);
    };
    const text = (key: string, secret = false): string => {
      const value = body[key];
      if (
        typeof value !== 'string' ||
        value.length > 1024 ||
        /['"\r\n\0]/u.test(value) ||
        (secret && /\s/u.test(value))
      )
        return fail(`${key}: enter a valid value.`);
      return value.trim();
    };
    let file: (typeof files)[number] | undefined;
    const updates: Record<string, string> = {};
    if (section === 'generation') {
      const provider = text('provider');
      if (!['openrouter', 'codex'].includes(provider))
        fail('provider: choose OpenRouter or Codex.');
      updates.TYRONE_TEXT_PROVIDER = provider;
      if (provider === 'openrouter') {
        updates.OPENROUTER_MODEL = text('model');
        const tokens = body.maxTokens;
        if (
          typeof tokens !== 'number' ||
          !Number.isInteger(tokens) ||
          tokens < 64 ||
          tokens > 16384
        )
          fail('maxTokens: use an integer from 64 to 16384.');
        updates.OPENROUTER_MAX_TOKENS = String(tokens);
        const key = text('key', true);
        if (key) updates.OPENROUTER_API_KEY = key;
        const candidate = { ...values, ...updates };
        try {
          readGenerationConfig({
            ...candidate,
            OPENROUTER_API_KEY: candidate.OPENROUTER_API_KEY || this.overrides.OPENROUTER_API_KEY,
          });
        } catch {
          fail('model/key: supply an exact supported model ID and API key.');
        }
      }
      file = 'generation.env';
    } else if (section === 'speech') {
      const key = text('key', true);
      if (key) updates.FISH_API_KEY = key;
      if (!(updates.FISH_API_KEY || values.FISH_API_KEY || this.overrides.FISH_API_KEY))
        fail('key: supply a speech API key.');
      file = 'fish.env';
    } else if (section === 'characters') {
      const voices = body.voices;
      if (!voices || typeof voices !== 'object' || Array.isArray(voices))
        fail('voices: supply character voice assignments.');
      const entries = this.#catalogEntries();
      for (const [id, voice] of Object.entries(voices as Record<string, unknown>)) {
        const entry = entries.find((p) => p.id === id);
        if (!entry || typeof voice !== 'string')
          fail('voices: unknown character or invalid voice.');
        if (!voice) continue;
        if (!/^[a-f0-9]{32}$/iu.test(voice as string))
          fail('voices: each voice ID must contain 32 hexadecimal characters.');
        updates[entry!.voiceIdEnv] = voice as string;
      }
      file = 'fish.env';
    } else if (section === 'playback' || section === 'application') {
      const app = { ...this.#app };
      if (section === 'playback') {
        if (
          typeof body.volume !== 'number' ||
          !Number.isInteger(body.volume) ||
          body.volume < 0 ||
          body.volume > 100
        )
          fail('volume: use an integer from 0 to 100.');
        app.volume = body.volume as number;
      } else {
        if (
          typeof body.setupSeen !== 'boolean' ||
          Object.keys(body).some((key) => key !== 'setupSeen')
        )
          fail('Application settings accept only setup checklist progress.');
        app.setupSeen = body.setupSeen as boolean;
      }
      this.#write('app.json', JSON.stringify(app, null, 2) + '\n');
      this.#app = app;
      this.#revision++;
      return;
    } else fail('Unknown settings section.');
    Object.assign(values, updates);
    const path = resolve(this.privateRoot, file!);
    const original = existsSync(path) ? readFileSync(path, 'utf8') : '';
    const names = new Set(Object.keys(updates));
    const kept = original.split(/\r?\n/u).filter((line) => {
      const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/u.exec(line);
      return !match || !names.has(match[1]!);
    });
    this.#write(
      file!,
      kept.join('\n').trimEnd() +
        '\n' +
        Object.entries(updates)
          .map(([name, value]) => `${name}='${value}'`)
          .join('\n') +
        '\n',
    );
    this.#values = values;
    this.#revision++;
  }
}
