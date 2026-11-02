import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { CharacterEditorState, PlaybackState } from '../../src/shared/protocol.ts';
import type { createServerState } from '../shared/server-state.ts';
import { Button } from './components/ui/button';
import { Textarea } from './components/ui/textarea';
import { Field, FieldLabel, FieldDescription } from './components/ui/field';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './components/ui/card';
import { FeedbackBanner } from './feedback';
import { preparationLimit, readSetupPosition, setupLimit } from './setup-progress';

type Props = {
  state: PlaybackState;
  server: ReturnType<typeof createServerState>;
  connected: boolean;
  blocked: boolean;
  dirty: boolean;
  dirtyStep?: number;
  dirtyPrepare?: number;
  selectedCharacterId: string | null;
  selectedCharacter?: CharacterEditorState;
  obsRequestId: string;
  connectContent: ReactNode;
  generationContent: ReactNode;
  speechContent: ReactNode;
  voiceContent: ReactNode;
  obsContent: ReactNode;
  rewardContent: ReactNode;
  onChooseCharacter: (id: string) => void;
  onComplete: () => void;
};
const storageKey = 'momoitts.setup-position.v1';
const steps = ['Connect Twitch', 'Connect AI and voice', 'Connect OBS', 'Create reward', 'Ready'];
const preparation = ['Text service', 'Speech service', 'Voice', 'Try a reply'];
function savedPosition() {
  try {
    return readSetupPosition(localStorage.getItem(storageKey));
  } catch {
    return readSetupPosition(null);
  }
}

export function SetupJourney(props: Props) {
  const { state, selectedCharacter: character } = props;
  const [initial] = useState(savedPosition);
  const [step, setStep] = useState(initial.step);
  const [prepare, setPrepare] = useState(initial.prepare);
  const [privateEvidence, setPrivateEvidence] = useState('');
  const [obsRun, setObsRun] = useState<{
    id: string;
    fingerprint: string;
    heard: boolean;
  } | null>(null);
  const lastObsId = useRef(props.obsRequestId);
  const [message, setMessage] = useState('');
  const selectedOnce = useRef(false);
  const management = state.management;
  const authorized = state.twitchSetup?.authorized === true;
  const intakeOff = !state.repliesRequested && !state.queue?.repliesEnabled;
  const preparationDirty = props.dirty && props.dirtyStep !== 3;
  // This transient comparison includes saved instructions, never writes them to browser storage.
  const fingerprint = JSON.stringify([
    management?.testRevision,
    state.twitchSetup?.channel,
    management?.generation,
    management?.speech,
    character?.id,
    character?.prompt,
    character?.voiceId,
    character?.available,
  ]);
  const characterReady = !!character?.available && /^[a-f0-9]{32}$/iu.test(character.voiceId);
  const prepareLimit = preparationLimit(
    !!management?.generation.ready,
    !!management?.speech.ready,
    characterReady,
  );
  const privateReady = privateEvidence === fingerprint && prepareLimit === 3 && !preparationDirty;
  const testEntry = state.queue?.requests.find((entry) => entry.id === props.obsRequestId);
  const currentObsRun = obsRun?.id === props.obsRequestId && obsRun?.fingerprint === fingerprint;
  const obsReady =
    currentObsRun &&
    obsRun?.heard &&
    testEntry?.status === 'completed' &&
    privateReady &&
    props.connected &&
    state.playerConnected &&
    intakeOff;
  const limit = setupLimit(authorized, privateReady, obsReady, !!state.twitchSetup?.rewardId);
  // A pending draft must remain reachable even when setup prerequisites have changed.
  const activeStep = props.dirtyStep ?? Math.min(step, limit);
  const activePrepare = props.dirtyPrepare ?? Math.min(prepare, prepareLimit);
  const unavailable = !props.connected
    ? 'Reconnect to MomoiTTS to continue.'
    : !intakeOff
      ? 'Turn replies off before continuing setup.'
      : props.dirty
        ? 'Save or discard your changes before continuing.'
        : props.blocked
          ? 'Wait for the current action to finish.'
          : '';
  const unfinished =
    !!testEntry &&
    !['completed', 'failed', 'skipped', 'removed', 'expired'].includes(testEntry.status);

  useEffect(() => {
    if (selectedOnce.current || !management?.characters.length) return;
    selectedOnce.current = true;
    const id =
      props.dirty && props.selectedCharacterId
        ? props.selectedCharacterId
        : (management.characters.find((item) => item.id === 'tyrone')?.id ??
          (management.characters.some((item) => item.id === initial.characterId)
            ? initial.characterId!
            : (props.selectedCharacterId ?? management.characters[0]!.id)));
    if (id !== props.selectedCharacterId) props.onChooseCharacter(id);
  }, [management?.characters, props.selectedCharacterId]);
  useEffect(() => {
    if (!props.selectedCharacterId) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          version: 1,
          step,
          prepare,
          characterId: props.selectedCharacterId,
        }),
      );
    } catch {
      /* Navigation works without browser storage. */
    }
  }, [step, prepare, props.selectedCharacterId]);
  useEffect(() => {
    setPrivateEvidence('');
    setObsRun(null);
  }, [fingerprint, preparationDirty]);
  useEffect(() => {
    if (props.obsRequestId !== lastObsId.current) {
      setObsRun(props.obsRequestId ? { id: props.obsRequestId, fingerprint, heard: false } : null);
    }
    lastObsId.current = props.obsRequestId;
  }, [props.obsRequestId, fingerprint]);
  useEffect(() => {
    if (!props.connected || !state.playerConnected || !intakeOff) setObsRun(null);
  }, [props.connected, state.playerConnected, intakeOff]);
  useEffect(() => {
    const leave = () => {
      setPrivateEvidence('');
      setObsRun(null);
    };
    window.addEventListener('pagehide', leave);
    return () => window.removeEventListener('pagehide', leave);
  }, []);

  function next() {
    setMessage('');
    setStep(Math.min(4, activeStep + 1));
  }
  return (
    <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Let's set up MomoiTTS</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Get one character speaking in OBS. Viewer replies stay off.
        </p>
      </div>
      <nav aria-label="Setup progress">
        <ol className="flex flex-wrap gap-x-4 gap-y-2">
          {steps.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                disabled={index > limit || props.blocked || props.dirty || unfinished}
                aria-current={activeStep === index ? 'step' : undefined}
                className={`flex items-center gap-2 rounded px-1 py-1 text-sm disabled:opacity-40 ${activeStep === index ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}
                onClick={() => setStep(index)}
              >
                {index < limit ? (
                  <Check className="size-3.5" aria-hidden="true" />
                ) : (
                  <span className="text-xs">{index + 1}</span>
                )}
                {label}
              </button>
            </li>
          ))}
        </ol>
      </nav>
      {!intakeOff ? (
        <div className="flex flex-wrap items-center gap-3">
          <FeedbackBanner
            message="Replies are on. Turn them off to set up safely."
            tone="warning"
          />
          <Button
            type="button"
            variant="outline"
            disabled={!props.connected || props.blocked}
            onClick={() =>
              void props.server
                .command('/api/replies/off', {})
                .catch((error) =>
                  setMessage(
                    error instanceof Error ? error.message : 'Could not turn replies off.',
                  ),
                )
            }
          >
            Turn replies off
          </Button>
        </div>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>{steps[activeStep]}</CardTitle>
          <CardDescription>
            {activeStep === 0
              ? 'Connect your broadcaster account.'
              : activeStep === 1
                ? 'Connect the services, assign a voice and hear a reply.'
                : activeStep === 2
                  ? 'Add the audio source, then check a recording.'
                  : activeStep === 3
                    ? 'Create one shared Channel Points reward. It stays paused until replies are on.'
                    : 'Setup checks passed for this visit. Live replies are still off.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-6">
          {activeStep === 0 ? (
            <>
              {props.connectContent}
              <Continue disabled={!!unavailable || !authorized} onClick={next} />
            </>
          ) : activeStep === 1 ? (
            <>
              <nav aria-label="Character preparation" className="flex flex-wrap gap-2">
                {preparation.map((label, index) => (
                  <Button
                    key={label}
                    type="button"
                    size="sm"
                    variant={activePrepare === index ? 'default' : 'ghost'}
                    disabled={index > prepareLimit || props.blocked || props.dirty}
                    aria-current={activePrepare === index ? 'step' : undefined}
                    onClick={() => setPrepare(index)}
                  >
                    {label}
                  </Button>
                ))}
              </nav>
              {activePrepare === 0 ? (
                props.generationContent
              ) : activePrepare === 1 ? (
                props.speechContent
              ) : activePrepare === 2 ? (
                props.voiceContent
              ) : (
                <PrivateReplyTest
                  key={fingerprint + ':' + props.dirty}
                  character={character}
                  unavailable={
                    unavailable ||
                    (prepareLimit < 3 ? 'Complete and save the services and character first.' : '')
                  }
                  onHeard={() => setPrivateEvidence(fingerprint)}
                  verified={privateReady}
                />
              )}
              {activePrepare < 3 ? (
                <Continue
                  disabled={!!unavailable || prepareLimit <= activePrepare}
                  onClick={() => setPrepare(activePrepare + 1)}
                />
              ) : (
                <Continue disabled={!!unavailable || !privateReady} onClick={next} />
              )}
              <p className="text-xs text-muted-foreground">
                Saved settings resume after reopening. Repeat audio checks after reloading or
                changing settings.
              </p>
            </>
          ) : activeStep === 2 ? (
            <>
              {props.obsContent}
              {obsReady ? (
                <FeedbackBanner message="OBS recording confirmed." tone="success" />
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-9 w-fit whitespace-normal text-left"
                  disabled={
                    !!unavailable ||
                    !state.playerConnected ||
                    testEntry?.status !== 'completed' ||
                    !currentObsRun
                  }
                  onClick={() => setObsRun((run) => (run ? { ...run, heard: true } : null))}
                >
                  I heard the test in an OBS recording
                </Button>
              )}
              <Continue disabled={!!unavailable || !obsReady} onClick={next} />
            </>
          ) : activeStep === 3 ? (
            <>
              {props.rewardContent}
              <Continue disabled={!!unavailable || !state.twitchSetup?.rewardId} onClick={next} />
            </>
          ) : (
            <>
              <ul className="flex flex-col gap-2 text-sm">
                <li>Twitch: {state.twitchSetup?.channel}</li>
                <li>Character reply: heard in this browser</li>
                <li>OBS: connected, recording confirmed</li>
                <li>Reward: {state.twitchSetup?.rewardTitle}</li>
              </ul>
              <p className="text-sm text-muted-foreground">
                Open Activity when you're ready. Turning replies on admits viewer questions while
                your channel is live.
              </p>
              <Button
                type="button"
                className="w-fit"
                disabled={!!unavailable || limit !== 4}
                onClick={props.onComplete}
              >
                Open Activity
              </Button>
            </>
          )}
          <FeedbackBanner message={message || unavailable} tone={message ? 'error' : 'info'} />
        </CardContent>
      </Card>
    </div>
  );
}

function Continue({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <Button type="button" className="w-fit" disabled={disabled} onClick={onClick}>
      Continue <ChevronRight aria-hidden="true" data-icon="inline-end" />
    </Button>
  );
}

function PrivateReplyTest({
  character,
  unavailable,
  verified,
  onHeard,
}: {
  character?: CharacterEditorState;
  unavailable: string;
  verified: boolean;
  onHeard: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [dialogue, setDialogue] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [finished, setFinished] = useState(false);
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    mounted.current = true;
    const leave = () => {
      active.current?.abort();
      audio.current?.pause();
      if (mounted.current) {
        setFinished(false);
        setAudioUrl('');
        setDialogue('');
      }
    };
    window.addEventListener('pagehide', leave);
    return () => {
      mounted.current = false;
      leave();
      window.removeEventListener('pagehide', leave);
    };
  }, []);
  useEffect(() => {
    if (unavailable) {
      active.current?.abort();
      audio.current?.pause();
    }
  }, [unavailable]);
  useEffect(() => {
    if (!audioUrl) return;
    const target = audio.current;
    return () => {
      target?.pause();
      if (target) {
        target.removeAttribute('src');
        target.load();
      }
      URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);
  async function test() {
    if (!character || unavailable || active.current || !question.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setMessage('');
    setDialogue('');
    setAudioUrl('');
    setFinished(false);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(92_000)]);
    async function post(route: string, body: unknown) {
      const response = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([signal, AbortSignal.timeout(46_000)]),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(typeof result.error === 'string' ? result.error : 'The reply test failed.');
      }
      signal.throwIfAborted();
      return response;
    }
    try {
      const response = await post('/api/test/response', {
        text: question.trim(),
        character: character.id,
      });
      const result = await response.json();
      signal.throwIfAborted();
      if (typeof result.dialogue !== 'string' || !result.dialogue.trim())
        throw new Error('The service returned an empty reply.');
      const speech = await post('/api/test/speech', {
        text: result.dialogue,
        voiceId: character.voiceId,
      });
      if (!speech.headers.get('Content-Type')?.startsWith('audio/mpeg'))
        throw new Error('The service returned invalid audio.');
      const blob = await speech.blob();
      signal.throwIfAborted();
      if (!blob.size || blob.size > 5_000_000)
        throw new Error('The service returned invalid audio.');
      if (mounted.current) {
        setDialogue(result.dialogue);
        setAudioUrl(URL.createObjectURL(blob));
      }
    } catch (error) {
      if (mounted.current)
        setMessage(
          controller.signal.aborted
            ? 'Test canceled.'
            : error instanceof Error &&
                !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)
              ? error.message
              : 'Connection interrupted or timed out. Try again after checking the app.',
        );
    } finally {
      if (active.current === controller) active.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Field>
        <FieldLabel htmlFor="setup-reply-question">
          Ask {character?.name ?? 'your character'} a question
        </FieldLabel>
        <Textarea
          id="setup-reply-question"
          rows={3}
          maxLength={1000}
          value={question}
          disabled={busy || verified}
          placeholder="Say hello or ask a short question"
          onChange={(event) => {
            setQuestion(event.target.value);
            setDialogue('');
            setAudioUrl('');
            setFinished(false);
          }}
        />
        <FieldDescription>
          Private browser preview. Uses both providers' allowance; charges may apply.
        </FieldDescription>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        {!verified ? (
          <Button
            type="button"
            disabled={!!unavailable || busy || !question.trim()}
            onClick={() => void test()}
          >
            {busy ? 'Preparing reply…' : 'Generate a test reply'}
          </Button>
        ) : null}
        {busy ? (
          <Button type="button" variant="ghost" onClick={() => active.current?.abort()}>
            Cancel
          </Button>
        ) : null}
      </div>
      {dialogue ? (
        <p className="whitespace-pre-wrap break-words rounded-lg border p-4 text-sm">{dialogue}</p>
      ) : null}
      {audioUrl ? (
        <>
          <audio
            ref={audio}
            src={audioUrl}
            controls
            className="w-full"
            aria-label="Character reply preview"
            onEnded={() => setFinished(true)}
            onError={() => {
              setFinished(false);
              setMessage('Could not play the reply. Check this browser’s audio output.');
            }}
          />
          {!verified ? (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={!finished || !!unavailable}
              onClick={onHeard}
            >
              I heard the reply
            </Button>
          ) : null}
        </>
      ) : null}
      <FeedbackBanner
        message={verified ? 'Character reply heard.' : message || unavailable}
        tone={verified ? 'success' : message ? 'error' : 'info'}
      />
    </div>
  );
}
