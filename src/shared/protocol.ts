export type PlaybackStatus =
  'idle' | 'ready' | 'playing' | 'blocked' | 'completed' | 'stopped' | 'failed';
export interface PlaybackClip {
  id: string;
  url: string;
}
export interface PlaybackState {
  management?: ManagementState;
  status: PlaybackStatus;
  clip: PlaybackClip | null;
  playerConnected: boolean;
  progress: { elapsedSeconds: number; durationSeconds: number } | null;
  muted: boolean;
  volume: number;
  message: string;
  canQuit?: boolean;
  twitchSetup?: TwitchSetupState;
  repliesRequested?: boolean;
  queue?: QueueState;
  twitch?: TwitchState;
  logging?: { available: boolean; failed: boolean };
}

export type SettingsSection = 'generation' | 'speech' | 'playback' | 'application';
export interface ManagementState {
  revision: number;
  testRevision: string;
  pending: boolean;
  setupSeen: boolean;
  generation: {
    provider: '' | 'openrouter';
    model: string;
    maxTokens: number;
    keyConfigured: boolean;
    ready: boolean;
  };
  speech: { provider: 'fish'; model: string; keyConfigured: boolean; ready: boolean };
  characters: { id: string; name: string; voiceConfigured: boolean; available?: boolean }[];
  volume: number;
  localReady: boolean;
  errors: Partial<Record<SettingsSection | 'characters', string>>;
  overrides: string[];
}
export interface PlayerState extends Pick<PlaybackState, 'status' | 'clip' | 'muted' | 'volume'> {
  primary: boolean;
}

export interface TwitchState {
  live: boolean | null;
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
export interface CharacterEditorState extends CharacterInfo {
  prompt: string;
  voiceId: string;
  voiceOverridden: boolean;
  available?: boolean;
}

export interface TwitchSetupState {
  registrationReady: boolean;
  authorized: boolean;
  channel: string | null;
  rewardId: string | null;
  rewardTitle: string;
  rewardCost: number;
  rewardCooldown: number;
  busy: boolean;
  activationUrl?: string;
  userCode?: string;
  message: string;
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
  mode: 'live' | 'disabled';
  repliesEnabled: boolean;
  activeId: string | null;
  waitingIds: string[];
  requests: RequestEntry[];
  viewerCooldownMs: number;
  globalCooldownMs: number;
  waitingExpiryMs: number;
}
