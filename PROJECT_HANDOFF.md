# Project handoff

Updated: 2026-10-09.

## Current status

The compact Activity feed is accepted as the starter UI, with its design direction in the [product and UX brief](docs/product-ux.md). Local operation includes a reopenable setup checklist, persistent settings/drafts, private credential storage, independent response/voice tests, bounded queues, playback intervention, restart/shutdown, and Windows prerequisite bootstrap. Playback behavior is preserved; the design remains revisable.

Normal/demo startup does not connect Twitch. Demo uses synthetic dialogue/audio. Generation supports OpenRouter and guarded Codex CLI; hosted speech uses Fish. Characters are file-based profiles with prompts and assigned voices. [README](README.md) owns usage, [architecture](docs/architecture.md) boundaries, and [verification](docs/verification.md) results and limits.

Browser code is grouped by management, testing, playback and shared assets; backend provider actions are separate from settings persistence. Activity uses React, Vite, Tailwind, selective shadcn components and Radix interactions, and TanStack Query core; Settings retains persistent HTML forms. No Next.js or TanStack Start app is implemented. Repository: private Joseph2xy/placeholder; naming is provisional. Development uses only `main`, locally and on GitHub.

## Agreed scope

- The [product and UX brief](docs/product-ux.md) owns the confirmed experience and starter design. Further UI/workflow refinement is authorized while preserving the streaming companion's identity and purpose. Question/reply presentation and waiting-message removal prominence are delegated to design judgment. Discuss consequential product, architecture, or behavior changes; routine design decisions need no repeated approval. Consult official library documentation during implementation.
- Characters need a name/identifier, prompt, and assigned voice. Production editing is file-based; browser personality editing is not an established requirement.
- Twitch uses one shared Channel Points reward with Name: question. Missing/unknown names are rejected and refunded after Twitch confirms; no default character. Viewer submissions are live-only, without an offline backlog. Local testing is independent.
- Twitch should remember the explicit connection choice: reconnect after Connect, remain disconnected after Disconnect. Reconnection must not create rewards or resume a paused queue. This and live-only intake are agreed but not integrated into the current entrypoint.
- Functional implementation/offline checks precede final model, quality, persona, voice, and fine-tuning evaluation. Functional tests do not select those choices.

## Open questions and authorization

Submission handling during a live playback pause and active/waiting work at stream end are unresolved. These policies do not block layout work; do not silently settle them through UI changes.

Connected testing is deferred. The intended OpenRouter functional trial uses verified free access, with model and request budget agreed separately. No additional trial, paid usage/fallback, installation/sign-in, Twitch account/reward action, or OBS setup is authorized. Continue local testing within the requested task.

Final provider/model/persona/voice choices and naming are open. Avatars, vision, microphone input, autonomous commentary, local model hosting, and subscriptions/donations are outside current scope. All choices remain revisable through discussion.

## Temporary state

Recorded private development configuration selects nvidia/nemotron-3.5-lightning:free with a 4,096-token ceiling and temporary keys. These are not final choices or authorization to use them. Both agreed three-request generation budgets are exhausted. Replace temporary OpenRouter/Fish keys and verify access/terms before separately agreed connected use. Never reproduce saved keys.
The review server is stopped; port 3224 has no listener. Automatic approval review blocks removal of disposable review artifacts with “blocked by policy”, including explicit nonrecursive deletion. Pending paths are `.generated/ui-review/`, `.generated/ux-review.ts`, `.generated/ux-review-settings/`, `.generated/prototype-ux-review.mp4`, and `web/management/prototype/review.mp4`. They remain ignored and are excluded from packaging. Private settings and account state are preserved.
