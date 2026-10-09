// Throwaway review: questions lead; current/queue stay fixed; only history scrolls.
// Charcoal/coral, distinct live and history surfaces, readable section headings.
// [controls] [current question + reply preview] [upcoming] [scrolling history]
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AudioLines,
  History,
  ListOrdered,
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
type Entry = Message & { kind: 'current' | 'waiting' | 'past'; status: string };
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
type Model = {
  current: Message | null;
  paused: boolean;
  muted: boolean;
  volume: number;
  skip: () => void;
  togglePause: () => void;
  toggleMute: () => void;
  setVolume: (n: number) => void;
  remove: (id: number) => void;
};

function Controls({ model }: { model: Model }) {
  return (
    <header className="controls">
      <div className="title-row">
        <h1>Messages</h1>
        <Button
          variant="ghost"
          size="icon"
          disabled
          title="Configuration is outside this prototype"
          aria-label="Settings (unavailable in prototype)"
        >
          <Settings data-icon="inline-start" />
        </Button>
      </div>
      <div className="transport">
        <Button onClick={model.skip} disabled={!model.current}>
          <SkipForward data-icon="inline-start" />
          Skip current
        </Button>
        <Button variant="outline" onClick={model.togglePause} aria-pressed={model.paused}>
          {model.paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
          {model.paused ? 'Resume' : 'Pause'}
        </Button>
        <div className="volume">
          <Button
            variant="ghost"
            size="icon"
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
          <span className="volume-value">{model.muted ? 'Muted' : model.volume + '%'}</span>
        </div>
      </div>
    </header>
  );
}

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

function Transcript({ entry }: { entry: Entry }) {
  const hasResponse = entry.kind !== 'waiting' && !!entry.response;
  return (
    <div className="transcript">
      <p className="question" title={entry.kind !== 'past' ? entry.question : undefined}>
        {entry.question}
      </p>
      {hasResponse ? (
        <div className="response">
          <span className="speaker">Tyrone’s reply</span>
          <p className="spoken-response">{entry.response}</p>
        </div>
      ) : null}
    </div>
  );
}

function FeedEntry({ entry, model }: { entry: Entry; model: Model }) {
  return (
    <article
      className={cn('feed-entry', entry.kind + '-entry')}
      aria-label={entry.status + ': ' + entry.viewer}
    >
      <div className="entry-meta">
        <span className="viewer">{entry.viewer}</span>
        <span className="destination">to Tyrone</span>
        <time>{entry.time}</time>
        {entry.kind !== 'current' ? <Status entry={entry} /> : null}
      </div>
      <Transcript entry={entry} />
      {entry.kind === 'waiting' ? (
        <Button
          variant="ghost"
          size="icon"
          className="remove"
          onClick={() => model.remove(entry.id)}
          title={'Remove question from ' + entry.viewer}
          aria-label={'Remove question from ' + entry.viewer}
        >
          <X data-icon="inline-start" />
        </Button>
      ) : null}
    </article>
  );
}

function App() {
  const [session, setSession] = useState({
    current: sampleCurrent as Message | null,
    waiting: sampleWaiting,
    history: sampleHistory,
  });
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [notice, setNotice] = useState('');
  const { current, waiting, history } = session;
  const model: Model = {
    current,
    paused,
    muted,
    volume,
    setVolume,
    skip: () => {
      setSession((s) =>
        s.current
          ? {
              current: s.waiting[0] ?? null,
              waiting: s.waiting.slice(1),
              history: [{ ...s.current, outcome: 'Skipped' }, ...s.history],
            }
          : s,
      );
      setNotice('Current message skipped.');
    },
    togglePause: () => {
      setPaused((p) => !p);
      setNotice(paused ? 'Playback resumed.' : 'Playback and queue paused.');
    },
    toggleMute: () => {
      setMuted((m) => !m);
      setNotice(muted ? 'Audio unmuted.' : 'Audio muted.');
    },
    remove: (id) => {
      setSession((s) => {
        const removed = s.waiting.find((entry) => entry.id === id);
        return removed
          ? {
              ...s,
              waiting: s.waiting.filter((entry) => entry.id !== id),
              history: [{ ...removed, response: '', outcome: 'Removed' }, ...s.history],
            }
          : s;
      });
      setNotice('Question removed from the queue.');
    },
  };
  return (
    <main className="utility">
      <Controls model={model} />
      <section className="now-playing" aria-labelledby="current-heading">
        <div className="section-header">
          <h2 id="current-heading">Now playing</h2>
          {current ? (
            <Status
              entry={{ ...current, kind: 'current', status: paused ? 'Paused' : 'Speaking' }}
            />
          ) : null}
        </div>
        {current ? (
          <FeedEntry
            entry={{ ...current, kind: 'current', status: paused ? 'Paused' : 'Speaking' }}
            model={model}
          />
        ) : (
          <div className="queue-empty">
            <p>{paused ? 'Playback paused' : 'All caught up'}</p>
            <span>
              {paused
                ? 'Resume when you’re ready for new messages.'
                : 'New questions will appear here.'}
            </span>
          </div>
        )}
      </section>
      <section className="upcoming" aria-labelledby="upcoming-heading">
        <div className="section-header">
          <h2 id="upcoming-heading">
            <ListOrdered aria-hidden="true" />
            Up next
          </h2>
        </div>
        {waiting.length ? (
          waiting.map((entry, i) => (
            <FeedEntry
              key={entry.id}
              entry={{ ...entry, kind: 'waiting', status: i === 0 ? 'Next' : 'Waiting' }}
              model={model}
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
          {history.map((entry) => (
            <FeedEntry
              key={entry.id}
              entry={{ ...entry, kind: 'past', status: entry.outcome ?? 'Answered' }}
              model={model}
            />
          ))}
        </div>
      </section>
      <div className="sr-only" role="status">
        {notice}
      </div>
    </main>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
