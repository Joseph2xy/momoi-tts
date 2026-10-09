# Code structure

One local Node/TypeScript application serves browser management and a separate testing page. Generation and hosted speech use independent adapters. This describes the current implementation; alternatives remain open to evaluation.

## File ownership

| Location | Responsibility |
| --- | --- |
| `src/app/` | Application composition and lifetime; settings persistence and explicit provider actions have separate modules |
| `src/characters/`, `characters/` | Trusted catalog loading, viewer name selection, file-based prompts |
| `src/queue/` | Admission, bounds, cooldowns, deduplication, lifecycle, cancellation, read-only history |
| `src/playback/` | Audio-owner lease, current clip, holds, progress and acknowledgements |
| `src/providers/` | Dialogue validation and independent OpenRouter, Codex and Fish adapters |
| `src/twitch/` | Retained redemption transport, rewards, private tokens/outcome journal for later integration |
| `src/server/` | HTTP validation, loopback/same-origin restrictions, audio/static delivery |
| `src/shared/` | Safe browser/server contracts and input errors |
| `web/management/` | Management entrypoint, navigation, settings drafts, activity feed and playback controls |
| `web/management/prototype/`, `web/prototype.html` | Throwaway Activity layout comparison on `prototype/activity-layouts`, with shared synthetic state and no backend access |
| `web/testing/` | Independent testing-page entrypoint |
| `web/playback/` | Audio ownership and playback lifecycle |
| `web/shared/`, `web/styles/` | Browser DOM helpers and shared app stylesheet |
| `web/index.html`, `web/testing.html` | Vite page entrypoints, served at / and /testing |
| `config/examples/` | Public provider/Twitch templates |
| `scripts/launch/`, `scripts/windows/` | Bounded start/reuse/restart helpers and prerequisite bootstrap |
| `scripts/build/` | Browser build reuse and public transfer packaging |
| `scripts/twitch/`, `scripts/auditions/` | Explicit later account/reward setup and provider auditions |
| `tests/` | Offline behavior, synthetic providers and actual SDK/CLI checks with local mocks |
| `.local/` | Ignored private configuration, account/recovery state and launcher logs |
| `.generated/` | Ignored builds, packages, auditions and check output |

## Settings and startup

`SettingsStore` reads `.local/generation.env`, `.local/fish.env` and `.local/app.json` (setup progress and launch-volume default), keeping inherited environment overrides distinct from saved values. Fixed section schemas validate before atomic writes and preserve unrelated env-file entries. Browser state exposes configured status, safe metadata and generic errors; saved API keys, voice IDs and prompts never return to the page. Blank replacements retain secrets. Save makes no provider calls.

`src/app/main.ts` starts management with missing provider configuration. New unconfigured management does not implicitly select a provider. Full local requests are gated on generation, speech and character configuration; independent tests have their own prerequisites. Essential failures, such as an invalid listening port, still prevent startup. Normal/demo startup deliberately does not connect Twitch in this milestone.

`src/app/runtime.ts` owns the playback session, queue, management operations and expiry. `app/server.ts` binds runtime to HTTP and disposes it when closed. The HTTP layer validates commands and delegates; it constructs no providers or queue. Routes accept fixed settings sections/actions, never arbitrary commands or paths. `src/app/provider-actions.ts` composes configured pipelines and runs explicit response/voice tests and account checks from settings snapshots. The settings store owns validation, persistence, profiles and safe public metadata; it makes no network requests. Account checks use read-only provider endpoints and redact responses; Codex has one local prerequisite check establishing only executable/version availability.

The testing page contains full-request, response-only and fixed-phrase voice tests and never owns audio. Settings links to the relevant mode. Both pages share `web/styles/app.css`. `web/management/main.ts` coordinates commands, state polling and application actions; `settings.ts` owns form drafts/saves, `activity.ts` owns request rows, `controls.ts` binds playback controls and `navigation.ts` switches persistent sections. Browser management uses persistent page sections. Navigation does not dispose playback or drafts. Per-section saves/Discard, beforeunload warnings, and pending settings are separate from explicit checks/tests. Application houses checklist, diagnostics, profile refresh, testing entrypoint, restart and shutdown. Windows setup provides Node/dependency bootstrap.

## Request and playback boundaries

Testing requests enter the bounded queue as `Name: question`. Selection resolves trusted catalog names; missing/unknown names fail before provider dispatch. Viewer input cannot choose files, providers, voice IDs or executables. Accepted work retains its character identity/prompt. At processing start, the queue pins one pipeline for both generation and speech and resolves the selected character's current assigned voice. Active work keeps its original pipeline; pending work uses the replacement before starting. Fixed voice-test pipelines are constructed by trusted runtime code only.

The queue imports no provider implementation. `pipeline.ts` binds generate/synthesize adapters. Slots remain occupied through acknowledged playback. Skip/stop/deadline invalidates late results. History is bounded and read-only; only current audio is retained, with no replay API/cache.

One audio-owner lease governs playback. `web/playback/player.ts` owns the audio element independently of page rendering; secondary tabs remain silent. `/testing` submits and polls without playback ownership. Closing/refreshing the owner cancels active work and pauses. Reopening requires Resume. Intentional holds exclude paused time from watchdogs; owner/clip identity gates progress and completion.

OpenRouter uses one exact model with separate trusted/viewer messages, no tools/plugins/executor, no fallback and temporary zero-price caps. Output validation rejects tool calls, malformed, empty, incomplete or overlength dialogue. Codex uses guarded CLI 0.162.0 with executors disabled; prompt instructions alone are not the boundary. Private CLI path overrides remain supported. Generation and hosted speech are independently replaceable.

## Launch and retained Twitch boundaries

Launcher reuse uses a fresh HMAC challenge over effective configuration without exposing settings or stable credential hashes. Browser saves update the proof. Mismatches require explicit shutdown/relaunch; no existing work is silently stopped. Explicit restart cancels/clears work, waits a bounded time for the old port to close, then starts through the normal launcher and returns paused. The server port is a developer environment setting read before launch; saved playback volume is a launch default.

Windows bootstrap offers Node/dependency actions when startup is blocked. Codex installation/sign-in are prepared externally; the app only checks the local guarded version. No browser-supplied shell text is executed. Build reuse fingerprints production inputs. Packaging uses a public-file allowlist and rejects links, excluding private state, dependencies and generated output. README supplies packaged setup instructions.

Twurple transport/intake is covered by mocks and disconnected from the current entrypoint. Explicit reward setup owns creation. Intake bounds/deduplicates work, handles moderator outcomes, and settles completion/refunds using a private durable journal without replaying old requests. A crash between completed playback and durable settlement can refund a just-played response. Agreed Twitch scope and unresolved policies live in the handoff.

[Commands](../README.md) · [Evidence](verification.md) · [Decisions](../PROJECT_HANDOFF.md)
