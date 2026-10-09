# Project instructions

Read `PROJECT_HANDOFF.md` before making project decisions. Use `README.md` for commands, `docs/architecture.md` for code boundaries, and `docs/verification.md` for test evidence.

## Collaboration

- Keep the user in the loop through discussion. Ask about unclear intent and consequential product, architecture, workflow, provider, account, cost, or default choices before treating them as agreed. Do not infer approval from research, silence, or existing code.
- Separate user-confirmed requirements, recommendations awaiting discussion, temporary development settings, and observed behavior in plans and handoffs. Never promote a recommendation into a requirement or a confirmed choice.
- Build the functional pieces first. Leave final model selection, output-quality evaluation, prompt/persona editing, voice selection, and fine-tuning until the end. Functional/offline tests still belong during implementation; they do not choose the final model or voice.
- The intended initial connected functional trial uses a free model through OpenRouter. No specific model, paid account, API balance, or spending authorization is assumed. Discuss the trial and verify its free-access conditions before using it; never silently fall back to paid inference.
- Be candid when the user's approach appears mistaken or a better option exists: explain the evidence and tradeoffs and invite discussion. Do not merely agree or work around an underlying problem.
- Existing code and architecture are revisable, including a complete rewrite if justified. Discuss substantial alternatives instead of treating current implementation as a constraint or applying a workaround solely to preserve it. A rewrite is not automatically authorized by this openness.
- Work on the component the user requests; do not treat the handoff as authorization to build everything.
- Prioritize the desired result over provisional implementation choices. Change routes when evidence supports a better fit.
- Look for suitable existing tools before implementing a component. Keep explanations and integration tests proportionate to this small app.
- Use established concepts, interaction patterns, and workflows as a starting point; take inspiration from similar apps rather than rethinking familiar problems from scratch. This is not a preference for libraries or existing software; use those when they fit. Do not infer additional workflow decisions or authorization from this principle.
- For routine live-operation workflows, use TTS donation/subscription-alert tools as the main reference, checking documented behavior where needed. This does not authorize adding those event types or adopting every reference-app behavior.
- Distinguish requirements, provisional choices, documented capabilities, and hands-on results.
- Update the handoff when material decisions or status change; avoid duplicating implementation history across documents.

## Cleanup

- Keep cleanup proportionate to the milestone. For small visual edits, remove superseded code/styles and temporary artifacts and check directly affected documentation/configuration. Reserve a repository-wide audit for substantial feature or architecture milestones. A blocked cleanup action does not prevent completing unrelated authorized work; record the unresolved item once in the handoff and continue.
- Every retained item needs a current purpose: required behavior, an active development/test workflow, necessary recovery or private configuration, or concise evidence needed for future decisions. Remove dead code, abandoned experiments, superseded paths, stale artifacts, and obsolete instructions.
- Consolidate overlapping documents and delete documents that no longer need to exist. Keep one authoritative home for each topic; update references, commands, packaging, and test evidence after cleanup. Do not preserve the existing file layout merely because it exists.
- Discuss unclear feature removals and consequential changes with the user. Cleanup authorization covers clearly obsolete or redundant material, not silently redefining agreed behavior. Preserve credentials and recovery state; never expose private content while auditing.
- Verify affected behavior with proportionate checks and report what was removed, what remains and why, and any unresolved cleanup decisions. Do not create an archive or a second implementation merely to avoid deleting obsolete material.
- Routine cleanup of clearly identified project-generated temporary files is authorized without repeated confirmation. Preserve credentials, account caches, and recovery state. Project instructions do not control the runtime's approval reviewer; record an automatic rejection accurately rather than treating it as a new permanent project requirement.

## Implementation

- Keep generation and hosted TTS independently replaceable. Implement providers within the discussed scope; local model hosting is currently outside scope, not an immutable architectural constraint.
- Treat viewer input as untrusted data, separate from character instructions.
- Enforce dialogue-only generation without tools, shell, files, browser automation, or computer control. Prompt instructions alone do not restrict access. Recheck the boundary after integration or CLI changes.
- Keep credentials out of source control, logs, chat, and returned browser state. User-approved local browser Settings may accept API-key entry for private backend storage; never return saved keys to the page, and show only configured/not-configured status afterward. Use private configuration and redact provider errors.
- Preserve bounded queues, cooldowns, duplicate-event protection, sequential playback, cancellation, and timeouts. Skipped or stopped work must never play through a late result.
- Do not infer API billing access or unlimited allowance from a consumer subscription. Supported subscription-backed CLI access is acceptable.
- Verify provider capabilities, allowance, prices, and terms before committing or spending money. Do not purchase access, consume paid usage, install models, or change OBS/Twitch configuration merely to prepare a plan.
- OBS linking is explicitly deferred. Continue local browser testing until the user requests OBS setup.
