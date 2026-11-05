# MomoiTTS architecture

A local Node/TypeScript application serves setup/management, explicit real provider checks and a transparent OBS audio player. Generation and hosted speech are independently replaceable. Twitch EventSub intake, the bounded request lifecycle and durable settlement share one owner; OBS owns routing and mixing.

## File ownership

| Location | Responsibility |
| --- | --- |
| `src/app/` | Runtime composition, configuration persistence, provider actions and lifetime. |
| `src/characters/`, `characters/` | Trusted catalog profiles, private prompt/voice edits and strict viewer name selection. |
| `src/queue/`, `src/playback/` | Admission, bounds, cancellation, sequential playback and audio-owner lease. |
| `src/providers/` | Dialogue validation, OpenRouter generation and Fish speech. |
| `src/twitch/` | EventSub intake, explicit reward setup, private tokens and settlement journal. |
| `src/server/`, `src/shared/` | Validated HTTP delivery and safe browser contracts. |
| `web/management/`, `web/playback/` | Setup/activity, independent provider previews and textless queued audio output. |
| `web/shared/` | Public-state polling and serialized commands. |
| `scripts/launch/`, `scripts/windows/` | Start/reuse/restart, explicit exit and verified portable updates. |
| `scripts/build/` | Development browser build and prebuilt product generation/packaging. |
| `tests/` | Offline fixtures, mocked transports/providers. |
| `.local/` | Ignored private settings, account/recovery state, Q/A logs and diagnostics. |
| `.generated/` | Ignored development builds, product staging, packages and check output. |

## Setup and configuration

`SettingsStore` reads fixed `.local/generation.env`, `fish.env`, `twitch.env` and `app.json` paths. Inherited environment overrides remain separate from saved values. Section schemas validate before atomic writes and preserve unrelated private entries. `.local/characters.json` stores prompt/voice overrides for existing trusted catalog IDs. Blank API-key replacements retain saved values; explicit confirmed removal deletes only the section’s key and rejects inherited-key removal; ordinary public state exposes configured status and safe model metadata, never saved keys or prompt/voice details. A dedicated local character-editor operation returns the selected character's effective prompt and voice for authorized editing; these details do not enter status polling or player payloads. Save makes no network request.

Speech requires a Fish API key and assigned voices. S2.1 Pro Free is the default only when no engine is saved or inherited; existing explicit selections are preserved. Backend validation and the browser selector share one Fish model list/default. Omitting the engine during a speech save retains the effective engine. Supported Fish engine changes use Settings without changing the adapter; a future speech-provider replacement remains contained by the speech boundary. Missing provider settings permit setup to open; full requests remain gated. Setup remains discoverable while local configuration is incomplete. Twitch setup uses the local interface: a cancelable, bounded device-code flow keeps access/refresh/device tokens on the backend, validates broadcaster identity and Channel Points access, then saves private authorization. Only activation URL/user code reach management. Twitch JSON is bounded to 64 KiB during streaming; each request retains a 15-second timeout through body reading, and cancellation disposes stalled bodies without waiting. Reward creation/editing is explicit, uses app-owned rewards and persists stable reward IDs. The shared MomoiTTS Public registration is owned by the maintainer's joe_momoi Twitch account, categorized as Application Integration, and supplied through trusted config/twitch-app.json. Its registered http://localhost:3210 redirect satisfies console registration; device-code authorization does not use it. No client secret is distributed. Each receiving streamer separately authorizes their broadcaster account; registration ownership does not provide a chat bot identity. Existing private configuration is preserved.

`SettingsStore` is the single startup/proof configuration owner. A fresh HMAC challenge uses relevant effective application settings, the private root and validated character snapshot, excluding unrelated inherited variables. Matching launchers reuse the service; mismatches require explicit shutdown/relaunch. Effective profile prompts/voices and private edits affect the proof. Private development environment names use `MOMOI_TTS_*`; old Tyrone application-prefix settings are not supported.

Normal startup has replies off and makes no inference request. Twitch connects only after the saved Connect choice. Shutdown/restart does not change saved Twitch intent. Restart cancels queued work, waits a bounded time for the old port to close, starts the same real application and returns with replies off.

## Management interface

Presentation uses charcoal surfaces, white/gray text, coral accents and local Outfit typography. Topic screens have one heading, persistent drafts and feedback near the relevant action. Narrow layouts wrap controls and stack content; visual verification limits live in verification.

Management uses React with shadcn components, Tailwind layouts and shared semantic theme tokens. A responsive sidebar frames Activity, a dedicated setup journey, separate Generation/Speech/OBS/Twitch settings and Characters. Activity loads as a separate browser chunk; it combines the current conversation, waiting queue and attached transport controls, with compact history below. Characters use compact selectable rows with voice/availability status. The detail editor places voice and availability above a bounded, scrollable instructions field; generation setup presents the OpenRouter key before choosing its model, with a deliberate Save action. Fish uses its agreed default with the engine selector in the regular configuration form. App options houses setup, Diagnostics and restart confirmation. A visible Exit MomoiTTS control starts bounded shutdown without a separate confirmation step. OBS is the recommended stream-mix volume control, with no separate playback settings page. The existing application volume capability and saved launch default remain supported.

Settings supplies bounded test dialogs: generation returns dialogue with an optional trusted catalog prompt; speech accepts a voice ID/phrase or loads an explicitly selected character’s assigned voice through the private editor endpoint and plays a transient browser preview. Neither depends on player connectivity, queue state or complete character configuration. OBS output sends a fixed speech-only OBS output test through the queue. Its identity and cancel action survive topic/dialog navigation. The setup journey runs explicit generation followed by speech for a saved character and requires browser playback completion plus user confirmation. Its previews use the same bounded provider endpoints. `/testing` redirects to Settings. The user guide owns user interactions.

Setup orders broadcaster authorization, generation/speech and a voice for included Tyrone, a private reply, OBS output, explicit paused reward creation and Ready. Shared fields preserve one validation path. Setup saves voice/availability without submitting a prompt; the backend retains the latest instructions. Pending instruction drafts remain reviewable in Characters. Browser storage contains only versioned navigation/character selection; test evidence stays in memory. Public `testRevision` is an opaque per-runtime token, changed after successful provider/character edits or reload, preserved for reward/app/playback writes. It contains no secret-derived data. Tests are invalidated after relevant edits/restart; source disconnection also invalidates OBS confirmation. A completed source request plus explicit recording confirmation is required before proceeding, and never proves actual live routing.

## Runtime and provider boundaries

`AppRuntime` owns queue/session expiry, management actions and integration composition. Twitch configuration validates independently: invalid settings disable its transport and expose a fixed repair message, without blocking management or provider previews. Private files remain unchanged. The server binds runtime to HTTP and disposes it on close or startup error. HTTP routes accept fixed schemas/actions, never arbitrary commands or paths. Connection checks and direct provider tests share one bounded action slot, independent of live queue processing; connection fetches have a 10-second timeout and previews a 45-second lifetime. Quit, restart, disposal, HTTP client departure and successful provider/character saves abort the request; late transport results are ignored. Questions are bounded to 1000 characters/4000 UTF-8 bytes; speech previews accept generated dialogue up to 4000 characters within the same 4000-byte ceiling. Speech previews return bounded MP3 bytes with no-store headers; transient blob URLs are revoked on replacement/departure.

The HTTP security policy restricts scripts and connections to local assets, disallows framing and permits inline styles required by Radix dialogs/selectors. Trusted widget styles control scrolling; the UI renders viewer text through React without HTML interpolation.

Viewer input is untrusted `Name: question` data. Names resolve only trusted catalog entries; viewers cannot choose files, executables, providers or voice IDs. Accepted work retains immutable character identity/prompt. Processing pins one pipeline for generation, speech model and assigned voice. Active requests retain it; waiting requests use replacement configuration before starting. Only available characters need valid voices; at least one available character is required. Availability is privately persisted with prompt/voice edits. Existing valid voice assignments default to available; unconfigured characters default to unavailable. Active requests retain their pinned pipeline; waiting work for a disabled character fails safely without playback.

OpenRouter uses one exact model ID, separated trusted/viewer messages, no tools/plugins/executor and no fallback routing. Recipient-selected paid or free models are permitted. Token/output limits, cancellation, body bounds and rejection of tool calls, incomplete or overlength dialogue remain enforced. Fish validates its engine against the supported API enum so misspelled IDs cannot trigger provider default substitution. Neither saving nor startup dispatches generation/speech.

Generation supports only explicit OpenRouter configuration. Unsupported retained provider selections are unconfigured and cannot silently route to API inference. No local executable, executor, browser/computer control or tool adapter is part of generation. The generation/speech composition boundary remains independently replaceable.

There are no product demo/rehearsal modes or synthetic audio. Offline tests inject test pipelines/transports; those fixtures do not ship. Generation/speech previews and OBS output checks consume the configured account's allowance only through deliberate actions. The OBS test bypasses generation using a fixed phrase and retains a pinned speech configuration. Trusted setup submission uses the existing queue while viewer replies are off; it cannot enable Twitch intake. Explicit On/Off, cancellation, source departure and shutdown cancel it with the normal late-result guard. Successful provider/character edits and reload cancel setup audio in the runtime; retry recovery is scoped to its original test revision. Setup tests leave viewer cooldown bookkeeping untouched.

## Queue, playback and persistence

The queue imports no provider implementation. Slots remain occupied until playback acknowledgement. Cooldowns, deduplication, expiry, deadlines and history are bounded. Skip/stop/departure invalidates late results. Terminal jobs release ownership before completion callbacks; cancellation and expiry detach their batches before notification so reentrant callbacks cannot double-finalize jobs or mutate an unfinished traversal. Only current audio is retained; there is no replay API/cache.

Speech failures use typed application-owned diagnostics so Activity and private outcome logs can retain HTTP status and fixed actionable reasons. Provider response bodies and arbitrary exception text are discarded; unknown failures remain generic. Failed speech never creates playable audio or retries automatically.

The transparent player renders no text or controls, including errors. Only one lease owns queued audio; duplicate players remain silent. Direct browser speech previews use an independent browser audio element and never acquire that lease. Refresh/disconnect of the queued player cancels unfinished work but preserves the streamer’s reply intent. A returning source resumes fresh intake only when that intent is still enabled. Explicit Off/Exit and launch/restart prevent automatic resumption. There is no held speech or playback pause state. Replies off rejects admission and cancels current/waiting work; turn-on accepts fresh work. Skip preserves the replies setting. Twitch refunds rejected requests, turns replies off on stream end and cancels unfinished redemptions. Reward availability tracks live state, connections, configuration, reply readiness and bounded queue capacity. Serialized pause updates prevent late unpause work overriding Exit; shutdown waits a bounded interval for pausing and settlement before closing. Owner/clip identity gates progress and completion.

The private dialogue logger appends and flushes JSONL synchronously without unbounded memory buffering. Errors are generic and sticky for the session, and cannot block cancellation or points settlement. Logs are private review records, never HTTP-served, used for replay or sent back into generation. The user guide owns contents and retention behavior.

Twurple transport establishes current live state on connection and checks before admission. Newer stream notifications take precedence over stale in-flight queries. Reconnect gaps make live state unknown, cancel unfinished Twitch work and reconcile outstanding redemptions without replay. Only the app-created reward may be settled. Authorization uses the signal-aware device-code setup service and privately saved refreshable tokens. Setup disconnects transport before token/reward mutation to avoid concurrent refresh ownership. Account changes with pending settlement are rejected. A crash between completed playback and durable settlement may refund a just-played reply.


Token and settlement files are flushed before atomic replacement. Authorization preflights settings persistence before token replacement, but token/config writes span separate files. An unexpected filesystem failure between those writes can require reauthorization. Remote reward writes can succeed before a lost response; cancellation is not rollback. Filesystem/hardware failure and crash settlement do not have an exactly-once guarantee.

Twitch token/outbox replacement retries transient Windows sharing conflicts within a bounded interval, retaining the original destination and honoring cancellation.

## Product distribution and development

The self-contained Windows x64 ZIP contains a pinned official Node runtime, preinstalled production dependencies, prebuilt application/browser assets, characters, public configuration templates, launch/update helpers, a release file-hash manifest, third-party notices and the user guide. Runtime downloads are verified against official SHA256 checksums at build time. Development source, tests, compiler/browser build tools, project handoff/evidence and demo artifacts do not belong in the delivered product. Recipients need no Node/npm preparation. Developers still use Node/npm to build. Compiler-only declarations and the npm installation cache are omitted from the product dependency tree. Source and emitted JavaScript helpers preserve matching resource paths.

Packaging uses explicit public inputs and rejects links/private state. Portable updates validate archive layout and file hashes before stopping the matching local app through a configuration-proof check. Only manifested public files are replaced/removed; private state remains untouched. Replaced files are backed up for rollback, with recovery workspace retained if rollback fails. Hashes establish integrity, not publisher authenticity. It stages archives and publishes only after successful completion; failure removes staging. Development build reuse fingerprints production inputs and complete generated assets, including indirect chunks/fonts. Build subprocess and readiness waits are bounded.

[README](../README.md#source-development) owns build, verification and packaging commands. Verification owns current results, not inferred success from command availability.

Release packaging cleans extracted runtime/product staging, keeping only its verified runtime ZIP cache and current release.

ZIP filenames use the manifest version: `MomoiTTS-v<version>.zip`. A successful rebuild atomically replaces the same-version ZIP; failed staging keeps the existing release intact.

## Open decisions

[Audit conclusions](audit.md#remaining-choices-and-limits) own product gaps and proposed changes. [Handoff](../PROJECT_HANDOFF.md) owns pending user decisions and blockers. Measurements and recipient validation are required before changing intake policy, logging durability or stream playback coordination.

[User guide](../USER_GUIDE.md) · [Evidence](verification.md) · [Audit conclusions](audit.md) · [Scope and blockers](../PROJECT_HANDOFF.md)
