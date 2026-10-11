# Current-state audit

Reviewed 2026-10-11. This document owns the review conclusions and proposed product changes. [Architecture](architecture.md) owns implemented boundaries; [verification](verification.md) owns evidence and its limits.

## Product and architecture

The core purpose is a mostly unattended Channel Points question-to-character-speech utility. Keep Twitch intake, trusted character selection, independent generation/speech adapters, sequential OBS output, bounded intervention controls and durable settlement. A replacement architecture is not justified by an observed failure. A single local process keeps ownership and cancellation comprehensible; adding services, generic plugins or an installer platform would introduce more coordination than this product needs.

Independent generation, browser speech and OBS checks have distinct purposes: they isolate credentials/model output, voice output and stream routing. Combining them would make setup failures harder to locate. Keep explicit saving, deliberate checks, replies off at startup and no inference fallback.

Generation is OpenRouter-only, avoiding CLI sign-in/version maintenance and executor-capability validation. Unsupported retained provider selections require an explicit configuration save before inference; private credentials/caches remain intact.

The cleaned standalone app uses its own management interface and OBS audio source, without a StreamElements account, token, transport or control dependency. Keys, character instructions and dialogue logs stay private in the local helper. Its controls affect only its own queue; other stream alerts may overlap.

The user requested a separate branch for exploring deep native StreamElements integration, with this standalone version retained as a fallback. A local helper is acceptable; the native route is conditional on practical setup, reliable playback and secure handling of private settings. This branch owns the standalone product; native extension research and prototype evidence belong on the separate integration branch.

## Implementation and failure paths

Queue terminal ownership now releases before callbacks. Clear and expiry detach their selected batches before notification. Regression checks cover reentrant callbacks attempting further cancellation, clearing or disconnecting; they cannot double-finalize terminal work or disturb batch traversal. This is lifecycle hardening, not evidence of a real Twitch refund incident.

Successful provider/character saves and catalog reload cancel backend previews, including requests from another tab; rejected saves preserve pending work. Connection checks share the bounded preview action slot and HTTP departure cancellation. Provider response disposal cannot delay a known result or replace a known Fish HTTP failure. Private Twitch atomic-write failures remove their temporary files.

Management polling suppresses notifications when the observable view is unchanged. Unused shadcn template implementations, exports, button variants, irrelevant directives and a write-only sidebar cookie are removed. The security policy permits Radix's required runtime styles while retaining local-only scripts and connections. The in-memory redemption fixture lives only under tests; shipped settlement storage is durable.

Browser build reuse fingerprints its shared Fish model definitions as well as browser/shared inputs and complete output. Runtime/browser dependencies have current consumers; no dependency replacement is justified solely by package count. Recipient packages contain the prebuilt product and pinned server dependencies, excluding source tests, review helpers and private state.

## Product gaps and decisions

| Topic | Assessment |
| --- | --- |
| Character catalog authoring | Add/remove/rename in Characters is the clearest missing product capability. The user chose to record it for follow-up; current prompt/voice editing and trusted-file catalog operations remain. |
| Character readiness | Requiring every catalog voice before full intake can delay first useful setup. Allowing only individually configured characters is a possible simplification, but changes agreed behavior and remains unadopted. |
| Twitch account setup | Terminal/device-code and reward helpers remain an accepted workflow. Browser guidance may reduce recipient support effort; it requires a separate product decision and real recipient validation. |
| Dialogue retention/review | Durable private logging serves agreed scope. Retention and review tooling remain undecided; avoid silently deleting history or adding a database/replay workflow. |
| Preview/live capacity | Manual provider actions can overlap live work. No measured contention justifies a new intake/refund policy. |
| Storage latency | Synchronous durable logging may stall on slow disks. Measure before trading durability for buffering. |

## Release assessment

Offline correctness and browser interaction evidence support continued development. They do not establish recipient installation, actual provider quality/latency, OBS stream routing, or real Twitch authorization/fulfillment/refunds. The main remaining release risk is absence of a receiving-streamer end-to-end check, not a missing framework or additional feature. Live trials still require separately agreed credentials, actions and allowance.
