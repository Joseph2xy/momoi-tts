// Throwaway review: a transcript feed versus a selectable list with an inspector.
// Same charcoal/coral palette, compact Outfit heading, plain rows, fixed transport.
// Feed: [controls] [current / waiting / previous transcripts].
// Inspector: [controls] [selectable messages | one selected transcript].
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Pause,
  Play,
  Settings,
  SkipForward,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from './components/ui/empty';
import { cn } from './lib/utils';
import './style.css';

type Message = {
  id: number;
  viewer: string;
  question: string;
  response: string;
  time: string;
  outcome?: string;
};
type Variant = 'feed' | 'inspector';
type Entry = Message & { kind: 'current' | 'waiting' | 'past'; status: string };
const variants: Variant[] = ['feed', 'inspector'];
const sampleCurrent: Message = {
  id: 1,
  viewer: 'pixelpilot',
  time: '14:32',
  question: 'How do I stop tilting after a losing streak?',
  response:
    'First, step away from the queue. You’re not getting those points back by arguing with your monitor. Get some water, reset, and play the next match like it’s the first one. One good decision at a time.',
};
const sampleWaiting: Message[] = [
  {
    id: 2,
    viewer: 'lunarfox',
    time: '14:32',
    question: 'What’s your advice for someone new to ranked?',
    response:
      'Pick one thing to improve each match. You don’t need to master everything today. Learn your role, watch your mistakes, and give yourself time.',
  },
  {
    id: 3,
    viewer: 'itsmilo',
    time: '14:31',
    question: 'Is a warm-up actually worth it?',
    response:
      'A short warm-up helps. Just don’t turn it into a two-hour excuse to avoid playing. Get comfortable, then get in there.',
  },
];
const sampleHistory: Message[] = [
  {
    id: 4,
    viewer: 'joeyplays',
    time: '14:30',
    question: 'Should I solo queue or find a duo?',
    response:
      'A good duo makes the game easier to enjoy. Solo queue teaches you to adapt. Try both, and stick with whichever keeps you playing thoughtfully.',
    outcome: 'Answered',
  },
  {
    id: 5,
    viewer: 'mintbyte',
    time: '14:29',
    question: 'What’s the best way to learn a new character?',
    response:
      'Learn the basics in practice, then play real matches. Keep your goals small and stop changing characters every time you lose.',
    outcome: 'Answered',
  },
  {
    id: 6,
    viewer: 'orbit',
    time: '14:28',
    question: 'Rate my terrible aim out of ten.',
    response: '',
    outcome: 'Skipped',
  },
];
function urlVariant(): Variant {
  return new URLSearchParams(location.search).get('variant') === 'inspector' ? 'inspector' : 'feed';
}
type Model = {
  current: Message | null;
  entries: Entry[];
  paused: boolean;
  muted: boolean;
  volume: number;
  skip: () => void;
  togglePause: () => void;
  toggleMute: () => void;
  setVolume: (n: number) => void;
  remove: (id: number) => void;
};
function Status({ entry }: { entry: Entry }) {
  return (
    <Badge
      variant={
        entry.kind === 'current' ? 'speaking' : entry.status === 'Answered' ? 'complete' : 'quiet'
      }
    >
      {entry.kind === 'current' && entry.status === 'Speaking' ? (
        <AudioLines aria-hidden="true" />
      ) : null}
      {entry.status}
    </Badge>
  );
}
function Controls({ model }: { model: Model }) {
  return (
    <header className="controls">
      <div className="title-row">
        <h1>Messages</h1>
        <span className="playback-state">
          {model.current
            ? model.paused
              ? 'Paused'
              : 'Speaking'
            : model.paused
              ? 'Paused'
              : 'Waiting for messages'}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled
          title="Configuration is outside this prototype"
          aria-label="Settings (unavailable in prototype)"
        >
          <Settings data-icon="inline-start" />
        </Button>
      </div>
      <div className="transport">
        <Button size="sm" onClick={model.skip} disabled={!model.current}>
          <SkipForward data-icon="inline-start" />
          Skip current
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={model.togglePause}
          aria-pressed={model.paused}
        >
          {model.paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
          {model.paused ? 'Resume' : 'Pause'}
        </Button>
        <div className="volume">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={model.toggleMute}
            aria-pressed={model.muted}
            aria-label={model.muted ? 'Unmute' : 'Mute'}
          >
            {model.muted ? (
              <VolumeX data-icon="inline-start" />
            ) : (
              <Volume2 data-icon="inline-start" />
            )}
          </Button>
          <input
            type="range"
            aria-label="Playback volume"
            min="0"
            max="100"
            value={model.volume}
            onChange={(e) => model.setVolume(Number(e.target.value))}
          />
        </div>
        <span className="transport-note">{model.muted ? 'Muted' : 'Audio in this tab'}</span>
      </div>
      {model.current ? <progress max="32" value="12" aria-label="Sample speech progress" /> : null}
    </header>
  );
}
function Remove({ entry, model }: { entry: Entry; model: Model }) {
  return entry.kind === 'waiting' ? (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => model.remove(entry.id)}
      aria-label={`Remove question from ${entry.viewer}`}
    >
      <X data-icon="inline-start" />
    </Button>
  ) : null;
}
function Identity({ entry }: { entry: Entry }) {
  return (
    <span className="identity">
      <span className="viewer">{entry.viewer}</span>
      <span className="destination">to Tyrone</span>
    </span>
  );
}
function Transcript({ entry }: { entry: Entry }) {
  const hasResponse = entry.kind !== 'waiting' && !!entry.response;
  return (
    <div className="transcript">
      <p className={cn('question', hasResponse && 'context-question')}>{entry.question}</p>
      {hasResponse ? <p className="spoken-response">{entry.response}</p> : null}
    </div>
  );
}
function VariantA({ model }: { model: Model }) {
  return (
    <div className="message-feed" aria-label="Message feed">
      {model.entries.map((entry) => (
        <article
          className={cn('feed-entry', entry.kind === 'current' && 'current-entry')}
          key={entry.id}
        >
          <div className="entry-meta">
            <Identity entry={entry} />
            <Status entry={entry} />
            <time>{entry.time}</time>
            <Remove entry={entry} model={model} />
          </div>
          <Transcript entry={entry} />
        </article>
      ))}
    </div>
  );
}
function VariantB({
  model,
  selectedId,
  select,
}: {
  model: Model;
  selectedId: number | null;
  select: (id: number) => void;
}) {
  const selected = model.entries.find((entry) => entry.id === selectedId) ?? model.entries[0];
  return (
    <div className="inspector-layout">
      <div className="message-list" aria-label="Select a message">
        {model.entries.map((entry) => (
          <article
            className={cn(
              'list-entry',
              entry.kind === 'current' && 'current-entry',
              entry.id === selected?.id && 'selected-entry',
            )}
            key={entry.id}
          >
            <Button
              variant="message"
              size="message"
              onClick={() => select(entry.id)}
              aria-pressed={entry.id === selected?.id}
              aria-label={`Review message from ${entry.viewer}`}
              aria-controls="message-detail"
            >
              <span className="list-meta">
                <Identity entry={entry} />
                <Status entry={entry} />
              </span>
              <span className="message-preview">
                {entry.kind !== 'waiting' && entry.response ? entry.response : entry.question}
              </span>
              <time>{entry.time}</time>
            </Button>
            <Remove entry={entry} model={model} />
          </article>
        ))}
      </div>
      <aside id="message-detail" className="inspector" aria-label="Selected message">
        {selected ? (
          <>
            <div className="inspector-meta">
              <Identity entry={selected} />
              <Status entry={selected} />
            </div>
            <div className="detail-body">
              {selected.kind !== 'waiting' && selected.response ? (
                <>
                  <p className="detail-label">Tyrone’s response</p>
                  <p className="detail-response">{selected.response}</p>
                  <p className="detail-label question-label">Viewer’s question</p>
                  <p className="detail-question">{selected.question}</p>
                </>
              ) : (
                <>
                  <p className="detail-label">Viewer’s question</p>
                  <p className="detail-response">{selected.question}</p>
                  <p className="detail-note">
                    {selected.kind === 'waiting'
                      ? 'Waiting for a response.'
                      : 'No response was completed.'}
                  </p>
                </>
              )}
              <time className="detail-time">{selected.time}</time>
            </div>
          </>
        ) : null}
      </aside>
    </div>
  );
}
function App() {
  const [variant, setVariant] = useState(urlVariant);
  const [current, setCurrent] = useState<Message | null>(sampleCurrent);
  const [waiting, setWaiting] = useState(sampleWaiting);
  const [history, setHistory] = useState(sampleHistory);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [selectedId, setSelectedId] = useState<number | null>(sampleCurrent.id);
  const [notice, setNotice] = useState('');
  function choose(value: Variant) {
    const url = new URL(location.href);
    url.searchParams.set('variant', value);
    window.history.replaceState(null, '', url);
    setVariant(value);
    setNotice('');
  }
  function cycle(step: number) {
    choose(variants[(variants.indexOf(variant) + step + variants.length) % variants.length]!);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, button, [contenteditable]'))
        return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        e.preventDefault();
        cycle(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    const onBack = () => setVariant(urlVariant());
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onBack);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onBack);
    };
  }, [variant]);
  const entries: Entry[] = [
    ...(current
      ? [{ ...current, kind: 'current' as const, status: paused ? 'Paused' : 'Speaking' }]
      : []),
    ...waiting.map((entry, i) => ({
      ...entry,
      kind: 'waiting' as const,
      status: i === 0 ? 'Next' : 'Waiting',
    })),
    ...history.map((entry) => ({
      ...entry,
      kind: 'past' as const,
      status: entry.outcome ?? 'Answered',
    })),
  ];
  const model: Model = {
    current,
    entries,
    paused,
    muted,
    volume,
    setVolume,
    skip: () => {
      if (!current) return;
      setHistory((h) => [{ ...current, outcome: 'Skipped' }, ...h]);
      setCurrent(waiting[0] ?? null);
      setWaiting((q) => q.slice(1));
      if (selectedId === current.id) setSelectedId(waiting[0]?.id ?? current.id);
      setNotice('Skipped.');
    },
    togglePause: () => {
      setPaused((p) => !p);
      setNotice(paused ? 'Resumed.' : 'Paused.');
    },
    toggleMute: () => {
      setMuted((m) => !m);
      setNotice(muted ? 'Unmuted.' : 'Muted.');
    },
    remove: (id) => {
      const removed = waiting.find((entry) => entry.id === id);
      setWaiting((q) => q.filter((entry) => entry.id !== id));
      if (removed) setHistory((h) => [{ ...removed, response: '', outcome: 'Removed' }, ...h]);
      setNotice('Removed from the queue.');
    },
  };
  function reset() {
    setCurrent(sampleCurrent);
    setWaiting(sampleWaiting);
    setHistory(sampleHistory);
    setPaused(false);
    setMuted(false);
    setVolume(80);
    setSelectedId(sampleCurrent.id);
    setNotice('Samples reset.');
  }
  return (
    <>
      <div className="review-note">
        <span>Prototype · Simulated messages, no audio</span>
        <button onClick={reset}>Reset samples</button>
      </div>
      <main className={cn('utility', variant === 'feed' ? 'feed-utility' : 'inspector-utility')}>
        <Controls model={model} />
        {variant === 'feed' ? (
          <VariantA model={model} />
        ) : (
          <VariantB model={model} selectedId={selectedId} select={setSelectedId} />
        )}
        {!current && !waiting.length ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Queue clear</EmptyTitle>
              <EmptyDescription>Recent messages stay available above.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
        <div className="footer-status" role="status">
          {notice || 'Sample session'}
        </div>
      </main>
      {import.meta.env.DEV ? (
        <nav className="switcher" aria-label="Compare layouts">
          <button className="cycle" onClick={() => cycle(-1)} aria-label="Previous layout">
            <ArrowLeft size={15} />
          </button>
          {variants.map((value, i) => (
            <button key={value} onClick={() => choose(value)} aria-pressed={variant === value}>
              {['A · Message feed', 'B · List & detail'][i]}
            </button>
          ))}
          <button className="cycle" onClick={() => cycle(1)} aria-label="Next layout">
            <ArrowRight size={15} />
          </button>
        </nav>
      ) : null}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
