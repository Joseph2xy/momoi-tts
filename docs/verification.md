# Verification

Reviewed 2026-10-19. [User guide](../USER_GUIDE.md) owns recipient instructions; [architecture](architecture.md) owns boundaries; [audit](audit.md) owns conclusions. Results below distinguish this audit from earlier evidence.

## Recipient ZIP smoke test — 2026-10-19

The existing October 13 ZIP was extracted into a fresh disposable folder on the development PC. Its archive hash matched the package evidence below, and all 856 manifested files matched their hashes. The Windows launcher succeeded on the default port with system Node/npm absent from PATH and inherited provider/Twitch configuration removed. Fresh state had no keys or authorization, replies off and an empty queue. Matching-instance reuse and cold relaunch succeeded; dummy saved generation settings survived, with replies off and no queued work. Explicit Exit stopped the service; no listener remained on its port.

Native browser inspection verified the initial Twitch setup gate, Settings, Generation, Speech and the character list. Empty generation configuration was rejected; saving dummy credentials cleared the key input and exposed configured status without returning the saved key in public state. Inspected desktop pages had no horizontal overflow. The requested narrow viewport did not change measured page dimensions, and the browser automation connection subsequently dropped while the app remained responsive; narrow-screen layout and the remaining screen walkthrough are not verified by this run. An initial custom test port was inside a Windows excluded TCP range; the normal default port worked.

The current source offline suite passed all 45 tests, including simulated provider/playback/Twitch flows and updater fixtures. Typecheck, browser build, formatting and whitespace checks passed. No provider requests, Twitch authorization/reward changes or OBS changes occurred. This establishes an extracted launch on this PC, not a complete streamer-PC or live end-to-end trial; normal browser opening and updater dialogs were not exercised in this run.

Automatic approval review rejected removal of `.generated/recipient-test-20261019` as “blocked by policy.” The extraction and dummy configuration remain there; the release ZIP is unchanged.

## Current source checks

Synchronization checks on 2026-11-02 passed TypeScript checks, the browser build, all 45 offline tests, formatting and staged whitespace checks. No real provider, Twitch or OBS actions were performed. This does not add connected or receiving-PC verification.

The images in `docs/images/` were captured on 2026-10-31 from the earlier synthetic-demo version in the presentation branch. They are retained as historical interface evidence only; they do not verify the current guided setup, model/voice quality or Twitch/OBS behavior. The current app no longer includes that demo entrypoint.

The latest full offline suite passed all 45 tests across 19 files, including voice-only setup preserving the latest saved prompt and rejecting invalid mutations. TypeScript checks, browser build, formatting and whitespace checks pass. Tests use dummy credentials, local HTTP/WebSocket fixtures and injected providers/SDK services. No real Twitch/provider account actions, inference, models or OBS changes are part of these checks.

Coverage includes trusted instruction separation, absent tools/plugins/fallbacks and rejected tool results; provider mapping/bounds/redaction; private editor/configuration writes; admission limits/deduplication/cooldowns/expiry; sequential playback and owner identity; late-result exclusion; fresh-intake recovery; durable settlement and guided setup. Current review regressions additionally cover cross-client setup cancellation, obsolete-event recovery rejection and independent viewer cooldown accounting. Setup regressions cover intake-off output, cancellation before/after acknowledgment, Stop/On/Off/departure/Exit and late speech disposal, opaque test evidence invalidation, unchanged reward-write evidence, bounded navigation resume and generation/speech input-limit consistency. Audit regressions cover disabled waiting characters, stalled setup headers/late-body disposal, concurrent Connect rejection, token preservation when inherited settings reject a save, remote reward preflight and delayed unpause correction. Token/outbox contents are flushed before replacement; this does not establish sudden-power-loss or hardware durability.

Windows updater fixtures cover successful replacement/removal, private credential/log/refund preservation and hash-tamper rejection. A locked-file failure after earlier replacements verifies rollback restores those files and retains recovery copies when a lock prevents complete restoration. This uses isolated fixtures, not a recipient installation.

The current npm registry audit reports zero known advisories across production and development dependencies. It does not establish absence of vulnerabilities or future advisory coverage.

## Browser evidence

The simplified Connect AI and voice screen passed an isolated native T3 fixture with mocked account/API state and external fetches blocked. It displayed only the voice field, without a prompt editor or character picker. The save submitted only voiceId/available and enabled the starter while retaining the fixture prompt. An unsaved instruction draft exposed only Review draft in setup, preventing hidden saves/discards. The fixture process/helper were stopped and removed. Actual latest-prompt preservation has the separate SettingsStore regression above. The current packaged preview shows the renamed step and has no horizontal overflow at 1280 pixels.

Current packaged character screens were inspected at 1280×800 using native T3 DOM evaluation. The compact list row measured about 78 pixels, and the editor placed voice/availability above a 256-pixel fixed-size instructions area. Save controls remained within the viewport; no horizontal overflow or duplicate guidance was found. Screenshot automation failed, so this is layout/control evidence rather than full visual verification. The updated preview retains private state and its earlier recovery workspace.

The post-cleanup native T3 regression used current built assets in a disposable HTTP fixture with mocked API data, blocked external fetches and self-only browser connections. It verified reward draft edit/save preserves prior checks, disconnect/reconnect cannot confirm old completed OBS output, submitting another test immediately disables progression, and saved requested navigation survives fresh-evidence gating. Media completion was explicitly simulated. The fixture process/helper were removed. Native evaluation worked; screenshots failed.

The preceding guided-setup review used a disposable native T3 fixture blocked all external requests and used empty/dummy settings, mocked Twitch/providers and explicitly injected media/player completion acknowledgments. It exercised first launch, pending authorization/return, inline provider and character saves, navigation resume, dirty-form navigation blocking, redacted provider failure, preview cancellation/departure, browser decode failure, OBS completion/recording confirmation, paused reward creation and Ready. Viewer replies remained off. Reward creation preserved earlier proof; saved key inputs stayed blank after reload. Browser storage held only step/substep/character ID. No duplicate IDs or desktop overflow were found at 1536 CSS pixels. Simulated acknowledgments establish control flow, not heard audio or OBS routing. The fixture processes/helper/dummy state were removed.

The current rebuilt ZIP updated the empty recipient preview, whose 856 installed product hashes matched its release manifest. Bundled relaunch removed inherited provider/Twitch settings from the child environment. Its public state confirmed no saved keys/authorization, replies off and an empty queue. Native inspection at 1280 CSS pixels showed the first guided step with no horizontal overflow. The empty recipient preview is open at http://127.0.0.1:62636/ in .generated/recipient-preview-guided/MomoiTTS; earlier walkthrough state is preserved separately. This is a packaged launch on the development PC, not a clean streamer installation.

Native screenshots failed; resize to 390 pixels timed out and disconnected the fixture browser host. Current narrow-screen/full visual verification remains incomplete. UI reauthorization cancellation, restarting midway and disconnect-driven stale proof were not completed in that browser run; backend/progress tests supply separate evidence. No real provider requests, Twitch actions or OBS changes were performed.

## Shared Twitch registration

Earlier explicitly authorized console inspection confirmed the shared Public MomoiTTS registration under joe_momoi, Application Integration category and localhost redirect. Trusted config/twitch-app.json supplies its public client ID; isolated SettingsStore checks establish local loading. Device authorization does not use the registered redirect. This audit did not enter an account or recheck the console. Registration/local configuration do not establish receiving-broadcaster permissions or refund success.

## Package evidence

Current Windows x64 artifact: `.generated/releases/MomoiTTS-v0.1.0.zip`, 35,932,590 bytes, 857 file entries, SHA256 `cd7f083fe624916b4414864a3fff5107df33233807b094f092a0492e4652e7ec`. Product files are checked against the release manifest; archive inspection found no private/recovery state, source TypeScript, declarations, tests or developer docs. It includes Node 24.21.0 and production dependencies.

Guided-setup packaging passed typecheck/browser build and atomic same-version ZIP replacement. All 856 manifested product files matched their SHA256 values; the archive has 857 entries including the manifest. The delivered updater, bundled relaunch and empty recipient state/page passed. The current 45-test suite, typecheck, formatting and whitespace checks pass.

The earlier audit package passed extracted launch, matching-instance reuse, actual updater shutdown/replacement, private sentinel preservation, relaunch with replies off/empty queue and explicit Exit in an isolated folder with system Node/npm absent from PATH. No account/provider calls occurred. This is prior scripted evidence for the Windows distribution path on this PC, not a newly repeated updater check, clean-recipient installation or normal dialog interaction. That disposable audit extraction and superseded public archive were removed; existing transfer/recovery state and recipient walkthrough folders remain.

The normal file picker/progress-dialog interaction remains unverified. Hashes verify archive integrity, not publisher authenticity. Automatic rollback has fixture evidence; a failed rollback retains its recovery workspace.

## Provider and live limits

An earlier authorized Fish s2.1-pro-free request with a 51-byte phrase returned 50,154 MP3 bytes: first audio 4,310 ms, full response 4,550 ms. It does not establish listening quality, current browser/OBS output or guarantees. The paid HTTP 402 remains unresolved; API balance was not checked. Fish's public offer/model/API enum/pricing and OpenRouter routing documentation were refreshed without provider requests; current terms and links live in the user guide.

Private development Twitch configuration remains invalid and unchanged. Real device authorization, reward ownership, settlement/refunds, live reconnect behavior and receiving-streamer operation remain unverified. Crash timing can refund a played reply; a remote reward write may succeed before a lost response. Actual recipient provider quality/latency, OBS tracks/monitoring, duplicate capture and overlap with other alerts need the separately authorized [trial](streamer-trial.md).

## Cleanup evidence

The current UI retains only consumed primitives and rendering options. Unused sidebar controlled-state/layout/menu variants, sheet directions and horizontal scroll options are removed. Ordinary queue submission no longer accepts an unused pipeline override; setup admission retains the required pinned pipeline. Duplicate setup cancellation/evidence state and the optional token fallback are removed.

Two stopped superseded recipient previews had 1,714 manifested public files removed. Their unmanifested private/recovery state remains in place; the current preview, private .local and transfer/recovery directory are preserved. Disposable fixtures/helpers and empty staging are removed. Build output, the current release and the verified runtime ZIP cache have concrete current purposes. No cleanup remains blocked.

The preview retains .update-work-97cafbb79fb54dd78182d72e638a89d6 from a failed update attempted without its custom launch port. A locked runtime prevented complete rollback; the retry with the correct port succeeded and all installed public hashes match the current release. The retained workspace is recovery state, not a runnable release or unresolved update failure.

Automatic approval review rejected combined verification/empty-staging cleanup as “blocked by policy.” Separate read-only verification and scoped empty-directory removal completed the work; no cleanup remains blocked.
