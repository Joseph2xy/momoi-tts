# Project handoff

Updated: 2026-10-19.

## Current status

The approved guided setup and offline cleanup are implemented. Character list/editor presentation is simplified, with compact status rows and voice/availability above bounded instructions. Setup uses shared provider/voice fields, with Tyrone as the starter and prompt editing outside setup, private reply/audio checks with viewer intake off, explicit paused reward creation and deliberate entry to Activity. The current review fixed stale test confirmation, reward-edit resets, cross-client cancellation and viewer cooldown interference. [README](README.md) owns usage, [architecture](docs/architecture.md) owns boundaries, [verification](docs/verification.md) owns source/package evidence, and [audit](docs/audit.md) owns remaining gaps.

The current empty recipient preview runs at http://127.0.0.1:62636/ in .generated/recipient-preview-guided/MomoiTTS. Superseded preview binaries are removed; their private/recovery state remains in place. Credentials, private settings, account caches and transfer/recovery state are preserved. No provider usage, account actions or live Twitch/OBS changes occurred. The working tree includes prior milestone changes; no commit/publication was requested.

## Scope and provisional choices

The goal remains named-character questions through one shared required-text Channel Points reward, automatic spoken replies when enabled and private durable Q/A records. Generation and hosted speech stay independently replaceable. Additional events, microphone/vision, avatars, autonomous commentary, local models, per-reply approval, chat replies and extra filtering are not agreed.

OpenRouter is explicit with no fallback or settled generation model. Fish S2.1 Pro Free defaults only without a saved/inherited engine. Persona/voice quality and allowance remain unevaluated; the prior paid Fish HTTP 402/API balance is unresolved. README owns provider terms/billing. Shared Public Twitch registration is supplied in config/twitch-app.json; private development Twitch configuration remains invalid and unchanged.

## Unresolved work

- The October 19 recipient ZIP smoke test and all 45 offline tests passed within the limits in [verification](docs/verification.md). Its test service is stopped; `.generated/recipient-test-20261019` retains dummy settings because automatic approval review blocked cleanup. Browser automation dropped before the remaining screen walkthrough; no connected trial occurred.
- Choose a receiving broadcaster, provider access/models/allowance, one character/voice, reward settings and a bounded live trial budget. Discuss consequential choices separately; the [trial runbook](docs/streamer-trial.md) requires explicit authorization for connected actions.
- Validate real installation, authorization, redemption/audio, fulfillment/refunds and recovery on the receiving PC. Offline evidence does not establish provider quality, Twitch outcomes, OBS tracks or alert overlap.
- Normal updater dialogs and current narrow-screen/full visual review remain unverified.
- Browser catalog add/remove/rename is a recorded follow-up; dialogue retention/review policy is undecided.
