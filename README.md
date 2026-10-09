# Stream characters

A local Windows companion: viewers submit a Channel Points question, choose a personality, and hear its reply in its assigned voice. Tyrone is the first example. App naming is deferred; existing launcher filenames, environment prefixes, and the provisional reward title retain their names.

## Run locally

Use Node.js 24.12 or newer.

```powershell
npm ci
npm run demo
```

Demo produces simulated dialogue and a two-second tone without generation or speech usage. Open the [testing page](http://127.0.0.1:3210/testing) in a separate tab and enter `Tyrone: How do I improve at ranked?` in **Send a test question**. Names are case-insensitive; missing/unknown names and empty questions are rejected. Demo still loads optional Twitch settings; incomplete `.local/twitch.env` can prevent startup. That behavior remains an open issue.

Playback and controls share [one page](http://127.0.0.1:3210/). Keep it open; click **Enable audio** if needed. One tab owns audio. Closing or refreshing it cancels active work and pauses the queue; reopen and click **Resume**. The server remains running until **Quit app** or Ctrl+C. `TYRONE_PLAYBACK_PORT` changes the default port 3210.

On Windows, **Try Tyrone Demo.cmd** launches the demo in the background and **Launch Tyrone.cmd** launches configured live mode. Repeated launches reuse an app with matching settings. Quit/relaunch after changes to configuration, profiles, prompts, voices, or demo/live mode; a mismatch never automatically stops existing work. Logs stay private in `.local/launcher*.log`.

For another streamer's PC, use **Setup Tyrone.cmd** and the [streamer setup guide](docs/streamer-setup.md). `npm run package` creates a public-source ZIP under `.generated/releases/`, excluding credentials, recovery files, dependencies, and generated output. Extract the ZIP before setup.

## Private provider configuration

Create `.local/` and copy the relevant templates from `config/examples/`:

| Template | Private destination | Purpose |
| --- | --- | --- |
| `fish.env.example` | `.local/fish.env` | Fish key and each character's voice ID |
| `generation.env.example` | `.local/generation.env` | OpenRouter or Codex selection |
| `twitch.env.example` | `.local/twitch.env` | Broadcaster/application and shared reward settings |

Environment variables override file values. Never commit or share private files. Startup makes no generation/TTS requests; submitting live questions uses the configured services.

For OpenRouter, set `TYRONE_TEXT_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, and an exact `OPENROUTER_MODEL`. No model is preselected in the template. `OPENROUTER_MAX_TOKENS` is a development token ceiling: default 1024, range 64–16384. It includes reasoning for many models and is separate from the 60-word spoken limit. Incomplete/overlength replies are rejected without retry or truncation.

OpenRouter currently caps prompt, completion, and per-request prices at zero, uses one exact model, attaches no tools/plugins, and disables fallback. This is a temporary free-trial constraint. Discuss and verify free access, account allowance, and terms before connected use; changing the model ID cannot enable paid inference. Presets, automatic routers, and search-enabled variants are unsupported.

For Codex, set `TYRONE_TEXT_PROVIDER=codex`. Installations without generation settings retain the Codex path. It requires existing ChatGPT sign-in and guarded CLI **0.162.0**. This version passed the offline dialogue-only tool-boundary probe. Other versions remain rejected until separately checked; do not change the guard or global installation just to make tests pass.

Speech currently uses Fish `s2.1-pro-free`. Verify current access, allowance, and commercial terms before live speech. Final provider/model/persona/voice evaluation and paid access remain separate decisions.

## Personalities and voices

`characters/catalog.json` contains trusted profiles; `characters/prompts/` contains their instructions. Each entry has:

- A unique `id` and display `name` (up to 40 characters, without a colon).
- A `promptFile` relative to the catalog directory, such as `prompts/tyrone.txt`.
- A `voiceIdEnv`, such as `FISH_VOICE_ID` for Tyrone, naming a private 32-character Fish voice setting.

To add a personality, add its prompt and catalog entry, then its assigned voice variable to `.local/fish.env`, for example `FISH_NEW_CHARACTER_VOICE_ID`. Every configured personality needs a valid voice for live startup. Demo ignores voice credentials and uses the test tone for all profiles. Final tuning is deferred.

Both the manual form and the shared reward use `Name: question`. The question after the first colon can contain more colons and is limited to 1,000 characters. No default personality is used. Available names appear on the testing page. Accepted requests retain their selected profile through generation and speech. Past entries are read-only; completed audio is released and cannot be replayed. Browser state exposes IDs/names, never character instructions, private voice IDs, or keys.

## Twitch and playback

Live Twitch authorization, reward setup, and OBS linking remain deferred. When separately agreed, follow the [setup guide](docs/streamer-setup.md); `npm run twitch:login` authorizes the broadcaster and `npm run twitch:reward` explicitly creates/checks the app-owned required-text reward. Startup and Connect never create rewards. Existing provisional settings are **Ask Tyrone**, **1000 points**, and a **60-second global cooldown**. Repeat setup preserves existing settings; final reward naming is undecided.

Viewers use one shared reward and enter `Name: question`. Ordinary chat is not read. Completed playback consumes points; rejected, skipped, failed, or expired work is refunded after Twitch confirms. Native moderator outcomes cancel matching work. Pending outcomes survive restart and retry without replaying old requests.

| Control | Behavior |
| --- | --- |
| Pause / Resume | Hold speech and the next request; active generation can prepare a held clip |
| Skip current | Cancel the current request; preserve pause |
| Stop and clear | Cancel all work and remain paused |
| Clear waiting / Remove | Discard waiting requests |
| Mute / Volume | Adjust audibility independently of queue progression |

Capacity is one active response and two waiting, with one submitted request per viewer. Cooldowns, expiry, deadlines, and read-only history remain bounded. Optional `TYRONE_VIEWER_COOLDOWN_MS`, `TYRONE_GLOBAL_COOLDOWN_MS`, and `TYRONE_WAITING_EXPIRY_MS` configure queue durations. Queue/history reset on restart; private Twitch settlement state persists.

## Development

A browser-management mockup is available before functional integration:

```powershell
npm run preview
```

Open [browser mockup](http://127.0.0.1:5174/designs.html). It uses the selected sidebar layout in dark mode, with Activity, Connections, Settings, and guided setup. Theme and detailed UI design remain deferred. All controls use sample state in memory; use placeholder keys only. Save clears key fields and simulates configuration, while checks, tests, authorization, reward setup, and shutdown are separate simulated actions. Reload restores the sample. Activity shows each question once, response-only expansion, and read-only past entries. No provider/Twitch calls, audio, private configuration, or backend integration occur. The mockup is development-only and excluded from production build inputs. The [handoff](PROJECT_HANDOFF.md#latest-direction-one-browser-interface) separates confirmed workflows from provisional details. The existing app remains the functional implementation until a replacement is reviewed and integrated.

```powershell
npm run build
npm run test:offline
npm run check:tools
npm run format:check
```

`build` runs strict TypeScript checks and Vite. `test:offline` builds browser assets and runs the ten service-independent test files. `check:tools` separately checks the guarded installed Codex CLI with a local fake provider. `npm test` runs the complete suite including that boundary check. To review an installed candidate without changing the application guard, use `npm run check:tools -- --candidate-version=X.Y.Z`; a passing probe does not automatically approve that version. No test command authorizes live allowance. [Verification](docs/verification.md) records evidence and limitations.

`npm run format` formats source, browser files, tests, and TypeScript scripts using pinned development-only Prettier; its settings live in `package.json`. For development, run `npm run dev:browser` and `npm run dev:server` in separate terminals, wait for the initial browser build, and refresh after browser changes. Server restarts reset the local queue.

Explicit character auditions remain available for the later quality stage and consume configured allowance:

```powershell
npm run ask -- "Tyrone: Your question"
npm run speak -- "Tyrone: Your fixed audition text"
npm run speak -- --question "Tyrone: Your question"
```

Audition MP3/timing files go under ignored `.generated/auditions/` and may contain private dialogue; do not share them casually. Browser builds, release ZIPs, and check reports also live under `.generated/`. Credentials, account/recovery state, setup progress, and launcher logs remain under `.local/`.

[Code boundaries](docs/architecture.md) · [Current decisions](PROJECT_HANDOFF.md) · [Project instructions](AGENTS.md)
