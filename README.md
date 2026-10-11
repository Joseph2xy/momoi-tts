# MomoiTTS

MomoiTTS is a local Windows app that turns a viewer's named-character Channel Points question into a generated spoken reply. OBS receives audio through a transparent Browser source. Characters have independent prompts and assigned voices; Tyrone is the first character, not the app's name.

## First-time setup

1. Extract the entire product ZIP into a writable folder. Keep its files together, then double-click **Setup MomoiTTS.cmd**.
2. If Node.js is missing or too old, setup offers installation. Reopen the shortcut afterward. Allow installation of the app's pinned runtime dependencies when prompted. Initial preparation needs internet; the browser interface is already built.
3. The local management page opens at `http://127.0.0.1:3210/`. The setup overview shows configured topics and their next useful actions. Replies start off.
4. Open **Generation**, enter your OpenRouter API key, then enter an exact model ID and save.
5. Open **Speech**, enter your Fish Audio API key and save. S2.1 Pro Free is the default; the speech engine selector appears alongside the API key. Open **Characters**, select a character, review its instructions and assign its Fish voice ID. Save.
6. In **Settings → Generation**, use **Check connection**, then **Test generation** to get a text response. In **Settings → Speech**, use **Check connection**, then **Test speech** with a voice ID and phrase to hear a preview in your browser. These are independent checks; saving never calls a provider.
7. Configure [OBS audio](#obs-audio-source). Keep the source active, click **Turn replies on**, then use **Settings → OBS output → Test OBS output** with a voice ID. This sends a short spoken phrase through the audio source without generating a reply. Confirm monitoring and recording in OBS.
8. For viewer intake, finish [Twitch setup](#channel-points). Account authorization and reward creation are deliberate setup actions.

Reopen setup using **App options → Setup guide**. Settings opens an overview with separate Generation, Speech, OBS output and Twitch topics; Characters is a main navigation item. Activity can be opened while setup is incomplete, but requests requiring missing configuration are blocked. Configured status describes saved settings; it does not prove current model access, account allowance or successful speech.

## Everyday use

Double-click **Launch MomoiTTS.cmd**. It starts the app in the background without opening a browser. Keep the OBS source active, open management when needed, and click **Turn replies on**. Launch and restart always return with replies off. Repeated launches reuse the matching service; changed settings require explicit shutdown/relaunch when reuse is refused.

Management can close while OBS continues queued playback. Speech previews play only in the Settings browser and stop when their test closes or you leave the page. **App options** supplies restart, shutdown and a separate Diagnostics dialog. Shutting down stops the local website; a saved bookmark does not start the service.

| Control | Behavior |
| --- | --- |
| Replies on / off | On accepts fresh requests. Off stops current speech, cancels waiting work and rejects new requests. Unfinished Channel Points requests are canceled for refund. |
| Skip reply | Cancel only current work and continue with the next request. |
| Clear waiting / Remove | Discard waiting work. |
| Mute / Volume | Change app audibility independently of queue progression; use OBS for the stream mix. |

Capacity is one active and two waiting requests, with per-viewer bounds, cooldowns, deduplication, expiry and timeouts. History is bounded and read-only; there is no replay. Select an activity entry to inspect its question and reply.

## Testing your setup

Tests open in dialogs from Settings, with the form and results together. A plain Back button sits at the top-left inside detail screens. Successes use green checks, warnings amber and failures red, with readable status text. Save configuration changes before testing. **Configured** means settings are saved; **Check connection** authenticates credentials without generating text or speech. A successful output test separately establishes that the chosen model or voice worked for that request.

- **Generation → Test generation:** enter a message and generate a response on the same page. A character prompt is optional. Speech, character voices and OBS are not required.
- **Speech → Test speech:** choose an assigned character voice or enter a Fish voice ID, enter a phrase, then generate speech. A browser audio player lets you hear and replay that preview. Character instructions, generation and OBS are not required. The voice ID is remembered when moving to the OBS test during the same browser session.
- **OBS output → Test OBS output:** send a fixed short phrase through the normal playback queue. Speech configuration, an active audio source, replies on and an empty queue are required. This does not test generation. The app reports source playback; you must confirm OBS monitoring and recording yourself. Closing the dialog does not stop this queued test; reopen it or use Activity to inspect/cancel it.

Generation and speech previews use the saved provider and account allowance, may incur charges, and never enter Activity or the private dialogue log. One provider check or preview runs at a time; connection requests have a 10-second timeout and previews a 45-second limit. Cancel, closing its test, leaving the page or saving provider/character changes cancels pending work. Successful saves cancel previews in other management tabs too; rejected saves keep the current preview. The browser preview volume is separate from OBS and the app's queued-output volume. OBS output tests appear in Activity and are logged, with normal queue cancellation/cooldown rules.

## Provider configuration

Generation and hosted speech are independently configured. Keys must belong to the selected services; an arbitrary provider's API key is not interchangeable with an OpenRouter or Fish key.

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
| `characters.json` | Private character prompt/voice edits made in management. |
| `app.json` | Setup progress, retained launch-volume default and remembered Twitch connection choice. |
| `twitch.env` | Twitch client/channel/reward configuration. |
| `dialogue.jsonl` | Private question/reply review log. |
| `launcher*.log` | Private startup diagnostics. |

Public templates are in `config/examples/`. Inherited environment settings override saved file values; management identifies relevant provider overrides. The port defaults to 3210 and can be set through `MOMOI_TTS_PLAYBACK_PORT` before launch. Queue duration overrides are `MOMOI_TTS_VIEWER_COOLDOWN_MS`, `MOMOI_TTS_GLOBAL_COOLDOWN_MS` and `MOMOI_TTS_WAITING_EXPIRY_MS`; invalid values use bounded defaults. Invalid Twitch configuration leaves its connection unavailable with a repair message; Settings and independent provider tests remain available. Repair that private configuration and restart before connecting it.

## Characters

Open **Characters** and select an entry to edit its instructions and voice. Save stores private overrides in `.local/characters.json`; the shipped character files remain intact. Instructions must be nonempty and fit within 6000 UTF-8 bytes. Voice IDs contain 32 hexadecimal characters; clearing a voice leaves the character unconfigured. An inherited voice override is displayed but cannot be changed until its launch override is removed. Every character needs a voice before full requests are enabled.

`characters/catalog.json` defines the available character IDs/names; `characters/prompts/` supplies their initial instructions. Adding/removing a character or changing its catalog name still requires those trusted files and **App options → Diagnostics → Reload character files**, or an app restart. Browser creation of catalog entries is not implemented.

Input is `Name: question`; names are case-insensitive. There is no default character. Questions are limited to 1000 characters. Routine status exposes names and configured status. Prompt and voice details are loaded only by the local character editor; OBS's player never receives them.

## OBS audio source

Add one OBS Browser source at `http://127.0.0.1:3210/player`, using your configured port. Enable **Control audio via OBS** for a separate mixer source. Leave **Shutdown source when not visible** and **Refresh browser when scene becomes active** off. Reuse the same existing source across scenes. Close ordinary browser `/player` tabs so they do not own audio.

The source is visually blank. Confirm recording/stream track assignments and headphone monitoring separately in OBS; avoid capturing monitored audio again through Desktop Audio. OBS versions may label the monitoring option differently. If management reports blocked audio, use OBS **Interact** and click the blank page.

Only one player owns audio. Additional players stay silent. Refreshing or disconnecting the owner cancels unfinished work and turns replies off. Reconnect and explicitly turn replies on; interrupted work is not replayed. OBS owns audio routing and monitoring; the app cannot infer that a heard reply reached the stream.

MomoiTTS controls affect only its own replies. Other stream alerts have their own queues and may overlap; use OBS to manage the mix. Muted acknowledged playback still completes and fulfills a redemption.

## Channel Points

Twitch setup currently uses assisted terminal commands and private configuration. It requires a broadcaster eligible for Channel Points, a Twitch Public application client ID and an app-owned required-text reward. Keep the client ID stable: Twitch permits settlement only through the app that created the reward.

1. Copy `config/examples/twitch.env.example` to `.local/twitch.env`. Supply the public client ID, broadcaster login and intended reward title/cost. The neutral provisional reward is **Ask a character**, 1000 points; choose the actual title/cost before creation.
2. Open a terminal in the app folder and run `npm run twitch:login`. Follow the displayed Twitch activation instructions as the broadcaster. Tokens are saved privately.
3. Run `npm run twitch:reward` to explicitly create/check the app-owned reward. Startup and Connect never create rewards.
4. Launch the app, keep OBS's source active, then use **Settings → Twitch → Connect Twitch**. Wait for reconciliation and click **Turn replies on** when ready. Intake accepts questions only while the channel is live.

Connect remembers that choice for later launches; Disconnect remembers the opposite. Replies still start off. Invalid, offline, replies-off, full or failed requests are canceled for refund; successful acknowledged playback fulfills them. Stream end cancels unfinished Channel Points work. Refund rules are fixed; there are no pause or stream-end policy overrides.

Disconnect/reconnect gaps cancel unfinished Twitch work. A separate durable settlement journal retries pending outcomes without replaying old requests. A pending cancellation is not a confirmed refund. A crash between completed playback and durable settlement may refund a just-played reply. Before changing reward/account configuration, settle pending work with the same configuration. Ordinary chat is not read.

## Private dialogue log

`.local/dialogue.jsonl` records accepted/rejected input, generated dialogue and final outcomes, with IDs, timestamps, character and generation metadata. It excludes saved credentials, voice IDs, prompt bodies and raw provider errors. OBS output tests are logged; direct generation/speech previews are not queued or logged. Records persist before playback completes and survive restart, but are never served over HTTP or used for replay/training.

Writes are flushed to disk. A failure appears in diagnostics and does not prevent cancellation or points settlement. Retention and future review tooling are undecided; there is no automatic deletion.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Website refuses connection | Start Setup/Launch, wait for readiness, then reopen management. Check the startup error or private launcher logs if it fails. |
| Setup stays incomplete | Configure generation, speech model/key and every character's voice; saved credentials alone do not prove provider access. |
| Existing app has different settings | Shut down from the application menu, then launch again. Page refresh does not restart the service. |
| Blank player | Expected. Check management's player/audio status. |
| No reply heard | Confirm replies are on, active player, mute, OBS volume and output tracks. Close competing player tabs. |
| Cooldown message | Wait the stated duration before another submission. |
| Replies off after source refresh or reconnect | Explicitly turn replies on. Interrupted work is discarded. |
| Provider request fails | Speech failures in Activity show a safe HTTP status/reason or a timeout/network/audio error. Check the saved exact model, key, voice and account access/credit. A successful connection check establishes authentication, not speech access or credit. The app does not select another model or automatically retry. |
| Twitch outcome pending | Reconnect with the same client/channel/reward configuration to retry settlement; check the actual outcome in Twitch. |

Development commands and implementation boundaries live in the source repository's `docs/architecture.md`; test evidence and remaining live-validation limits live in `docs/verification.md`. These developer documents are not part of the product ZIP.
