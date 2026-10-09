# Project handoff

Updated: 2026-10-09.

## Current status

Local browser operation and configuration are implemented: reopenable setup checklist, settings/drafts, private credential storage, independent response/voice tests, bounded queues, playback intervention, restart/shutdown, and Windows prerequisite bootstrap. The interface currently has Activity, Connections, and Settings with a dark sidebar; this describes implementation, not a future visual design requirement.

Normal/demo startup does not connect Twitch. Demo uses synthetic dialogue/audio. Generation supports OpenRouter and guarded Codex CLI; hosted speech uses Fish. Characters are file-based profiles with prompts and assigned voices. [README](README.md) owns usage, [architecture](docs/architecture.md) boundaries, and [verification](docs/verification.md) results and limits.

Browser code is grouped by management, testing, playback and shared assets; backend provider actions are separate from settings persistence. Repository: private Joseph2xy/placeholder; naming is provisional. Activity layout review is on branch `prototype/activity-layouts`; production browser behavior is unchanged.

## Agreed scope

- The visual overhaul will use React/TypeScript/Vite, Tailwind, selective shadcn components, and TanStack Query. The dark theme and typography reference is [Tania Rascia's site](https://www.taniarascia.com/). The screen supports quick checks and intervention. Three synthetic layout prototypes (compact, dashboard, adaptive) await user selection; routing and the final layout remain open. Consult current official documentation during implementation.
- The app is a mostly unattended stream utility. Activity supports checking work and playback intervention; completed history is read-only. Configuration, diagnostics, tests, restart, and shutdown belong in management.
- Characters initially need a name/identifier, prompt, and assigned voice. File-based editing is sufficient; browser character creation is not required.
- Twitch uses one shared Channel Points reward with Name: question. Missing/unknown names are rejected and refunded after Twitch confirms; no default character. Viewer submissions are live-only, without an offline backlog. Local testing is independent.
- Twitch should remember the explicit connection choice: reconnect after Connect, remain disconnected after Disconnect. Reconnection must not create rewards or resume a paused queue. This and live-only intake are agreed but not integrated into the current entrypoint.
- Functional implementation/offline checks precede final model, quality, persona, voice, and fine-tuning evaluation. Functional tests do not select those choices.

## Open questions and authorization

Submission handling during a live playback pause and active/waiting work at stream end are unresolved.

Connected testing is deferred. The intended OpenRouter functional trial uses verified free access, with model and request budget agreed separately. No additional trial, paid usage/fallback, installation/sign-in, Twitch account/reward action, or OBS setup is authorized. Continue local testing within the requested task.

Final provider/model/persona/voice choices and naming are open. Avatars, vision, microphone input, autonomous commentary, local model hosting, and subscriptions/donations are outside current scope. All choices remain revisable through discussion.

## Temporary state

Recorded private development configuration selects nvidia/nemotron-3.5-lightning:free with a 4,096-token ceiling and temporary keys. These are not final choices or authorization to use them. Both agreed three-request generation budgets are exhausted. Replace temporary OpenRouter/Fish keys and verify access/terms before separately agreed connected use. Never reproduce saved keys.

The frontend-only layout review runs on port 3222 using `npm run prototype:ui`; it uses sample data and simulated controls, without backend or provider calls. Other review servers are stopped.
