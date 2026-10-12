# Project handoff

Updated: 2026-10-12.

## Product and agreed scope

MomoiTTS is a local Windows multi-character Channel Points question-to-speech app with audio-only OBS output, automatic replies when enabled and durable private Q/A logging. Generation and hosted speech remain independent. No new event types, microphone/vision, avatars, autonomous commentary, local models, per-reply approval or additional filtering are agreed.

Distribution is a prebuilt ZIP with Setup/Launch shortcuts and a user guide. Assisted Node/runtime dependency installation and terminal/device-code Twitch setup are acceptable. The user is not a streamer and will not configure accounts for development validation; use offline fixtures and the existing limited user-reported OBS evidence. Private configuration, credentials, logs and recovery state must be preserved.

## Current state

The architecture, runtime, providers/integrations, browser UI, dependencies, build/package flow and documentation have been reviewed. Failure-path fixes, backend preview cancellation, Radix style compatibility, polling optimization and unused UI/test-fixture cleanup are implemented. Generation is OpenRouter-only; the CLI adapter, prerequisite actions and unused dispatcher are removed. All 25 offline tests, build/typecheck, formatting and archive checks pass. [Audit](docs/audit.md) owns conclusions and product recommendations; [README](README.md) owns use/configuration, [architecture](docs/architecture.md) owns boundaries and [verification](docs/verification.md) owns checks and release evidence.

Replies start off. Turning off cancels current/waiting work; late results cannot play. Source loss leaves replies off. Twitch cancels unplayed work for refund and reconnects without replay. Setup/Settings have focused topic pages and independent generation, browser speech and queued OBS checks. Characters supports private prompt/voice editing; catalog add/remove/rename remains file-based.

Fish S2.1 Pro Free is the default only when no engine is saved or inherited. Recipient-selected OpenRouter models can be free or paid, with explicit model IDs and no fallback. Saving/startup makes no inference request. Local speech is saved as s2.1-pro-free; one previously authorized short request succeeded. Further trials, account actions, spending and OBS/Twitch changes are not authorized by this handoff.

The standalone app is the selected product direction, with development consolidated on `main` and no parallel product branches. Its public ZIP and evidence are recorded in verification. Guided Twitch setup is the next milestone under discussion; design the complete streamer setup and operation flow before implementation. The agreed viewer flow is one Channel Points reward for all characters, with required input such as `Tyrone: your question`. Viewers redeem inside Twitch without installing or signing into MomoiTTS; the streamer authorizes their channel.

## Unresolved decisions and validation

- Discuss moving Twitch authorization and explicit reward creation into the local interface, alongside provider/character setup and OBS verification. One MomoiTTS-owned public Twitch app registration and streamer-editable reward name/price are recommendations, not settled requirements. Registration ownership, reward controls and setup sequencing remain open. Current terminal/device-code helpers remain implemented; no new setup implementation or account actions are authorized by the discussion.
- The user chose to record character catalog add/remove/rename as a follow-up, not implement it during this audit. Other product gaps and proposed simplifications are in the audit.
- Validate install/configure/connect/redeem/hear/recover with a willing receiving streamer before describing the product as semi-ready. Real provider quality/latency, OBS routing and Twitch outcomes remain unestablished by offline tests.
- No final generation model, persona/voice evaluation or allowance guarantee is settled. The earlier paid Fish HTTP 402 and API balance remain unresolved. README owns the time-limited free offer and billing distinctions.
- Private Twitch client/channel settings remain invalid and preserved. Choose the actual broadcaster/client ID, reward title/cost, live window and redemption budget before authorized account actions.

Private .local state and the transfer folder's recovery state are retained. Old TYRONE_* application environment names are unsupported; retained development generation settings may need explicit reselection under MOMOI_TTS_* before use. Temporary credentials must be replaced before recipient distribution. Repository naming remains provisional (private Joseph2xy/placeholder).
