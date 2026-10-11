import { useRef, useState, type ReactNode } from 'react';
import {
  AudioLines,
  MessageCircle,
  ListOrdered,
  History,
  Clock3,
  ChevronRight,
  Ellipsis,
  Play,
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
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from './components/ui/card';
import { Slider } from './components/ui/slider';
import { Progress } from './components/ui/progress';
import { ScrollArea } from './components/ui/scroll-area';
import { Separator } from './components/ui/separator';
import { Tooltip, TooltipTrigger, TooltipContent } from './components/ui/tooltip';

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
  notice?: ReactNode;
  state: PlaybackState | null;
  connected: boolean;
  pending: boolean;
  command: (route: string, body: unknown) => Promise<unknown>;
};
type Kind = 'current' | 'waiting' | 'past';

function Status({ entry, kind }: { entry: RequestEntry; kind: Kind }) {
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
      {kind === 'current' && entry.status === 'playing' ? <AudioLines aria-hidden="true" /> : null}
      {statusLabels[entry.status]}
    </Badge>
  );
}

function Entry({
  entry,
  kind,
  remove,
  disabled = false,
  inspect,
}: {
  entry: RequestEntry;
  kind: Kind;
  remove?: () => void;
  disabled?: boolean;
  inspect: () => void;
}) {
  if (kind === 'past') {
    return (
      <article aria-label={entry.viewer + ': ' + statusLabels[entry.status]}>
        <button
          type="button"
          className="group flex w-full min-w-0 items-center gap-4 rounded-lg px-4 py-4 text-left hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
          onClick={inspect}
          aria-label={'View message from ' + entry.viewer}
        >
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
              <span className="max-w-[50%] truncate font-semibold">{entry.viewer}</span>
              <span className="truncate text-xs text-muted-foreground">
                to {entry.characterName}
              </span>
              <Status entry={entry} kind="past" />
            </div>
            <p className="line-clamp-2 break-words text-sm text-muted-foreground">
              {entry.question}
            </p>
            {entry.error ? (
              <p className="line-clamp-2 break-words text-xs text-destructive">{entry.error}</p>
            ) : null}
          </div>
          <time
            className="hidden shrink-0 text-xs tabular-nums text-muted-foreground sm:block"
            dateTime={new Date(entry.createdAt).toISOString()}
          >
            {clock.format(entry.createdAt)}
          </time>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </article>
    );
  }
  return (
    <article className="relative" aria-label={entry.viewer + ': ' + statusLabels[entry.status]}>
      <button
        type="button"
        className={cn(
          'flex w-full min-w-0 flex-col gap-3 rounded-lg p-4 text-left outline-none hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring',
          kind === 'current' && 'p-0 hover:bg-transparent',
        )}
        onClick={inspect}
        aria-label={'View message from ' + entry.viewer}
      >
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 pr-4">
          <span className="max-w-[45%] truncate text-sm font-semibold">{entry.viewer}</span>
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            to {entry.characterName}
          </span>
          <span className="ml-auto">
            <Status entry={entry} kind={kind} />
          </span>
        </div>
        <p
          className={cn(
            'w-full min-w-0 break-words pr-6 text-sm',
            kind === 'current' ? 'line-clamp-3 text-xl font-medium leading-relaxed' : 'truncate',
          )}
        >
          {entry.question}
        </p>
        {kind === 'current' && entry.dialogue ? (
          <div className="flex flex-col gap-2 border-l-2 border-primary/40 pl-4">
            <span className="text-xs font-medium text-primary">{entry.characterName}’s reply</span>
            <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted-foreground">
              {entry.dialogue}
            </p>
          </div>
        ) : null}
        {entry.error ? (
          <p className="line-clamp-2 break-words pr-4 text-sm text-destructive">{entry.error}</p>
        ) : null}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock3 className="size-3" aria-hidden="true" />
          <time dateTime={new Date(entry.createdAt).toISOString()}>
            {clock.format(entry.createdAt)}
          </time>
          {kind === 'current' ? <span className="ml-2">View conversation</span> : null}
        </div>
        <ChevronRight
          className={cn(
            'absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground',
            kind === 'waiting' && 'right-12',
          )}
          aria-hidden="true"
        />
      </button>
      {kind === 'waiting' ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              disabled={disabled}
              onClick={remove}
              aria-label={'Remove question from ' + entry.viewer}
            >
              <X data-icon="inline-start" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove question</TooltipContent>
        </Tooltip>
      ) : null}
    </article>
  );
}

function readinessReason(state: PlaybackState | null): string | null {
  if (!state) return null;
  if (state.management && !state.management.localReady)
    return 'Complete generation, speech and character voice setup in Settings before turning replies on.';
  if (!state.playerConnected)
    return 'Connect the OBS audio source in Settings before turning replies on.';
  return null;
}

function Controls({ state, connected, pending, command }: Props) {
  const [draftVolume, setDraftVolume] = useState<number | null>(null);
  const committing = useRef(false);
  const disabled = !connected || pending || !state;
  const current = state?.queue?.activeId;
  const enableBlocked = readinessReason(state);
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
    <div className="flex w-full flex-wrap items-center gap-2">
      <Button
        id="replies-toggle"
        variant={state?.queue?.repliesEnabled ? 'outline' : 'default'}
        disabled={disabled || !state?.queue || (!state.queue.repliesEnabled && !!enableBlocked)}
        aria-describedby={enableBlocked ? 'replies-readiness' : undefined}
        aria-pressed={state?.queue?.repliesEnabled ?? false}
        onClick={() => run(state?.queue?.repliesEnabled ? '/api/replies/off' : '/api/replies/on')}
      >
        {state?.queue?.repliesEnabled ? (
          <Square data-icon="inline-start" />
        ) : (
          <Play data-icon="inline-start" />
        )}
        {state?.queue?.repliesEnabled ? 'Turn replies off' : 'Turn replies on'}
      </Button>
      <Button
        id="skip"
        aria-label="Skip current"
        variant="outline"
        disabled={disabled || !current}
        onClick={() => run('/api/queue/skip')}
      >
        <SkipForward data-icon="inline-start" />
        <span className="hidden sm:inline">Skip current</span>
        <span className="sm:hidden">Skip</span>
      </Button>
      <div className="ml-auto flex items-center gap-2">
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
        <Slider
          id="volume"
          aria-label="Playback volume"
          min={0}
          max={100}
          step={1}
          disabled={disabled}
          className="w-16 sm:w-24"
          value={[draftVolume ?? Math.round((state?.volume ?? 1) * 100)]}
          onValueChange={(values) => setDraftVolume(values[0] ?? 100)}
          onValueCommit={(values) => commitVolume(values[0] ?? 100)}
          onBlur={() => {
            if (draftVolume !== null) commitVolume(draftVolume);
          }}
        />
        <span className="hidden w-9 text-xs tabular-nums text-muted-foreground sm:inline">
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
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {enableBlocked ? (
        <p id="replies-readiness" className="basis-full text-xs text-muted-foreground">
          {enableBlocked}
        </p>
      ) : null}
    </div>
  );
}

export function Activity(props: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const inspectionTrigger = useRef<HTMLButtonElement | null>(null);
  const { state, pending, connected, command } = props;
  const queue = state?.queue;
  const readiness = readinessReason(state);
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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Activity</h1>
        <p className="text-muted-foreground">The conversation behind your stream.</p>
      </header>
      {props.notice}
      <Card className="min-w-0 gap-0 overflow-hidden pb-0">
        <CardHeader className="pb-6">
          <CardTitle className="flex items-center gap-2">
            <AudioLines className="size-4 text-primary" aria-hidden="true" />
            Current conversation
          </CardTitle>
          <CardDescription>
            {current
              ? 'A viewer asks. Your character takes the mic.'
              : 'Ready when your viewers are.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-6 pb-6 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
          <section aria-label="Current conversation" className="min-w-0 lg:pr-6">
            {current ? (
              <Entry
                key={current.id}
                entry={current}
                kind="current"
                inspect={() => inspect(current.id)}
              />
            ) : (
              <Empty className="min-h-32 gap-4 p-4 md:p-4">
                <div
                  className="flex size-10 items-center justify-center rounded-xl border bg-background text-primary"
                  aria-hidden="true"
                >
                  <MessageCircle className="size-6" />
                </div>
                <EmptyHeader>
                  <EmptyTitle>
                    {!state
                      ? 'Connecting…'
                      : !connected
                        ? 'Server offline'
                        : readiness
                          ? 'Setup needs attention'
                          : !queue?.repliesEnabled
                            ? 'Replies are off'
                            : 'Ready for a conversation'}
                  </EmptyTitle>
                  <EmptyDescription>
                    {!connected
                      ? 'Reconnect to see the latest activity.'
                      : readiness
                        ? readiness
                        : !queue?.repliesEnabled
                          ? 'Turn replies on when you’re ready. New requests while off are refunded.'
                          : 'The next viewer question will appear here.'}
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
            {current && state?.progress ? (
              <div className="mt-6 flex items-center gap-3">
                <Progress
                  className="h-1.5"
                  aria-label="Speech playback progress"
                  value={
                    state.progress.durationSeconds > 0
                      ? (100 * state.progress.elapsedSeconds) / state.progress.durationSeconds
                      : 0
                  }
                />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                  {Math.round(state.progress.elapsedSeconds)} /{' '}
                  {Math.round(state.progress.durationSeconds)}s
                </span>
              </div>
            ) : null}
          </section>
          <aside
            aria-label="Waiting queue"
            className="flex min-w-0 flex-col gap-4 border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <ListOrdered className="size-4 text-muted-foreground" aria-hidden="true" />
                Up next
              </h2>
              <Badge variant="quiet">{waiting.length} waiting</Badge>
            </div>
            {waiting.length ? (
              <div className="flex flex-col">
                {waiting.map((entry, index) => (
                  <div key={entry.id}>
                    {index ? <Separator className="my-1" /> : null}
                    <Entry
                      entry={entry}
                      kind="waiting"
                      disabled={disabled}
                      remove={() => run('/api/requests/remove', { id: entry.id })}
                      inspect={() => inspect(entry.id)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <Empty className="min-h-32 p-4 md:p-4">
                <EmptyHeader>
                  <EmptyTitle>Queue is clear</EmptyTitle>
                  <EmptyDescription>
                    Incoming questions line up here while a character replies.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </aside>
        </CardContent>
        <CardFooter className="flex-wrap gap-4 border-t bg-background/40 px-4 py-4 md:px-6">
          <Badge
            variant={connected && state && !!queue?.repliesEnabled ? 'success' : 'quiet'}
            role="status"
          >
            {!state
              ? 'Connecting…'
              : !connected
                ? 'Server offline'
                : !queue?.repliesEnabled
                  ? 'Replies off'
                  : 'Replies on'}
          </Badge>
          <div className="min-w-0 flex-1 basis-full sm:basis-0">
            <Controls {...props} />
          </div>
        </CardFooter>
      </Card>
      <section className="flex min-w-0 flex-col gap-4" aria-labelledby="history-heading">
        <header className="flex items-center justify-between gap-3">
          <h2 id="history-heading" className="flex items-center gap-2 text-lg font-semibold">
            <History className="size-4 text-muted-foreground" aria-hidden="true" />
            Recent conversations
          </h2>
          <Badge variant="quiet">{history.length} recent</Badge>
        </header>
        <ScrollArea className={history.length ? 'h-80' : ''} aria-label="Message history">
          <div className="pr-3" role="region" aria-label="Message history" tabIndex={0}>
            {history.length ? (
              history.map((entry, index) => (
                <div key={entry.id}>
                  {index ? <Separator /> : null}
                  <Entry entry={entry} kind="past" inspect={() => inspect(entry.id)} />
                </div>
              ))
            ) : (
              <Empty className="p-4 md:p-4">
                <EmptyHeader>
                  <EmptyTitle>No recent activity</EmptyTitle>
                  <EmptyDescription>Finished messages will appear here.</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </ScrollArea>
      </section>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_auto_minmax(0,1fr)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const trigger = inspectionTrigger.current;
            if (trigger?.isConnected) trigger.focus();
            else document.getElementById('replies-toggle')?.focus();
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
                kind={
                  selected.id === queue?.activeId
                    ? 'current'
                    : queue?.waitingIds.includes(selected.id)
                      ? 'waiting'
                      : 'past'
                }
              />
              <div className="flex min-h-0 flex-col gap-6 overflow-y-auto overscroll-contain">
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium text-muted-foreground">Question</h2>
                  <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                    {selected.question}
                  </p>
                </section>
                <section className="flex flex-col gap-2">
                  <h2 className="text-sm font-medium text-muted-foreground">
                    {selected.characterName}’s reply
                  </h2>
                  <p className="whitespace-pre-wrap break-words text-base leading-relaxed">
                    {selected.dialogue ?? 'No reply yet.'}
                  </p>
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
