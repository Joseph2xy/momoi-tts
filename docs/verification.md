# Verification record

Updated 2026-10-09. Local/mock evidence establishes checked behavior, not provider quality, production reliability, current allowance, or commercial licensing. Commands live in [README](../README.md); decisions and unresolved cleanup live in [handoff](../PROJECT_HANDOFF.md).

## Current offline checks

The repository review/cleanup passed `npm run build`, strict server/browser TypeScript, the complete eleven-file `npm test` suite, formatting, and whitespace checks. Dependencies have no extraneous top-level packages. Tests use synthetic dialogue/audio, dummy credentials, and loopback endpoints; no live provider/Twitch access or allowance was used.

| Area | Evidence |
| --- | --- |
| Characters/config | Catalog/path validation, strict name selection, two distinct personality/voice adapter routes, public-state privacy, immutable profile selection, configuration bounds, private launcher proofs |
| Queue | One active/two waiting, per-viewer bounds, cooldowns, deduplication, expiry/deadlines, sequential playback, pause/resume, remove/clear/stop, late-result rejection, redacted failures, bounded read-only history |
| Playback | Single audio owner, held speech/watchdogs, cancellation on page departure/disposal, explicit Resume, progress ownership, immutable audio/ranges, completion-acknowledgement retries, no completed-audio access |
| Replay removal | Former endpoint returns 404, public replay flags absent, no queue replay path/cache, completed entries remain read-only |
| HTTP/frontend | Built control/testing pages and hashed assets served, private/generated/catalog/prompt paths denied, same-origin/loopback validation, duplicate current question/response panel absent |
| OpenRouter | Exact model/token settings, separated trusted/viewer messages, no tools/plugins/fallback, zero-price caps, output validation, redacted errors, abort/deadline/body bounds |
| Speech | Fish mapping, input/voice validation, cancellation/timeouts, MP3/size validation, redacted errors |
| Launcher | Matching-settings reuse, refusal on provider/model/key/token/voice changes, private health proofs, cold child propagation without inference |
| Twitch intake/SDK | Actual Twurple SDK against mock endpoints; broadcaster auth/refresh, explicit idempotent reward setup, redemption subscriptions, deduplication, bounds, moderation/reconnect cancellation, refunds/settlement, durable restart recovery without old playback |

Codex CLI **0.162.0** passed the installed-version offline boundary probe against a fake loopback provider. One `/responses` request omitted `tools`, offered no executors, included viewer input, and completed synthetic dialogue with permitted event types. Other versions remain rejected. This is evidence for the tested local transport, not every live transport or future CLI release. No global CLI installation or private provider selection changed. The exact guarded version is required by both setup and runtime.

## Browser and packaging checks

An isolated port-3211 demo accepted a question through the real `/testing` form without an audio element, then completed simulated dialogue and WAV playback in controls after explicit Resume. Past rows had no action/replay buttons and the desktop page had no horizontal overflow. The review server was stopped. Earlier browser checks also established secondary-tab silence, page-refresh cancellation, held audio, and autoplay-denial handling; they do not establish OBS or destination-PC behavior.

The selected sidebar mockup uses dark mode. DOM/evaluation checks at 320/768/1280px covered Activity, Connections, all Settings sections, and every setup step without horizontal overflow. Checks established response-only expansion, no waiting dropdowns or past actions, Pause preserving expansion, Skip preserving pause, separate Save/check/test actions, cleared placeholder key fields after Save, pending settings between sample requests, connection without reward creation, shared setup controls, and mock shutdown. Alternate layouts, their styles, URL selection, and comparison shortcuts were removed. Theme/UI refinement is deferred.

T3 screenshot/semantic snapshot capture failed; no fresh screenshot-based visual verification is claimed. Browser evidence uses DOM/evaluation and interactions. A follow-up interaction check after removing the duplicate panel timed out and the T3 automation host disconnected; duplicate-panel absence is covered by the final frontend test, while the new expansion-preservation change has no completed hands-on browser result. The mockup has no API/provider calls, storage, private-config access, or audio and does not verify functional browser management.

Packaging and its PowerShell syntax passed. ZIP inspection found 62 public runtime/setup files, retained required launchers/catalog/templates, and excluded the mockup, private state, dependencies, and generated output. Build fingerprinting excludes the development mockup. Existing launcher reuse checks passed after this change. Fresh-install/destination-PC testing was not repeated. The scratch ZIP could not be removed; the handoff records the automatic-review rejection.

## Connected evidence retained for later decisions

OpenRouter generation-only trials on 2026-10-08 used two separately authorized three-request budgets, both exhausted. Read-only catalog/account checks advertised free allowance and zero-price endpoints. Three `google/gemma-4-26b-a4b-it:free` requests returned HTTP 429. On `nvidia/nemotron-3.5-lightning:free`, two requests returned HTTP 200 but ended at `finish_reason: length` at 1,024/4,096-token ceilings; they reported 1,039/3,597 reasoning tokens and cost zero. Both incomplete outputs were rejected before speech. A third request cancelled locally after about 111 ms using a 100 ms timer. Immediate metadata showed 49 free requests remaining and zero daily credit usage; counters may settle later. No usable live dialogue or full OpenRouter-to-speech run is accepted. Client abort does not prove remote cancellation/refund. See [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits) and the [tested NVIDIA route](https://openrouter.ai/nvidia/nemotron-3.5-lightning:free); current conditions must be reverified before use.

Earlier Codex CLI 0.160.1 live samples produced four replies within 60 words in about 6–10 seconds, reported no tool actions, and refused a viewer file-access override in character. Those samples do not establish the current guarded 0.162.0 live behavior.

Earlier Fish `s2.1-pro-free` trials returned valid MP3s, including one complete Codex-to-speech-to-playback run around 31.6 seconds. These are functional samples, not quality/latency guarantees. The recorded [free API announcement](https://fish.audio/blog/s2-1-pro-free-api/) named November 30, 2026 as the offer end; current access, allowance, and commercial terms require checking before live speech. Recordings were removed and temporary keys require replacement.

Official Grok CLI 1.0.50 (`c58f321264ba`) failed the offline zero-tool probe: tested restrictions still exposed tools including `run_terminal_command`. No adapter, malicious execution, or live usage resulted. This finding is specific to that version.

## Remaining limits

Live Twitch authorization/eligibility, reward creation, moderation/refunds, and redemption-to-playback remain unverified. SDK mocks are not real Twitch evidence, and no hour-long live-session reliability was established. A crash between playback completion and durable settlement recording may refund a just-played reply; restart recovery never automatically plays old requests.

OBS capture/routing/monitoring, destination-PC behavior, final model/persona/voice quality, production latency, settled billing, ongoing allowance, and commercial licensing remain unverified. Functional browser settings/setup and their application during active work are still unimplemented; mockup checks do not establish them.
