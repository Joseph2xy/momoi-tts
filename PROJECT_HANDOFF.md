# Project handoff

Updated: 2026-10-09.

## Current status

Local browser operation and configuration are implemented: reopenable setup checklist, settings/drafts, private credential storage, independent response/voice tests, bounded queues, playback intervention, restart/shutdown, and Windows prerequisite bootstrap. Production Activity uses a question-first React screen with stationary current/upcoming work and scrolling history. A full UX redesign is under review; production behavior is unchanged.

Normal/demo startup does not connect Twitch. Demo uses synthetic dialogue/audio. Generation supports OpenRouter and guarded Codex CLI; hosted speech uses Fish. Characters are file-based profiles with prompts and assigned voices. [README](README.md) owns usage, [architecture](docs/architecture.md) boundaries, and [verification](docs/verification.md) results and limits.

Browser code is grouped by management, testing, playback and shared assets; backend provider actions are separate from settings persistence. Repository: private Joseph2xy/placeholder; naming is provisional. Production integration is on `feat/message-screen`. Current comparison work is on `prototype/ux-directions`; [design notes](web/management/prototype/DESIGN.md) own the preview and its proposals. No new direction has been selected.

## Agreed scope

- A complete UI and workflow rework is authorized while preserving the streaming companion's identity and purpose. Existing screens, sections, layouts, and interaction patterns are not constraints. Compare multiple concrete directions before integrating the selected design; preview proposals do not establish settled production requirements.
- The app is a mostly unattended stream utility. Activity supports checking work and playback intervention; completed history is read-only. Configuration, diagnostics, tests, restart, and shutdown belong in management.
- Characters need a name/identifier, prompt, and assigned voice. Production editing is file-based; browser personality editing is a redesign proposal.
- Twitch uses one shared Channel Points reward with Name: question. Missing/unknown names are rejected and refunded after Twitch confirms; no default character. Viewer submissions are live-only, without an offline backlog. Local testing is independent.
- Twitch should remember the explicit connection choice: reconnect after Connect, remain disconnected after Disconnect. Reconnection must not create rewards or resume a paused queue. This and live-only intake are agreed but not integrated into the current entrypoint.
- Functional implementation/offline checks precede final model, quality, persona, voice, and fine-tuning evaluation. Functional tests do not select those choices.

## Open questions and authorization

Submission handling during a live playback pause and active/waiting work at stream end are unresolved.

Connected testing is deferred. The intended OpenRouter functional trial uses verified free access, with model and request budget agreed separately. No additional trial, paid usage/fallback, installation/sign-in, Twitch account/reward action, or OBS setup is authorized. Continue local testing within the requested task.

Final provider/model/persona/voice choices and naming are open. Avatars, vision, microphone input, autonomous commentary, local model hosting, and subscriptions/donations are outside current scope. All choices remain revisable through discussion.

## Temporary state

Recorded private development configuration selects nvidia/nemotron-3.5-lightning:free with a 4,096-token ceiling and temporary keys. These are not final choices or authorization to use them. Both agreed three-request generation budgets are exhausted. Replace temporary OpenRouter/Fish keys and verify access/terms before separately agreed connected use. Never reproduce saved keys.

The UX comparison runs on port 3224 with synthetic in-memory state and no backend, accounts, or audio. Leave it available for selection; stop its Vite process when review is finished. Ports 3222 and 3223 have no listener. Automatic approval review rejected cleanup of `.generated/ui-review/` and `web/management/prototype/review.mp4` with “blocked by policy”; those temporary files remain pending cleanup.
