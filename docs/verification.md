# Verification

Audit evidence recorded on 2026-10-11; standalone source and package checks refreshed on 2026-10-12. [README](../README.md) owns recipient instructions, [architecture](architecture.md) owns boundaries and [audit](audit.md) owns review conclusions.

## Source checks

The selected standalone branch was rechecked on 2026-10-12: all 25 offline tests across 16 files passed, including the browser build; typecheck, formatting and whitespace checks passed. Obsolete fixtures/references and abandoned development work were removed. Production runtime/browser/launcher code matches the audited standalone baseline. The existing 65-entry product archive was re-inspected for public inputs and current documentation; no replacement package was needed for developer-document/test-only changes. Private settings and recovery state remain intact. This run used no paid inference, account actions or OBS changes.

The current offline suite passes all 25 reported tests across 16 files. TypeScript/browser build, formatting and whitespace checks pass. npm audit reports zero vulnerabilities in the locked dependencies; this is a registry audit result, not proof of absence of defects. Tests use dummy credentials, local HTTP/WebSocket fixtures and mocked providers/SDK services; no live provider requests or account actions were made for this audit.

Coverage includes trusted instruction separation, dialogue-only enforcement, provider request/model mapping, output bounds, secret/error redaction, private character editing, atomic persistence, admission bounds/cooldowns/deduplication/expiry, sequential playback, cancellation, output-owner identity and durable settlement/recovery. New regressions establish stable queue batches and single terminal ownership under reentrant completion/cancellation callbacks; this is not proof of a real-world refund incident.

Provider tests cover cancellation on successful generation/speech saves, character saves and catalog reload, rejected-save preservation, late-result exclusion, HTTP departure cancellation for speech and connection checks, and nonblocking response-body disposal. Fish HTTP failures retain their known status despite stalled/failed disposal. Failed Twitch token/journal replacements retain the original target and remove temporary files. The in-memory settlement implementation is test-only.

Browser-state checks verify identical polling results preserve state identity and no-op commands produce only meaningful pending-state transitions. Existing checks establish startup off, turn-off/source-loss cancellation, no replay after turn-on, late generation/speech exclusion, player-lease requirements and offline Twitch-configuration recovery. Credential removal preserves model settings, clears duplicate saved entries, survives reload and rejects inherited removal.

## Browser evidence

The audit used isolated local servers, OS temporary configuration and dummy keys/voices. T3 native preview verified mocked generation without OBS, the default S2.1 Pro Free engine, selecting an assigned character voice, speech test enablement and deferred keyboard-focus restoration after closing its dialog. No real inference or synthesis was dispatched.

Browser inspection reproduced blocked Radix inline style sheets under the previous style policy. After the fix and server restart, dialog scroll-lock and Select sheets had active CSS rules and body scrolling was locked. Scripts remain restricted to self, frames are disallowed and frontend tests check the policy. This establishes the widget regression fix, not a complete visual design review.

Earlier isolated-fixture checks established draft preservation, deliberate saves/key removal, semantic feedback, preview cancellation and no horizontal overflow for overview/topic/editor/test screens at 320, 390, 768 and 1024 CSS pixels. Those broad layout checks predate this audit's cleanup. Native resize timed out during this audit; a transient 468-pixel viewport showed no overflow. Screenshot output was stale, so it is not accepted as current aesthetic evidence.

The cleaned Settings overview was checked in an isolated T3 browser at 1280 CSS pixels: Generation, Speech, OBS output and Twitch are the four topics, with no horizontal overflow. Native resize timed out again; this is desktop browser evidence. Review process, helper and empty dummy private folder were removed.

## Product and recipient limits

The current ZIP is `.generated/releases/MomoiTTS-20261011-234019-f7ec1a71.zip`, with 65 public entries and three pinned runtime dependency roots. Inspection found no private state, source TypeScript, tests, developer docs, CLI adapter/probes, demo files or obsolete setup helper. Packaging left zero staging directories; superseded public ZIPs were removed after verifying the replacement. Recipient setup remains unverified on a clean PC. Earlier extracted-product evidence established dependency installation, matching-service reuse and restart for an older release with existing Node and dummy settings; it does not establish the current package's recipient installation or actual Node/admin prompts.

One earlier user-authorized Fish request with s2.1-pro-free and a 51-byte phrase returned 50,154 MP3 bytes: first audio 4,310 ms, full response 4,550 ms. It did not establish listening quality, current browser/OBS playback or guarantees. The prior paid HTTP 402 remains unresolved; Developer API balance was not checked. Fish offer/model/pricing documentation was rechecked during this audit; current terms and links live in README.

Private Twitch configuration remains invalid and unchanged. Offline mocks cannot establish real authorization, reward ownership, fulfillment/refunds, live reconnect behavior or receiving-streamer operation. Durable settlement is asynchronous; a crash after playback can refund a just-played reply. Earlier user-reported OBS monitoring/recording of a synthetic tone is limited evidence, not a full real-provider path. Actual destination-PC routing, duplicate capture and overlap with other stream alerts remain unverified.

OpenRouter fixtures establish the dialogue-only request/response boundary, including absent tools/plugins/fallbacks and rejection of tool responses. Unsupported retained provider selections reject before dispatch even when other API credentials exist. The removed CLI route has no installed-version or live-subscription validation requirement.

## Cleanup

Unused UI implementations/exports/variants/directives and write-only cookie code are removed; all retained UI exports/dependencies have current consumers. The CLI generation adapter, its setup actions/tests and obsolete runtime exports are removed; the runtime restart helper has its own current name. Direct ws is test-only; Twitch retains its declared transitive WebSocket runtime. Private state and recovery folders are preserved. Review servers, source helpers, dummy temporary settings, abandoned integration work and superseded public archives were removed. Automatic approval review rejected combined shell cleanup commands with "blocked by policy"; individually scoped patch/filesystem operations completed the authorized cleanup. These are observed rejections, not a permanent project restriction.
