# Momoi TTS user guide

## First-time setup

1. Extract the entire ZIP into a writable folder and double-click **Launch MomoiTTS.cmd**. Its runtime is included.
2. Follow **Finish setup** in the local page. **Connect Twitch** opens approval in another tab with the code filled in. Check your broadcaster account, click **Activate**, approve MomoiTTS, then return to the confirmed channel. No reward is created yet.
3. **Connect AI and voice** guides you through OpenRouter, Fish Audio and a voice for the included Tyrone character. Save the services, save the voice to enable Tyrone, then generate a private test reply, play it and confirm you heard it. Edit personality or other characters later in Characters. Tests use your provider allowance and may incur charges; saving makes no provider request. [Provider configuration](#provider-configuration) explains model IDs, keys and access.
4. **Connect OBS** shows the [Browser source instructions](#obs-audio-source). Send the test phrase with viewer replies off, check an OBS recording and confirm you heard it. A connected source alone does not establish audibility.
5. **Create reward** reviews the shared Channel Points reward's name, price and cooldown. Creation is explicit and the reward starts paused.
6. **Ready** summarizes the checks. Open Activity with replies still off. When live and ready, turn replies on and verify one real redemption, its reply and Twitch outcome.

Reopen the journey through **App options → Setup guide**. It remembers the current task and chosen character in this browser; saved configuration survives restarting the app. Audio evidence is limited to this visit: reloading, changing relevant settings or restarting requires fresh tests. The ready screen does not prove a real redemption, refund or live stream's audio tracks. Settings and Characters remain available for later edits. No generation model is selected automatically.

## Everyday use

Double-click **Launch MomoiTTS.cmd**. It starts or reuses the app and opens management. Twitch reconnects using the saved connection choice. Keep the OBS source active and click **Turn replies on** when ready. Launch and restart always return with replies off. Repeated launches reuse the matching service; changed settings require explicit shutdown/relaunch when reuse is refused.

Management can close while OBS continues queued playback. Private reply and speech previews play only in the management browser and stop when their test closes or you leave the page. **Exit MomoiTTS** is visible in navigation and stops the app without separate disconnect/queue-clearing steps. **App options** supplies restart and Diagnostics. Shutting down stops the local website; a saved bookmark does not start the service.

| Control | Behavior |
| --- | --- |
| Replies on / off | On accepts fresh requests. Off stops current speech, cancels waiting work and rejects new requests. Unfinished Channel Points requests are canceled for refund. |
| Skip reply | Cancel only current work and continue with the next request. |
| Clear waiting / Remove | Discard waiting work. |
| Mute / Volume | Change app audibility independently of queue progression; use OBS for the stream mix. |

Capacity is one active and two waiting requests, with per-viewer bounds, cooldowns, deduplication, expiry and timeouts. History is bounded and read-only; there is no replay. Select an activity entry to inspect its question and reply.

## Testing your setup

The setup journey combines generation and speech into one private reply preview. Settings also provides independent test dialogs. A plain Back button sits at the top-left inside detail screens. Successes use green checks, warnings amber and failures red, with readable status text. Save configuration changes before testing. **Configured** means settings are saved; **Check connection** authenticates credentials without generating text or speech. A successful output test separately establishes that the chosen model or voice worked for that request.

- **Generation → Test generation:** enter a message and generate a response on the same page. A character prompt is optional. Speech, character voices and OBS are not required.
- **Speech → Test speech:** choose an assigned character voice or enter a Fish voice ID, enter a phrase, then generate speech. A browser audio player lets you hear and replay that preview. Character instructions, generation and OBS are not required. The voice ID is remembered when moving to the OBS test during the same browser session.
- **OBS output → Test OBS output:** send a fixed short phrase through the normal playback queue. Speech configuration, an active audio source, replies off and an empty queue are required. Viewer intake stays off. This does not test generation. The app reports source playback; you must confirm OBS monitoring and recording yourself. Closing the Settings dialog does not stop this queued test; reopen it or use Activity to inspect/cancel it. Leaving the setup journey cancels its tracked output test.

Generation and speech previews use the saved provider and account allowance, may incur charges, and never enter Activity or the private dialogue log. One provider check or preview runs at a time; connection requests have a 10-second timeout and previews a 45-second limit. Cancel, closing its test, leaving the page or saving provider/character changes cancels pending work. Successful saves cancel previews in other management tabs too; rejected saves keep the current preview. The browser preview volume is separate from OBS and the app's queued-output volume. OBS output tests appear in Activity and are logged, with existing queue cancellation, timeout and deduplication rules. Setup tests do not use or change viewer cooldowns. Starting live replies cancels a setup output test.

## Provider configuration

Generation and hosted speech are independently configured. Keys must belong to the selected services; an arbitrary provider's API key is not interchangeable with an OpenRouter or Fish key.

When generating replies, OpenRouter receives the viewer question and character instructions. Fish Audio receives the text to speak and the assigned voice ID. Character instructions are not editable by viewers; they are sent to the generation service, rather than staying exclusively on this PC.

OpenRouter accepts one exact `organization/model` ID, including supported `:free` IDs. The app does not restrict routing to free prices. It sends no tools, plugins or model fallback list, and disables provider fallback. The maximum token setting is 64–16384, with a 1024 default; reasoning may consume that allowance. Spoken replies are limited to 60 words. Incomplete or overlength results are rejected without retry or truncation. The selected model and account determine access and charges; review those on [OpenRouter](https://openrouter.ai/models).

Fish Audio requires an API key and each character's 32-character hexadecimal voice ID. New setup uses **S2.1 Pro Free** (`s2.1-pro-free`). Change engines in **Settings → Speech → Change configuration**, then save; no code change is needed for supported Fish engines. Existing explicitly saved/environment engine choices are preserved. Generation and speech remain independently configured; changing the speech engine does not change generation or character prompts. No engine fallback is configured by this app.

The free engine is the same model as paid `s2.1-pro`, with fair-use limits, no uptime/latency guarantee and possible request retention for model improvement. Fish currently advertises the free offer through **November 30, 2026**, with restrictions for some commercial scenarios; confirm current terms before deployment. See the [free API offer](https://fish.audio/blog/s2-1-pro-free-api/) and [model guide](https://docs.fish.audio/developer-guide/models-pricing/choosing-a-model). Paid engines use **Developer API credit**, which is separate from Fish website credits; remaining website messages do not establish API allowance. HTTP 402 means the API rejected billing/model access, not proof that website credits are exhausted. Review [API pricing](https://docs.fish.audio/developer-guide/models-pricing/pricing-and-rate-limits). Saving a key or launching the app makes no speech request, and the app never automatically switches to paid inference if free access fails.

Generation uses OpenRouter. An existing unsupported provider selection is left unconfigured; it never silently switches to API inference. Explicitly save OpenRouter configuration before use. If `MOMOI_TTS_TEXT_PROVIDER` is inherited at launch, change that override to `openrouter` first. Private settings and account caches are preserved.

## Browser management and private configuration

Generation and Speech have their own settings pages; Characters has a separate list and detail editor. Save/Discard controls keep changes deliberate, and drafts survive navigation within management. Saved provider/model and credential status are shown before editing. Change configuration opens the form; Replace key opens the key input. Blank replacements retain saved keys. Remove key requires confirmation and preserves other settings; inherited launch keys must be removed from their environment instead. Saved API keys never return to the page. The character editor loads only the selected character's prompt and voice for editing. Active requests keep their original settings. A question keeps the character instructions accepted with it; waiting work picks up current provider/model and voice settings before processing. Set volume in OBS.

Private state lives in `.local/` beside the app. Do not send that folder to another person or copy it into a release package.

| File | Purpose |
| --- | --- |
| `generation.env` | Explicit OpenRouter selection, model and API key. |
| `fish.env` | Speech key, optional `FISH_MODEL` override and existing file-based voice assignments. |
| `characters.json` | Private character prompt/voice/availability edits made in management. |
| `app.json` | Setup completion, retained launch-volume default and remembered Twitch connection choice. |
| `twitch.env` | Twitch client/channel/reward configuration. |
| `twitch-token.json` | Private broadcaster authorization and refresh tokens. |
| `twitch-redemptions.json` | Durable pending fulfillment/refund outcomes. |
| `dialogue.jsonl` | Private question/reply review log. |
| `launcher*.log` | Private startup diagnostics. |

Public templates are in `config/examples/`. Inherited environment settings override saved file values; management identifies relevant provider overrides. The port defaults to 3210 and can be set through `MOMOI_TTS_PLAYBACK_PORT` before launch. Queue duration overrides are `MOMOI_TTS_VIEWER_COOLDOWN_MS`, `MOMOI_TTS_GLOBAL_COOLDOWN_MS` and `MOMOI_TTS_WAITING_EXPIRY_MS`; invalid values use bounded defaults. Invalid Twitch configuration leaves its connection unavailable with a repair message; Settings and independent provider tests remain available. Repair that private configuration and restart before connecting it.

## Characters

Open **Characters** and select an entry to edit its instructions and voice. Save stores private overrides in `.local/characters.json`; the shipped character files remain intact. Instructions must be nonempty and fit within 6000 UTF-8 bytes. Voice IDs contain 32 hexadecimal characters; clearing a voice leaves the character unconfigured. An inherited voice override is displayed but cannot be changed until its launch override is removed. Only available characters need valid voices; at least one must be available.

Use **Available to viewers** to enable or temporarily disable a character without deleting its instructions/voice. Existing valid voice assignments default to available; unconfigured characters default to unavailable. The shared reward description follows the available names when Twitch is connected. The names must fit Twitch's description limit; an oversized list produces a setup message.

`characters/catalog.json` defines the available character IDs/names; `characters/prompts/` supplies their initial instructions. Adding/removing a character or changing its catalog name still requires those trusted files and **App options → Diagnostics → Reload character files**, or an app restart. Browser creation of catalog entries is not implemented.

Input is `Name: question`; names are case-insensitive. There is no default character. Questions are limited to 1000 characters. Routine status exposes names and configured status. Prompt and voice details are loaded only by the local character editor; OBS's player never receives them.

## OBS audio source

In OBS, use **Sources → + → Browser**, create a source named MomoiTTS, leave **Local file** off and paste `http://127.0.0.1:3210/player` into **URL**, using your configured port. Settings → OBS output has the actual address and **Copy URL**. Enable **Control audio via OBS** for a separate mixer source. Leave **Shutdown source when not visible** and **Refresh browser when scene becomes active** off. Reuse the same existing source across scenes. Close ordinary browser `/player` tabs so they do not own audio.

The source is visually blank. Confirm recording/stream track assignments and headphone monitoring separately in OBS; avoid capturing monitored audio again through Desktop Audio. OBS versions may label the monitoring option differently. If management reports blocked audio, use OBS **Interact** and click the blank page.

Only one player owns audio. Additional players stay silent. Refreshing or disconnecting the owner cancels unfinished work. If replies were enabled, fresh intake resumes automatically when the source returns. Off, Exit and restart prevent automatic resumption; interrupted work is never replayed. OBS owns audio routing and monitoring; the app cannot infer that a heard reply reached the stream.

MomoiTTS controls affect only its own replies. Other stream alerts have their own queues and may overlap; use OBS to manage the mix. Muted acknowledged playback still completes and fulfills a redemption.

## Channel Points

Twitch setup lives in **Settings → Twitch**. The streamer authorizes their broadcaster account using MomoiTTS's shared Public app registration; viewers redeem inside Twitch without MomoiTTS accounts. Required reward-management permission covers creating/editing the reward and fulfilling/refunding redemptions. Ordinary chat is not read.

The reward name, price and cooldown are editable here. Use 0 seconds for no reward cooldown or 60–604800 seconds; 60 seconds is initially suggested. Updates address the saved reward ID, so renaming it does not create another reward. Required input and playback-based fulfillment remain built in. A long list of character names must fit Twitch's 200-character description; setup explains if the available list is too long.

The reward stays visible but paused while replies are off, the channel is offline, connections/configuration are unavailable or the waiting queue is full. Availability returns automatically when ready and replies remain enabled. Temporary Twitch/source disconnections cancel unfinished work and recover fresh intake without replay. Stream end turns replies off and cancels unfinished requests for refund.

Successful acknowledged playback fulfills a redemption. Invalid, unavailable, full, failed, stopped and interrupted requests are canceled for refund. Muted acknowledged playback still fulfills. A durable journal retries pending settlement without replaying requests; a pending cancellation is not a confirmed refund. A crash between playback and durable settlement can refund a just-played reply.

Exit attempts pausing and settlement for a bounded period and closes even if Twitch is unreachable. Pending outcomes remain private and retry on the next connection. Before changing accounts or reward settings, turn replies off and settle pending work using the same account/reward. A crashed app or lost internet cannot immediately update Twitch's reward availability.

## Updating MomoiTTS

Download a new MomoiTTS ZIP from the maintainer. In your existing app folder, double-click **Update MomoiTTS.cmd** and select that ZIP. The helper checks its layout/file hashes, asks the matching running app to exit, replaces application files and preserves `.local/` settings, credentials, logs and pending refunds. Use Launch afterward; replies start off. You do not merge folders manually. Keep the ZIP intact; the update helper reads it directly.

Updates apply only to an existing self-contained release with its release manifest. Source checkouts use the development build commands. A failed update restores replaced files; if restoration cannot complete, the update workspace remains for recovery. File hashes check archive integrity, not publisher authenticity; use the maintainer's release.

## Private dialogue log

`.local/dialogue.jsonl` records accepted/rejected input, generated dialogue and final outcomes, with IDs, timestamps, character and generation metadata. It excludes saved credentials, voice IDs, prompt bodies and raw provider errors. OBS output tests are logged; direct generation/speech previews are not queued or logged. Records persist before playback completes and survive restart, but are never served over HTTP or used for replay/training.

Writes are flushed to disk. A failure appears in diagnostics and does not prevent cancellation or points settlement. Retention and future review tooling are undecided; there is no automatic deletion.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Website refuses connection | Use Launch MomoiTTS, wait for readiness, then reopen management. Check the startup error or private launcher logs if it fails. |
| Setup stays incomplete | Configure generation/speech and at least one available character's voice; saved credentials alone do not prove provider access. |
| Existing app has different settings | Click Exit MomoiTTS, then launch again. Page refresh does not restart the service. |
| Blank player | Expected. Check management's player/audio status. |
| No reply heard | Confirm replies are on, active player, mute, OBS volume and output tracks. Close competing player tabs. |
| Cooldown message | Wait the stated duration before another submission. |
| Source refreshed or reconnecting | Wait for readiness. Previously enabled replies recover automatically for fresh requests; interrupted work is discarded. |
| Provider request fails | Speech failures in Activity show a safe HTTP status/reason or a timeout/network/audio error. Check the saved exact model, key, voice and account access/credit. A successful connection check establishes authentication, not speech access or credit. The app does not select another model or automatically retry. |
| Twitch outcome pending | Reconnect with the same client/channel/reward configuration to retry settlement; check the actual outcome in Twitch. |
