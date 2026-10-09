# Project handoff

Updated: 2026-10-09. Read [AGENTS.md](AGENTS.md) first. [README](README.md) owns commands/configuration, [architecture](docs/architecture.md) owns code boundaries, and [verification](docs/verification.md) owns test/provider evidence.

## Confirmed direction

- The main streamer screen contains playback, queue controls, and Twitch connection controls. The user confirmed moving manual questions off that screen into a separate testing page at `/testing`. Testing uses the shared queue but never owns audio; keep the main screen open in another tab. Closing/refreshing the audio owner cancels active work and pauses the queue; reopening requires Resume. The server stays running until Quit.
- Viewers choose a personality through one shared Channel Points reward using a name parameter. Each personality has an assigned voice. Missing/unrecognized names are rejected and refunded after Twitch confirms; there is no default character. Tyrone is the first example; adding more profiles is supported. App/reward naming is deferred.
- Functional pieces come before final models, output-quality evaluation, persona editing, voice selection, and fine-tuning. The user expects paid models later but has authorized no paid access, funded account, budget, purchase, or paid usage. Easy model switching matters; no final IDs or shortlist are selected.
- The user authorized the proposed organization pass. Characters now have a cohesive module/data home, scripts are grouped by purpose, the browser source is flat, and application assembly/lifetime is separated from HTTP serving. Disposable output uses `.generated/`; private settings/recovery keep their existing `.local/` paths. Prettier is development-only. No rewrite, new application framework, provider change, or feature removal was needed.

## Current state

One isolated activity-feed preview is retained at http://127.0.0.1:5174/designs.html (run command in README). It uses synthetic state, no real audio or provider/Twitch calls; the existing functional frontend remains in use. Superseded layouts, dead preview controls/hooks, redundant styles, and duplicate design notes have been removed. The Vite review server is left running.

### Frontend direction

- Confirmed usage: mostly unattended stream utility, briefly checked to inspect the queue or skip/pause.
- Confirmed layout direction: prominent Pause/Skip/Mute; current request pinned above waiting and recent activity; details expand on demand; secondary Twitch, volume, Testing, and Stop and clear controls. The StreamElements screenshots inspire the feel, not a copied screen.
- Theme direction accepted: violet charcoal with coral accents inspired by https://www.taniarascia.com/ (theme only). Primary questions, expanded content, and detail controls now use plain white; metadata stays muted. Character/status colours provide distinction.
- Pending: improve the bars and expandable/dropdown controls, complete visual review, then integrate the full frontend. Current dimensions and native controls are provisional, not approved final choices. Conversation-style layouts are ruled out.
- The user is willing to consider implementation changes for better UX. Discuss substantial changes before proceeding; this is not authorization for a rewrite or provider change.

Design rationale: one compact event feed supports brief checks during a stream; full replies stay secondary. Colour conveys status and character, with quiet surface depth. No dashboard metrics, sidebar, decorative player, or unneeded filters.

The organization pass preserves viewer input, profile/voice routing, bounded queues, cancellation, refunds, and playback. Tyrone remains the only configured character, using the existing development prompt/voice. The visible “Stream characters” heading is descriptive, not an agreed product name; launcher filenames, internal identifiers, and the provisional reward title retain Tyrone pending naming.

Build, formatting, and the ten non-Codex offline test files passed after relocation/runtime changes. Browser playback/rejection/replay/Quit, packaging contents, PowerShell syntax, setup prerequisite checks, and the moved Windows launcher passed; details and limits live in [verification](docs/verification.md). Both isolated review demos were stopped. The local demo that was already running on port 3210 was left running; its old `.local/web/` build is retained while it remains in use. New builds use `.generated/web/`.

Installed Codex CLI **0.162.0** remains rejected by the **0.160.1** guard. Do not relax the guard or replace the global installation just to obtain passing tests; discuss repair and recheck the tool boundary separately. OpenRouter has offline evidence but no usable live dialogue accepted yet. The user accepts that gap while focusing on app functionality.

## Temporary private development settings

Ignored `.local/generation.env` still selects `nvidia/nemotron-3.5-lightning:free` with a temporary 4,096-token ceiling and a temporary user-supplied key. These are development settings, not final choices. Both bounded generation-only trial budgets are exhausted; further trials/reasoning adjustments are deferred. Replace temporary OpenRouter/Fish keys before ongoing use as intended. Never reproduce them in docs or diagnostics. Connected provider conditions and commercial terms must be reverified before further use; historical evidence lives in verification.

## Open decisions and deferred work

- Demo can fail on incomplete private Twitch settings even for manual-only testing. Better isolation remains a recommendation awaiting discussion.
- Queue failures replace safe provider guidance with generic phase errors. Improving actionable errors remains a recommendation awaiting discussion.
- Broader setup workflow and the graphical wizard remain provisional. Terminal setup is acceptable, polish is low priority, and no installer is required.
- Live Twitch authorization/reward creation, live speech trials, OBS linking, destination-PC checks, and final model/persona/voice evaluation require separate discussion. No real Twitch application/channel/reward is configured. No additional connected trial or spending is authorized.
- Avatars, vision, microphone input, autonomous commentary, local model hosting, and subscriptions/donations remain outside current scope, open to later discussion.
