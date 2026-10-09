export type PlaybackStatus =
  'idle' | 'ready' | 'playing' | 'blocked' | 'completed' | 'stopped' | 'failed';
export interface PlaybackClip {
  id: string;
  label: string;
  url: string;
}
export interface PlaybackState {
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
  replayOf?: string;
  replayAvailable?: boolean;
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
