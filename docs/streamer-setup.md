# Set up the character app on the streamer's PC

Use this with your helper. The app runs on the streamer's Windows PC and uses the streamer's own Twitch authorization, configured generation access, and Fish API key. Viewers select a personality using `Name: question` in one shared Channel Points option. Each personality has an assigned voice; Tyrone is the first example. Final voices can be selected last. Launcher filenames and the provisional reward title retain their existing names until app naming is discussed.

This guide describes the current implementation. Broader setup changes, live Twitch integration, and OBS linking remain deferred. OpenRouter is configured through a private file; the existing graphical generation steps are for Codex only.

## First: local demo

1. Extract the entire ZIP into a writable folder, such as `Desktop\Tyrone`. Keep all files together; do not launch from inside the ZIP.
2. Install [Node.js](https://nodejs.org/en/download) 24.12 or newer. Close and reopen setup after installing it.
3. Double-click **Setup Tyrone.cmd**. In **Prepare this PC**, click **Install app dependencies** and wait for installation/build to finish in its action window. Press Enter there to return to setup. Internet is required; this installs app dependencies, without calling generation, speech, or Twitch services.
4. Click **Next step** to reach **Try the demo**, then **Open demo**, or double-click **Try Tyrone Demo.cmd**. Playback and controls share one page; click **Enable audio** there if needed.
5. Keep the controls open and open `/testing` on the same local address in another tab. Send a test question using `Tyrone: How do I improve at ranked?`. Expect simulated dialogue and a two-second tone. Check Pause/Resume, Skip, and Replay. The stream-control page plays the audio; the testing page does not. Missing/unknown names are rejected, with no default personality.

The setup window shows one step at a time. **Back** and **Next step** only navigate; actions run only when you click their named buttons. You may skip account steps to inspect the flow locally. **Continue later** saves your current page so you can return. Navigating to the last page does not certify accounts or services as ready. Install/sign-in actions open separate windows; finish or close those windows before continuing.

## Next: Twitch with demo audio

1. The broadcaster registers a [Public Twitch application](https://dev.twitch.tv/docs/authentication/register-app/) in their developer console. Follow Twitch's registration requirements, select Public, and copy its client ID. No client secret is needed by Tyrone.
2. **Configure Twitch → Edit Twitch settings** opens `.local/twitch.env` in Notepad. Replace the client ID placeholder and enter the broadcaster's channel login, without a URL. Save and close. Leave the reward title/cost defaults unless you want to change them.
3. **Authorize the broadcaster → Sign in to Twitch** displays Twitch's activation URL/code in its action window. The owner authorizes as the broadcaster on their own PC. Moderator/editor access alone cannot substitute for broadcaster authorization. Tokens are saved locally.
4. **Create the reward and test Twitch → Create or check reward** explicitly creates/checks the required-text reward after a confirmation. Initial settings are **Ask Tyrone**, **1000 points**, and **60-second global cooldown**; repeat setup preserves the existing reward settings. This requires channel-points eligibility. A manually created reward cannot substitute for the app-created one. Keep required viewer text enabled and automatic fulfillment disabled.
5. Quit any running demo, relaunch it, and click **Connect Twitch** in controls. Redeem the shared option with `Tyrone: your question`. Check a redemption completes with demo audio; check a missing/unknown name, skipped request, and moderator rejection are refunded in Twitch. Pending outcomes must resolve before calling the trial successful. Existing reward setup preserves its settings; update outdated viewer instructions in Twitch during the separately agreed live setup.

Twitch points can be consumed by completed demo redemptions. Plan this trial with the broadcaster and a cooperating viewer. No real channel or reward has been tested merely by building this package.

## Last: live accounts and final voice

Choose generation with your helper before following the Codex steps below. For OpenRouter, skip both Codex installation and ChatGPT sign-in: copy `config/examples/generation.env.example` to `.local/generation.env`, set `TYRONE_TEXT_PROVIDER=openrouter`, and replace the key and exact model ID placeholders. Keep the key private. No final model is selected. This development integration restricts routes to zero price and does not fall back; verify free access and allowance and discuss the connected trial before submitting questions. Change `OPENROUTER_MODEL` and quit/relaunch to switch models. The optional `OPENROUTER_MAX_TOKENS` setting controls the token ceiling (default 1024, range 64–16384); it is not the 60-word spoken limit. Incomplete or overlength responses are discarded.

For Codex, set `TYRONE_TEXT_PROVIDER=codex` in that private file, or retain the existing installation without generation settings:

1. **Prepare generation → Install generation CLI** installs official Codex CLI **0.160.1**, the exact version tested by Tyrone. Installation is explicit and may replace an existing global Codex version. Do not update it independently: generation rejects other versions until the dialogue-only tool boundary is rechecked.
2. **Sign in for generation → Sign in with ChatGPT** runs `codex login`; finish browser sign-in using the streamer's own ChatGPT account. [OpenAI documents ChatGPT sign-in](https://learn.chatgpt.com/docs/auth) separately from API-key billing. Account eligibility, selected-model access, and remaining allowance still need checking for this streamer; a subscription does not imply unlimited use.
3. On Fish's website, tune/select the voice. Copy its **32-character voice ID**. **Add speech and the final voice → Edit speech settings** opens `.local/fish.env`: enter the streamer's own API key and replace `FISH_VOICE_ID` with that ID. Existing settings are preserved when you reopen the editor. Do not paste a full voice URL into this field.
   `FISH_VOICE_ID` is Tyrone's assigned voice. To add a personality, add a `characters/catalog.json` entry with a unique `id` and `name`, its `promptFile` under `characters/prompts/` (relative to the catalog), and a `voiceIdEnv` such as `FISH_NEW_CHARACTER_VOICE_ID`; put that voice variable and its ID in `.local/fish.env`. Every character needs a valid voice ID for live startup. Demo ignores voice settings.
4. Check Fish availability, allowance, and commercial terms before using live speech. Tyrone currently requests `s2.1-pro-free` without a paid fallback; the recorded free offer was time-limited. Final voice selection and account checks can wait until this stage.
5. Quit the demo and double-click **Launch Tyrone.cmd**. Keep the page open, enable audio if asked, open `/testing` in another tab to send one manual question, then test a redemption. These submissions use the streamer's configured provider allowance. Check completion, cancellation, and refunds again.

## Daily use and help

- Double-click **Launch Tyrone.cmd** and connect Twitch. Keep the page open while replies are running. Closing or refreshing the audio-owning tab cancels current work and pauses the queue; reopen and click Resume. Waiting requests still expire normally. The server remains running until **Quit app** shuts down the companion.
- **Pause/Resume** holds speech and the next reply. **Skip current** cancels one reply. **Stop and clear** cancels everything and stays paused. Twitch's native moderator redemption queue can cancel matching requests.
- Quit/relaunch after changing private configuration, models, character profiles, prompts, or assigned voices. Quit before switching demo/live modes; repeated launches reuse an already-running matching app and refuse changed settings.
- Missing Node.js: install/update it, then reopen setup. Missing dependencies: return to **Prepare this PC**. Codex version error: discuss rechecking the new CLI boundary or reinstalling the tested version with your helper before changing an existing installation.
- OpenRouter configuration errors: check `.local/generation.env` with your helper. Allowance/model errors do not trigger paid fallback. Startup checks file settings without querying provider accounts; a successful launch does not establish live access.
- Invalid Twitch settings: return to **Configure Twitch**; replace both placeholders. Authorization failure: confirm the Public client ID and broadcaster account, then retry **Authorize the broadcaster**. A mismatched app/channel journal must be reviewed with your helper, not deleted to bypass it.
- No audio: check Enable audio, volume, mute, and whether another app tab owns playback. Losing the audio-owning tab cancels active work and pauses the queue; reopen, then Resume.
- Private files live in `.local`; launcher diagnostics are `.local/launcher*.log`. Do not send that folder or account credential caches to anyone. Send redacted symptoms to your helper instead.

OBS routing/docks are a separate integration step. This setup does not change OBS or Twitch automatically; Twitch authorization/reward creation happen only when their setup actions are selected.
