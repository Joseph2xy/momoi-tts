// Throwaway review: three Activity layouts with shared synthetic data and no backend calls.
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AudioLines,
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  Pause,
  Play,
  SkipForward,
  Settings,
  Volume2,
  VolumeX,
  X,
  Radio,
} from 'lucide-react';
import { Button } from './components/ui/button';
import { Badge } from './components/ui/badge';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from './components/ui/empty';
import './style.css';

type Message = { id: number; viewer: string; question: string; response: string; outcome?: string };
type Variant = 'compact' | 'dashboard' | 'adaptive';
const variants: Variant[] = ['compact', 'dashboard', 'adaptive'];
const names = {
  compact: 'Compact panel',
  dashboard: 'Wider dashboard',
  adaptive: 'Adaptive panel',
};
const sampleCurrent: Message = {
  id: 1,
  viewer: 'pixelpilot',
  question: 'How do I stop tilting after a losing streak?',
  response:
    'First, step away from the queue. You’re not getting those points back by arguing with your monitor. Get some water, reset, and play the next match like it’s the first one. One good decision at a time.',
};
const sampleWaiting: Message[] = [
  {
    id: 2,
    viewer: 'lunarfox',
    question: 'What’s your advice for someone new to ranked?',
    response:
      'Pick one thing to improve each match. You don’t need to master everything today. Learn your role, watch your mistakes, and give yourself time.',
  },
  {
    id: 3,
    viewer: 'itsmilo',
    question: 'Is a warm-up actually worth it?',
    response:
      'A short warm-up helps. Just don’t turn it into a two-hour excuse to avoid playing. Get comfortable, then get in there.',
  },
];
const sampleHistory: Message[] = [
  {
    id: 4,
    viewer: 'joeyplays',
    question: 'Should I solo queue or find a duo?',
    response:
      'A good duo makes the game easier to enjoy. Solo queue teaches you to adapt. Try both, and stick with whichever keeps you playing thoughtfully.',
    outcome: 'Answered',
  },
  {
    id: 5,
    viewer: 'mintbyte',
    question: 'What’s the best way to learn a new character?',
    response:
      'Learn the basics in practice, then play real matches. Keep your goals small and stop changing characters every time you lose.',
    outcome: 'Answered',
  },
  {
    id: 6,
    viewer: 'orbit',
    question: 'Rate my terrible aim out of ten.',
    response: '',
    outcome: 'Skipped',
  },
];
function urlVariant(): Variant {
  const value = new URLSearchParams(location.search).get('variant');
  return variants.includes(value as Variant) ? (value as Variant) : 'compact';
}
type Model = {
  current: Message | null;
  waiting: Message[];
  history: Message[];
  paused: boolean;
  muted: boolean;
  volume: number;
  skip: () => void;
  togglePause: () => void;
  toggleMute: () => void;
  setVolume: (n: number) => void;
  remove: (id: number) => void;
};

function Header() {
  return (
    <header className="app-header">
      <div className="wordmark">
        <span className="mark">
          <AudioLines size={23} strokeWidth={1.8} />
        </span>
        Stream controls
      </div>
      <nav aria-label="Application">
        <span className="audio-status">Audio in this tab</span>
        <Button
          variant="ghost"
          size="icon"
          disabled
          title="Settings are outside this layout prototype"
          aria-label="Settings (unavailable in prototype)"
        >
          <Settings data-icon="inline-start" />
        </Button>
      </nav>
    </header>
  );
}
function Transport({ model }: { model: Model }) {
  return (
    <div className="transport">
      <Button onClick={model.skip} disabled={!model.current}>
        <SkipForward data-icon="inline-start" />
        Skip current
      </Button>
      <Button variant="outline" onClick={model.togglePause} aria-pressed={model.paused}>
        {model.paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
        {model.paused ? 'Resume' : 'Pause'}
      </Button>
      <div className="volume-control">
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
          aria-label="Playback volume"
          type="range"
          min="0"
          max="100"
          value={model.volume}
          onChange={(e) => model.setVolume(Number(e.target.value))}
        />
      </div>
    </div>
  );
}
function Current({ model, controls = true }: { model: Model; controls?: boolean }) {
  return (
    <>
      <div className="meta">
        <div className="identity">
          <span className="character-name">Tyrone</span>
          <span>{model.current ? model.current.viewer : 'No current question'}</span>
        </div>
        <Badge variant="secondary">
          {!model.current ? 'Idle' : model.paused ? 'Paused' : 'Speaking'}
        </Badge>
      </div>
      {model.current ? (
        <>
          <h2 className="current-question">{model.current.question}</h2>
          <div className="current-response">
            <div className="response-label">Response</div>
            <p>{model.current.response}</p>
          </div>
          <div className="progress-row">
            <progress max="32" value="12" aria-label="Sample speech progress" />
            <span>0:12 / 0:32</span>
          </div>
        </>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Waiting for questions</EmptyTitle>
            <EmptyDescription>New questions will appear here.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
      {controls ? <Transport model={model} /> : null}
    </>
  );
}
function Waiting({ model }: { model: Model }) {
  return (
    <section className="waiting-section" aria-label="Waiting questions">
      <div className="section-title">
        <h2>
          Up next<span className="count">{model.waiting.length} waiting</span>
        </h2>
      </div>
      <div className="queue-list">
        {model.waiting.map((entry) => (
          <article className="queue-row" key={entry.id}>
            <div className="queue-copy">
              <div className="queue-meta">
                <span className="character-name">Tyrone</span>
                <span>{entry.viewer}</span>
              </div>
              <p className="queue-question">{entry.question}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => model.remove(entry.id)}
              aria-label={`Remove question from ${entry.viewer}`}
            >
              <X data-icon="inline-start" />
            </Button>
          </article>
        ))}
      </div>
      {!model.waiting.length ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No waiting questions</EmptyTitle>
            <EmptyDescription>The queue is clear.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </section>
  );
}
function History({ model }: { model: Model }) {
  return (
    <section className="history-section" id="recent-activity" aria-label="Recent activity">
      <div className="section-title">
        <h2>
          Recent activity<span className="count">{model.history.length}</span>
        </h2>
        <span className="text-muted-foreground text-xs">This session</span>
      </div>
      {model.history.map((entry, i) => (
        <details className="history-row" key={entry.id}>
          <summary>
            <div>
              <div className="history-meta">
                <span>Tyrone</span>
                <span>{entry.viewer}</span>
                <span className={entry.outcome === 'Answered' ? 'outcome' : 'outcome skipped'}>
                  {entry.outcome}
                </span>
                <span>{i + 1}m ago</span>
              </div>
              <div className="queue-question">{entry.question}</div>
            </div>
            <ChevronRight size={15} aria-hidden="true" />
          </summary>
          <p>{entry.response || 'This question was skipped before a response was completed.'}</p>
        </details>
      ))}
    </section>
  );
}
function Footer() {
  return (
    <div className="foot-status">
      <Radio size={14} aria-hidden="true" />
      <span>Demo mode</span>
      <span>Synthetic messages · no audio</span>
    </div>
  );
}
function VariantA({ model }: { model: Model }) {
  return (
    <main className="compact-shell">
      <Header />
      <div className="head-row">
        <h1>Activity</h1>
        <span className="text-muted-foreground text-xs">Current playback</span>
      </div>
      <section className="compact-current" aria-label="Current message">
        <Current model={model} />
      </section>
      <Waiting model={model} />
      <History model={model} />
      <Footer />
    </main>
  );
}
function VariantB({ model }: { model: Model }) {
  return (
    <main className="dashboard-shell">
      <Header />
      <div className="head-row">
        <div>
          <h1>Activity</h1>
          <p className="text-muted-foreground text-sm mt-2">
            A quick view of what’s playing and what’s next.
          </p>
        </div>
        <Badge variant="outline">{model.paused ? 'Queue paused' : 'Queue running'}</Badge>
      </div>
      <div className="dashboard-grid">
        <div>
          <section className="dashboard-current" aria-label="Current message">
            <Current model={model} />
          </section>
          <Waiting model={model} />
        </div>
        <div className="dashboard-history">
          <History model={model} />
        </div>
      </div>
      <Footer />
    </main>
  );
}
function VariantC({ model }: { model: Model }) {
  return (
    <main className="adaptive-shell">
      <Header />
      <nav className="adaptive-nav" aria-label="Activity sections">
        <button className="active" aria-current="page">
          Activity
        </button>
        <button
          onClick={() =>
            document.getElementById('recent-activity')?.scrollIntoView({ block: 'start' })
          }
        >
          Recent activity
        </button>
      </nav>
      <div className="head-row">
        <h1>Right now</h1>
        <span className="audio-status">{model.paused ? 'Queue paused' : 'Queue running'}</span>
      </div>
      <div className="adaptive-grid">
        <section className="adaptive-current" aria-label="Current message">
          <Current model={model} controls={false} />
        </section>
        <Waiting model={model} />
      </div>
      <div className="adaptive-player">
        <div className="player-caption">
          <strong>{model.current ? 'Tyrone' : 'No current message'}</strong>
          {model.paused ? 'Playback paused' : 'Playback controls'}
        </div>
        <Transport model={model} />
      </div>
      <History model={model} />
      <Footer />
    </main>
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
      if (
        (e.target as HTMLElement).closest(
          'input, textarea, select, button, summary, [contenteditable]',
        )
      )
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
  const model: Model = {
    current,
    waiting,
    history,
    paused,
    muted,
    volume,
    setVolume,
    skip: () => {
      if (!current) return;
      setHistory((h) => [{ ...current, outcome: 'Skipped' }, ...h]);
      setCurrent(waiting[0] ?? null);
      setWaiting((q) => q.slice(1));
      setNotice('Current question skipped. Sample queue advanced.');
    },
    togglePause: () => {
      setPaused((p) => !p);
      setNotice(paused ? 'Sample queue resumed.' : 'Sample queue paused.');
    },
    toggleMute: () => {
      setMuted((m) => !m);
      setNotice(muted ? 'Sample audio unmuted.' : 'Sample audio muted.');
    },
    remove: (id) => {
      setWaiting((q) => q.filter((e) => e.id !== id));
      setNotice('Waiting question removed from the sample queue.');
    },
  };
  function reset() {
    setCurrent(sampleCurrent);
    setWaiting(sampleWaiting);
    setHistory(sampleHistory);
    setPaused(false);
    setMuted(false);
    setVolume(80);
    setNotice('Sample messages restored.');
  }
  return (
    <>
      <div className="review-note">
        <span>
          <strong>Layout prototype</strong> · Sample data and simulated controls
        </span>
        <button onClick={reset}>Reset samples</button>
      </div>
      {variant === 'compact' ? (
        <VariantA model={model} />
      ) : variant === 'dashboard' ? (
        <VariantB model={model} />
      ) : (
        <VariantC model={model} />
      )}
      <div className="announcement" role="status" hidden={!notice}>
        {notice}
      </div>
      {import.meta.env.DEV ? (
        <nav className="switcher" aria-label="Compare layouts">
          <span className="switcher-title">Compare layouts</span>
          <button className="cycle" onClick={() => cycle(-1)} aria-label="Previous layout">
            <ArrowLeft size={16} />
          </button>
          {variants.map((value, i) => (
            <button
              key={value}
              onClick={() => choose(value)}
              aria-pressed={variant === value}
              title={names[value]}
            >
              {['A · Compact', 'B · Dashboard', 'C · Adaptive'][i]}
            </button>
          ))}
          <button className="cycle" onClick={() => cycle(1)} aria-label="Next layout">
            <ArrowRight size={16} />
          </button>
        </nav>
      ) : null}
    </>
  );
}
createRoot(document.getElementById('root')!).render(<App />);
