# Code structure

One local Node/TypeScript application serves a streamer control page and a separate manual testing page. Generation and hosted speech remain independent adapters. No framework or hosted application service is required.

## File ownership

| Location | Responsibility |
| --- | --- |
| `src/app/` | Read configuration, compose providers/runtime, start and stop the application |
| `src/characters/` | Character types, trusted catalog loading, viewer name selection |
| `characters/` | Editable catalog and character-specific prompts |
| `src/queue/` | Admission, cooldowns, deduplication, request lifecycle, cancellation, history/replay |
| `src/playback/` | Audio-owner lease, current clip, progress, speech holds, playback acknowledgements |
| `src/providers/` | Shared dialogue validation and OpenRouter, Codex, and Fish adapters |
| `src/twitch/` | Redemption intake, Twurple transport, reward setup, private tokens/outcome journal |
| `src/server/` | HTTP validation/routes, same-origin/loopback restrictions, audio and static-file delivery |
| `src/shared/` | Browser/server state contracts and safe request-input errors |
| `web/` | Main controls/rendering and audio playback; separate testing HTML/entrypoint; shared styles |
| `config/examples/` | Public provider/Twitch templates |
| `scripts/launch/` | Foreground/background Node launch entrypoints |
| `scripts/windows/` | Windows launcher and setup UI wrappers |
| `scripts/build/` | Browser build reuse and transfer packaging |
| `scripts/twitch/`, `scripts/auditions/` | Explicit account/reward setup and later provider auditions |
| `tests/` | Offline behavior and actual SDK checks using mocks |
| `.local/` | Ignored private settings, account/recovery state, setup progress, launcher logs |
| `.generated/` | Ignored disposable browser builds, release ZIPs, audition output, check reports |

## Application flow

`web/designs.html`, `designs.ts`, and `designs.css` form a temporary, isolated activity-feed preview served by Vite development mode. They do not import app playback, fetch app APIs, or enter the production Vite inputs. Their queue state and controls are illustrative. Keep it for ongoing design review; the current production frontend is still the functional implementation. Remove the preview once integration makes it redundant.

`src/app/main.ts` selects demo/live adapters and starts `createAppServer`. `src/app/runtime.ts` owns the playback session, its queue, Twitch intake, periodic expiry checks, and shutdown. `src/app/server.ts` connects that runtime to HTTP and disposes it on server close. The HTTP server consumes the runtime through a small structural interface; it constructs no queue, provider, or Twitch transport.

Manual requests from `/testing` and Twitch requests enter the same queue using `Name: question`. Character selection resolves only trusted catalog names. Missing/unknown names and empty questions fail before provider dispatch. Viewer content cannot select files, voice IDs, or providers. Each accepted job snapshots its character profile; only its question reaches generation as untrusted conversational data. Public state contains character IDs/names, not prompts or voice settings.

The queue calls independent generate/synthesize operations through `QueuePipeline`, without importing provider implementations. `src/app/pipeline.ts` binds them to configured adapters. A slot remains occupied through acknowledged playback. Skip/stop/timeout invalidates late generation and speech results. History and audio replay caches are bounded; replay uses its original character/audio with no providers or new redemption.

## Playback and generation boundaries

The playback session owns one audio lease; `web/playback.ts` owns the browser audio element independently of controls rendering. Secondary control tabs stay silent. The testing page polls public state and submits questions without importing playback or acquiring/releasing an audio lease. Closing/refreshing the owner cancels active work and pauses the queue. Reopening requires explicit Resume. Pause holds current speech and the next request, including a clip prepared during generation. Intentional holds exclude paused time from watchdogs; disconnection still cancels work. Progress/events are accepted only from the current owner and clip.

OpenRouter sends one non-streaming request with separate character/viewer messages and one exact model. It attaches no tools/plugins/executor, disables fallback, and currently caps prices at zero. Output validation rejects tool calls and malformed, empty, incomplete, oversized, or overlength dialogue. Only final content reaches speech. Abort/deadline handling covers fetch and body consumption; no retry occurs. Codex has executors disabled and a guarded tested CLI version. Prompt instructions alone are not the tool boundary.

## Twitch recovery

Twurple transport verifies broadcaster authorization and listens for redemption add/update events. Connect finds an app-managed required-text reward; only explicit reward setup creates it. Intake persists a cancellation outcome before admission, marks completed playback fulfilled, and cancels/refunds other terminal work. Native moderation and disconnect/reconnect races cancel matching requests.

The private bounded outcome journal contains identifiers/targets, never viewer text/audio. It retries confirmation while connected and reconciles outstanding old redemptions on restart, without replaying them. Native final outcomes are preserved after ambiguous failures. Malformed/mismatched journals fail closed for review. A crash between playback completion and durable recording can refund a just-played reply.

## Operational paths

Private paths remain stable; no credential/recovery migration is needed. The launcher uses a fresh HMAC challenge over effective settings, including loaded profiles/prompts/voices, without exposing settings or stable credential hashes. Mismatches require explicit quit/relaunch. Browser builds are reused by source/config fingerprint. HTTP exposes only the built control/testing pages and hashed assets, never enclosing generated/private directories.

Windows setup runs fixed local actions outside the browser. Navigation remembers a page, not verified completion. Packaging uses a public-file allowlist and rejects linked files/directories; it excludes both private state and generated output.

[Commands/configuration](../README.md) · [Test evidence](verification.md) · [Current decisions](../PROJECT_HANDOFF.md)
