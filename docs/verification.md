# Verification

Evidence recorded through 2026-10-09. Recorded results do not mean every check ran during the latest documentation edit. [README](../README.md) owns commands; [handoff](../PROJECT_HANDOFF.md) owns authorization, temporary settings, and cleanup blockers.

## Offline coverage

The final organizational review on 2026-10-09 passed the build, strict server/browser TypeScript, all twelve test files, formatting, whitespace, and PowerShell syntax checks. Source references and local document links were checked; the moved stylesheet is unchanged. Eleven test files are service-independent; the installed Codex probe uses a fake loopback provider. Tests use synthetic dialogue/audio, dummy credentials, and mocks without live allowance.

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

## Activity layout prototype evidence

On 2026-10-09, branch `prototype/activity-layouts` passed the existing production build
and strict server/browser TypeScript, plus `prototype:check` for the isolated React
prototype. The production build includes only its existing management and testing pages.

T3 browser review loaded all three layout variants and captured desktop screenshots.
Interactions verified pause, skip advancing the sample queue while preserving pause,
state retention when switching variants, waiting-question removal and its empty state,
recent-response expansion, and sample reset. Browser inspection found no audio element
or `/api/` resource requests. These are synthetic interactions, not live queue evidence.

Script-free DOM/stylesheet copies of all three variants had no horizontal overflow at
390 CSS pixels; dashboard and adaptive grids reduced to one column. Direct browser
resizing timed out, so actual narrow-window interaction remains unverified.

## Packaging evidence

The transfer package passed a fresh check during the organizational pass: the new browser folders and backend provider-actions module are included; superseded browser paths, private state, dependencies and generated output are excluded. The public-file allowlist continues to include the five project documents. The temporary verification ZIP was deleted. Fresh destination-PC installation and actual prerequisite installation/sign-in were not exercised.

## Connected evidence and limits

OpenRouter generation trials on 2026-10-08 produced no accepted usable dialogue. The tested Gemma free route returned HTTP 429. On nvidia/nemotron-3.5-lightning:free, two replies ended at finish_reason: length at 1,024/4,096-token ceilings and were rejected before speech; reported costs were zero. A third request cancelled locally. Client abort does not prove remote cancellation/refund. Recorded allowance is not evidence of current access; verify [current limits](https://openrouter.ai/docs/api_reference/limits) before agreed use.

Fish s2.1-pro-free trials returned valid MP3s, including a Codex-to-speech-to-playback sample around 31.6 seconds. That sample used Codex CLI 0.160.1 and does not verify the current guarded CLI's live behavior or establish quality/latency guarantees. The recorded [Fish offer](https://fish.audio/blog/s2-1-pro-free-api/) named November 30, 2026 as its end; verify current access, allowance, and commercial terms before agreed speech use.

Live Twitch eligibility/authorization, reward creation, moderation/refunds, and redemption-to-playback are unverified. SDK mocks are not real Twitch results. A crash between playback and durable settlement may refund a just-played reply; recovery does not automatically replay old work.

OBS routing/monitoring, destination-PC behavior, sustained live reliability, current guarded Codex live access, final model/persona/voice quality, production latency, settled billing, ongoing allowance, and commercial licensing remain unverified.
