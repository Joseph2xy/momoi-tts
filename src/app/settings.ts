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
import { configurationProof } from './config.ts';
import { readGenerationConfig } from './generation.ts';
import { readCharacters } from '../characters/catalog.ts';
import { readCharacterEdits, validCharacterEdit, type CharacterEdit } from '../characters/edits.ts';
import type { CharacterEditorState } from '../shared/protocol.ts';
import { RequestInputError } from '../shared/errors.ts';
import type { ManagementState, SettingsSection } from '../shared/protocol.ts';
import { readTwitchConfig } from '../twitch/config.ts';
import { defaultFishModel, validateFishModel } from '../providers/fish/config.ts';

const root = fileURLToPath(new URL('../../', import.meta.url));
const files = ['generation.env', 'fish.env'] as const;
const generationNames = [
  'MOMOI_TTS_TEXT_PROVIDER',
  'OPENROUTER_MODEL',
  'OPENROUTER_MAX_TOKENS',
  'OPENROUTER_API_KEY',
];
interface AppSettings {
  volume: number;
  setupSeen: boolean;
  twitchConnected?: boolean;
}

// Only fixed local paths are accepted. Secrets never enter the public settings contract.
export class SettingsStore {
  readonly privateRoot: string;
  readonly overrides: NodeJS.ProcessEnv;
  #values: Record<string, string> = {};
  #app: AppSettings = { volume: 100, setupSeen: false, twitchConnected: false };
  #readError = false;
  #revision = 0;
  #catalog: URL;
  #characterEdits: Record<string, CharacterEdit> = {};
  constructor(options: { privateRoot?: string; env?: NodeJS.ProcessEnv; catalog?: URL } = {}) {
    this.privateRoot = options.privateRoot ?? resolve(root, '.local');
    this.overrides = { ...(options.env ?? process.env) };
    this.#catalog = options.catalog ?? new URL('../../characters/catalog.json', import.meta.url);
    try {
      for (const file of [...files, 'twitch.env']) {
        const path = resolve(this.privateRoot, file);
        if (existsSync(path)) Object.assign(this.#values, parseEnv(readFileSync(path, 'utf8')));
      }
      const characterPath = resolve(this.privateRoot, 'characters.json');
      if (existsSync(characterPath))
        this.#characterEdits = readCharacterEdits(JSON.parse(readFileSync(characterPath, 'utf8')));
      const path = resolve(this.privateRoot, 'app.json');
      if (existsSync(path)) {
        const app = JSON.parse(readFileSync(path, 'utf8')) as AppSettings;
        if (
          !Number.isInteger(app.volume) ||
          app.volume < 0 ||
          app.volume > 100 ||
          typeof app.setupSeen !== 'boolean' ||
          (app.twitchConnected !== undefined && typeof app.twitchConnected !== 'boolean')
        )
          throw new Error();
        this.#app = {
          volume: app.volume,
          setupSeen: app.setupSeen,
          twitchConnected: app.twitchConnected ?? false,
        };
      }
    } catch {
      this.#readError = true;
    }
  }
  env(values = this.#values): NodeJS.ProcessEnv {
    return {
      FISH_MODEL: defaultFishModel,
      ...values,
      ...this.overrides,
    };
  }
  get port() {
    const value = Number(this.env().MOMOI_TTS_PLAYBACK_PORT ?? 3210);
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
  twitchConfig() {
    return readTwitchConfig(this.env());
  }
  get twitchConnected() {
    return this.#app.twitchConnected === true;
  }
  rememberTwitch(connected: boolean) {
    if (this.#readError)
      throw new RequestInputError('Repair unreadable private settings before connecting Twitch.');
    const app = { ...this.#app, twitchConnected: connected };
    this.#write('app.json', JSON.stringify(app, null, 2) + '\n');
    this.#app = app;
  }
  queueSettings() {
    const env = this.env();
    const duration = (key: string, fallback: number) => {
      const value = Number(env[key] ?? fallback);
      return Number.isInteger(value) &&
        value >= (key === 'MOMOI_TTS_WAITING_EXPIRY_MS' ? 100 : 0) &&
        value <= 3_600_000
        ? value
        : fallback;
    };
    return {
      viewerCooldownMs: duration('MOMOI_TTS_VIEWER_COOLDOWN_MS', 10000),
      globalCooldownMs: duration('MOMOI_TTS_GLOBAL_COOLDOWN_MS', 1000),
      waitingExpiryMs: duration('MOMOI_TTS_WAITING_EXPIRY_MS', 180000),
    };
  }
  profiles(withVoices = false) {
    const base = readCharacters({}, true, this.#catalog);
    const entries = this.#catalogEntries();
    const env = this.env();
    const voiceEnv = { ...env };
    for (const entry of entries)
      voiceEnv[entry.voiceIdEnv] = this.#voice(entry.id, entry.voiceIdEnv);
    const profiles = withVoices ? readCharacters(voiceEnv, false, this.#catalog) : base;
    return Object.freeze(
      profiles.map((profile) =>
        Object.freeze({
          ...profile,
          prompt: this.#characterEdits[profile.id]?.prompt ?? profile.prompt,
        }),
      ),
    );
  }
  refreshProfiles() {
    this.profiles();
    this.#revision++;
  }
  #catalogEntries(): { id: string; name: string; voiceIdEnv: string }[] {
    readCharacters({}, true, this.#catalog);
    return JSON.parse(readFileSync(this.#catalog, 'utf8'));
  }
  #voice(id: string, envName: string): string {
    return (
      this.overrides[envName] ?? this.#characterEdits[id]?.voiceId ?? this.#values[envName] ?? ''
    );
  }
  characterEditor(id: string): CharacterEditorState {
    const entry = this.#catalogEntries().find((character) => character.id === id);
    const profile = this.profiles().find((character) => character.id === id);
    if (!entry || !profile) throw new RequestInputError('Unknown character.');
    return {
      id: profile.id,
      name: profile.name,
      prompt: profile.prompt,
      voiceId: this.#voice(id, entry.voiceIdEnv),
      voiceOverridden: this.overrides[entry.voiceIdEnv] !== undefined,
    };
  }
  saveCharacter(id: string, body: Record<string, unknown>): void {
    if (this.#readError)
      throw new RequestInputError('Repair unreadable private settings before saving.');
    if (!validCharacterEdit(body))
      throw new RequestInputError(
        'Enter a nonempty prompt up to 6000 UTF-8 bytes and a valid voice ID or leave the voice blank.',
      );
    const current = this.characterEditor(id);
    const entry = this.#catalogEntries().find((character) => character.id === id)!;
    if (current.voiceOverridden && body.voiceId !== current.voiceId)
      throw new RequestInputError(
        'The launch environment controls this voice. Remove its override before changing it.',
      );
    const edits = {
      ...this.#characterEdits,
      [id]: {
        prompt: body.prompt,
        voiceId: current.voiceOverridden
          ? (this.#characterEdits[id]?.voiceId ?? this.#values[entry.voiceIdEnv] ?? '')
          : body.voiceId,
      },
    };
    this.#write('characters.json', JSON.stringify(edits, null, 2) + '\n');
    this.#characterEdits = edits;
    this.#revision++;
  }
  snapshot(): ManagementState {
    const env = this.env();
    const errors: ManagementState['errors'] = {};
    let generationReady = false,
      speechReady = false,
      charactersReady = false;
    try {
      readGenerationConfig(env);
      generationReady = true;
    } catch {
      errors.generation =
        'Save an OpenRouter API key and exact model ID. No connection has been checked.';
    }
    try {
      validateFishModel(env.FISH_MODEL);
      speechReady = !!env.FISH_API_KEY && !/\s/u.test(env.FISH_API_KEY);
    } catch {
      speechReady = false;
    }
    if (!speechReady)
      errors.speech = 'Configure your Fish Audio API key and choose a supported speech engine.';
    let characters: ManagementState['characters'] = [];
    try {
      characters = this.#catalogEntries().map(({ id, name, voiceIdEnv }) => ({
        id,
        name,
        voiceConfigured: /^[a-f0-9]{32}$/iu.test(this.#voice(id, voiceIdEnv)),
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
      generation: {
        provider: env.MOMOI_TTS_TEXT_PROVIDER === 'openrouter' ? 'openrouter' : '',
        model: env.OPENROUTER_MODEL ?? '',
        maxTokens: Number(env.OPENROUTER_MAX_TOKENS ?? 1024),
        keyConfigured: !!env.OPENROUTER_API_KEY,
        ready: generationReady,
      },
      speech: {
        provider: 'fish',
        model: env.FISH_MODEL ?? '',
        keyConfigured: !!env.FISH_API_KEY,
        ready: speechReady,
      },
      characters,
      volume: this.#app.volume,
      localReady: generationReady && speechReady && charactersReady && !this.#readError,
      errors,
      overrides: Object.keys(this.overrides).filter(
        (name) =>
          generationNames.includes(name) ||
          name === 'FISH_API_KEY' ||
          name === 'FISH_MODEL' ||
          /^FISH_[A-Z0-9_]*VOICE_ID$/u.test(name) ||
          name === 'MOMOI_TTS_PLAYBACK_PORT',
      ),
    };
  }
  proof(nonce: string): string {
    // Only application configuration participates; unrelated inherited values do not affect reuse.
    const env = this.env();
    const names = Object.keys(env)
      .filter((name) => /^(?:MOMOI_TTS_|OPENROUTER_|FISH_|TWITCH_)/u.test(name))
      .sort();
    let characters: unknown;
    try {
      characters = this.profiles();
    } catch {
      characters = { invalid: true };
    }
    return configurationProof(
      {
        privateRoot: this.privateRoot,
        port: this.port,
        values: Object.fromEntries(names.map((name) => [name, env[name]])),
        characters,
        characterEdits: this.#characterEdits,
        app: this.#app,
      },
      nonce,
    );
  }
  #write(file: string, value: string) {
    const path = resolve(this.privateRoot, file),
      temp = `${path}.${randomUUID()}.tmp`;
    try {
      mkdirSync(this.privateRoot, { recursive: true });
      writeFileSync(temp, value, { encoding: 'utf8', mode: 0o600 });
      renameSync(temp, path);
    } catch {
      try {
        if (existsSync(temp)) unlinkSync(temp);
      } catch {
        // Failed cleanup cannot replace the original redacted persistence error.
      }
      throw new RequestInputError('Settings could not be stored. Previous settings were kept.');
    }
  }
  save(section: SettingsSection, body: Record<string, unknown>): void {
    if (this.#readError)
      throw new RequestInputError('Repair unreadable private settings before saving.');
    if (body.removeKey !== undefined) {
      if (
        !['generation', 'speech'].includes(section) ||
        body.removeKey !== true ||
        Object.keys(body).length !== 1
      )
        throw new RequestInputError('Key removal must be a separate action.');
      const name = section === 'generation' ? 'OPENROUTER_API_KEY' : 'FISH_API_KEY';
      if (this.overrides[name] !== undefined)
        throw new RequestInputError(
          'This key is controlled by the launch environment. Remove its override first.',
        );
      const file = section === 'generation' ? 'generation.env' : 'fish.env';
      const path = resolve(this.privateRoot, file);
      const original = existsSync(path) ? readFileSync(path, 'utf8') : '';
      const kept = original.split(/\r?\n/u).filter((line) => {
        const match = /^\s*(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=/u.exec(line);
        return match?.[1] !== name;
      });
      this.#write(file, kept.join('\n').trimEnd() + '\n');
      delete this.#values[name];
      this.#revision++;
      return;
    }
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
      if (provider !== 'openrouter') fail('provider: use OpenRouter.');
      updates.MOMOI_TTS_TEXT_PROVIDER = provider;
      updates.OPENROUTER_MODEL = text('model');
      const tokens = body.maxTokens;
      if (typeof tokens !== 'number' || !Number.isInteger(tokens) || tokens < 64 || tokens > 16384)
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
      file = 'generation.env';
    } else if (section === 'speech') {
      const model = body.model === undefined ? this.env().FISH_MODEL! : text('model');
      try {
        validateFishModel(model);
      } catch {
        fail('model: choose a supported Fish Audio model.');
      }
      updates.FISH_MODEL = model;
      const key = text('key', true);
      if (key) updates.FISH_API_KEY = key;
      if (!(updates.FISH_API_KEY || values.FISH_API_KEY || this.overrides.FISH_API_KEY))
        fail('key: supply a speech API key.');
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
