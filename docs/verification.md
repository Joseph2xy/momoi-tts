# Verification

Evidence recorded through 2026-10-09. Recorded results do not mean every check ran during the latest documentation edit. [README](../README.md) owns commands; [handoff](../PROJECT_HANDOFF.md) owns authorization, temporary settings, and cleanup blockers.

## Offline coverage

The local application checks on 2026-10-09 passed the production build, strict server/browser TypeScript, formatting, whitespace, twelve service-independent test files and the installed Codex probe using a fake loopback provider. Tests use synthetic dialogue/audio, dummy credentials, and mocks without live allowance.

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

The Activity redesign on 2026-10-09 passed a fresh production build, strict server/browser TypeScript, twelve offline test files and formatting. No provider or CLI adapter changed; the guarded Codex probe evidence above is retained from its earlier run, not newly claimed for this pass.

T3 review used an isolated demo server, disposable settings, synthetic dialogue/audio and zero review-only cooldowns. Browser interaction and DOM inspection verified:

- Full question/reply inspection, live status updates in an open dialog, Escape dismissal and focus returning to the originating row or Pause/Resume when that row disappeared.
- Waiting-message removal, Skip preserving pause, the labeled secondary controls menu, Stop and clear returning paused with no active/waiting work, and keyboard volume changes reaching server state.
- Settings access and return, unsaved playback drafts surviving navigation, and Discard restoring the saved value.
- Viewer HTML appearing as literal text in both rows and inspection, with no injected image. History exposes inspection only, without replay or queue commands.

Script-free copies of the built DOM/styles at 1280x800, 600x700, 390x844 and 320x568 kept controls and rows within the viewport. With one held current message, two waiting messages and long synthetic questions, only history was scrollable and retained positive height (about 92px at 320x568). These are limited layout checks, not mobile pointer interaction evidence. Direct preview resizing timed out. Saved preview screenshots were blurred and delayed relative to inspected DOM state; complete visual verification remains open.

Earlier isolated management reviews also verified the first-use/reopenable checklist, incomplete-setup access, invalid-save feedback, durable saves, blank secret retention, secret replacement clearing, save-response races, profile-refresh revisions, response/voice testing, secondary-tab silence, retained audio across navigation and restart persistence. Those checks were not all repeated during this layout pass. Offline tests continue to cover their backend contracts. Testing owns no audio element. A connected account-check dialog timed out; mock coverage does not establish hands-on connected behavior.

## Packaging evidence

The transfer package passed a fresh integration check: production React TSX files, public-state Query integration, component configuration, and the current browser folders are included. Prototype paths, private state, dependencies and generated output are excluded. PowerShell packaging syntax passed, and the temporary verification ZIP was deleted. Fresh destination-PC installation and actual prerequisite installation/sign-in were not exercised.

## Starter cleanup

On 2026-10-09, the accepted starter passed a fresh production build, strict server/browser TypeScript, twelve offline test files, formatting and whitespace checks after removing unused UI variants, inactive animation classes, duplicate CSS rules and no-op row props. Existing browser evidence above is retained; no fresh browser interaction or screenshot verification is claimed for this cleanup.

Packaging PowerShell syntax and the six public TSX component inputs were checked. No new transfer ZIP, provider request or CLI probe was produced. The isolated review process was stopped and port 3224 was confirmed to have no listener. Review-file deletion was rejected by automatic approval review; [handoff](../PROJECT_HANDOFF.md#temporary-state) owns the pending paths. Private configuration and account state were preserved.

## Connected evidence and limits

OpenRouter generation trials on 2026-10-08 produced no accepted usable dialogue. The tested Gemma free route returned HTTP 429. On nvidia/nemotron-3.5-lightning:free, two replies ended at finish_reason: length at 1,024/4,096-token ceilings and were rejected before speech; reported costs were zero. A third request cancelled locally. Client abort does not prove remote cancellation/refund. Recorded allowance is not evidence of current access; verify [current limits](https://openrouter.ai/docs/api_reference/limits) before agreed use.

Fish s2.1-pro-free trials returned valid MP3s, including a Codex-to-speech-to-playback sample around 31.6 seconds. That sample used Codex CLI 0.160.1 and does not verify the current guarded CLI's live behavior or establish quality/latency guarantees. The recorded [Fish offer](https://fish.audio/blog/s2-1-pro-free-api/) named November 30, 2026 as its end; verify current access, allowance, and commercial terms before agreed speech use.

Live Twitch eligibility/authorization, reward creation, moderation/refunds, and redemption-to-playback are unverified. SDK mocks are not real Twitch results. A crash between playback and durable settlement may refund a just-played reply; recovery does not automatically replay old work.

OBS routing/monitoring, destination-PC behavior, sustained live reliability, current guarded Codex live access, final model/persona/voice quality, production latency, settled billing, ongoing allowance, and commercial licensing remain unverified.
