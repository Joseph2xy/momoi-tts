# Verification

Evidence recorded through 2026-10-09. Recorded results do not mean every check ran during the latest documentation edit. [README](../README.md) owns commands; [handoff](../PROJECT_HANDOFF.md) owns authorization, temporary settings, and cleanup blockers.

## Offline coverage

The message-screen integration on 2026-10-09 passed the production build, strict server/browser TypeScript, formatting, whitespace, twelve service-independent test files and the installed Codex probe using a fake loopback provider. Tests use synthetic dialogue/audio, dummy credentials, and mocks without live allowance.

| Area | Checked behavior |
| --- | --- |
| Characters/configuration | Catalog/path validation, strict names, distinct character/voice routing, immutable queued identity, configuration bounds, secret-free public state |
| Queue | One active/two waiting, per-viewer bounds, cooldowns, deduplication, expiry/deadlines, sequential playback, pause/resume, remove/clear/stop, late-result rejection, bounded history |
| Playback | One audio owner, held speech/watchdogs, departure cancellation, explicit Resume, progress ownership, immutable audio/ranges, acknowledgement retries, no completed-audio access/replay |
| HTTP/frontend | Built pages/hashed assets, private/generated/catalog/prompt path denial, same-origin/loopback validation |
| OpenRouter | Exact model/token settings, separated trusted/viewer messages, no tools/plugins/fallback, zero-price caps, output validation, redacted errors, abort/deadline/body bounds |
| Fish speech | Voice mapping, input/voice validation, cancellation/timeouts, MP3/size validation, redacted errors |
| Launcher | Configuration/mode matching, private reuse proofs, cold startup without inference, bounded restart returning paused |
| Management | Atomic persistence, environment precedence, failed-save recovery, blank secret retention, mocked read-only checks, request-pinned adapters, pending settings, profile-refresh notifications |
| Twitch/SDK | Actual Twurple SDK with mocks: auth/refresh, idempotent reward setup, subscriptions, bounds/deduplication, moderation/reconnect cancellation, settlement/refunds, durable recovery without old playback |

Codex CLI **0.162.0** passed the installed-version dialogue-only probe. A fake-provider /responses request omitted tools, offered no executors, included viewer input, and completed synthetic dialogue with permitted event types. This establishes the tested local transport boundary, not every live transport or future release. Other versions are rejected by the current guard.

Account checks were compared with [OpenRouter's current-key API](https://openrouter.ai/docs/api/api-reference/api-keys/get-current-key) and [Fish's official account resource](https://github.com/fishaudio/fish-audio-python/blob/main/src/fishaudio/resources/account.py). Tests mock authentication and discard response bodies; real account checks were not completed during local integration.

## Browser evidence

Isolated demo reviews with disposable configuration and synthetic providers verified:

- First-use/reopenable checklist, access with incomplete setup, drafts across navigation, invalid-save feedback, Discard, durable saves, and secret replacement fields clearing.
- Response-only completion/cancellation, voice-only/full requests, waiting removal, held playback, skip preserving pause, completion, shutdown, and secondary-tab silence. Testing owns no audio element.
- Save-response races: newer edits remain unsaved drafts while older saves persist. Clean tabs receive profile-refresh revisions.
- Restart persistence: saved default volume restored, history cleared, processing paused. Real launcher restart passed its offline test.
- At 1280x800, no horizontal overflow and each question displayed once.

Same-browser script-free copies of the current DOM/stylesheet had no horizontal overflow at 320, 390, 700, and 1024 CSS pixels for management, and at 320px for Testing. This is limited layout evidence. Actual resizing timed out; screenshot/semantic capture failed. Mobile interaction and screenshot-based visual review remain unverified. A confirmation-dialog account-check interaction timed out; mock coverage does not establish hands-on connected behavior.

The organizational-pass review also loaded both built pages in the T3 collaborative browser against isolated demo settings. DOM inspection and interactions verified the first-use checklist, navigation, draft retention across views, Discard, saved playback defaults, and a synthetic response-only test. Testing had no audio element. Snapshot capture failed; this review adds no screenshot or responsive-layout evidence. The review server and disposable settings were removed afterward.

## Message-screen integration

The accepted question-first screen is integrated into the production Vite build on
branch feat/message-screen. Fresh checks on 2026-10-09 passed strict server/browser
TypeScript, the twelve offline test files, and the installed Codex dialogue-only probe
against a fake loopback provider. State-controller tests verify cancellation of stale
GETs, serialized commands, no automatic POST retries, offline gating, departure
aborts, and transport-error redaction. Frontend tests fetch bundled WOFF2 fonts and
verify their MIME type as well as existing private-path exclusion.

T3 review used an isolated demo server, disposable settings, synthetic dialogue/audio,
and zero review-only cooldowns. DOM-dispatched interactions verified the setup
checklist, persistent settings drafts across navigation, Discard, durable playback
default saving, secret replacement clearing without public-state disclosure, paused
waiting removal, skip preserving pause, mute, volume reaching server state, and
stop-and-clear. Navigation retained the same held audio element. A secondary Activity
tab owned no audio, and Testing remained silent. Viewer input containing HTML appeared
as literal text with no injected element; history exposed no buttons.

DOM scrolling moved history while page scroll stayed zero and current work stayed
stationary. Script-free copies of the production DOM/styles at 1280x800, 600x700,
390x844, and 320x568 had no page overflow and only one visible scrollable region:
history. With one current and two waiting questions expanded to long synthetic text,
history remained within the viewport with positive height. These are limited layout
checks, not mobile pointer interaction evidence. Current/upcoming text uses bounded
previews; history text is complete. Direct resizing remains unverified. Snapshot
capture failed, so this revision has no fresh screenshot-based visual verification.

## UX direction prototypes

On 2026-10-09, `prototype/ux-directions` passed strict server/browser TypeScript,
the production build, and formatting of its new UI files. Production Vite inputs
still contain only management and Testing; the comparison uses a separate
development entrypoint. This was a synthetic UX review, not backend integration.

T3 browser interactions verified variant switching and URL updates, pause/skip
preserving hold state, stop-and-clear confirmation with initial focus on Cancel,
sample response completion, full-flow queue insertion, rejection when the two
waiting places are full, and saving a playback draft without changing live volume.
The preview creates no audio element and makes no app/provider API calls. History
search returned only its matching question and exposed no action buttons.
Preparation navigation and in-memory personality draft saving were checked with
DOM-dispatched events; this does not verify backend character persistence.

Live same-origin iframe instances of A/B/C rendered Activity, preparation, and
Soundcheck at 1280x800, 1024x768, 390x844, and 320x568 without horizontal overflow.
Desktop Activity fits the viewport; A scrolls recent history and C scrolls the
activity ledger. Mobile pages use vertical page scrolling. These are actual
iframe layout checks, not direct mobile pointer testing. T3 direct resize timed
out and snapshot capture failed. Native preview recording succeeded; recorded
frames were used for visual review. No successful standalone screenshots were
captured. Earlier production evidence above does not establish that proposed
browser character editing or the new workflows are implemented.

## Packaging evidence

The transfer package passed a fresh integration check: production React TSX files, public-state Query integration, component configuration, and the current browser folders are included. Prototype paths, private state, dependencies and generated output are excluded. PowerShell packaging syntax passed, and the temporary verification ZIP was deleted. Fresh destination-PC installation and actual prerequisite installation/sign-in were not exercised.

## Connected evidence and limits

OpenRouter generation trials on 2026-10-08 produced no accepted usable dialogue. The tested Gemma free route returned HTTP 429. On nvidia/nemotron-3.5-lightning:free, two replies ended at finish_reason: length at 1,024/4,096-token ceilings and were rejected before speech; reported costs were zero. A third request cancelled locally. Client abort does not prove remote cancellation/refund. Recorded allowance is not evidence of current access; verify [current limits](https://openrouter.ai/docs/api_reference/limits) before agreed use.

Fish s2.1-pro-free trials returned valid MP3s, including a Codex-to-speech-to-playback sample around 31.6 seconds. That sample used Codex CLI 0.160.1 and does not verify the current guarded CLI's live behavior or establish quality/latency guarantees. The recorded [Fish offer](https://fish.audio/blog/s2-1-pro-free-api/) named November 30, 2026 as its end; verify current access, allowance, and commercial terms before agreed speech use.

Live Twitch eligibility/authorization, reward creation, moderation/refunds, and redemption-to-playback are unverified. SDK mocks are not real Twitch results. A crash between playback and durable settlement may refund a just-played reply; recovery does not automatically replay old work.

OBS routing/monitoring, destination-PC behavior, sustained live reliability, current guarded Codex live access, final model/persona/voice quality, production latency, settled billing, ongoing allowance, and commercial licensing remain unverified.
