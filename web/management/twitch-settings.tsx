import { useEffect, useRef, useState } from 'react';
import type { PlaybackState } from '../../src/shared/protocol.ts';
import type { createServerState } from '../shared/server-state.ts';
import { Button, buttonVariants } from './components/ui/button';
import { Input } from './components/ui/input';
import { Field, FieldGroup, FieldLabel, FieldDescription } from './components/ui/field';
import { FeedbackBanner } from './feedback';

type RewardDraft = { title: string; cost: number; cooldown: number };
const rewardValue = (state?: PlaybackState | null): RewardDraft => ({
  title: state?.twitchSetup?.rewardTitle ?? 'Ask a character',
  cost: state?.twitchSetup?.rewardCost ?? 1000,
  cooldown: state?.twitchSetup?.rewardCooldown ?? 60,
});

// The owning App keeps this draft when the Twitch page is unmounted.
export function useRewardDraft(state?: PlaybackState | null) {
  const [value, setValue] = useState(() => rewardValue(state));
  const [dirty, setDirty] = useState(false);
  const dirtyRef = useRef(false);
  const setup = state?.twitchSetup;
  useEffect(() => {
    if (!dirtyRef.current) setValue(rewardValue(state));
  }, [
    setup?.channel,
    setup?.rewardId,
    setup?.rewardTitle,
    setup?.rewardCost,
    setup?.rewardCooldown,
  ]);
  function edit(patch: Partial<RewardDraft>) {
    dirtyRef.current = true;
    setDirty(true);
    setValue((current) => ({ ...current, ...patch }));
  }
  function reset(savedState = state) {
    dirtyRef.current = false;
    setDirty(false);
    setValue(rewardValue(savedState));
  }
  return { value, dirty, edit, reset };
}

export function TwitchSettings({
  state,
  server,
  blocked,
  draft,
  mode = 'all',
}: {
  state?: PlaybackState | null;
  server: ReturnType<typeof createServerState>;
  blocked: boolean;
  draft: ReturnType<typeof useRewardDraft>;
  mode?: 'all' | 'connect' | 'reward';
}) {
  const setup = state?.twitchSetup;
  const { title, cost, cooldown } = draft.value;
  const cooldownInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    cooldownInput.current?.setCustomValidity(
      cooldown > 0 && cooldown < 60 ? 'Use 0 for none, or at least 60 seconds.' : '',
    );
  }, [cooldown]);
  const busy = blocked || !!setup?.busy;
  async function authorize() {
    const popup = window.open('about:blank', '_blank');
    try {
      const result = await server.command<PlaybackState>('/api/twitch/authorize', {}, 20_000);
      const url = result.twitchSetup?.activationUrl;
      if (popup && url) {
        popup.opener = null;
        popup.location.href = url;
      } else popup?.close();
    } catch {
      popup?.close();
    }
  }
  return (
    <section className="flex flex-col gap-5">
      <FeedbackBanner
        message={setup?.message ?? 'Twitch setup is unavailable.'}
        tone={setup?.registrationReady ? 'info' : 'warning'}
      />
      {mode !== 'reward' ? (
        <p className="text-sm text-muted-foreground">
          Requires Channel Points access. MomoiTTS needs permission to manage its reward and refund
          requests.
        </p>
      ) : null}
      {mode !== 'reward' && (!setup?.authorized || setup.activationUrl) ? (
        <p className="text-sm text-muted-foreground">
          Twitch opens with the code filled in. Check your broadcaster account, click Activate,
          approve MomoiTTS, then return here. Twitch calls this app your “device”.
        </p>
      ) : null}
      {mode !== 'reward' && setup?.channel ? (
        <div className="flex flex-col gap-1">
          <p>
            Saved broadcaster: <strong>{setup.channel}</strong>
          </p>
        </div>
      ) : null}
      {mode !== 'reward' ? (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !setup?.registrationReady} onClick={() => void authorize()}>
            {setup?.activationUrl
              ? 'Waiting for Twitch approval'
              : setup?.authorized
                ? 'Authorize Twitch again'
                : 'Connect Twitch account'}
          </Button>
          {setup?.busy ? (
            <Button
              variant="outline"
              disabled={blocked}
              onClick={() => void server.command('/api/twitch/cancel', {}).catch(() => {})}
            >
              {setup.activationUrl ? 'Cancel sign-in' : 'Cancel Twitch action'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {mode !== 'reward' && setup?.activationUrl ? (
        <div className="flex flex-col gap-2">
          <p>
            Code, if Twitch's field is blank: <strong>{setup.userCode}</strong>
          </p>
          <p className="text-sm text-muted-foreground">
            Tab didn't open? Use the link below. Cancel sign-in to start again.
          </p>
          <a
            className={buttonVariants({ variant: 'outline' })}
            href={setup.activationUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open Twitch to finish sign-in
          </a>
        </div>
      ) : null}
      {mode !== 'connect' && setup?.authorized ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !title.trim() || (cooldown > 0 && cooldown < 60)) return;
            void server
              .command<PlaybackState>(
                '/api/twitch/reward',
                { title: title.trim(), cost, cooldown },
                50_000,
              )
              .then((result) => draft.reset(result))
              .catch(() => {});
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="reward-title">Reward name</FieldLabel>
              <Input
                id="reward-title"
                value={title}
                required
                pattern={'.*\\S.*'}
                maxLength={45}
                disabled={busy}
                onChange={(event) => draft.edit({ title: event.target.value })}
              />
              <FieldDescription>
                The name viewers see in your channel's Channel Points menu.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="reward-cost">Price (Channel Points)</FieldLabel>
              <Input
                id="reward-cost"
                type="number"
                min={1}
                max={1000000}
                required
                step={1}
                value={Number.isNaN(cost) ? '' : cost}
                disabled={busy}
                onChange={(event) => draft.edit({ cost: event.target.valueAsNumber })}
              />
              <FieldDescription>
                Points per question. Provider charges are separate.
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="reward-cooldown">Reward cooldown (seconds)</FieldLabel>
              <Input
                id="reward-cooldown"
                ref={cooldownInput}
                type="number"
                min={0}
                max={604800}
                required
                step={1}
                value={Number.isNaN(cooldown) ? '' : cooldown}
                disabled={busy}
                onChange={(event) => draft.edit({ cooldown: event.target.valueAsNumber })}
              />
              <FieldDescription>
                Wait between redemptions, for everyone. Use 0 for none, or at least 60 seconds.
              </FieldDescription>
            </Field>
          </FieldGroup>
          <p className="text-sm text-muted-foreground">
            Viewers enter <strong>Name: question</strong> using an available character below.
          </p>
          <p className="text-sm text-muted-foreground">
            Available characters:{' '}
            {state?.management?.characters
              .filter((character) => character.available)
              .map((character) => character.name)
              .join(', ') || 'Assign and enable a voice first'}
            .
          </p>
          <p className="text-sm text-muted-foreground">
            {setup.rewardId
              ? 'Updates your existing reward.'
              : 'Creates one shared reward. It starts paused.'}
          </p>
          <Button
            className="w-fit"
            disabled={busy || !state?.management?.localReady || !state.playerConnected}
          >
            {setup.rewardId ? 'Save reward changes' : 'Create Channel Points reward'}
          </Button>
          {draft.dirty ? (
            <div className="flex flex-col items-start gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => draft.reset()}>
                Discard changes
              </Button>
              <FeedbackBanner message="Unsaved reward changes" tone="warning" />
            </div>
          ) : null}
          {!state?.playerConnected ? (
            <FieldDescription>
              Connect and test the OBS source before creating the reward.
            </FieldDescription>
          ) : null}
          {!state?.management?.localReady ? (
            <FieldDescription>
              Finish Generation and Speech settings and make at least one character available before
              creating the reward.
            </FieldDescription>
          ) : null}
        </form>
      ) : null}
      {mode !== 'connect' && setup?.rewardId ? (
        <>
          <FeedbackBanner
            message={state?.twitch?.message ?? 'Ready to connect.'}
            tone={state?.twitch?.status === 'error' ? 'error' : 'info'}
          />
          {state?.twitch?.status !== 'connected' &&
          state?.twitch?.status !== 'connecting' &&
          state?.twitch?.status !== 'reconnecting' ? (
            <Button
              className="w-fit"
              disabled={busy}
              onClick={() => void server.command('/api/twitch/connect', {}).catch(() => {})}
            >
              Reconnect Twitch
            </Button>
          ) : null}
          {state?.twitch?.settlementMessage ? (
            <FeedbackBanner message={state.twitch.settlementMessage} tone="warning" />
          ) : null}
          <p className="text-sm text-muted-foreground">
            Paused while offline, replies are off, audio is unavailable or the queue is full.
          </p>
        </>
      ) : null}
    </section>
  );
}
