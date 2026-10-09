// Throwaway review: one message feed, with a stronger current-response hierarchy.
// Charcoal/coral, Outfit headings, plain queue rows, persistent playback controls.
// [controls] [current transcript] [upcoming questions] [recent transcripts]
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AudioLines, Pause, Play, Settings, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
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
    <Badge variant={entry.kind === 'current' ? 'speaking' : 'quiet'}>
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
      <p className={cn('question', hasResponse && 'context-question')}>
        <span className="viewer">{entry.viewer}</span>{' '}
        <span className="question-text">{entry.question}</span>
      </p>
      {hasResponse ? (
        <div className="response">
          <span className="speaker">Tyrone</span>
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
      {entry.kind !== 'waiting' ? (
        <div className="entry-meta">
          <Status entry={entry} />
          <time>{entry.time}</time>
        </div>
      ) : null}
      {entry.kind === 'waiting' ? (
        <div className="waiting-meta">
          <Status entry={entry} />
          <time>{entry.time}</time>
        </div>
      ) : null}
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
  function reset() {
    setSession({ current: sampleCurrent, waiting: sampleWaiting, history: sampleHistory });
    setPaused(false);
    setMuted(false);
    setVolume(80);
    setNotice('Samples reset.');
  }
  return (
    <>
      <div className="review-note">
        <span>Design preview · Sample messages, no audio</span>
        <button onClick={reset}>Reset samples</button>
      </div>
      <main className="utility">
        <Controls model={model} />
        <div className="message-feed">
          {current ? (
            <FeedEntry
              entry={{ ...current, kind: 'current', status: paused ? 'Paused' : 'Speaking' }}
              model={model}
            />
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{paused ? 'Playback paused' : 'All caught up'}</EmptyTitle>
                <EmptyDescription>
                  {paused
                    ? 'Resume when you’re ready for the next message.'
                    : 'New messages will appear here.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
          {waiting.length ? (
            <section className="upcoming" aria-labelledby="upcoming-heading">
              <h2 id="upcoming-heading" className="feed-heading">
                Up next
              </h2>
              {waiting.map((entry, i) => (
                <FeedEntry
                  key={entry.id}
                  entry={{ ...entry, kind: 'waiting', status: i === 0 ? 'Next' : 'Waiting' }}
                  model={model}
                />
              ))}
            </section>
          ) : null}
          {history.length ? (
            <section className="history" aria-labelledby="history-heading">
              <h2 id="history-heading" className="feed-heading">
                Earlier
              </h2>
              {history.map((entry) => (
                <FeedEntry
                  key={entry.id}
                  entry={{ ...entry, kind: 'past', status: entry.outcome ?? 'Answered' }}
                  model={model}
                />
              ))}
            </section>
          ) : null}
        </div>
        <div className="footer-status" role="status">
          {notice}
        </div>
      </main>
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
