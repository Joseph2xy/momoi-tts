export type PlaybackStatus =
  'idle' | 'ready' | 'playing' | 'blocked' | 'completed' | 'stopped' | 'failed';
export interface PlaybackClip {
  id: string;
  label: string;
  url: string;
}
export interface PlaybackState {
  management?: ManagementState;
  status: PlaybackStatus;
  clip: PlaybackClip | null;
  playerConnected: boolean;
  speechPaused: boolean;
  progress: { elapsedSeconds: number; durationSeconds: number } | null;
  muted: boolean;
  volume: number;
  message: string;
  canQuit?: boolean;
  queue?: QueueState;
  twitch?: TwitchState;
}

export type SettingsSection = 'generation' | 'speech' | 'characters' | 'playback' | 'application';
export interface ManagementState {
  revision: number;
  pending: boolean;
  setupSeen: boolean;
  demo: boolean;
  generation: {
    provider: '' | 'openrouter' | 'codex';
    model: string;
    maxTokens: number;
    keyConfigured: boolean;
    ready: boolean;
  };
  speech: { provider: 'fish'; keyConfigured: boolean; ready: boolean };
  characters: { id: string; name: string; voiceConfigured: boolean }[];
  volume: number;
  localReady: boolean;
  errors: Partial<Record<SettingsSection, string>>;
  overrides: string[];
}
export interface PlayerState extends PlaybackState {
  primary: boolean;
}

export interface TwitchState {
  status: 'disabled' | 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  channel: string | null;
  rewardTitle: string;
  pendingUpdates: number;
  settlementMessage: string | null;
  message: string;
  accepted: number;
  lastRejection: string | null;
}

export type RequestStatus =
  | 'waiting'
  | 'generating'
  | 'synthesizing'
  | 'ready'
  | 'playing'
  | 'blocked'
  | 'completed'
  | 'skipped'
  | 'removed'
  | 'expired'
  | 'failed';
export interface CharacterInfo {
  id: string;
  name: string;
}
export interface RequestEntry {
  id: string;
  viewer: string;
  question: string;
  characterId: string;
  characterName: string;
  dialogue?: string;
  status: RequestStatus;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}
export interface QueueState {
  characters: CharacterInfo[];
  mode: 'live' | 'demo' | 'disabled';
  paused: boolean;
  activeId: string | null;
  waitingIds: string[];
  requests: RequestEntry[];
  viewerCooldownMs: number;
  globalCooldownMs: number;
  waitingExpiryMs: number;
}
