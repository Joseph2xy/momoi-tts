// Throwaway whole-app UX exploration. Synthetic state only; no backend or audio owner.
import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowLeft,
  ArrowRight,
  AudioLines,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  FlaskConical,
  Headphones,
  History,
  LayoutDashboard,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Search,
  Settings2,
  SkipForward,
  SlidersHorizontal,
  Square,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import './style.css';

type Variant = 'A' | 'B' | 'C';
type Page = 'live' | 'prepare' | 'test';
type Question = {
  id: number;
  viewer: string;
  question: string;
  reply: string;
  time: string;
  outcome?: 'Spoken' | 'Skipped' | 'Failed';
};
const examples: Question[] = [
  {
    id: 1,
    viewer: 'pixelpilot',
    question: 'How do I stop tilting after losing three ranked games in a row?',
    reply:
      'First, get up from that chair. Drink some water. Your next match is not a revenge mission. Come back when you can play the game in front of you, instead of arguing with the last one.',
    time: '14:32',
  },
  {
    id: 2,
    viewer: 'mossbyte',
    question: 'Be honest. Is blaming my teammates ever justified?',
    reply:
      'Sure. But being right about your teammates will not make your aim any better. Fix the part you can control.',
    time: '14:33',
  },
  {
    id: 3,
    viewer: 'lunar_lo',
    question: 'What would you tell someone playing their first competitive match?',
    reply:
      'You are allowed to be new. Listen, make a call, and learn one thing. Nobody arrived here knowing everything.',
    time: '14:33',
  },
];
const recent: Question[] = [
  {
    id: 4,
    viewer: 'jaywalks',
    question: 'What’s the secret to actually getting better?',
    reply: 'Pick one thing to work on. Do it badly until you do it well. Then pick the next thing.',
    time: '14:30',
    outcome: 'Spoken',
  },
  {
    id: 5,
    viewer: 'softreset',
    question: 'Roast my six-hour warm-up routine.',
    reply: 'That is not a warm-up. That is a full-time job with no benefits.',
    time: '14:28',
    outcome: 'Spoken',
  },
  {
    id: 6,
    viewer: 'no_scope',
    question: 'Can you settle an argument for us?',
    reply: '',
    time: '14:27',
    outcome: 'Skipped',
  },
];
const directions: Record<Variant, { name: string; detail: string }> = {
  A: { name: 'Studio desk', detail: 'A dedicated workspace for running the stream.' },
  B: { name: 'Focus view', detail: 'One question in focus. Everything else steps back.' },
  C: { name: 'Operator view', detail: 'A compact activity ledger with a persistent control dock.' },
};

function App() {
  const initial = new URLSearchParams(location.search).get('variant');
  const [variant, setVariant] = useState<Variant>(
    initial === 'B' || initial === 'C' ? initial : 'A',
  );
  const [page, setPage] = useState<Page>('live');
  const [current, setCurrent] = useState<Question | null>(examples[0]!);
  const [waiting, setWaiting] = useState<Question[]>(examples.slice(1));
  const [history, setHistory] = useState<Question[]>(recent);
  const [paused, setPaused] = useState(false);
  const [volume, setVolume] = useState(75);
  const [muted, setMuted] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState('');
  const [scene, setScene] = useState('busy');
  const [setupTab, setSetupTab] = useState('character');
  const [draftVolume, setDraftVolume] = useState(75);
  const [savedVolume, setSavedVolume] = useState(75);
  const [personality, setPersonality] = useState(
    'A blunt but supportive gaming coach. Give short, practical answers with dry humor.',
  );
  const [savedPersonality, setSavedPersonality] = useState(personality);
  const [testQuestion, setTestQuestion] = useState('How do I get better at ranked?');
  const [testReply, setTestReply] = useState('');
  const [testMode, setTestMode] = useState('response');
  const [testError, setTestError] = useState('');
  const helpDialog = useRef<HTMLDialogElement>(null);
  const stopDialog = useRef<HTMLDialogElement>(null);
  const nextId = useRef(20);

  function selectVariant(value: Variant) {
    setVariant(value);
    const url = new URL(location.href);
    url.searchParams.set('variant', value);
    globalThis.history.replaceState(null, '', url);
  }
  function cycle(delta: number) {
    const values: Variant[] = ['A', 'B', 'C'];
    selectVariant(values[(values.indexOf(variant) + delta + 3) % 3]!);
  }
  useEffect(() => {
    function keydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable], dialog[open]')) return;
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const values: Variant[] = ['A', 'B', 'C'];
        const next =
          values[(values.indexOf(variant) + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3]!;
        selectVariant(next);
      }
    }
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [variant]);

  function reset(example = 'busy') {
    setScene(example);
    setCurrent(example === 'empty' || example === 'failed' ? null : examples[0]!);
    setWaiting(example === 'empty' || example === 'failed' ? [] : examples.slice(1));
    setHistory(
      example === 'failed'
        ? [{ ...examples[0]!, outcome: 'Failed', reply: '' }, ...recent]
        : recent,
    );
    setPaused(example === 'paused' || example === 'failed');
    setNotice('');
    setTestError('');
  }
  function finish(outcome: 'Spoken' | 'Skipped') {
    if (!current) return;
    setHistory([{ ...current, outcome }, ...history].slice(0, 30));
    setCurrent(waiting[0] ?? null);
    setWaiting(waiting.slice(1));
    setNotice(
      outcome === 'Skipped'
        ? 'Question skipped. The next question is ready.'
        : 'Example reply finished. The next question is ready.',
    );
  }
  function remove(id: number) {
    setWaiting(waiting.filter((entry) => entry.id !== id));
    setNotice('Waiting question removed.');
  }
  function stop() {
    setHistory(
      [
        ...([current, ...waiting].filter(Boolean) as Question[]).map((entry) => ({
          ...entry,
          outcome: 'Skipped' as const,
        })),
        ...history,
      ].slice(0, 30),
    );
    setCurrent(null);
    setWaiting([]);
    setPaused(true);
    setNotice('Playback stopped and waiting questions cleared.');
    stopDialog.current?.close();
  }
  function addTest() {
    if (!testQuestion.trim()) {
      setTestError('Enter a question first.');
      return;
    }
    if (testMode === 'response') {
      setTestReply(examples[0]!.reply);
      setTestError('');
      return;
    }
    if (waiting.length >= 2) {
      setTestError('The two waiting places are full. Remove or finish a question first.');
      return;
    }
    const entry: Question = {
      id: nextId.current++,
      viewer: 'Local test',
      question: testMode === 'voice' ? 'Voice soundcheck' : testQuestion.trim(),
      reply:
        testMode === 'voice'
          ? 'This is Tyrone. Your voice is ready for the stream.'
          : examples[0]!.reply,
      time: 'Now',
    };
    if (!current) setCurrent(entry);
    else setWaiting([...waiting, entry]);
    setTestError('');
    setNotice('Sample added to the live desk.');
    setPage('live');
  }

  function transport(compact = false) {
    return (
      <div className={`transport-row${compact ? ' compact' : ''}`}>
        <Button
          variant={variant === 'B' ? 'default' : 'outline'}
          onClick={() => setPaused(!paused)}
          aria-pressed={paused}
        >
          {paused ? <Play data-icon="inline-start" /> : <Pause data-icon="inline-start" />}
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button
          variant={variant === 'B' ? 'outline' : 'default'}
          onClick={() => finish('Skipped')}
          disabled={!current}
        >
          <SkipForward data-icon="inline-start" />
          Skip question
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Stop and clear"
          title="Stop and clear"
          disabled={!current && !waiting.length}
          onClick={() => stopDialog.current?.showModal()}
        >
          <Square data-icon="inline-start" />
        </Button>
        <div className="volume-control">
          <Button
            variant="ghost"
            size="icon"
            aria-label={muted ? 'Unmute' : 'Mute'}
            aria-pressed={muted}
            onClick={() => setMuted(!muted)}
          >
            {muted ? <VolumeX data-icon="inline-start" /> : <Volume2 data-icon="inline-start" />}
          </Button>
          <input
            aria-label="Playback volume"
            type="range"
            min="0"
            max="100"
            value={volume}
            onChange={(event) => setVolume(Number(event.target.value))}
          />
          <span>{muted ? 'Muted' : `${volume}%`}</span>
        </div>
      </div>
    );
  }
  function questionSurface() {
    const QuestionHeading = variant === 'B' ? 'h1' : 'h2';
    return current ? (
      <>
        <div className="question-meta">
          <span className="viewer-icon">{current.viewer.slice(0, 1).toUpperCase()}</span>
          <span>{current.viewer}</span>
          <ChevronRight aria-hidden="true" />
          <span>asked Tyrone</span>
          <time>{current.time}</time>
        </div>
        <QuestionHeading className="current-question">{current.question}</QuestionHeading>
        <div className="character-reply">
          <div className="reply-heading">
            <span className="character-mark">T</span>
            <strong>Tyrone</strong>
            <span>{paused ? 'Reply paused' : 'Speaking'}</span>
          </div>
          <p>{current.reply}</p>
        </div>
      </>
    ) : (
      <div className="empty-stage">
        <AudioLines aria-hidden="true" />
        <h2>
          {scene === 'failed'
            ? 'This reply couldn’t be generated.'
            : paused
              ? 'Take your time.'
              : 'Ready for the next question.'}
        </h2>
        <p>
          {scene === 'failed'
            ? 'Playback is paused. Check your response setup before resuming.'
            : paused
              ? 'New work stays on hold until you resume.'
              : 'Questions and character replies will appear here.'}
        </p>
        {scene === 'failed' ? (
          <Button variant="outline" onClick={() => setPage('prepare')}>
            Review setup
          </Button>
        ) : (
          <Button variant="outline" onClick={() => setPage('test')}>
            Try a sample question
          </Button>
        )}
      </div>
    );
  }
  function progress() {
    return current ? (
      <div className="playback-progress">
        <progress aria-label="Sample speech progress" value={12} max={31} />
        <div>
          <span>{paused ? 'Paused at 0:12' : '0:12'}</span>
          <span>0:31</span>
        </div>
      </div>
    ) : null;
  }
  function queue() {
    return (
      <section className="next-panel" aria-label="Waiting questions">
        <div className="section-title">
          <h2>
            Up next <span>{waiting.length}</span>
          </h2>
          {waiting.length ? (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setWaiting([]);
                setNotice('Waiting questions cleared.');
              }}
            >
              Clear
            </Button>
          ) : null}
        </div>
        {waiting.length ? (
          waiting.map((entry, index) => (
            <article key={entry.id} className="waiting-entry">
              <span className="queue-position">{index + 1}</span>
              <div>
                <div className="waiting-meta">
                  {entry.viewer}
                  <span>Tyrone</span>
                </div>
                <p>{entry.question}</p>
              </div>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove question from ${entry.viewer}`}
                onClick={() => remove(entry.id)}
              >
                <X data-icon="inline-start" />
              </Button>
            </article>
          ))
        ) : (
          <div className="empty-queue">
            <CheckCheck aria-hidden="true" />
            <p>No questions waiting.</p>
          </div>
        )}
        <div className="queue-foot">
          <Clock3 aria-hidden="true" />
          {paused ? 'Queue on hold' : 'Questions play one at a time'}
          <span>{waiting.length} / 2</span>
        </div>
      </section>
    );
  }
  const filteredHistory = history.filter((entry) =>
    `${entry.viewer} ${entry.question} ${entry.reply}`.toLowerCase().includes(search.toLowerCase()),
  );
  function historySection() {
    return (
      <section className="recent-panel">
        <div className="section-title">
          <h2>
            Recent activity <span>{history.length}</span>
          </h2>
          <label className="history-search">
            <Search aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Find a question"
              aria-label="Search recent activity"
            />
          </label>
        </div>
        <div className="recent-list" tabIndex={0} role="region" aria-label="Recent activity">
          {filteredHistory.map((entry) => (
            <details key={entry.id} className="history-entry">
              <summary>
                <span className={`outcome ${entry.outcome?.toLowerCase()}`}>
                  {entry.outcome === 'Spoken' ? (
                    <Check aria-hidden="true" />
                  ) : entry.outcome === 'Failed' ? (
                    <CircleHelp aria-hidden="true" />
                  ) : (
                    <SkipForward aria-hidden="true" />
                  )}
                </span>
                <span className="history-content">
                  <span className="history-question">{entry.question}</span>
                  <span className="history-meta">
                    {entry.viewer}
                    <span>Tyrone</span>
                    <span>{entry.outcome}</span>
                  </span>
                </span>
                <time>{entry.time}</time>
                <ChevronDown aria-hidden="true" />
              </summary>
              <div className="history-reply">
                {entry.outcome === 'Failed'
                  ? 'Response generation failed. No audio was played.'
                  : entry.outcome === 'Skipped'
                    ? 'This question was skipped.'
                    : entry.reply}
              </div>
            </details>
          ))}
          {!filteredHistory.length ? (
            <p className="quiet-empty">
              {search ? 'No questions match your search.' : 'Finished questions will appear here.'}
            </p>
          ) : null}
        </div>
      </section>
    );
  }
  function readiness() {
    return (
      <details className="readiness">
        <summary>
          <span className="status-dot" />
          <span>Local demo ready</span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div>
          <p>
            <Check aria-hidden="true" />
            Sample character and voice
          </p>
          <p>
            <Check aria-hidden="true" />
            Simulated replies and playback
          </p>
          <p>
            <Radio aria-hidden="true" />
            Twitch isn’t connected
          </p>
          <Button variant="ghost" size="sm" onClick={() => setPage('prepare')}>
            Review stream setup
          </Button>
        </div>
      </details>
    );
  }
  function pageTitle(title: string, subtitle: string) {
    return (
      <header className="workspace-heading">
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        <Badge variant={paused ? 'quiet' : 'complete'}>
          {paused ? <Pause data-icon="inline-start" /> : <span className="status-dot" />}
          {paused ? 'Paused' : 'Running'}
        </Badge>
      </header>
    );
  }
  function studio() {
    return (
      <div className="studio-shell">
        <aside className="studio-sidebar">
          <a className="brand" href="?variant=A">
            <span className="brand-symbol">
              <AudioLines />
            </span>
            <span>
              Tyrone<small>Stream companion</small>
            </span>
          </a>
          <nav aria-label="Workspace">
            <Button
              variant={page === 'live' ? 'secondary' : 'ghost'}
              onClick={() => setPage('live')}
              aria-current={page === 'live' ? 'page' : undefined}
            >
              <LayoutDashboard data-icon="inline-start" />
              Live desk
            </Button>
            <Button
              variant={page === 'test' ? 'secondary' : 'ghost'}
              onClick={() => setPage('test')}
              aria-current={page === 'test' ? 'page' : undefined}
            >
              <Headphones data-icon="inline-start" />
              Soundcheck
            </Button>
            <Button
              variant={page === 'prepare' ? 'secondary' : 'ghost'}
              onClick={() => setPage('prepare')}
              aria-current={page === 'prepare' ? 'page' : undefined}
            >
              <SlidersHorizontal data-icon="inline-start" />
              Stream setup
            </Button>
          </nav>
          <div className="sidebar-character">
            <span className="character-mark">T</span>
            <div>
              Tyrone<small>Character loaded</small>
            </div>
          </div>
          <div className="sidebar-bottom">
            {readiness()}
            <Button variant="ghost" size="sm" onClick={() => helpDialog.current?.showModal()}>
              <CircleHelp data-icon="inline-start" />
              How this works
            </Button>
          </div>
        </aside>
        <main className="studio-workspace">
          {page === 'live' ? (
            <>
              {pageTitle('Live desk', 'Keep an eye on the conversation. Step in when you need to.')}
              <div className="studio-live-grid">
                <section className="current-panel">
                  <div className="section-title">
                    <h2>{current ? 'Current question' : 'Standing by'}</h2>
                    <Badge variant="speaking">
                      {current ? (paused ? 'On hold' : 'Speaking') : 'Ready'}
                    </Badge>
                  </div>
                  {questionSurface()}
                  <div className="current-bottom">
                    {progress()}
                    {transport()}
                  </div>
                </section>
                {queue()}
              </div>
              {historySection()}
            </>
          ) : page === 'prepare' ? (
            prepare()
          ) : (
            testing()
          )}
        </main>
      </div>
    );
  }
  function focus() {
    return (
      <div className="focus-shell">
        <header className="focus-header">
          <a className="brand" href="?variant=B">
            <span className="brand-symbol">
              <AudioLines />
            </span>
            <span>Tyrone</span>
          </a>
          <nav aria-label="Workspace">
            <Button
              variant={page === 'live' ? 'secondary' : 'ghost'}
              onClick={() => setPage('live')}
            >
              On stream
            </Button>
            <Button
              variant={page !== 'live' ? 'secondary' : 'ghost'}
              onClick={() => setPage('prepare')}
            >
              Before stream
            </Button>
          </nav>
          <Button
            variant="ghost"
            size="icon"
            aria-label="How this works"
            onClick={() => helpDialog.current?.showModal()}
          >
            <CircleHelp data-icon="inline-start" />
          </Button>
        </header>
        <main className="focus-workspace">
          {page === 'live' ? (
            <>
              <div className="focus-status">
                {readiness()}
                <Badge variant={paused ? 'quiet' : 'speaking'}>
                  {paused ? 'Playback paused' : current ? 'Tyrone is speaking' : 'Standing by'}
                </Badge>
              </div>
              <div className="focus-live-grid">
                <section className="focus-stage">
                  {questionSurface()}
                  {progress()}
                  <div className="focus-controls">{transport()}</div>
                </section>
                <aside className="focus-rail">
                  {queue()}
                  <Button variant="ghost" onClick={() => setPage('test')}>
                    <FlaskConical data-icon="inline-start" />
                    Try a sample
                  </Button>
                </aside>
              </div>
              <section className="focus-history">
                <Button
                  variant="ghost"
                  aria-expanded={showHistory}
                  onClick={() => setShowHistory(!showHistory)}
                >
                  <History data-icon="inline-start" />
                  {showHistory ? 'Hide' : 'Show'} recent activity
                  <ChevronDown data-icon="inline-end" />
                </Button>
                {showHistory ? historySection() : <span>{history.length} recent questions</span>}
              </section>
            </>
          ) : page === 'prepare' ? (
            prepare()
          ) : (
            testing()
          )}
        </main>
      </div>
    );
  }
  function operator() {
    return (
      <div className="operator-shell">
        <header className="operator-header">
          <a className="brand" href="?variant=C">
            <span className="brand-symbol">
              <AudioLines />
            </span>
            <span>Tyrone</span>
          </a>
          <span className="operator-label">Stream workspace</span>
          <div className="operator-header-actions">
            {readiness()}
            <Button
              variant="ghost"
              onClick={() => setPage(page === 'prepare' ? 'live' : 'prepare')}
            >
              <Settings2 data-icon="inline-start" />
              {page === 'prepare' ? 'Back to workspace' : 'Configure'}
            </Button>
          </div>
        </header>
        <main className="operator-workspace">
          {page === 'live' ? (
            <>
              <header className="ledger-heading">
                <div>
                  <h1>Questions</h1>
                  <p>A clear view of what’s playing, waiting, and finished.</p>
                </div>
                <Button variant="outline" onClick={() => setPage('test')}>
                  <FlaskConical data-icon="inline-start" />
                  Soundcheck
                </Button>
              </header>
              <section className="operator-current">
                <div className="operator-current-label">
                  <Badge variant="speaking">
                    {paused ? 'On hold' : current ? 'Now speaking' : 'Standing by'}
                  </Badge>
                  <span>{current ? `Tyrone replying to ${current.viewer}` : 'Tyrone'}</span>
                </div>
                {current ? (
                  <>
                    <h2 className="current-question">{current.question}</h2>
                    <details className="operator-reply">
                      <summary>
                        Read character reply <ChevronDown aria-hidden="true" />
                      </summary>
                      <p>{current.reply}</p>
                    </details>
                  </>
                ) : (
                  questionSurface()
                )}
                {progress()}
              </section>
              <section className="ledger">
                <div className="section-title">
                  <h2>Activity</h2>
                  <label className="history-search">
                    <Search aria-hidden="true" />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Find a question"
                      aria-label="Search activity"
                    />
                  </label>
                </div>
                <div className="ledger-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th scope="col">State</th>
                        <th scope="col">Viewer</th>
                        <th scope="col">Question</th>
                        <th scope="col">Time</th>
                        <th scope="col">
                          <span className="sr-only">Action</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {waiting.map((entry, index) => (
                        <tr key={entry.id} className="waiting-table-row">
                          <td>
                            <Badge variant="outline">Waiting {index + 1}</Badge>
                          </td>
                          <td>{entry.viewer}</td>
                          <td>{entry.question}</td>
                          <td>{entry.time}</td>
                          <td>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove question from ${entry.viewer}`}
                              onClick={() => remove(entry.id)}
                            >
                              <X data-icon="inline-start" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {filteredHistory.map((entry) => (
                        <tr key={entry.id}>
                          <td>
                            <Badge variant={entry.outcome === 'Spoken' ? 'complete' : 'quiet'}>
                              {entry.outcome}
                            </Badge>
                          </td>
                          <td>{entry.viewer}</td>
                          <td>
                            <details>
                              <summary>{entry.question}</summary>
                              <p>
                                {entry.reply ||
                                  (entry.outcome === 'Failed'
                                    ? 'No audio was played.'
                                    : 'Question skipped.')}
                              </p>
                            </details>
                          </td>
                          <td>{entry.time}</td>
                          <td />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!waiting.length && !filteredHistory.length ? (
                    <p className="quiet-empty">No questions to show.</p>
                  ) : null}
                </div>
              </section>
            </>
          ) : page === 'prepare' ? (
            prepare()
          ) : (
            testing()
          )}
        </main>
        {page === 'live' ? (
          <footer className="operator-dock">
            <div className="dock-state">
              <span className={`status-dot${paused ? ' held' : ''}`} />
              <div>
                {paused ? 'Playback paused' : 'Playback running'}
                <small>{waiting.length} questions waiting</small>
              </div>
            </div>
            {transport(true)}
          </footer>
        ) : null}
      </div>
    );
  }
  function prepare() {
    const tabs = [
      { id: 'character', label: 'Character & voice', icon: AudioLines },
      { id: 'response', label: 'Responses', icon: Settings2 },
      { id: 'playback', label: 'Playback', icon: Volume2 },
      { id: 'connection', label: 'Stream connection', icon: Radio },
    ];
    return (
      <div className="prepare-page">
        <header className="prepare-heading">
          <div>
            <h1>Before you go live</h1>
            <p>Choose who answers, check how they sound, then leave it running.</p>
          </div>
          <Button variant="outline" onClick={() => setPage('live')}>
            <ArrowLeft data-icon="inline-start" />
            Back to stream
          </Button>
        </header>
        <div className="prepare-layout">
          <nav className="prepare-nav" aria-label="Setup topics">
            {tabs.map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                variant={setupTab === id ? 'secondary' : 'ghost'}
                aria-current={setupTab === id ? 'page' : undefined}
                onClick={() => setSetupTab(id)}
              >
                <Icon data-icon="inline-start" />
                {label}
              </Button>
            ))}
            <div className="prepare-soundcheck">
              <Headphones aria-hidden="true" />
              <h3>Hear it before they do.</h3>
              <p>Try a response or check the voice before your stream.</p>
              <Button variant="outline" onClick={() => setPage('test')}>
                Open soundcheck
              </Button>
            </div>
          </nav>
          <section className="prepare-content">
            <Badge variant="quiet">Example configuration</Badge>
            {setupTab === 'character' ? (
              <>
                <h2>Your character</h2>
                <p>A personality and a voice, ready to answer the audience.</p>
                <div className="character-profile">
                  <span className="large-character-mark">T</span>
                  <div>
                    <h3>Tyrone</h3>
                    <p>Your competitive gaming coach with something to say.</p>
                    <Badge variant="complete">
                      <Check data-icon="inline-start" />
                      Voice assigned
                    </Badge>
                  </div>
                </div>
                <label className="prototype-field">
                  <span>Personality instructions</span>
                  <textarea
                    rows={3}
                    value={personality}
                    onChange={(event) => setPersonality(event.target.value)}
                  />
                </label>
                <div className="config-detail">
                  <span>Voice</span>
                  <strong>Assigned voice configured</strong>
                </div>
                <p className="setup-hint">
                  Proposed browser character editing. These example instructions stay in this
                  preview.
                </p>
                <div className="setup-actions">
                  <Button
                    variant="outline"
                    disabled={personality === savedPersonality}
                    onClick={() => {
                      setSavedPersonality(personality);
                      setNotice('Example personality saved in this preview.');
                    }}
                  >
                    Save personality
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={personality === savedPersonality}
                    onClick={() => setPersonality(savedPersonality)}
                  >
                    Discard
                  </Button>
                  <Button
                    onClick={() => {
                      setTestMode('voice');
                      setPage('test');
                    }}
                  >
                    Check the voice
                  </Button>
                </div>
              </>
            ) : setupTab === 'response' ? (
              <>
                <h2>How Tyrone answers</h2>
                <p>Response generation is configured separately from the voice.</p>
                <div className="config-detail">
                  <span>Response provider</span>
                  <strong>OpenRouter (example)</strong>
                </div>
                <div className="config-detail">
                  <span>Model</span>
                  <strong>Configured model</strong>
                </div>
                <div className="config-detail">
                  <span>API key</span>
                  <Badge variant="complete">Configured</Badge>
                </div>
                <details className="advanced-settings">
                  <summary>Advanced response options</summary>
                  <p>Exact model ID and token limit would be editable here.</p>
                </details>
                <div className="setup-actions">
                  <Button
                    variant="outline"
                    onClick={() =>
                      setNotice('Simulated connection check complete. No provider was contacted.')
                    }
                  >
                    Check connection
                  </Button>
                  <Button
                    onClick={() => {
                      setTestMode('response');
                      setPage('test');
                    }}
                  >
                    Try a response
                  </Button>
                </div>
              </>
            ) : setupTab === 'playback' ? (
              <>
                <h2>Playback preferences</h2>
                <p>Set the starting level. Adjust live volume from the playback controls.</p>
                <label className="prototype-field" htmlFor="launch-volume">
                  <span>Volume when the app starts</span>
                  <div className="launch-volume-field">
                    <input
                      id="launch-volume"
                      type="range"
                      min="0"
                      max="100"
                      value={draftVolume}
                      onChange={(event) => setDraftVolume(Number(event.target.value))}
                    />
                    <output htmlFor="launch-volume">{draftVolume}%</output>
                  </div>
                </label>
                <p className="setup-hint">
                  Changes apply on the next launch. Live volume stays at {volume}%.
                </p>
                <div className="setup-actions">
                  <Button
                    disabled={draftVolume === savedVolume}
                    onClick={() => {
                      setSavedVolume(draftVolume);
                      setNotice('Example playback preference saved for this preview.');
                    }}
                  >
                    Save changes
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={draftVolume === savedVolume}
                    onClick={() => setDraftVolume(savedVolume)}
                  >
                    Discard
                  </Button>
                </div>
              </>
            ) : (
              <>
                <h2>Connect your stream</h2>
                <p>Audience questions will come from a shared Twitch Channel Points reward.</p>
                <div className="connection-placeholder">
                  <Radio aria-hidden="true" />
                  <h3>Twitch setup is a later step.</h3>
                  <p>
                    Local soundchecks work independently. This preview does not connect accounts or
                    create rewards.
                  </p>
                  <Badge variant="quiet">Not connected</Badge>
                </div>
                <Button variant="outline" onClick={() => setPage('test')}>
                  Try a local question
                </Button>
              </>
            )}
          </section>
        </div>
      </div>
    );
  }
  function testing() {
    return (
      <div className="soundcheck-page">
        <header className="prepare-heading">
          <div>
            <h1>Soundcheck</h1>
            <p>Try it yourself before the audience joins in.</p>
          </div>
          <Button variant="outline" onClick={() => setPage('live')}>
            <ArrowLeft data-icon="inline-start" />
            Back to stream
          </Button>
        </header>
        <div className="soundcheck-layout">
          <section className="test-form">
            <Badge variant="quiet">Simulated preview</Badge>
            <h2>Give Tyrone a question.</h2>
            <p>Start with a response, check the voice, or try the whole flow.</p>
            <fieldset className="test-modes">
              <legend>What would you like to check?</legend>
              {[
                { value: 'response', label: 'Just the response' },
                { value: 'voice', label: 'Just the voice' },
                { value: 'full', label: 'Question to playback' },
              ].map(({ value, label }) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="test-mode"
                    value={value}
                    checked={testMode === value}
                    onChange={() => {
                      setTestMode(value);
                      setTestReply('');
                      setTestError('');
                    }}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            <label className="prototype-field">
              <span>Character</span>
              <select aria-label="Test character">
                <option>Tyrone</option>
              </select>
            </label>
            {testMode !== 'voice' ? (
              <label className="prototype-field">
                <span>Your question</span>
                <textarea
                  value={testQuestion}
                  onChange={(event) => setTestQuestion(event.target.value)}
                  rows={4}
                  maxLength={500}
                  placeholder="Ask Tyrone something…"
                />
              </label>
            ) : (
              <p className="voice-test-phrase">
                “This is Tyrone. Your voice is ready for the stream.”
              </p>
            )}
            <Button onClick={addTest}>
              {testMode === 'response' ? 'Try response' : 'Add sample to playback'}
              <ArrowRight data-icon="inline-end" />
            </Button>
            {testError ? (
              <p role="alert" className="test-error">
                {testError}
              </p>
            ) : null}
            <p className="setup-hint">
              Sample text only. No providers are contacted and no audio is played.
            </p>
          </section>
          <section className="soundcheck-result">
            <span className="character-mark">T</span>
            <h2>{testReply ? 'Tyrone’s response' : 'Make sure it feels right.'}</h2>
            <p>
              {testReply ||
                'Your sample response will appear here. Full-flow and voice samples go to the stream workspace so you can try the controls.'}
            </p>
            {testReply ? (
              <Badge variant="complete">Sample complete</Badge>
            ) : (
              <Headphones aria-hidden="true" />
            )}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className={`design-preview variant-${variant}`}>
      {variant === 'A' ? studio() : variant === 'B' ? focus() : operator()}
      {notice ? (
        <div className="preview-notice" role="status">
          <Check aria-hidden="true" />
          {notice}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Dismiss notification"
            onClick={() => setNotice('')}
          >
            <X data-icon="inline-start" />
          </Button>
        </div>
      ) : null}
      <dialog ref={stopDialog} className="prototype-dialog">
        <h2>Stop and clear?</h2>
        <p>
          This stops the current reply and removes the waiting questions. Playback will stay paused.
        </p>
        <div>
          <Button variant="outline" onClick={() => stopDialog.current?.close()}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={stop}>
            Stop and clear
          </Button>
        </div>
      </dialog>
      <dialog ref={helpDialog} className="prototype-dialog">
        <h2>A character in the conversation.</h2>
        <p>
          A viewer asks a named character a question. The app generates a short reply and plays it
          in that character’s voice, one question at a time.
        </p>
        <p>
          Let it run in the background. Use Pause to hold playback, Skip to move on, and Soundcheck
          to try things before streaming.
        </p>
        <p>
          This design preview uses synthetic examples. Twitch and provider access are outside this
          preview.
        </p>
        <Button onClick={() => helpDialog.current?.close()}>Got it</Button>
      </dialog>
      {import.meta.env.DEV ? (
        <footer className="prototype-toolbar" aria-label="Design comparison">
          <div className="prototype-context">
            <strong>Design preview</strong>
            <span>
              {paused ? 'Paused' : 'Running'} · {current ? '1 current' : 'No current'} ·{' '}
              {waiting.length} waiting
            </span>
          </div>
          <div className="variant-controls">
            <button onClick={() => cycle(-1)} aria-label="Previous design">
              <ArrowLeft />
            </button>
            <div>
              <strong>
                {variant} / {directions[variant].name}
              </strong>
              <span>{directions[variant].detail}</span>
            </div>
            <button onClick={() => cycle(1)} aria-label="Next design">
              <ArrowRight />
            </button>
          </div>
          <div className="scene-controls">
            <select
              aria-label="Example state"
              value={scene}
              onChange={(event) => reset(event.target.value)}
            >
              <option value="busy">Busy queue</option>
              <option value="paused">Paused</option>
              <option value="empty">Empty</option>
              <option value="failed">Failed response</option>
            </select>
            <button onClick={() => reset()} title="Reset example" aria-label="Reset example">
              <RotateCcw />
            </button>
            <button
              disabled={!current}
              onClick={() => finish('Spoken')}
              title="Simulate reply finishing"
              aria-label="Simulate reply finishing"
            >
              <CheckCheck />
            </button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
