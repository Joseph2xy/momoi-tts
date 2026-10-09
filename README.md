# Stream characters

A local Windows companion that turns a named character's question into dialogue and assigned-voice playback. Browser management is integrated; Twitch connection and OBS setup are deferred. Tyrone is the first file-based character. App naming and final model/voice refinement remain deferred.

## Run locally

Use Node.js 24.12 or newer.

```powershell
npm ci
npm run demo
```

Demo uses synthetic dialogue and a two-second tone, with no provider or Twitch calls. Open [controls](http://127.0.0.1:3210/), enable audio if prompted, and click **Resume**. Open [testing](http://127.0.0.1:3210/testing) separately and submit `Tyrone: How do I improve at ranked?`. The testing page owns no audio. One main tab owns playback; closing/refreshing it cancels active work and pauses. Reopen and Resume. Shutdown is in **Settings → Application**, or Ctrl+C for foreground use.

On Windows, **Try Tyrone Demo.cmd** starts/reuses demo; **Launch Tyrone.cmd** starts/reuses normal mode. **Setup Tyrone.cmd** runs prerequisite bootstrap and opens normal mode. Missing Node/dependencies produce explicit assisted-install prompts. Repeated launches reuse matching servers; a mismatch requires explicit shutdown/relaunch. Switch modes only after shutdown. Private launcher logs remain in `.local/launcher*.log`.

For transfer, `npm run package` writes a public-source ZIP under `.generated/releases/`, excluding private state, dependencies and generated output. Extract the entire ZIP into a writable folder and keep its files together before running a shortcut. The package contains no private settings or accounts. Node installation may need administrator approval; reopen the shortcut afterward. Dependency setup downloads pinned packages and builds the interface.

## Browser management and private configuration

First opening shows a reopenable setup checklist. Activity remains accessible with incomplete setup; normal full requests require generation, speech and voices. No provider is silently chosen for new management installations. Connections identifies Twitch as a later phase. Settings has Generation, Speech, Character voices, Playback and Application sections.

Generation, Speech, Character voices, and Playback have Save/Discard; Application contains actions and diagnostics. Drafts survive navigation within the tab and remain in page memory. Save validates and writes local files without contacting providers. Blank secret replacements retain existing values; saved keys/voice IDs are never returned to the page. Active requests finish on their original settings; waiting requests use changes before starting, retaining character selection. Default volume applies on the next launch. Restart warns before clearing queued work and returns paused.

| File | Purpose |
| --- | --- |
| `.local/generation.env` | Generation provider/model/key and optional CLI paths |
| `.local/fish.env` | Speech key and per-character voice IDs |
| `.local/app.json` | Setup progress and launch-volume default |
| `.local/twitch.env` | Reserved private settings for separately agreed Twitch setup |

Public templates live in `config/examples/`. Actual inherited environment variables override file values; management displays relevant override names. The server port defaults to 3210. Developers can set `TYRONE_PLAYBACK_PORT` in the launch environment or private generation env file before launch; it is outside browser Settings. Legacy `app.json` port entries are ignored. Never commit/share private files. Essential startup failures remain separate from missing provider settings; missing settings no longer block opening management. Startup does not connect Twitch or request generation/TTS.

Connection checks and response/voice tests are explicit separate actions. API-key checks authenticate against read-only account endpoints without inference. Codex has one Check prerequisites action, verifying local executable/version only. The single Testing page offers response-only, fixed-phrase voice-only and full question-to-playback tests. Normal-mode tests use configured allowance and require separately agreed connected trials.

OpenRouter requires `TYRONE_TEXT_PROVIDER=openrouter`, `OPENROUTER_API_KEY` and an exact `OPENROUTER_MODEL`. No final model is selected. `OPENROUTER_MAX_TOKENS` defaults to 1024, range 64–16384, and includes reasoning for many models; the separate spoken limit is 60 words. Incomplete/overlength replies are rejected without retry/truncation. Temporary zero-price caps, one exact model, no tools/plugins and no fallback prevent paid routing. Verify current free access, allowance and terms before connected use. Presets, automatic routers and search-enabled variants remain unsupported.

Codex requires explicit `TYRONE_TEXT_PROVIDER=codex`, ChatGPT sign-in and guarded CLI **0.162.0**. Prepare that version externally with your helper and use `codex login` with the streamer's ChatGPT account before selecting Codex in Settings. The app checks executable/version only, not sign-in or allowance. Other versions remain rejected until checked. Optional private `TYRONE_CODEX_BIN`/`TYRONE_CODEX_LAUNCHER` paths are supported. Audition configuration defaults to Codex; browser management requires explicit selection. Subscription access does not imply unlimited or API-billed use.

Speech currently uses Fish `s2.1-pro-free`. Verify access, allowance and commercial terms before live speech. Final provider/persona/voice evaluation remains separate.

## Characters and playback

`characters/catalog.json` contains trusted profiles and `characters/prompts/` their instructions. Each entry has a unique `id`, display `name` (up to 40 characters, no colon), relative `promptFile`, and `voiceIdEnv` naming a private 32-character Fish voice setting. Add profiles/prompts in files, click **Refresh file-based profiles** in Application, then assign their voices. No browser character Add/Edit interface is required initially. Demo ignores voice credentials.

Input is `Name: question`; names are case-insensitive, with no default character. Questions after the first colon may contain colons and are bounded to 1,000 characters. Browser state exposes IDs/names, never prompts or voice IDs. Activity emphasizes questions, with replies secondary. Current and upcoming previews stay stationary; only history scrolls, showing complete questions/replies with the latest outcomes first. Short windows compact previews to retain space for history. History is read-only, with no replay.

| Control | Behavior |
| --- | --- |
| Pause / Resume | Hold speech and the next request; generation can prepare a held clip |
| Skip current | Cancel current work and preserve pause |
| Stop and clear | Cancel everything and remain paused |
| Clear waiting / Remove | Discard waiting work |
| Mute / Volume | Adjust audibility independently of queue progression |

Capacity is one active and two waiting, with one submitted request per viewer. Deduplication, cooldowns, expiry and deadlines remain bounded. `TYRONE_VIEWER_COOLDOWN_MS`, `TYRONE_GLOBAL_COOLDOWN_MS`, and `TYRONE_WAITING_EXPIRY_MS` configure queue durations; invalid duration values use bounded defaults. Queue/history reset on restart.

## Later Twitch integration

Existing modular Twitch code/scripts remain for later work. The current entrypoint does not load/connect Twitch. Remembered connection choice, live-only viewer intake and stream-end behavior are not yet integrated. No real app/channel/reward is configured. When separately authorized, `npm run twitch:login` authorizes the broadcaster; `npm run twitch:reward` explicitly creates/checks the app-owned required-text reward. Existing provisional defaults are Ask Tyrone, 1000 points and a 60-second global cooldown. No startup action creates rewards.

The retained intake uses one shared `Name: question` reward, completion fulfillment, rejection/cancellation refunds and durable settlement without replay. Ordinary chat is not read. These paths have mock coverage, not current real-Twitch evidence. OBS linking is deferred.

## Development

The production Activity screen uses React, Tailwind and editable shadcn components.
TanStack Query polls public server state; commands are serialized and never retried
automatically. Settings retains its persistent forms and draft handling. Both browser
pages use the charcoal/coral theme and locally bundled Outfit font. Use `npm run demo`
for synthetic generation/audio without provider or Twitch calls.

```powershell
npm run build
npm run test:offline
npm run check:tools
npm run format:check
```

`build` runs strict server/browser TypeScript and Vite. `test:offline` runs twelve service-independent test files. `check:tools` probes the guarded installed Codex CLI against a fake loopback provider. `npm test` runs all thirteen files. Candidate checks use `npm run check:tools -- --candidate-version=X.Y.Z`; passing does not approve changing the guard. No test command authorizes live allowance. [Verification](docs/verification.md) owns evidence and limitations.

`npm run format` uses pinned development-only Prettier. For development, run `npm run dev:browser` and `npm run dev:server` separately, wait for the browser build, then refresh after changes. Server restarts reset queued work.

Explicit later-stage auditions consume configured allowance:

```powershell
npm run ask -- "Tyrone: Your question"
npm run speak -- "Tyrone: Your fixed audition text"
npm run speak -- --question "Tyrone: Your question"
```

Audition output may contain private dialogue. `.generated/` owns builds, packages, auditions and check reports. `.local/` owns private configuration, accounts/recovery and logs. Do not share that folder or account caches. Diagnostics redact provider failures.

[Boundaries](docs/architecture.md) · [Decisions](PROJECT_HANDOFF.md) · [Instructions](AGENTS.md)
