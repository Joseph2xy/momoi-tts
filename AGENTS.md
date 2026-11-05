# Project instructions

Read [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for current status and agreed scope. Use [User guide](USER_GUIDE.md) for usage/configuration, [README](README.md#source-development) for development commands, [architecture](docs/architecture.md) for current boundaries, and [verification](docs/verification.md) for evidence. These documents do not authorize unrelated work.

## Collaboration and judgment

- Help the user make informed decisions. Explain relevant options in accessible language, research uncertain or changing claims, recommend an approach, and explain meaningful tradeoffs. Evaluate the user's suggestions rather than assuming they know the best implementation.
- Discuss unclear intent and consequential product, architecture, workflow, provider, account, cost, or default choices before adopting them. Ask focused questions that help the user learn and express their goals. Do not infer agreement from silence, research, recommendations, or existing code. Carry out routine implementation within agreed scope without repeatedly requesting approval.
- Be candid when an approach appears mistaken or a better option exists. Explain the evidence and invite discussion rather than merely accommodating the problem.
- Every part of the project is revisable: requirements, workflows, providers, dependencies, architecture, and implementation. Existing choices and effort already spent are not reasons to keep an inferior solution. Recommend replacement or a complete restart when justified; discuss consequential changes before implementing them.
- Before fixing a problem, step back: should it exist, what creates it, and would changing the underlying approach serve the goal better? Compare a local fix with meaningful alternatives. Avoid patches whose main purpose is preserving the implementation. Scale investigation to the problem.
- Look for suitable existing tools and established approaches before building a component. Assess them against the user's needs; references do not settle requirements or authorize additional features.
- For routine live-operation workflows, use documented TTS donation/subscription-alert behavior as a reference. This does not authorize adding those event types or adopting every reference-app behavior.
- Work on the requested component. Keep the user informed about findings, assumptions, and decisions. Separate confirmed requirements, recommendations, temporary settings, and observed behavior.

## Documentation

- Record the current settled state directly. Include concise reasons when useful for understanding or reevaluating a decision. Omit discussion chronology, rejected options, and descriptions of what was replaced.
- Replace obsolete information in its authoritative home. Keep prior-state information only when necessary for an active migration, compatibility issue, recovery, or relevant test limitation.
- Give each topic one authoritative home and link rather than duplicating detail. Consolidate, remove, or add documents according to purpose; the file structure is revisable.
- Keep the handoff concise: current status, agreed scope not represented by implemented behavior, provisional settings, unresolved questions, and blockers. Do not turn it into a transcript, changelog, or self-assigned roadmap.
- Update affected documents when material state changes. Do not claim new verification from old evidence or describe planned behavior as implemented.

## Cleanup

- Be thorough and aggressive within the task's scope. Inspect files, folders, functions, code paths, dependencies, configuration, tests, generated artifacts, and documentation for unnecessary, obsolete, redundant, or abandoned material. Every retained item needs a concrete current purpose.
- Remove superseded material and update references, commands, packaging, and test evidence. Do not preserve archives, second implementations, or unused fallbacks merely to avoid deletion. Reconsider the structure when consolidation is better.
- Finish cleanup as part of the work. Check directly affected areas for small changes; audit the broader repository for substantial milestones or explicit cleanup tasks. Report meaningful removals and unresolved items.
- Discuss removals that could change agreed behavior or whose purpose is unclear. Preserve credentials, account caches, recovery state, and necessary private configuration. Never expose their contents while auditing.
- Routine deletion of clearly identified project-generated temporary files is authorized. If runtime approval review blocks an action, record the actual rejection once and continue unrelated authorized work; do not invent a permanent project restriction.

## Implementation safeguards

- Keep generation and hosted speech independently replaceable. Treat viewer input as untrusted data, separate from trusted character instructions.
- Enforce dialogue-only generation without tools, shell, files, browser automation, or computer control. Prompt instructions alone are insufficient. Recheck the enforced boundary after integration or CLI changes.
- Keep credentials out of source control, logs, chat, and returned browser state. Local Settings may accept keys for private backend storage; saved secrets must never return to the page. Show configured status and redact provider errors.
- Preserve bounded queues, cooldowns, deduplication, sequential playback, cancellation, and timeouts. Skipped or stopped work must never play through a late result.
- Verify provider capabilities, allowance, prices, and terms before committing to access or spending. Consumer subscriptions do not imply API billing access or unlimited allowance. Supported subscription-backed CLI access is acceptable.
- Do not purchase access, consume paid usage, install models, or change OBS/Twitch configuration merely to prepare a plan. Connected trials and account actions require agreed authorization; never silently fall back to paid inference.
