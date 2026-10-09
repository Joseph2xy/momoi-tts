import { useRef, useState } from 'react';
import {
  AudioLines,
  ChevronRight,
  Ellipsis,
  Pause,
  Play,
  Settings,
  SkipForward,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { PlaybackState, RequestEntry, RequestStatus } from '../../src/shared/protocol.ts';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { cn } from './lib/utils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
} from './components/ui/dropdown-menu';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from './components/ui/empty';
import { Alert, AlertDescription } from './components/ui/alert';

const statusLabels: Record<RequestStatus, string> = {
  waiting: 'Waiting',
  generating: 'Writing reply',
  synthesizing: 'Creating speech',
  ready: 'Ready',
  playing: 'Speaking',
  blocked: 'Audio blocked',
  completed: 'Answered',
  skipped: 'Skipped',
  removed: 'Removed',
  expired: 'Expired',
  failed: 'Failed',
};
const clock = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
type Props = {
  state: PlaybackState | null;
  connected: boolean;
  pending: boolean;
  command: (route: string, body: unknown) => Promise<unknown>;
  openSettings: () => void;
};
type Kind = 'current' | 'waiting' | 'past';

function Status({ entry, paused, kind }: { entry: RequestEntry; paused: boolean; kind: Kind }) {
  return (
    <Badge
      variant={
        entry.status === 'failed' || entry.status === 'blocked'
          ? 'error'
          : kind === 'current'
            ? 'speaking'
            : 'quiet'
      }
    >
      {kind === 'current' && entry.status === 'playing' && !paused ? (
        <AudioLines aria-hidden="true" />
      ) : null}
      {kind === 'current' && paused && ['ready', 'playing'].includes(entry.status)
        ? 'Held'
        : statusLabels[entry.status]}
    </Badge>
  );
}

function Entry({
  entry,
  kind,
  remove,
  disabled = false,
  inspect,
  paused,
}: {
  entry: RequestEntry;
  kind: Kind;
  remove?: () => void;
  disabled?: boolean;
  inspect: () => void;
  paused: boolean;
}) {
  return (
    <article
      className={cn('feed-entry', kind + '-entry')}
      aria-label={entry.viewer + ': ' + statusLabels[entry.status]}
    >
      <button
        type="button"
        className="entry-inspect"
        onClick={inspect}
        aria-label={'View message from ' + entry.viewer}
      >
        <div className="entry-meta">
          <span className="viewer">{entry.viewer}</span>
          <span className="destination">to {entry.characterName}</span>
          <time dateTime={new Date(entry.createdAt).toISOString()}>
            {clock.format(entry.createdAt)}
          </time>
          <Status entry={entry} paused={paused} kind={kind} />
        </div>
        <p className="question">{entry.question}</p>
        {entry.error ? <p className="request-error">{entry.error}</p> : null}
        <ChevronRight className="inspect-chevron" aria-hidden="true" />
      </button>
      {kind === 'waiting' ? (
        <Button
          variant="ghost"
          size="icon"
          className="remove"
          disabled={disabled}
          onClick={remove}
          aria-label={'Remove question from ' + entry.viewer}
        >
          <X data-icon="inline-start" />
        </Button>
      ) : null}
    </article>
  );
}

function Controls({ state, connected, pending, command, openSettings }: Props) {
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  const committing = useRef(false);
  const disabled = !connected || pending || !state;
  const current = state?.queue?.activeId;
  const run = (route: string, body = {}) => void command(route, body).catch(() => {});
  function commitVolume(value: number) {
    if (committing.current) return;
    if (!state || disabled || value === Math.round(state.volume * 100)) {
      setDraftVolume(null);
      return;
    }
    committing.current = true;
    void command('/api/settings', { muted: state.muted, volume: value / 100 })
      .catch(() => {})
      .finally(() => {
        committing.current = false;
        setDraftVolume(null);
      });
  }
  return (
    <header className="controls">
      <div className="title-row">
        <h1>Activity</h1>
        <span className="operating-state" role="status">
          {!state
            ? 'Connecting…'
            : !connected
              ? 'Server offline'
              : state.queue?.paused
                ? 'Paused'
                : 'Running'}
        </span>
        {state?.queue?.mode === 'demo' ? <Badge variant="quiet">Demo</Badge> : null}
        <Button
          variant="ghost"
          size="icon"
          className="settings-entrypoint"
          onClick={openSettings}
          aria-label="Open settings"
          title="Settings"
        >
          <Settings data-icon="inline-start" />
        </Button>
      </div>
      <div className="transport">
        <Button
          id="skip"
          aria-label="Skip current"
          disabled={disabled || !current}
          onClick={() => run('/api/queue/skip')}
        >
          <SkipForward data-icon="inline-start" />
          <span className="full-label">Skip current</span>
          <span className="compact-label">Skip</span>
        </Button>
        <Button
          id="pause"
          variant="outline"
          disabled={disabled || !state?.queue}
          aria-pressed={state?.queue?.paused ?? true}
          onClick={() => run(state?.queue?.paused ? '/api/playback/resume' : '/api/playback/pause')}
        >
          {state?.queue?.paused !== false ? (
            <Play data-icon="inline-start" />
          ) : (
            <Pause data-icon="inline-start" />
          )}
          {state?.queue?.paused !== false ? 'Resume' : 'Pause'}
        </Button>
        <div className="volume">
          <Button
            id="mute"
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-pressed={state?.muted ?? false}
            aria-label={state?.muted ? 'Unmute' : 'Mute'}
            onClick={() =>
              state && run('/api/settings', { muted: !state.muted, volume: state.volume })
            }
          >
            {state?.muted ? (
              <VolumeX data-icon="inline-start" />
            ) : (
              <Volume2 data-icon="inline-start" />
            )}
          </Button>
          <input
            id="volume"
            type="range"
            aria-label="Playback volume"
            min="0"
            max="100"
            disabled={disabled}
            value={draftVolume ?? Math.round((state?.volume ?? 1) * 100)}
            onChange={(e) => setDraftVolume(Number(e.currentTarget.value))}
            onPointerUp={(e) => commitVolume(Number(e.currentTarget.value))}
            onKeyUp={(e) => {
              if (
                [
                  'ArrowLeft',
                  'ArrowRight',
                  'ArrowUp',
                  'ArrowDown',
                  'Home',
                  'End',
                  'PageUp',
                  'PageDown',
                ].includes(e.key)
              )
                commitVolume(Number(e.currentTarget.value));
            }}
            onBlur={(e) => {
              if (draftVolume !== null) commitVolume(Number(e.currentTarget.value));
            }}
          />
          <span className="volume-value">
            {state?.muted ? 'Muted' : (draftVolume ?? Math.round((state?.volume ?? 1) * 100)) + '%'}
          </span>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More playback controls">
              <Ellipsis data-icon="inline-start" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuGroup>
              <DropdownMenuItem
                id="clear"
                disabled={disabled || !state?.queue?.waitingIds.length}
                onSelect={() => run('/api/queue/clear')}
              >
                Clear waiting
              </DropdownMenuItem>
              <DropdownMenuItem
                id="stop-clear"
                disabled={disabled || (!current && !state?.queue?.waitingIds.length)}
                onSelect={() => run('/api/queue/stop')}
              >
                <Square />
                Stop and clear
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

export function Activity(props: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inspectionTrigger = useRef<HTMLButtonElement | null>(null);
  const { state, pending, connected, command } = props;
  const queue = state?.queue;
  const current = queue?.requests.find((entry) => entry.id === queue.activeId);
  const waiting =
    queue?.waitingIds.flatMap((id) => queue.requests.filter((entry) => entry.id === id)) ?? [];
  const history =
    queue?.requests
      .filter((entry) => entry.id !== queue.activeId && !queue.waitingIds.includes(entry.id))
      .sort((a, b) => (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt)) ?? [];
  const disabled = pending || !connected;
  const selected = queue?.requests.find((entry) => entry.id === selectedId);
  function inspect(id: string) {
    inspectionTrigger.current =
      document.activeElement instanceof HTMLButtonElement ? document.activeElement : null;
    setSelectedId(id);
  }
  const run = (route: string, body = {}) => void command(route, body).catch(() => {});
  return (
    <div className="utility">
      <Controls {...props} />
      <section className="current-work" aria-labelledby="current-heading">
        <div className="section-header">
          <h2 id="current-heading">Current</h2>
        </div>
        {current ? (
          <Entry
            key={current.id}
            entry={current}
            kind="current"
            inspect={() => inspect(current.id)}
            paused={!!queue?.paused}
          />
        ) : (
          <p className="waiting-empty">
            {!state
              ? 'Connecting…'
              : !connected
                ? 'Server offline'
                : queue?.paused
                  ? 'No current message. Resume to start playback.'
                  : 'Waiting for questions.'}
          </p>
        )}
        {current && state?.progress ? (
          <div className="speech-progress">
            <progress
              aria-label="Speech playback progress"
              max={state.progress.durationSeconds}
              value={state.progress.elapsedSeconds}
            />
            <span>
              {Math.round(state.progress.elapsedSeconds)} /{' '}
              {Math.round(state.progress.durationSeconds)}s
            </span>
          </div>
        ) : null}
      </section>
      <section className="upcoming" aria-labelledby="upcoming-heading">
        <div className="section-header">
          <h2 id="upcoming-heading">
            Up next
            {waiting.length ? <span className="waiting-count">{waiting.length}</span> : null}
          </h2>
        </div>
        {waiting.length ? (
          waiting.map((entry) => (
            <Entry
              key={entry.id}
              entry={entry}
              kind="waiting"
              disabled={disabled}
              remove={() => run('/api/requests/remove', { id: entry.id })}
              inspect={() => inspect(entry.id)}
              paused={false}
            />
          ))
        ) : (
          <p className="waiting-empty">No questions waiting.</p>
        )}
      </section>
      <section className="history" aria-labelledby="history-heading">
        <div className="section-header history-header">
          <h2 id="history-heading">History</h2>
        </div>
        <div className="history-list" tabIndex={0} role="region" aria-label="Message history">
          {history.length ? (
            history.map((entry) => (
              <Entry
                key={entry.id}
                entry={entry}
                kind="past"
                inspect={() => inspect(entry.id)}
                paused={false}
              />
            ))
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No recent activity</EmptyTitle>
                <EmptyDescription>Finished messages will appear here.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      </section>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className="message-detail"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = inspectionTrigger.current;
            if (trigger?.isConnected) trigger.focus();
            else document.getElementById('pause')?.focus();
          }}
        >
          {selected ? (
            <>
              <DialogHeader>
                <DialogTitle>Message from {selected.viewer}</DialogTitle>
                <DialogDescription>
                  To {selected.characterName} at {clock.format(selected.createdAt)}
                </DialogDescription>
              </DialogHeader>
              <Status
                entry={selected}
                paused={!!queue?.paused}
                kind={
                  selected.id === queue?.activeId
                    ? 'current'
                    : queue?.waitingIds.includes(selected.id)
                      ? 'waiting'
                      : 'past'
                }
              />
              <div className="detail-transcript">
                <section>
                  <h2>Question</h2>
                  <p>{selected.question}</p>
                </section>
                <section>
                  <h2>{selected.characterName}’s reply</h2>
                  <p>{selected.dialogue ?? 'No reply yet.'}</p>
                </section>
                {selected.error ? (
                  <Alert variant="destructive">
                    <AlertDescription>{selected.error}</AlertDescription>
                  </Alert>
                ) : null}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
