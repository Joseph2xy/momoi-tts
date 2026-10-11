# Product and UX brief

MomoiTTS is a mostly unattended local streaming utility. A viewer submits a named character's Channel Points question; the app generates dialogue, plays the assigned voice through OBS with no visible stream content, and records the question/reply privately. Management supplies setup, review and app-specific intervention.

## Interface requirements

- Use a modern, simple React interface. Keep each settings topic on its own page and remove implementation details that do not help the user make a decision.
- Use OpenRouter generation. Enter the API key first, then choose the exact generation model. Saving configuration is explicit; unsupported retained provider selections cannot silently choose API inference.
- Put Fish Audio API credentials first. Use S2.1 Pro Free by default, with supported engines shown alongside the other configuration fields. Distinguish free developer access from paid API credit and website allowance. Existing explicit engine selections remain intact; inference stays an explicit action.
- Give Characters its own navigation item, list and detail editor. Each character has a display name, trusted instructions and assigned voice. The owner can author characters privately in management; viewers cannot alter these settings.
- Recommend OBS for stream-mix volume. Remove the separate playback-volume settings form; retain the existing app volume capability and saved launch default.
- Put restart and shutdown in the application menu. Keep diagnostic details in a separate dialog.
- Preserve drafts when navigating between settings topics. Saving credentials or character changes must not contact providers.
- Centralize tests in Settings. Generation needs a message and an optional character prompt; return text within its dialog. Speech needs only a voice ID and phrase; play the preview in the same browser. Keep character editing free of test controls. Serialize deliberate provider checks/previews and cancel pending previews after successful provider/character saves, including saves from another tab.
- Keep the existing plain Back button at the top-left inside detail screens, outside the centered content column. Open tests in bounded dialogs with a persistent title/close control and a scrolling body. Closing provider previews cancels them; queued OBS tests retain their identity. Use green success checks, amber warnings and red errors with readable text; keep feedback visible near its action instead of transient-only notifications.
- Settings and setup open a configuration-aware overview with focused Generation, Speech, OBS output and Twitch destinations. Show saved configuration first; open editing explicitly. Keep manual model-ID selection and current character-management capabilities.
- Show key status, replacement and confirmed removal without returning saved secrets. Preserve provider/model settings when removing a key. Explain inherited overrides.
- Keep OBS routing verification on OBS output, using a fixed phrase through the connected audio source. Distinguish saved settings, authenticated credentials, generated output and user-confirmed audibility; explain disabled actions and show safe errors beside the test.
- Generation and browser speech tests require no OBS, queue or complete character setup. Assigned character voices are optional conveniences alongside direct voice-ID entry. Remember test outcomes for the current visit and invalidate them when configuration changes.

## Activity and playback

Keep routine controls brief and predictable. Clearly distinguish active, waiting and completed requests, with history scrolling separately. Keep Skip and Replies on/off easy to reach; batch queue actions and waiting-message removal belong in secondary positions. Replies off cancels current and waiting work; turn-on accepts fresh requests without resuming old speech. Launch and output connection loss leave replies off. Twitch rejects requests while replies are off and cancels unfinished redemptions on stream end for refund, with no policy selectors or private overrides.

Show viewer, character, question preview and state. Deliberate read-only inspection exposes the complete question and reply with equal treatment. History has no replay or queue actions. Errors should appear where they affect the user; diagnostic details remain separate.

Use charcoal surfaces, white/gray text, coral accents and local Outfit typography. Compose shadcn components and Tailwind layouts; shared CSS owns theme tokens and base rules. The responsive sidebar has expanded labels, a centered icon rail and a dismissible mobile drawer. Each screen has one page heading. Settings uses a compact status list and focused topic pages: saved configuration, explicit editing, access checks and independent output tests. Characters is accessed from the sidebar without a duplicate Settings destination and keeps profile cards and a private editor. Activity combines the current conversation, waiting queue and controls, with compact history below. Bound previews; deliberate inspection exposes full text. Narrow screens wrap controls and stack content without horizontal scrolling. Show unsaved drafts in words, including edits on another topic. Empty states and failures give a relevant next action. Preserve cancellation, timeouts, single-player ownership and refund boundaries.

## Scope and authority

Cooldowns, queue bounds, expiry and technical timeouts remain internal safeguards, without new operational settings. The global cooldown remains a burst-admission protection separate from sequential provider processing.

Per-reply approval and additional filtering remain deferred. Browser-driven Twitch authorization/reward creation is outside the current interface change; assisted terminal setup remains acceptable.

[README](../README.md) owns implemented interactions and setup. [Architecture](architecture.md) owns technical boundaries, [verification](verification.md) owns evidence, and [handoff](../PROJECT_HANDOFF.md) owns current status and unresolved choices.
