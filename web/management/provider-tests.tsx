import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import type { CharacterInfo, PlaybackState, RequestEntry } from '../../src/shared/protocol.ts';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Textarea } from './components/ui/textarea';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './components/ui/field';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from './components/ui/dialog';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { FeedbackBanner } from './feedback';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from './components/ui/select';
import { FlaskConical } from 'lucide-react';
import type { createServerState } from '../shared/server-state.ts';

type Server = ReturnType<typeof createServerState>;
type Availability = { connected: boolean; blocked: boolean; ready: boolean; dirty: boolean };
export type TestResult = { ok: boolean; message: string; at: number };
type ResultFeedback = { onResult?: (result: TestResult) => void };

function TestDialog({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <Button type="button" variant="outline" className="w-fit">
          <FlaskConical data-icon="inline-start" />
          {title}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b p-6 pr-12">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto p-6">
          {open ? <FieldGroup>{children}</FieldGroup> : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Provider tests stay out of the operation queue. Each request is bounded and canceled on departure.
function usePreviewTask(onResult?: ResultFeedback['onResult']) {
  const report = useRef(onResult);
  report.current = onResult;
  const active = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    mounted.current = true;
    const leave = () => active.current?.abort();
    window.addEventListener('pagehide', leave);
    return () => {
      mounted.current = false;
      active.current?.abort();
      window.removeEventListener('pagehide', leave);
    };
  }, []);
  async function run<T>(
    route: string,
    body: unknown,
    read: (response: Response) => Promise<T>,
  ): Promise<T | undefined> {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setFailed(false);
    setMessage('');
    try {
      const response = await fetch(route, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(46_000)]),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(typeof result.error === 'string' ? result.error : 'The test failed.');
      }
      const result = await read(response);
      controller.signal.throwIfAborted();
      if (mounted.current) return result;
    } catch (error) {
      if (mounted.current) {
        setFailed(!controller.signal.aborted);
        const message = controller.signal.aborted
          ? 'Test canceled.'
          : error instanceof Error &&
              !['TypeError', 'TimeoutError', 'AbortError'].includes(error.name)
            ? error.message
            : 'The connection was interrupted or timed out. Check the app before trying again.';
        setMessage(message);
        if (!controller.signal.aborted) report.current?.({ ok: false, message, at: Date.now() });
      }
    } finally {
      if (active.current === controller) active.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return { busy, message, failed, run, cancel: () => active.current?.abort() };
}

function availabilityMessage(value: Availability, provider: string) {
  return !value.connected
    ? 'Start or reconnect to MomoiTTS to test.'
    : value.dirty
      ? 'Save your changes before testing.'
      : !value.ready
        ? `Save your ${provider} settings before testing.`
        : value.blocked
          ? 'Wait for the current action to finish.'
          : '';
}
function Feedback({ message, failed }: { message: string; failed?: boolean }) {
  return message ? <FeedbackBanner message={message} tone={failed ? 'error' : 'info'} /> : null;
}

export function GenerationTest(
  props: Availability & ResultFeedback & { characters: CharacterInfo[] },
) {
  return (
    <TestDialog
      title="Test generation"
      description="Text only; no speech or OBS needed. Uses your saved provider’s allowance and may incur charges."
    >
      <GenerationPreview {...props} />
    </TestDialog>
  );
}
function GenerationPreview(props: Availability & ResultFeedback & { characters: CharacterInfo[] }) {
  const [text, setText] = useState('');
  const [character, setCharacter] = useState('');
  const [dialogue, setDialogue] = useState('');
  const task = usePreviewTask(props.onResult);
  const unavailable = availabilityMessage(props, 'generation');
  async function generate() {
    if (unavailable || !text.trim() || task.busy) return;
    setDialogue('');
    const result = await task.run<{ dialogue: string }>(
      '/api/test/response',
      { text: text.trim(), ...(character ? { character } : {}) },
      (response) => response.json(),
    );
    if (result) {
      setDialogue(result.dialogue);
      props.onResult?.({ ok: true, message: 'Text response generated.', at: Date.now() });
    }
  }
  return (
    <>
      <Field>
        <FieldLabel htmlFor="generation-test-text">Message</FieldLabel>
        <Textarea
          id="generation-test-text"
          rows={3}
          maxLength={1000}
          value={text}
          disabled={task.busy}
          autoFocus
          placeholder="Ask a question or say hello"
          onChange={(event) => {
            setText(event.target.value);
            setDialogue('');
          }}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="generation-test-character">
          Character prompt{' '}
          <span className="text-sm font-normal text-muted-foreground">Optional</span>
        </FieldLabel>
        <Select
          disabled={task.busy}
          value={character || 'none'}
          onValueChange={(value) => {
            setCharacter(value === 'none' ? '' : value);
            setDialogue('');
          }}
        >
          <SelectTrigger id="generation-test-character" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="none">No character prompt</SelectItem>
              {props.characters.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!!unavailable || task.busy || !text.trim()}
          onClick={() => void generate()}
        >
          {task.busy ? 'Generating…' : 'Generate response'}
        </Button>
        {task.busy ? (
          <Button type="button" variant="ghost" onClick={task.cancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      <Feedback message={unavailable || task.message} failed={task.failed && !unavailable} />
      {dialogue ? (
        <div
          className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-4"
          role="status"
        >
          <FeedbackBanner message="Response generated" tone="success" />
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{dialogue}</p>
        </div>
      ) : null}
    </>
  );
}

type VoiceInput = {
  voiceId: string;
  setVoiceId: (value: string) => void;
  characters?: CharacterInfo[];
};
type ObsTracking = {
  requestId: string;
  setRequestId: (value: string) => void;
  submission: RefObject<{ voiceId: string; eventId: string } | null>;
};
function VoiceField({
  voiceId,
  setVoiceId,
  disabled,
  id,
  characters = [],
}: VoiceInput & { disabled: boolean; id: string }) {
  const [character, setCharacter] = useState('custom');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (character === 'custom') return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setVoiceId('');
    void fetch(`/api/characters/${encodeURIComponent(character)}`, {
      cache: 'no-store',
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    })
      .then(async (response) => {
        if (!response.ok)
          throw new Error('Could not load the assigned voice. Try again or paste a voice ID.');
        const result = await response.json();
        controller.signal.throwIfAborted();
        setVoiceId(typeof result.voiceId === 'string' ? result.voiceId : '');
        if (!result.voiceId)
          setError('This character has no assigned voice. Choose another or paste a voice ID.');
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError('Could not load the assigned voice. Choose another or paste a voice ID.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [character]);
  return (
    <Field>
      <FieldLabel htmlFor={characters.length ? `${id}-choice` : id}>Voice</FieldLabel>
      {characters.length ? (
        <Select
          value={character}
          disabled={disabled}
          onValueChange={(value) => {
            setCharacter(value);
            setError('');
            setLoading(false);
          }}
        >
          <SelectTrigger id={`${id}-choice`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="custom">Use a voice ID</SelectItem>
              {characters.map((item) => (
                <SelectItem key={item.id} value={item.id}>
                  {item.name}’s assigned voice
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      ) : null}
      {character === 'custom' ? (
        <>
          {characters.length ? <FieldLabel htmlFor={id}>Voice ID</FieldLabel> : null}
          <Input
            id={id}
            value={voiceId}
            disabled={disabled}
            autoComplete="off"
            maxLength={32}
            placeholder="Paste a Fish Audio voice ID"
            onChange={(event) => setVoiceId(event.target.value.trim())}
          />
          <FieldDescription>32-character ID from Fish Audio.</FieldDescription>
        </>
      ) : (
        <FieldDescription>
          {loading ? 'Loading assigned voice…' : error || 'Uses this character’s saved voice.'}
        </FieldDescription>
      )}
    </Field>
  );
}
const validVoice = (value: string) => /^[a-f0-9]{32}$/iu.test(value);

export function SpeechTest(props: Availability & VoiceInput & ResultFeedback) {
  return (
    <TestDialog
      title="Test speech"
      description="Listen in this browser; no generation or OBS needed. Uses Fish Audio allowance and may incur charges."
    >
      <SpeechPreview {...props} />
    </TestDialog>
  );
}
function SpeechPreview(props: Availability & VoiceInput & ResultFeedback) {
  const [text, setText] = useState('This is a voice test. Your voice is ready to speak.');
  const [audioUrl, setAudioUrl] = useState('');
  const [playback, setPlayback] = useState('');
  const [playbackFailed, setPlaybackFailed] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  const task = usePreviewTask(props.onResult);
  const unavailable = availabilityMessage(props, 'speech');
  useEffect(() => {
    setAudioUrl('');
    setPlayback('');
    setPlaybackFailed(false);
  }, [props.voiceId]);
  useEffect(() => {
    if (!audioUrl) return;
    const target = audio.current;
    const leave = () => target?.pause();
    window.addEventListener('pagehide', leave);
    void target?.play().catch(() => setPlayback('Audio is ready. Press Play below to hear it.'));
    return () => {
      target?.pause();
      if (target) {
        target.removeAttribute('src');
        target.load();
      }
      URL.revokeObjectURL(audioUrl);
      window.removeEventListener('pagehide', leave);
    };
  }, [audioUrl]);
  async function generate() {
    if (unavailable || !validVoice(props.voiceId) || !text.trim() || task.busy) return;
    setAudioUrl('');
    setPlayback('');
    setPlaybackFailed(false);
    const result = await task.run<Blob>(
      '/api/test/speech',
      { text: text.trim(), voiceId: props.voiceId },
      async (response) => {
        if (!response.headers.get('Content-Type')?.startsWith('audio/mpeg'))
          throw new Error('The speech test returned invalid audio.');
        const blob = await response.blob();
        if (!blob.size || blob.size > 5_000_000)
          throw new Error('The speech test returned invalid audio.');
        return blob;
      },
    );
    if (result) {
      setAudioUrl(URL.createObjectURL(result));
      props.onResult?.({
        ok: true,
        message: 'Speech generated for browser preview.',
        at: Date.now(),
      });
    }
  }
  return (
    <>
      <VoiceField {...props} disabled={task.busy} id="speech-test-voice" />
      <Field>
        <FieldLabel htmlFor="speech-test-text">Phrase</FieldLabel>
        <Textarea
          id="speech-test-text"
          rows={3}
          maxLength={1000}
          disabled={task.busy}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setAudioUrl('');
            setPlayback('');
            setPlaybackFailed(false);
          }}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!!unavailable || task.busy || !validVoice(props.voiceId) || !text.trim()}
          onClick={() => void generate()}
        >
          {task.busy ? 'Generating speech…' : 'Generate speech'}
        </Button>
        {task.busy ? (
          <Button type="button" variant="ghost" onClick={task.cancel}>
            Cancel
          </Button>
        ) : null}
      </div>
      <Feedback
        message={
          unavailable ||
          task.message ||
          (props.voiceId && !validVoice(props.voiceId)
            ? 'Enter a valid voice ID to test speech.'
            : '')
        }
        failed={task.failed && !unavailable}
      />
      {audioUrl ? (
        <div className="flex min-w-0 flex-col gap-3 rounded-lg border bg-background p-4">
          <FeedbackBanner message="Speech generated" tone="success" />
          <audio
            ref={audio}
            controls
            className="w-full"
            src={audioUrl}
            aria-label="Speech preview"
            preload="auto"
            onPlaying={() => {
              setPlayback('Playing preview.');
              setPlaybackFailed(false);
            }}
            onEnded={() => setPlayback('Preview finished.')}
            onError={() => {
              setPlayback('The browser could not play this audio. Check its audio output.');
              setPlaybackFailed(true);
            }}
          />
          <Feedback message={playback} failed={playbackFailed} />
        </div>
      ) : null}
    </>
  );
}

export function ObsTest(
  props: VoiceInput &
    ObsTracking & {
      state: PlaybackState;
      server: Server;
      blocked: boolean;
      dirty: boolean;
      connected: boolean;
    },
) {
  return (
    <TestDialog
      title="Test OBS output"
      description="Uses Fish Audio allowance and may incur charges. Closing this window leaves the test running; use Cancel test to stop it."
    >
      <ObsPreview {...props} />
    </TestDialog>
  );
}
function ObsPreview({
  state,
  server,
  blocked,
  dirty,
  connected,
  requestId,
  setRequestId,
  submission,
  ...voice
}: VoiceInput &
  ObsTracking & {
    state: PlaybackState;
    server: Server;
    blocked: boolean;
    dirty: boolean;
    connected: boolean;
  }) {
  const [message, setMessage] = useState('');
  const queue = state.queue;
  const entry = queue?.requests.find((item) => item.id === requestId);
  const unfinished =
    !!entry && !['completed', 'failed', 'skipped', 'removed', 'expired'].includes(entry.status);
  const unavailable = !connected
    ? 'Start or reconnect to MomoiTTS to test.'
    : dirty
      ? 'Save your speech settings before testing.'
      : !state.management?.speech.ready
        ? 'Save your speech settings before testing.'
        : !state.playerConnected
          ? 'Activate an audio source using the address above; use OBS for stream output.'
          : !queue?.repliesEnabled
            ? 'Turn replies on to test OBS output.'
            : (queue?.activeId || queue?.waitingIds.length) && !unfinished && !submission.current
              ? 'Wait for queued replies to finish before testing OBS output.'
              : '';
  async function test() {
    if (unavailable || blocked || unfinished || !validVoice(voice.voiceId)) return;
    setMessage('');
    if (!submission.current || submission.current.voiceId !== voice.voiceId)
      submission.current = { voiceId: voice.voiceId, eventId: crypto.randomUUID() };
    try {
      const result = await server.command<PlaybackState & { requestId: string }>(
        '/api/test/obs',
        submission.current,
      );
      setRequestId(result.requestId);
      submission.current = null;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not test OBS output.');
    }
  }
  return (
    <>
      <p className="text-sm leading-relaxed text-muted-foreground">
        Listen in OBS monitoring or a recording to confirm stream output.
      </p>
      <VoiceField {...voice} disabled={blocked || unfinished} id="obs-test-voice" />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          disabled={!!unavailable || blocked || unfinished || !validVoice(voice.voiceId)}
          onClick={() => void test()}
        >
          Send test phrase
        </Button>
        {connected && !queue?.repliesEnabled ? (
          <Button
            type="button"
            variant="outline"
            disabled={blocked}
            onClick={() =>
              void server
                .command('/api/replies/on', {})
                .catch((error) =>
                  setMessage(error instanceof Error ? error.message : 'Could not turn replies on.'),
                )
            }
          >
            Turn replies on
          </Button>
        ) : null}
        {unfinished ? (
          <Button
            type="button"
            variant="ghost"
            disabled={blocked}
            onClick={() =>
              void server
                .command('/api/test/obs/cancel', { requestId })
                .catch((error) =>
                  setMessage(error instanceof Error ? error.message : 'Could not cancel the test.'),
                )
            }
          >
            Cancel test
          </Button>
        ) : null}
      </div>
      <Feedback
        message={
          message ||
          unavailable ||
          (voice.voiceId && !validVoice(voice.voiceId)
            ? 'Enter a valid voice ID to test OBS output.'
            : '')
        }
        failed={!!message}
      />
      {entry ? (
        <FeedbackBanner
          message={obsFeedback(entry)}
          tone={
            entry.status === 'failed'
              ? 'error'
              : entry.status === 'completed'
                ? 'success'
                : entry.status === 'blocked'
                  ? 'warning'
                  : 'info'
          }
        />
      ) : null}
    </>
  );
}
function obsFeedback(entry: RequestEntry) {
  if (entry.error) return entry.error;
  if (entry.status === 'completed')
    return 'The audio source finished playback. Confirm you heard it in OBS; the app cannot verify OBS routing.';
  if (entry.status === 'blocked')
    return 'Audio is blocked. Use OBS Interact and click the blank source.';
  if (['skipped', 'removed', 'expired'].includes(entry.status)) return 'OBS output test stopped.';
  if (entry.status === 'playing') return 'Playing through the connected audio source.';
  if (entry.status === 'ready') return 'Waiting for the audio source to start playback.';
  return entry.status === 'synthesizing' ? 'Generating the test phrase…' : 'Test queued.';
}
