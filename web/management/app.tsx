import { useEffect, useRef, useState, lazy, Suspense, type ReactNode } from 'react';
import {
  ChevronRight,
  ArrowLeft,
  Check,
  Copy,
  AudioLines,
  Radio,
  MessageSquare,
  WandSparkles,
} from 'lucide-react';
import type { ManagementState, PlaybackState } from '../../src/shared/protocol.ts';
import type { ServerView, createServerState } from '../shared/server-state.ts';
import { GenerationTest, SpeechTest, ObsTest } from './provider-tests.tsx';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './components/ui/field';
import { Alert, AlertDescription } from './components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { ManagementShell } from './management-shell';
import { defaultFishModel, fishModels } from '../../src/providers/fish/config.ts';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardAction,
} from './components/ui/card';
import { Skeleton } from './components/ui/skeleton';
import { Badge } from './components/ui/badge';
import { FeedbackBanner, type FeedbackTone } from './feedback';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from './components/ui/select';

const Activity = lazy(() =>
  import('./activity.tsx').then((module) => ({ default: module.Activity })),
);

type Server = ReturnType<typeof createServerState>;
type Page = 'activity' | 'characters' | 'settings' | 'setup';
type Topic = 'overview' | 'generation' | 'speech' | 'obs' | 'twitch';
type TestResult = { ok: boolean; message: string; at: number; revision: number };
const topicNames = {
  generation: 'Generation',
  speech: 'Speech',
  obs: 'OBS output',
  twitch: 'Twitch',
};
const topicDescriptions = {
  generation: 'Configure OpenRouter to generate replies.',
  speech: 'Configure Fish Audio and preview voices.',
  obs: 'Route spoken replies into your stream and check the output separately.',
  twitch: 'Connect your Channel Points reward to viewer replies.',
};
type Generation = {
  model: string;
  key: string;
  maxTokens: number;
};
type Speech = { key: string; model: string };
type Character = {
  id: string;
  name: string;
  prompt: string;
  voiceId: string;
  voiceOverridden: boolean;
};
type CharacterDraft = {
  value: Character;
  original: Character;
  dirty: boolean;
  epoch: number;
  feedback: string;
  feedbackTone?: FeedbackTone;
};
const generationValue = (m?: ManagementState): Generation => ({
  model: m?.generation.model ?? '',
  key: '',
  maxTokens: m?.generation.maxTokens ?? 1024,
});
const speechValue = (m?: ManagementState): Speech => ({
  key: '',
  model: m?.speech.model || defaultFishModel,
});

function useDraft<T>(value: (m?: ManagementState) => T, management: ManagementState | undefined) {
  const [draft, setDraft] = useState(() => value(management));
  const [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [feedbackTone, setFeedbackTone] = useState<FeedbackTone>('info');
  const [check, setCheck] = useState<{ ok: boolean; message: string } | null>(null);
  const epoch = useRef(0);
  const dirtyRef = useRef(false);
  useEffect(() => {
    if (!dirtyRef.current) setDraft(value(management));
    setCheck(null);
  }, [management?.revision]);
  function edit(patch: Partial<T>) {
    epoch.current++;
    dirtyRef.current = true;
    setDirty(true);
    setDraft((previous) => ({ ...previous, ...patch }));
    setFeedback('');
    setCheck(null);
  }
  function discard() {
    epoch.current++;
    dirtyRef.current = false;
    setDirty(false);
    setDraft(value(management));
    setFeedback('Changes discarded.');
    setFeedbackTone('info');
    setCheck(null);
  }
  async function save(server: Server, section: 'generation' | 'speech') {
    const sent = epoch.current;
    try {
      const result = await server.command<PlaybackState>(
        `/api/config/${section}`,
        section === 'generation' ? { ...draft, provider: 'openrouter' } : draft,
      );
      if (sent === epoch.current) {
        dirtyRef.current = false;
        setDirty(false);
        setDraft(value(result.management));
        const overridden = result.management?.overrides.some((name) =>
          section === 'generation'
            ? name.startsWith('OPENROUTER_') || name === 'MOMOI_TTS_TEXT_PROVIDER'
            : name === 'FISH_API_KEY' || name === 'FISH_MODEL',
        );
        setFeedback(
          overridden
            ? 'Saved locally. A launch environment override remains active.'
            : result.management?.pending
              ? 'Saved. Applies after the current reply.'
              : 'Saved.',
        );
        setFeedbackTone(overridden ? 'warning' : 'success');
        setCheck(null);
        return true;
      }
    } catch (error) {
      if (sent === epoch.current) {
        setFeedback(error instanceof Error ? error.message : 'Could not save.');
        setFeedbackTone('error');
      }
    }
    return false;
  }
  return { draft, dirty, edit, discard, save, feedback, feedbackTone, check, setCheck, epoch };
}
function FormField({
  id,
  label,
  description,
  children,
}: {
  id: string;
  label: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {children}
      {description ? <FieldDescription>{description}</FieldDescription> : null}
    </Field>
  );
}
function SaveActions({
  disabled,
  dirty,
  onDiscard,
  feedback,
  feedbackTone = 'info',
  label = 'Save changes',
}: {
  disabled: boolean;
  dirty: boolean;
  onDiscard: () => void;
  feedback: string;
  feedbackTone?: FeedbackTone;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={disabled}>
          {label}
        </Button>
        <Button type="button" variant="ghost" disabled={!dirty} onClick={onDiscard}>
          Discard
        </Button>
      </div>
      <FeedbackBanner
        message={feedback || (dirty ? 'Unsaved changes' : '')}
        tone={feedback ? feedbackTone : 'warning'}
      />
    </div>
  );
}

export function App({ view, server }: { view: ServerView; server: Server }) {
  const state = view.state,
    m = state?.management;
  const currentRevision = useRef(m?.revision);
  currentRevision.current = m?.revision;
  const requestedSettings = new URLSearchParams(location.search).get('page') === 'settings';
  const requestedTopic = new URLSearchParams(location.search).get('topic');
  const [page, setPage] = useState<Page>(requestedSettings ? 'settings' : 'activity');
  const [topic, setTopic] = useState<Topic>(
    requestedTopic === 'connections'
      ? 'obs'
      : ['generation', 'speech', 'obs', 'twitch'].includes(requestedTopic ?? '')
        ? (requestedTopic as Topic)
        : 'overview',
  );
  const [editing, setEditing] = useState({ generation: false, speech: false });
  const [results, setResults] = useState<Partial<Record<'generation' | 'speech', TestResult>>>({});
  const [removeKey, setRemoveKey] = useState<'generation' | 'speech' | null>(null);
  const [keyFeedback, setKeyFeedback] = useState('');
  const firstState = useRef(false);
  const generation = useDraft(generationValue, m),
    speech = useDraft(speechValue, m);
  const [selected, setSelected] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Record<string, CharacterDraft>>({});
  const charactersRef = useRef(characters);
  charactersRef.current = characters;
  const [characterError, setCharacterError] = useState('');
  const [dialog, setDialog] = useState<'diagnostics' | 'restart' | 'quit' | null>(null);
  const [lifecycle, setLifecycle] = useState('');
  const [copied, setCopied] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [testVoiceId, setTestVoiceId] = useState('');
  const [obsTestId, setObsTestId] = useState('');
  const obsSubmission = useRef<{ voiceId: string; eventId: string } | null>(null);
  const blocked = !view.connected || view.pending || !!lifecycle;
  const formDisabled = !view.connected || !!lifecycle;
  const hasDirty =
    generation.dirty || speech.dirty || Object.values(characters).some((d) => d.dirty);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [page, topic, selected]);
  useEffect(() => {
    if (m && !firstState.current) {
      firstState.current = true;
      if (!requestedSettings && (!m.setupSeen || !m.localReady)) setPage('setup');
    }
  }, [m]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (hasDirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasDirty]);
  useEffect(() => {
    if (!selected || !view.connected || charactersRef.current[selected]?.dirty) return;
    const controller = new AbortController();
    setCharacterError('');
    void (async () => {
      try {
        const response = await fetch(`/api/characters/${encodeURIComponent(selected)}`, {
          cache: 'no-store',
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
        });
        if (!response.ok)
          throw new Error('Could not load this character. Reconnect and try again.');
        const value: Character = await response.json();
        controller.signal.throwIfAborted();
        setCharacters((previous) =>
          previous[selected]?.dirty
            ? previous
            : {
                ...previous,
                [selected]: {
                  value,
                  original: value,
                  dirty: false,
                  epoch: previous[selected]?.epoch ?? 0,
                  feedback: previous[selected]?.feedback ?? '',
                  feedbackTone: previous[selected]?.feedbackTone,
                },
              },
        );
      } catch (error) {
        if (!controller.signal.aborted)
          setCharacterError(
            error instanceof Error && error.name !== 'TypeError'
              ? error.message
              : 'Could not load this character.',
          );
      }
    })();
    return () => controller.abort();
  }, [selected, view.connected, m?.revision]);
  function editCharacter(patch: Partial<Character>) {
    if (!selected) return;
    setCharacters((previous) => {
      const current = previous[selected];
      return !current
        ? previous
        : {
            ...previous,
            [selected]: {
              ...current,
              value: { ...current.value, ...patch },
              dirty: true,
              epoch: current.epoch + 1,
              feedback: '',
            },
          };
    });
  }
  async function saveCharacter() {
    if (!selected) return;
    const id = selected,
      sent = characters[id];
    if (!sent) return;
    try {
      const result = await server.command<PlaybackState>(
        `/api/characters/${encodeURIComponent(id)}`,
        { prompt: sent.value.prompt, voiceId: sent.value.voiceId },
      );
      setCharacters((previous) =>
        previous[id]?.epoch !== sent.epoch
          ? previous
          : {
              ...previous,
              [id]: {
                ...sent,
                original: sent.value,
                dirty: false,
                feedback: result.management?.pending
                  ? 'Saved. Applies after the current reply.'
                  : 'Saved.',
                feedbackTone: 'success',
              },
            },
      );
    } catch (error) {
      setCharacters((previous) =>
        previous[id]?.epoch !== sent.epoch
          ? previous
          : {
              ...previous,
              [id]: {
                ...previous[id],
                feedback: error instanceof Error ? error.message : 'Could not save.',
                feedbackTone: 'error',
              },
            },
      );
    }
  }
  async function check(section: 'generation' | 'speech') {
    const draft = section === 'speech' ? speech : generation;
    const sent = draft.epoch.current;
    const revision = m?.revision;
    try {
      const result = await server.command<{ ok: boolean; message: string }>(
        '/api/check/connection',
        { section },
        12000,
      );
      if (draft.epoch.current === sent && currentRevision.current === revision)
        draft.setCheck({
          ok: result.ok,
          message: result.ok
            ? 'API key authenticated. Test output to check model or voice access.'
            : result.message,
        });
    } catch (error) {
      if (draft.epoch.current === sent && currentRevision.current === revision)
        draft.setCheck({
          ok: false,
          message: error instanceof Error ? error.message : 'Could not check.',
        });
    }
  }
  async function lifecycleAction() {
    if (dialog !== 'restart' && dialog !== 'quit') return;
    try {
      await server.command(`/api/app/${dialog}`, { confirmed: true });
      setLifecycle(
        dialog === 'restart'
          ? 'Restarting. Refresh this page when the app is ready.'
          : 'App shut down. Use Launch MomoiTTS to reopen it.',
      );
      setDialog(null);
      server.suspend();
    } catch {
      /* Command errors are redacted by the shared controller. */
    }
  }
  async function copyPlayer() {
    try {
      await navigator.clipboard.writeText(`${location.origin}/player`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  const playerMessage = !view.connected
    ? 'Server offline'
    : state?.status === 'blocked'
      ? 'Audio blocked'
      : state?.playerConnected
        ? 'Audio source connected'
        : 'Audio source disconnected';
  const chosenCharacter = selected ? characters[selected] : undefined;
  const generationForm = (
    <>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void generation.save(server, 'generation').then((saved) => {
            if (saved) setEditing((current) => ({ ...current, generation: false }));
          });
        }}
      >
        <FieldGroup>
          <>
            <FormField
              id="generation-key"
              label="API key"
              description={
                m?.generation.keyConfigured ? (
                  'A saved key is kept unless you enter a replacement.'
                ) : (
                  <>
                    Create a key in your{' '}
                    <a
                      href="https://openrouter.ai/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenRouter account
                    </a>
                    .
                  </>
                )
              }
            >
              <Input
                id="generation-key"
                type="password"
                autoComplete="off"
                disabled={formDisabled}
                value={generation.draft.key}
                onChange={(event) => generation.edit({ key: event.target.value })}
                placeholder={
                  m?.generation.keyConfigured ? 'Replace saved key' : 'Paste your API key'
                }
              />
            </FormField>
            <FormField
              id="model"
              label="Model"
              description={
                <>
                  <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer">
                    Browse OpenRouter models
                  </a>{' '}
                  and copy its model ID here.
                </>
              }
            >
              <Input
                id="model"
                disabled={formDisabled}
                value={generation.draft.model}
                onChange={(event) => generation.edit({ model: event.target.value })}
                placeholder="provider/model"
              />
            </FormField>

            <FormField id="tokens" label="Maximum response tokens">
              <Input
                id="tokens"
                type="number"
                min={64}
                max={16384}
                disabled={formDisabled}
                value={generation.draft.maxTokens}
                onChange={(event) => generation.edit({ maxTokens: Number(event.target.value) })}
              />
            </FormField>
          </>
        </FieldGroup>
        <SaveActions
          label="Save changes"
          disabled={blocked}
          dirty={generation.dirty}
          onDiscard={generation.discard}
          feedback={generation.feedback}
          feedbackTone={generation.feedbackTone}
        />
      </form>
    </>
  );
  const speechForm = (
    <>
      <form
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void speech.save(server, 'speech').then((saved) => {
            if (saved) setEditing((current) => ({ ...current, speech: false }));
          });
        }}
      >
        <FieldGroup>
          <FormField
            id="speech-key"
            label="Fish Audio API key"
            description={
              m?.speech.keyConfigured ? (
                'A saved key is kept unless you enter a replacement.'
              ) : (
                <>
                  Create a key in your{' '}
                  <a href="https://fish.audio" target="_blank" rel="noopener noreferrer">
                    Fish Audio account
                  </a>
                  .
                </>
              )
            }
          >
            <Input
              id="speech-key"
              type="password"
              autoComplete="off"
              disabled={formDisabled}
              value={speech.draft.key}
              onChange={(event) => speech.edit({ key: event.target.value })}
              placeholder={m?.speech.keyConfigured ? 'Replace saved key' : 'Paste your API key'}
            />
          </FormField>

          <FormField
            id="speech-model"
            label="Speech engine"
            description={
              speech.draft.model === 's2.1-pro-free'
                ? 'Free developer tier: subject to fair use, with no uptime or latency guarantee. Requests may be retained for model improvement. You can change engines here later.'
                : 'This engine may use paid Developer API credit, separate from website credits. You can change engines here; the app never switches automatically.'
            }
          >
            <Select
              disabled={formDisabled}
              value={speech.draft.model}
              onValueChange={(value) => speech.edit({ model: value })}
            >
              <SelectTrigger id="speech-model" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {fishModels.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model === 's2.1-pro-free'
                        ? 'S2.1 Pro — Free developer tier'
                        : model === 's2.1-pro'
                          ? 'S2.1 Pro — Paid API'
                          : model}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FormField>
        </FieldGroup>
        <SaveActions
          label="Save changes"
          disabled={blocked}
          dirty={speech.dirty}
          onDiscard={speech.discard}
          feedback={speech.feedback}
          feedbackTone={speech.feedbackTone}
        />
      </form>
    </>
  );
  const characterList = (
    <div className="grid gap-4 sm:grid-cols-2">
      {m?.characters.map((character) => (
        <Card key={character.id} className="gap-4">
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
                aria-hidden="true"
              >
                {character.name[0]}
              </span>
              {character.name}
            </CardTitle>
            <CardDescription>
              {character.voiceConfigured
                ? 'Voice assigned'
                : 'Choose a voice to complete this character.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setSelected(character.id)}
              aria-label={'Edit ' + character.name}
            >
              Edit character
              <ChevronRight data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
      ))}
      {!m?.characters.length ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No characters are available. Check the catalog files.
        </p>
      ) : null}
    </div>
  );
  const characterEditor = chosenCharacter ? (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void saveCharacter();
      }}
    >
      <FieldGroup>
        <FormField
          id="character-prompt"
          label="Character instructions"
          description="Describe their personality, tone and how they answer questions."
        >
          <Textarea
            id="character-prompt"
            disabled={formDisabled}
            value={chosenCharacter.value.prompt}
            onChange={(event) => editCharacter({ prompt: event.target.value })}
            rows={10}
            className="min-h-56 resize-y"
          />
        </FormField>
        <FormField
          id="character-voice"
          label="Voice"
          description={
            chosenCharacter.value.voiceOverridden ? (
              'This voice is set by an environment override. Change that configuration to replace it.'
            ) : (
              <>
                Choose a voice from{' '}
                <a href="https://fish.audio" target="_blank" rel="noopener noreferrer">
                  Fish Audio
                </a>{' '}
                and paste its voice ID.
              </>
            )
          }
        >
          <Input
            id="character-voice"
            autoComplete="off"
            disabled={formDisabled || chosenCharacter.value.voiceOverridden}
            value={chosenCharacter.value.voiceId}
            onChange={(event) => editCharacter({ voiceId: event.target.value })}
            placeholder="Paste the voice ID"
          />
        </FormField>
      </FieldGroup>
      <SaveActions
        disabled={blocked || !chosenCharacter.dirty}
        dirty={chosenCharacter.dirty}
        onDiscard={() =>
          selected &&
          setCharacters((previous) => {
            const current = previous[selected];
            return !current
              ? previous
              : {
                  ...previous,
                  [selected]: {
                    ...current,
                    value: current.original,
                    dirty: false,
                    epoch: current.epoch + 1,
                    feedback: 'Changes discarded.',
                    feedbackTone: 'info',
                  },
                };
          })
        }
        feedback={chosenCharacter.feedback}
        feedbackTone={chosenCharacter.feedbackTone}
      />
    </form>
  ) : (
    <p className="text-sm leading-relaxed text-muted-foreground">
      {characterError || 'Loading character…'}
    </p>
  );
  const obs = (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Add a Browser source in OBS with this address. Enable “Control audio via OBS” and leave
        source shutdown and scene refresh off.
      </p>
      <div className="my-4 flex min-w-0 items-center justify-between gap-3 rounded-md border bg-background p-2 pl-3">
        <code className="min-w-0 break-all text-xs">{location.origin}/player</code>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Copy OBS audio source URL"
          disabled={!view.connected}
          onClick={() => void copyPlayer()}
        >
          {copied ? <Check /> : <Copy />}
        </Button>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Reuse that source across scenes. It stays invisible and plays replies when replies are on.
      </p>
    </>
  );
  const obsContent = (
    <section className="flex flex-col gap-3">
      {' '}
      {obs}
      <FeedbackBanner
        message={playerMessage}
        tone={state?.playerConnected && state.status !== 'blocked' ? 'success' : 'warning'}
      />
      {state ? (
        <ObsTest
          requestId={obsTestId}
          setRequestId={setObsTestId}
          submission={obsSubmission}
          state={state}
          server={server}
          blocked={blocked}
          dirty={speech.dirty}
          connected={view.connected}
          voiceId={testVoiceId}
          setVoiceId={setTestVoiceId}
          characters={m?.characters ?? []}
        />
      ) : null}
    </section>
  );
  const twitchContent = (
    <section className="flex flex-col gap-4">
      {state?.twitch?.channel ? (
        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm text-muted-foreground">Channel</dt>
            <dd>{state.twitch.channel}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Channel Points reward</dt>
            <dd>{state.twitch.rewardTitle || 'Not configured'}</dd>
          </div>
        </dl>
      ) : null}
      <p className="text-sm leading-relaxed text-muted-foreground">
        Follow the Channel Points instructions in the included user guide to authorize Twitch and
        create the reward. Then connect here.
      </p>
      <FeedbackBanner
        message={state?.twitch?.message || 'Not configured'}
        tone={
          state?.twitch?.status === 'connected'
            ? 'success'
            : state?.twitch?.status === 'error'
              ? 'error'
              : 'info'
        }
      />
      {state?.twitch?.status === 'connected' ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {state.twitch.live === true
            ? 'Channel live.'
            : state.twitch.live === false
              ? 'Channel offline.'
              : 'Live state unknown.'}
        </p>
      ) : null}
      {state?.twitch?.settlementMessage ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {state.twitch.settlementMessage}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={
            blocked || !state?.twitch || !['disconnected', 'error'].includes(state.twitch.status)
          }
          onClick={() => void server.command('/api/twitch/connect', {}).catch(() => {})}
        >
          Connect Twitch
        </Button>
        <Button
          variant="ghost"
          disabled={
            blocked || !state?.twitch || ['disabled', 'disconnected'].includes(state.twitch.status)
          }
          onClick={() => void server.command('/api/twitch/disconnect', {}).catch(() => {})}
        >
          Disconnect
        </Button>
      </div>

      <div className="border-t pt-5 text-sm leading-relaxed text-muted-foreground">
        <p>
          Viewer requests are accepted while the channel is live and replies are on. Requests
          received while replies are off are refunded.
        </p>
        <p className="mt-2">
          Turning replies off or ending the stream cancels unfinished viewer requests and refunds
          them. Turning replies on starts fresh.
        </p>
      </div>
    </section>
  );

  function resultText(section: 'generation' | 'speech') {
    const result = results[section];
    if (!result) return 'Not tested during this visit';
    if (result.revision !== m?.revision) return 'Settings changed; test again';
    return result.ok
      ? section === 'speech'
        ? 'Speech generated; listen to confirm'
        : 'Text generation worked'
      : 'Last test failed';
  }
  function recordResult(section: 'generation' | 'speech', result: Omit<TestResult, 'revision'>) {
    setResults((previous) => ({
      ...previous,
      [section]: { ...result, revision: m?.revision ?? 0 },
    }));
  }
  function providerContent(section: 'generation' | 'speech') {
    const isGeneration = section === 'generation';
    const draft = isGeneration ? generation : speech;
    const configured = isGeneration ? m?.generation.ready : m?.speech.ready;
    const keyConfigured = isGeneration ? m?.generation.keyConfigured : m?.speech.keyConfigured;
    const keyOverridden = m?.overrides.includes(
      isGeneration ? 'OPENROUTER_API_KEY' : 'FISH_API_KEY',
    );
    const open = editing[section] || !configured;
    const result = results[section];
    return (
      <div className="flex flex-col gap-6">
        {result ? (
          <FeedbackBanner
            tone={result.revision !== m?.revision ? 'warning' : result.ok ? 'success' : 'error'}
            message={
              resultText(section) +
              (result.revision === m?.revision
                ? ' · ' +
                  new Date(result.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : '')
            }
          />
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>Current configuration</CardTitle>
            <CardAction>
              <Badge variant={configured ? 'speaking' : 'warning'}>
                {configured ? 'Configured' : 'Needs setup'}
              </Badge>
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <dl className="grid min-w-0 gap-5 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-muted-foreground">Provider</dt>
                <dd className="mt-1 font-medium">
                  {isGeneration
                    ? m?.generation.provider === 'openrouter'
                      ? 'OpenRouter'
                      : 'Not configured'
                    : 'Fish Audio'}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-muted-foreground">
                  {isGeneration ? 'Model' : 'Speech engine'}
                </dt>
                <dd className="mt-1 break-all font-medium">
                  {isGeneration
                    ? m?.generation.model || 'Not selected'
                    : m?.speech.model === 's2.1-pro-free'
                      ? 'S2.1 Pro — Free developer tier'
                      : m?.speech.model || 'Not selected'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-sm text-muted-foreground">API key</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-3">
                  <span>
                    {keyConfigured
                      ? keyOverridden
                        ? 'Provided at launch'
                        : 'Key saved'
                      : 'No key saved'}
                  </span>
                  {keyConfigured && !open && !keyOverridden ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={formDisabled}
                      onClick={() => setEditing((current) => ({ ...current, [section]: true }))}
                    >
                      Replace key
                    </Button>
                  ) : null}
                  {keyConfigured ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={blocked || draft.dirty || keyOverridden}
                      onClick={() => {
                        setKeyFeedback('');
                        setRemoveKey(section);
                      }}
                    >
                      Remove key
                    </Button>
                  ) : null}
                </dd>
              </div>
            </dl>
            {m?.errors[section] ? (
              <FeedbackBanner message={m.errors[section] ?? ''} tone="error" />
            ) : null}
            {m?.overrides.some((name) =>
              isGeneration
                ? name.startsWith('OPENROUTER_') || name === 'MOMOI_TTS_TEXT_PROVIDER'
                : name === 'FISH_API_KEY' || name === 'FISH_MODEL',
            ) ? (
              <p className="text-sm text-muted-foreground">
                Launch environment settings override this saved configuration. Change those
                overrides before replacing affected values here.
              </p>
            ) : null}
            {!open ? (
              <Button
                variant="outline"
                className="w-fit"
                disabled={formDisabled}
                onClick={() => setEditing((current) => ({ ...current, [section]: true }))}
              >
                Change configuration
              </Button>
            ) : null}
            {draft.feedback && !open ? (
              <FeedbackBanner message={draft.feedback} tone={draft.feedbackTone} />
            ) : null}
            {open ? (
              <div className="border-t pt-5">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <h2 className="font-semibold">
                    {configured ? 'Edit configuration' : 'Configure ' + topicNames[section]}
                  </h2>
                  {configured && !draft.dirty ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditing((current) => ({ ...current, [section]: false }))}
                    >
                      Close editor
                    </Button>
                  ) : null}
                </div>
                {isGeneration ? generationForm : speechForm}
              </div>
            ) : null}
          </CardContent>
        </Card>
        <section className="flex flex-col gap-3 rounded-xl border px-6 py-5">
          <h2 className="font-semibold">Check & test</h2>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              className="w-fit"
              disabled={blocked || draft.dirty || !configured}
              onClick={() => void check(isGeneration ? 'generation' : 'speech')}
            >
              Check connection
            </Button>{' '}
            {isGeneration ? (
              <GenerationTest
                key={m?.revision + ':' + generation.epoch.current}
                connected={view.connected}
                blocked={blocked}
                dirty={generation.dirty}
                ready={!!m?.generation.ready}
                characters={m?.characters ?? []}
                onResult={(result) => recordResult('generation', result)}
              />
            ) : (
              <SpeechTest
                key={m?.revision + ':' + speech.epoch.current}
                connected={view.connected}
                blocked={blocked}
                dirty={speech.dirty}
                ready={!!m?.speech.ready}
                voiceId={testVoiceId}
                setVoiceId={setTestVoiceId}
                characters={m?.characters ?? []}
                onResult={(result) => recordResult('speech', result)}
              />
            )}
          </div>
          {draft.check ? (
            <FeedbackBanner
              message={draft.check.message}
              tone={draft.check.ok ? 'success' : 'error'}
            />
          ) : null}
          {draft.dirty ? (
            <p className="text-sm text-muted-foreground">
              Save or discard changes before checking or testing.
            </p>
          ) : null}
        </section>
      </div>
    );
  }
  const voiceCount = m?.characters.filter((character) => character.voiceConfigured).length ?? 0;
  const topicRows = [
    {
      topic: 'generation' as const,
      title: 'Generation',
      icon: WandSparkles,
      detail: m?.generation.ready
        ? 'OpenRouter · ' + m.generation.model
        : 'Save your OpenRouter API key and model',
      status: m?.generation.ready ? 'Configured' : 'Needs setup',
      next: m?.generation.ready ? resultText('generation') : 'Set up text replies',
    },
    {
      topic: 'speech' as const,
      title: 'Speech',
      icon: AudioLines,
      detail: m?.speech.ready ? 'Fish Audio · ' + m.speech.model : 'Save your Fish Audio API key',
      status: m?.speech.ready ? 'Configured' : 'Needs setup',
      next: m?.speech.ready ? resultText('speech') : 'Set up speech',
    },
    {
      topic: 'obs' as const,
      title: 'OBS output',
      icon: Radio,
      detail: state?.playerConnected
        ? 'Audio source connected; confirm audibility in OBS'
        : 'Connect an OBS Browser source',
      status: state?.playerConnected ? 'Connected' : 'Not connected',
      next: 'Set up or test stream output',
    },
    {
      topic: 'twitch' as const,
      title: 'Twitch',
      icon: MessageSquare,
      detail: state?.twitch?.channel
        ? state.twitch.channel +
          (state.twitch.status === 'connected'
            ? state.twitch.live === true
              ? ' · Live'
              : state.twitch.live === false
                ? ' · Offline'
                : ' · Live state unknown'
            : '')
        : 'Connect your Channel Points reward',
      status:
        state?.twitch?.status === 'connected'
          ? 'Connected'
          : state?.twitch?.status === 'error'
            ? 'Needs attention'
            : state?.twitch?.status === 'disabled'
              ? 'Needs setup'
              : 'Not connected',
      next: state?.twitch?.message || 'Assisted account setup',
    },
  ];
  const settingsOverview = (
    <div className="flex flex-col gap-7">
      <div className="overflow-hidden rounded-xl border bg-card">
        {topicRows.map((item, index) => (
          <button
            key={item.topic}
            type="button"
            className={
              'group flex w-full items-start gap-4 px-5 py-5 text-left transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring sm:items-center sm:px-6' +
              (index ? ' border-t' : '')
            }
            onClick={() => setTopic(item.topic)}
          >
            <item.icon
              className="mt-1 size-5 shrink-0 text-muted-foreground sm:mt-0"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="text-base font-semibold">{item.title}</span>
                <Badge
                  variant={
                    item.status === 'Connected'
                      ? 'success'
                      : item.status === 'Configured'
                        ? 'speaking'
                        : item.status === 'Needs attention'
                          ? 'error'
                          : item.status === 'Needs setup'
                            ? 'warning'
                            : 'quiet'
                  }
                >
                  {item.status}
                </Badge>
              </div>
              <p className="break-words text-sm text-muted-foreground">{item.detail}</p>
              <p className="mt-1 text-xs text-muted-foreground">{item.next}</p>
            </div>
            <ChevronRight
              className="mt-1 size-5 shrink-0 text-muted-foreground group-hover:text-foreground sm:mt-0"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {voiceCount < (m?.characters.length ?? 0) ? (
        <FeedbackBanner
          tone="warning"
          message="Assign missing voices in Characters before turning replies on."
        />
      ) : null}
      {page === 'setup' ? (
        <div className="flex flex-col items-start gap-3 border-t pt-6">
          <Button
            disabled={blocked || hasDirty}
            onClick={() =>
              void server
                .command('/api/config/application', { setupSeen: true })
                .then(() => setPage('activity'))
                .catch(() => {})
            }
          >
            Open Activity
          </Button>
          <p className="text-sm text-muted-foreground">
            You can open Activity now. Viewer replies stay off until the required services and
            character voices are configured.
          </p>
        </div>
      ) : null}
    </div>
  );
  return (
    <ManagementShell
      page={page}
      onNavigate={(next) => {
        setPage(next);
        if (next === 'characters') setSelected(null);
        if (next === 'settings' || next === 'setup') setTopic('overview');
      }}
      onDialog={setDialog}
      needsSetup={!m?.setupSeen || !m?.localReady}
      playerMessage={playerMessage}
      audioConnected={view.connected && !!state?.playerConnected && state.status !== 'blocked'}
      blocked={blocked}
      canQuit={!!state?.canQuit}
    >
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {state &&
        (((page === 'settings' || page === 'setup') && topic !== 'overview') ||
          (page === 'characters' && selected)) ? (
          <Button
            variant="ghost"
            className="mx-4 mt-4 w-fit shrink-0 self-start md:mx-8"
            aria-label={page === 'characters' ? 'Back to characters' : 'Back to settings'}
            onClick={() => (page === 'characters' ? setSelected(null) : setTopic('overview'))}
          >
            <ArrowLeft />
            {page === 'characters' ? 'All characters' : 'All settings'}
          </Button>
        ) : null}
        {view.message || lifecycle ? (
          <div className="px-4 pt-4 md:px-8">
            <FeedbackBanner
              message={lifecycle || view.message}
              tone={lifecycle ? 'info' : 'error'}
            />
          </div>
        ) : null}
        {!state ? (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Connecting to MomoiTTS
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Start the app if this page stays offline.
            </p>
          </div>
        ) : page === 'activity' ? (
          <>
            <Suspense
              fallback={
                <div className="flex flex-col gap-6 p-8" role="status">
                  <span className="sr-only">Loading activity…</span>
                  <Skeleton className="h-10 w-40" />
                  <Skeleton className="h-80 w-full" />
                </div>
              }
            >
              <Activity
                state={state}
                connected={view.connected && !lifecycle}
                pending={view.pending}
                command={server.command}
                notice={
                  !state.playerConnected && view.connected ? (
                    <Alert role="status">
                      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                        <span>Connect an audio source to play queued replies.</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setPage('settings');
                            setTopic('obs');
                          }}
                        >
                          Set up OBS output
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : undefined
                }
              />
            </Suspense>
          </>
        ) : page === 'settings' || page === 'setup' ? (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-4 py-8 md:px-8 md:py-10">
            <header className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {topic === 'overview'
                  ? page === 'setup'
                    ? 'Set up MomoiTTS'
                    : 'Settings'
                  : topicNames[topic]}
              </h1>
              <p className="max-w-2xl leading-relaxed text-muted-foreground">
                {topic === 'overview'
                  ? 'Configure your services and check what works.'
                  : topicDescriptions[topic]}
              </p>
            </header>
            {generation.dirty || speech.dirty ? (
              <p role="status" className="text-sm text-primary">
                Unsaved changes in{' '}
                {generation.dirty && speech.dirty
                  ? 'Generation and Speech'
                  : generation.dirty
                    ? 'Generation'
                    : 'Speech'}
                . Drafts are kept while you move between pages.
              </p>
            ) : null}
            {topic === 'overview' ? (
              settingsOverview
            ) : (
              <>
                {topic === 'generation' || topic === 'speech' ? (
                  providerContent(topic)
                ) : (
                  <Card>
                    <CardContent>{topic === 'obs' ? obsContent : twitchContent}</CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        ) : page === 'characters' ? (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 md:px-8 md:py-10">
            <header className="flex flex-col gap-2">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {selected ? chosenCharacter?.value.name || 'Character' : 'Characters'}
              </h1>
              <p className="text-muted-foreground">
                {selected
                  ? 'Give this character a personality and a voice.'
                  : 'Choose a character to edit their instructions and voice.'}
              </p>
            </header>
            {selected ? (
              <Card>
                <CardHeader>
                  <CardTitle>Personality & voice</CardTitle>
                  <CardDescription>These instructions stay private to this app.</CardDescription>
                </CardHeader>
                <CardContent>{characterEditor}</CardContent>
              </Card>
            ) : (
              characterList
            )}
          </div>
        ) : null}
      </div>
      <Dialog
        open={!!removeKey}
        onOpenChange={(open) => {
          if (!open) setRemoveKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Remove saved {removeKey === 'generation' ? 'OpenRouter' : 'Fish Audio'} key?
            </DialogTitle>
            <DialogDescription>
              {removeKey === 'generation' ? 'Text generation' : 'Speech generation'} will need a new
              key before it can work. Your other settings stay saved.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setRemoveKey(null)}>
              Cancel
            </Button>
            <Button
              disabled={blocked}
              onClick={() => {
                const section = removeKey;
                if (!section) return;
                void server
                  .command('/api/config/' + section, { removeKey: true })
                  .then(() => {
                    setRemoveKey(null);
                    setEditing((current) => ({ ...current, [section]: false }));
                  })
                  .catch((error) =>
                    setKeyFeedback(
                      error instanceof Error ? error.message : 'Could not remove key.',
                    ),
                  );
              }}
            >
              Remove key
            </Button>
          </div>
          {keyFeedback ? <FeedbackBanner message={keyFeedback} tone="error" /> : null}
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!dialog}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog === 'diagnostics'
                ? 'Diagnostics'
                : dialog === 'restart'
                  ? 'Restart MomoiTTS?'
                  : 'Shut down MomoiTTS?'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'diagnostics'
                ? 'Current setup and connection status.'
                : dialog === 'restart'
                  ? 'Active replies stop and waiting questions are cleared. Replies stay off until you turn them on.'
                  : 'Active replies stop and waiting questions are cleared.'}
            </DialogDescription>
          </DialogHeader>
          {dialog === 'diagnostics' ? (
            <div className="flex flex-col gap-4 text-sm text-muted-foreground">
              <p>{playerMessage}</p>
              {Object.entries(m?.errors || {}).map(([key, error]) => (
                <p key={key}>{error}</p>
              ))}
              {m?.overrides.length ? <p>Environment overrides: {m.overrides.join(', ')}.</p> : null}
              {state?.logging?.failed ? (
                <p>Private dialogue logging failed. Check local storage.</p>
              ) : null}
              <Button
                variant="outline"
                disabled={blocked}
                onClick={() => void server.command('/api/app/refresh-profiles', {}).catch(() => {})}
              >
                Reload character files
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button disabled={blocked} onClick={() => void lifecycleAction()}>
                {dialog === 'restart' ? 'Restart app' : 'Shut down app'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}
