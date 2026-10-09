import { useRef, useState } from 'react';
import {
  AudioLines,
  History,
  ListOrdered,
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
        kind === 'current' ? 'speaking' : entry.status === 'completed' ? 'complete' : 'quiet'
      }
    >
      {kind === 'current' && entry.status === 'playing' && !paused ? (
        <AudioLines aria-hidden="true" />
      ) : null}
      {kind === 'current' && paused ? 'Paused' : statusLabels[entry.status]}
    </Badge>
  );
}

function Entry({
  entry,
  kind,
  remove,
  disabled,
}: {
  entry: RequestEntry;
  kind: Kind;
  remove: () => void;
  disabled: boolean;
}) {
  return (
    <article
      className={'feed-entry ' + kind + '-entry'}
      aria-label={entry.viewer + ': ' + statusLabels[entry.status]}
    >
      <div className="entry-meta">
        <span className="viewer">{entry.viewer}</span>
        <span className="destination">to {entry.characterName}</span>
        <time dateTime={new Date(entry.createdAt).toISOString()}>
          {clock.format(entry.createdAt)}
        </time>
        {kind === 'past' ? <Status entry={entry} paused={false} kind={kind} /> : null}
      </div>
      <p className="question" title={kind !== 'past' ? entry.question : undefined}>
        {entry.question}
      </p>
      {kind !== 'waiting' && entry.dialogue ? (
        <div className="response">
          <span className="speaker">{entry.characterName}’s reply</span>
          <p className="spoken-response">{entry.dialogue}</p>
        </div>
      ) : null}
      {entry.error ? <p className="request-error">{entry.error}</p> : null}
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
        <h1>Messages</h1>
        <Button variant="ghost" size="icon" onClick={openSettings} aria-label="Open settings">
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
        <Button
          id="stop-clear"
          variant="ghost"
          size="icon"
          disabled={disabled || (!current && !state?.queue?.waitingIds.length)}
          onClick={() => run('/api/queue/stop')}
          aria-label="Stop and clear"
          title="Stop and clear current and waiting messages"
        >
          <Square data-icon="inline-start" />
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
      </div>
    </header>
  );
}

export function Activity(props: Props) {
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
  const run = (route: string, body = {}) => void command(route, body).catch(() => {});
  return (
    <div className="utility">
      <Controls {...props} />
      <section className="now-playing" aria-labelledby="current-heading">
        <div className="section-header">
          <h2 id="current-heading">
            {current?.status === 'playing' ? 'Now playing' : 'Current message'}
          </h2>
          {current ? <Status entry={current} paused={!!queue?.paused} kind="current" /> : null}
        </div>
        {current ? (
          <Entry entry={current} kind="current" disabled={disabled} remove={() => {}} />
        ) : (
          <div className="queue-empty">
            <p>
              {!state
                ? 'Connecting…'
                : !connected
                  ? 'Server offline'
                  : queue?.paused
                    ? 'Playback paused'
                    : 'All caught up'}
            </p>
            <span>
              {queue?.paused
                ? 'Resume when you’re ready for new messages.'
                : 'New questions will appear here.'}
            </span>
          </div>
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
            <ListOrdered aria-hidden="true" />
            Up next
          </h2>
          <Button
            id="clear"
            variant="ghost"
            size="xs"
            disabled={disabled || !waiting.length}
            onClick={() => run('/api/queue/clear')}
          >
            Clear waiting
          </Button>
        </div>
        {waiting.length ? (
          waiting.map((entry) => (
            <Entry
              key={entry.id}
              entry={entry}
              kind="waiting"
              disabled={disabled}
              remove={() => run('/api/requests/remove', { id: entry.id })}
            />
          ))
        ) : (
          <p className="waiting-empty">No questions waiting.</p>
        )}
      </section>
      <section className="history" aria-labelledby="history-heading">
        <div className="section-header history-header">
          <h2 id="history-heading">
            <History aria-hidden="true" />
            History
          </h2>
        </div>
        <div className="history-list" tabIndex={0} role="region" aria-label="Message history">
          {history.length ? (
            history.map((entry) => (
              <Entry key={entry.id} entry={entry} kind="past" disabled={true} remove={() => {}} />
            ))
          ) : (
            <p className="waiting-empty">Finished questions will appear here.</p>
          )}
        </div>
      </section>
    </div>
  );
}
