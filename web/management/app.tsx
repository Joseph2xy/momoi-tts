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
import type {
  CharacterEditorState,
  ManagementState,
  PlaybackState,
} from '../../src/shared/protocol.ts';
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
import { SetupJourney } from './setup-journey';
import { TwitchSettings, useRewardDraft } from './twitch-settings';
import { defaultFishModel, fishModels } from '../../src/providers/fish/config.ts';
import { Card, CardHeader, CardTitle, CardContent, CardAction } from './components/ui/card';
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
type TestResult = { ok: boolean; message: string; at: number; testRevision: string };
const topicNames = {
  generation: 'Generation',
  speech: 'Speech',
  obs: 'OBS output',
  twitch: 'Twitch',
};
const topicDescriptions = {
  generation: 'OpenRouter writes character replies.',
  speech: 'Fish Audio reads replies aloud. Choose voices in Characters.',
  obs: 'Route spoken replies into your stream and check the output separately.',
  twitch: 'Connect your broadcaster account, then create the viewer reward.',
};
type Generation = {
  model: string;
  key: string;
  maxTokens: number;
};
type Speech = { key: string; model: string };
type CharacterDraft = {
  value: CharacterEditorState;
  original: CharacterEditorState;
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
  }, [management?.revision]);
  useEffect(() => setCheck(null), [management?.testRevision]);
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
  const currentTestRevision = useRef(m?.testRevision);
  currentTestRevision.current = m?.testRevision;
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
  const reward = useRewardDraft(state);
  const [selected, setSelected] = useState<string | null>(null);
  const [characters, setCharacters] = useState<Record<string, CharacterDraft>>({});
  const charactersRef = useRef(characters);
  charactersRef.current = characters;
  const [characterError, setCharacterError] = useState('');
  const [dialog, setDialog] = useState<'diagnostics' | 'restart' | null>(null);
  const [lifecycle, setLifecycle] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [testVoiceId, setTestVoiceId] = useState('');
  const [obsTestId, setObsTestId] = useState('');
  const obsSubmission = useRef<{ voiceId: string; eventId: string } | null>(null);
  const evidenceRevision = m?.testRevision;
  const previousEvidenceRevision = useRef(evidenceRevision);
  useEffect(() => {
    const previous = previousEvidenceRevision.current;
    previousEvidenceRevision.current = evidenceRevision;
    if (previous === undefined || previous === evidenceRevision) return;
    const body = obsSubmission.current
      ? { eventId: obsSubmission.current.eventId }
      : obsTestId
        ? { requestId: obsTestId }
        : null;
    if (body) void server.command('/api/test/obs/cancel', body).catch(() => {});
    setObsTestId('');
    obsSubmission.current = null;
  }, [evidenceRevision]);
  const blocked = !view.connected || view.pending || !!lifecycle;
  const formDisabled = !view.connected || !!lifecycle;
  const hasDirty =
    generation.dirty ||
    speech.dirty ||
    reward.dirty ||
    Object.values(characters).some((d) => d.dirty);
  const dirtyCharacterId = Object.keys(characters).find((id) => characters[id]?.dirty);
  useEffect(() => {
    if (page === 'setup' && dirtyCharacterId && selected !== dirtyCharacterId)
      setSelected(dirtyCharacterId);
  }, [page, dirtyCharacterId, selected]);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [page, topic, selected]);
  useEffect(() => {
    if (m && !firstState.current) {
      firstState.current = true;
      if (!requestedSettings && (!m.setupSeen || !m.localReady || !state?.twitchSetup?.rewardId))
        setPage('setup');
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
        const value: CharacterEditorState = await response.json();
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
  function editCharacter(patch: Partial<CharacterEditorState>) {
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
  async function saveCharacter(voiceOnly = false) {
    if (!selected) return;
    const id = selected,
      sent = characters[id];
    if (!sent) return;
    try {
      const result = await server.command<PlaybackState>(
        `/api/characters/${encodeURIComponent(id)}`,
        {
          ...(voiceOnly ? {} : { prompt: sent.value.prompt }),
          voiceId: sent.value.voiceId,
          available: voiceOnly || (sent.value.available ?? false),
        },
      );
      setCharacters((previous) =>
        previous[id]?.epoch !== sent.epoch
          ? previous
          : {
              ...previous,
              [id]: {
                ...sent,
                value: voiceOnly ? { ...sent.value, available: true } : sent.value,
                original: voiceOnly ? { ...sent.value, available: true } : sent.value,
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
    const revision = m?.testRevision;
    try {
      const result = await server.command<{ ok: boolean; message: string }>(
        '/api/check/connection',
        { section },
        12000,
      );
      if (draft.epoch.current === sent && currentTestRevision.current === revision)
        draft.setCheck({
          ok: result.ok,
          message: result.ok
            ? 'API key authenticated. Test output to check model or voice access.'
            : result.message,
        });
    } catch (error) {
      if (draft.epoch.current === sent && currentTestRevision.current === revision)
        draft.setCheck({
          ok: false,
          message: error instanceof Error ? error.message : 'Could not check.',
        });
    }
  }
  async function lifecycleAction(action: 'restart' | 'quit') {
    try {
      await server.command(`/api/app/${action}`, { confirmed: true });
      setLifecycle(
        action === 'restart'
          ? 'Restarting. Refresh this page when the app is ready.'
          : 'Closing MomoiTTS. You can close this tab; use Launch MomoiTTS to reopen it.',
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
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }
  const playerMessage = !view.connected
    ? 'Server offline'
    : state?.status === 'blocked'
      ? 'Browser playback is blocked. In OBS, use Interact on the source and click its blank page.'
      : state?.playerConnected
        ? 'Audio source connected. Check the OBS mixer and a recording to confirm stream audio.'
        : 'No audio source connected yet. Add the Browser source in OBS using the address shown on this page.';
  const chosenCharacter = selected ? characters[selected] : undefined;
  useEffect(() => {
    if (page === 'setup') setTestVoiceId(chosenCharacter?.original.voiceId ?? '');
  }, [page, chosenCharacter?.original.voiceId]);
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
              label="OpenRouter API key"
              description={
                m?.generation.keyConfigured ? (
                  'A saved key is kept unless you enter a replacement.'
                ) : (
                  <>
                    Open{' '}
                    <a
                      href="https://openrouter.ai/settings/keys"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      OpenRouter API Keys
                    </a>{' '}
                    to create a key, then paste it here.
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
              label="Model ID"
              description={
                <>
                  <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer">
                    Browse OpenRouter models
                  </a>{' '}
                  and copy the model ID, not its name or URL. Check its price before testing.
                </>
              }
            >
              <Input
                id="model"
                disabled={formDisabled}
                value={generation.draft.model}
                onChange={(event) => generation.edit({ model: event.target.value })}
                placeholder="organization/model"
              />
            </FormField>

            {page === 'setup' ? null : (
              <FormField
                id="tokens"
                label="Maximum response tokens"
                description="Leave 1024 for setup. This limits model output; spoken replies have a separate 60-word limit."
              >
                <Input
                  id="tokens"
                  type="number"
                  min={64}
                  max={16384}
                  required
                  step={1}
                  disabled={formDisabled}
                  value={Number.isNaN(generation.draft.maxTokens) ? '' : generation.draft.maxTokens}
                  onChange={(event) => generation.edit({ maxTokens: event.target.valueAsNumber })}
                />
              </FormField>
            )}
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
                  Open{' '}
                  <a
                    href="https://fish.audio/app/api-keys/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Fish Audio API Keys
                  </a>{' '}
                  to create a key, then paste it here. Use a Fish key, not your OpenRouter key.
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
                ? 'Free under fair use; no uptime or latency guarantee. Requests may be retained for model improvement.'
                : 'Uses Developer API credit, separate from website credits. No automatic engine switching.'
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
    <ul className="flex flex-col gap-3">
      {m?.characters.map((character) => (
        <li key={character.id}>
          <Button
            variant="outline"
            className="h-auto w-full justify-between gap-4 px-5 py-4 text-left"
            onClick={() => setSelected(character.id)}
            aria-label={'Edit ' + character.name}
          >
            <span className="flex min-w-0 items-center gap-4">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-lg text-primary"
                aria-hidden="true"
              >
                {character.name[0]}
              </span>
              <span className="truncate text-base font-semibold">{character.name}</span>
            </span>
            <span className="flex shrink-0 items-center gap-3">
              <Badge
                variant={
                  !character.voiceConfigured ? 'warning' : character.available ? 'success' : 'quiet'
                }
              >
                {!character.voiceConfigured
                  ? 'Needs voice'
                  : character.available
                    ? 'Available'
                    : 'Disabled'}
              </Badge>
              <ChevronRight data-icon="inline-end" />
            </span>
          </Button>
        </li>
      ))}
      {!m?.characters.length ? (
        <li className="text-sm text-muted-foreground">No characters in the catalog.</li>
      ) : null}
    </ul>
  );
  function discardCharacter() {
    if (!selected) return;
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
    });
  }
  const characterVoiceField = chosenCharacter ? (
    <FormField
      id="character-voice"
      label="Fish Audio voice ID"
      description={
        chosenCharacter.value.voiceOverridden ? (
          'This voice is set by an environment override. Change that configuration to replace it.'
        ) : (
          <>
            Browse voices on{' '}
            <a href="https://fish.audio" target="_blank" rel="noopener noreferrer">
              Fish Audio
            </a>
            : copy the 32-character ID after /m/ in the voice URL.
          </>
        )
      }
    >
      <Input
        id="character-voice"
        autoComplete="off"
        required={page === 'setup'}
        pattern={page === 'setup' ? '[a-fA-F0-9]{32}' : undefined}
        disabled={formDisabled || chosenCharacter.value.voiceOverridden}
        value={chosenCharacter.value.voiceId}
        onChange={(event) => editCharacter({ voiceId: event.target.value })}
        placeholder="Paste the 32-character voice ID"
      />
    </FormField>
  ) : null;
  const pendingInstructions =
    !!chosenCharacter?.dirty && chosenCharacter.value.prompt !== chosenCharacter.original.prompt;
  const setupVoice = chosenCharacter ? (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!pendingInstructions) void saveCharacter(true);
      }}
    >
      <p className="text-sm text-muted-foreground">
        Voice for <strong className="text-foreground">{chosenCharacter.value.name}</strong>
      </p>
      <FieldGroup>{characterVoiceField}</FieldGroup>
      {pendingInstructions ? (
        <div className="flex flex-col items-start gap-2">
          <FeedbackBanner
            message="Save or discard your instruction draft in Characters first."
            tone="warning"
          />
          <Button type="button" variant="outline" onClick={() => setPage('characters')}>
            Review draft
          </Button>
        </div>
      ) : null}
      {!pendingInstructions ? (
        <SaveActions
          label={'Save voice and enable ' + chosenCharacter.value.name}
          disabled={
            blocked ||
            !/^[a-f0-9]{32}$/iu.test(chosenCharacter.value.voiceId) ||
            (!chosenCharacter.dirty && !!chosenCharacter.original.available)
          }
          dirty={chosenCharacter.dirty}
          onDiscard={discardCharacter}
          feedback={chosenCharacter.feedback}
          feedbackTone={chosenCharacter.feedbackTone}
        />
      ) : null}
    </form>
  ) : (
    <p className="text-sm text-muted-foreground">{characterError || 'Loading voice settings…'}</p>
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
        {characterVoiceField}
        <Field>
          <FieldLabel
            htmlFor="character-available"
            className="flex w-fit cursor-pointer items-center gap-3 py-2"
          >
            <input
              id="character-available"
              type="checkbox"
              className="size-4 shrink-0 accent-primary"
              checked={chosenCharacter.value.available ?? false}
              disabled={formDisabled}
              onChange={(event) => editCharacter({ available: event.target.checked })}
            />
            Available to viewers
          </FieldLabel>
        </Field>
        <FormField
          id="character-prompt"
          label="Instructions"
          description="Sent to OpenRouter with each question."
        >
          <Textarea
            id="character-prompt"
            disabled={formDisabled}
            value={chosenCharacter.value.prompt}
            onChange={(event) => editCharacter({ prompt: event.target.value })}
            rows={10}
            style={{ fieldSizing: 'fixed' }}
            className="h-64 min-h-48 resize-y leading-relaxed"
          />
        </FormField>
      </FieldGroup>
      <SaveActions
        disabled={blocked || !chosenCharacter.dirty}
        dirty={chosenCharacter.dirty}
        onDiscard={discardCharacter}
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
      <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-muted-foreground">
        <li>In OBS, use Sources → + → Browser and create a source named MomoiTTS.</li>
        <li>Leave Local file off and paste the address below into URL.</li>
        <li>Enable “Control audio via OBS” to give MomoiTTS its own mixer source.</li>
        <li>
          Leave “Shutdown source when not visible” and “Refresh browser when scene becomes active”
          off, then click OK.
        </li>
      </ol>
      <div className="my-4 flex min-w-0 items-center justify-between gap-3 rounded-md border bg-background p-2 pl-3">
        <code className="min-w-0 break-all text-xs">{location.origin}/player</code>
        <Button
          variant="outline"
          size="sm"
          aria-label="Copy OBS audio source URL"
          disabled={!view.connected}
          onClick={() => void copyPlayer()}
        >
          {copied ? <Check data-icon="inline-start" /> : <Copy data-icon="inline-start" />}
          {copied ? 'Copied' : 'Copy URL'}
        </Button>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        The blank source is normal. Reuse it across scenes; close ordinary /player tabs to keep
        audio in OBS.
      </p>
      {copyFailed ? (
        <FeedbackBanner
          message="Could not copy automatically. Select the address above and copy it manually into OBS."
          tone="warning"
        />
      ) : null}
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
          inline={page === 'setup'}
          fixedVoice={page === 'setup'}
          voiceId={testVoiceId}
          setVoiceId={setTestVoiceId}
          characters={m?.characters ?? []}
        />
      ) : null}
    </section>
  );
  const twitchContent = (
    <TwitchSettings state={state} server={server} blocked={blocked} draft={reward} />
  );

  function resultText(section: 'generation' | 'speech') {
    const result = results[section];
    if (!result) return 'Not tested during this visit';
    if (result.testRevision !== m?.testRevision) return 'Settings changed; test again';
    return result.ok
      ? section === 'speech'
        ? 'Speech generated; listen to confirm'
        : 'Text generation worked'
      : 'Last test failed';
  }
  function recordResult(
    section: 'generation' | 'speech',
    result: Omit<TestResult, 'testRevision'>,
  ) {
    setResults((previous) => ({
      ...previous,
      [section]: { ...result, testRevision: m?.testRevision ?? '' },
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
        <p className="text-sm leading-relaxed text-muted-foreground">
          Saving makes no provider request. “Configured” means saved, not tested.
        </p>
        {result ? (
          <FeedbackBanner
            tone={
              result.testRevision !== m?.testRevision ? 'warning' : result.ok ? 'success' : 'error'
            }
            message={
              resultText(section) +
              (result.testRevision === m?.testRevision
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
              <FeedbackBanner
                message={m.errors[section] ?? ''}
                tone={keyConfigured ? 'error' : 'info'}
              />
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

          <p className="text-sm leading-relaxed text-muted-foreground">
            Connection checks verify your key. Output tests check the model or voice.
          </p>

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
                key={m?.testRevision + ':' + generation.epoch.current}
                connected={view.connected}
                blocked={blocked}
                dirty={generation.dirty}
                ready={!!m?.generation.ready}
                characters={m?.characters ?? []}
                onResult={(result) => recordResult('generation', result)}
              />
            ) : (
              <SpeechTest
                key={m?.testRevision + ':' + speech.epoch.current}
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
          {!configured && !draft.dirty ? (
            <p className="text-sm text-muted-foreground">
              Save the configuration above to enable these checks.
            </p>
          ) : null}
        </section>
      </div>
    );
  }
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
        : 'Authorize the broadcaster, then create a viewer reward',
      status:
        state?.twitch?.status === 'connected'
          ? 'Connected'
          : state?.twitch?.status === 'error'
            ? 'Needs attention'
            : state?.twitch?.status === 'disabled'
              ? 'Needs setup'
              : 'Not connected',
      next: state?.twitchSetup?.rewardId
        ? state?.twitch?.message || 'Check Twitch connection'
        : state?.twitchSetup?.authorized
          ? 'Authorization saved; return here to create the reward after the other setup steps'
          : 'Sign in and approve MomoiTTS on Twitch; no reward is created yet',
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
              {['Configured', 'Connected', 'Needs attention'].includes(item.status) ? (
                <p className="mt-1 text-xs text-muted-foreground">{item.next}</p>
              ) : null}
            </div>
            <ChevronRight
              className="mt-1 size-5 shrink-0 text-muted-foreground group-hover:text-foreground sm:mt-0"
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      {!m?.characters.some((character) => character.available && character.voiceConfigured) ? (
        <FeedbackBanner
          tone="warning"
          message="Configure and enable at least one character in Characters before turning replies on."
        />
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
      onExit={() => void lifecycleAction('quit')}
      needsSetup={!m?.setupSeen || !m?.localReady || !state?.twitchSetup?.rewardId}
      playerMessage={playerMessage}
      audioConnected={view.connected && !!state?.playerConnected && state.status !== 'blocked'}
      blocked={blocked}
      canQuit={!!state?.canQuit}
    >
      <div ref={contentRef} className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {state &&
        ((page === 'settings' && topic !== 'overview') || (page === 'characters' && selected)) ? (
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
        ) : page === 'setup' ? (
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-8 md:px-8 md:py-10">
            <SetupJourney
              state={state}
              server={server}
              connected={view.connected && !lifecycle}
              blocked={blocked}
              dirty={hasDirty}
              dirtyStep={
                generation.dirty || speech.dirty || dirtyCharacterId
                  ? 1
                  : reward.dirty
                    ? 3
                    : undefined
              }
              dirtyPrepare={
                generation.dirty ? 0 : speech.dirty ? 1 : dirtyCharacterId ? 2 : undefined
              }
              selectedCharacterId={selected}
              selectedCharacter={chosenCharacter?.original}
              onChooseCharacter={setSelected}
              obsRequestId={obsTestId}
              connectContent={
                <TwitchSettings
                  state={state}
                  server={server}
                  blocked={blocked}
                  draft={reward}
                  mode="connect"
                />
              }
              generationContent={generationForm}
              speechContent={speechForm}
              voiceContent={setupVoice}
              obsContent={obsContent}
              rewardContent={
                <TwitchSettings
                  state={state}
                  server={server}
                  blocked={blocked}
                  draft={reward}
                  mode="reward"
                />
              }
              onComplete={() => {
                void server
                  .command('/api/config/application', { setupSeen: true })
                  .then(() => setPage('activity'))
                  .catch(() => {});
              }}
            />
          </div>
        ) : page === 'settings' ? (
          <div className="mx-auto flex w-full max-w-4xl flex-col gap-7 px-4 py-8 md:px-8 md:py-10">
            <header className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {topic === 'overview' ? 'Settings' : topicNames[topic]}
              </h1>
              <p className="max-w-2xl leading-relaxed text-muted-foreground">
                {topic === 'overview'
                  ? 'Configure your services and check what works.'
                  : topicDescriptions[topic]}
              </p>
            </header>
            {generation.dirty || speech.dirty || reward.dirty ? (
              <p role="status" className="text-sm text-primary">
                Unsaved changes in{' '}
                {[
                  generation.dirty && 'Generation',
                  speech.dirty && 'Speech',
                  reward.dirty && 'Twitch reward',
                ]
                  .filter(Boolean)
                  .join(', ')}
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
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 md:px-8 md:py-10">
            <header>
              <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
                {selected ? chosenCharacter?.value.name || 'Character' : 'Characters'}
              </h1>
            </header>
            {selected ? characterEditor : characterList}
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
              {dialog === 'diagnostics' ? 'Diagnostics' : 'Restart MomoiTTS?'}
            </DialogTitle>
            <DialogDescription>
              {dialog === 'diagnostics'
                ? 'Current setup and connection status.'
                : 'Active replies stop and waiting questions are cleared. Replies stay off until you turn them on.'}
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
              <Button disabled={blocked} onClick={() => void lifecycleAction('restart')}>
                Restart app
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </ManagementShell>
  );
}
