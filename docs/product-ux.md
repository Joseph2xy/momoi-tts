# Product and UX brief

## Purpose and use

The app is a mostly unattended streaming utility. A viewer addresses a named character; the app generates dialogue and plays it in that character's voice. The streamer opens the control screen briefly to skip a message, check what is waiting, or review recent activity. Continuous attention is not the intended workflow.

The interaction model should resemble a TTS/stream-alert activity feed: predictable controls and compact, readable message entries. StreamElements is a workflow reference, not a feature specification or a layout to reproduce. Its supplied screenshot illustrates the level of simplicity wanted. Donations, subscriptions, advertisements, analytics, and other reference-app features are not authorized additions.

Existing screens, navigation, features, and implementation are revisable. A redesign may change functionality where justified, but consequential changes require discussion. Simplifying what is visible does not automatically justify removing useful behavior.

## Confirmed design constraints

- Optimize for brief checks and fast intervention rather than a dashboard, conversation workspace, or large reading stage. Avoid KPIs, decorative panels, repetitive status summaries, and unnecessary navigation.
- Make active, waiting, and completed work easy to distinguish. Readability and clear hierarchy take priority over visual flourish.
- Keep routine playback controls accessible. Configuration, testing, diagnostics, restart, and shutdown should not dominate the routine screen.
- Keep the page stationary and history scrollable; avoid simultaneous page and message-list scrolling.
- Use the charcoal background, white/gray text, peach accent, and typography feel of [Tania Rascia's website](https://www.taniarascia.com/) as visual inspiration, without copying its page structure.
- Neither the question nor the character's reply is inherently more important to the user. Their presentation is delegated to design judgment.
- The user has delegated the prominence of individual waiting-message removal to design judgment informed by comparable alert workflows.

## Starter design

The compact feed is accepted as the starter, with the design principles below. [README](../README.md#characters-and-playback) owns its current interactions. The design remains revisable:

- Use a modest fixed toolbar and a compact message-list layout. Present active and waiting work above scrolling history using a consistent row language and unmistakable state labels, rather than competing large cards.
- Show viewer, character, a question preview, and relevant state in each entry. Make the complete question and generated reply available through deliberate inspection. The current pass uses a read-only dialog with equal text treatment for question and reply; this keeps long messages from expanding the routine list.
- Keep Skip and Pause/Resume prominent, and mute easy to reach. Give volume adjustment less space. Preserve the existing meanings of these actions unless a behavior change is discussed.
- Keep individual waiting-message removal available as a secondary row action. Keep batch clearing and stop-and-clear accessible but less prominent. This preserves useful intervention without turning queue management into the main task.
- Make ordinary successful actions evident through the list changing. Surface errors where they affect work, with diagnostic detail available separately.
- Put configuration and optional testing behind a small management entrypoint. Avoid imposing a preparation or Soundcheck workflow. Browser personality editing needs a separate product justification.
- Remove empty navigation destinations, duplicate entrypoints, character-loaded decoration, and repetitive readiness/explanatory surfaces from the routine screen.

The [StreamElements Activity Feed documentation](https://support.streamelements.com/hc/en-us/articles/10474542090770-Activity-Feed-Overview) documents mute and skip controls as live alert-management actions. The compact presentation and secondary waiting-message removal are design choices for this app, not claims about StreamElements' exact queue behavior.

## Review boundary

The operating model above governs further refinement. Discuss consequential feature or behavior changes before implementing them; routine design choices can use the delegated judgment recorded above. Evaluate revisions by whether the streamer can quickly identify current work, find what is next, intervene, and leave the screen. Consult official documentation for the libraries used during implementation.

Queue bounds, sequential playback, cancellation, timeouts, and protection against late skipped results remain required. History remains read-only. Intake during pause and work remaining at stream end are unresolved product policies; the visual brief does not settle them.

[Current scope and authorization](../PROJECT_HANDOFF.md) · [Implemented behavior and commands](../README.md) · [Architecture](architecture.md) · [Verification](verification.md)
