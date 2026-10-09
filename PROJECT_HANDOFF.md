# Project handoff

Updated: 2026-10-09. Read [AGENTS.md](AGENTS.md) first. [README](README.md) owns commands/configuration, [architecture](docs/architecture.md) owns code boundaries, [verification](docs/verification.md) owns evidence, and [streamer setup](docs/streamer-setup.md) describes the currently working Windows setup.

## Latest direction: one browser interface

The intended result is one local browser interface for operation and configuration, with management separate from Activity. This supersedes launcher-based management. The user selected sidebar navigation and dark mode, but dislikes the current theme/UI; detailed visual design will be handled separately later. Selection of the layout does not approve its current palette, detailed controls, or every section's contents.

### User-confirmed workflows

- A desktop shortcut quietly starts/reuses the local server and opens the browser: setup on first use, Activity on later launches. Guided setup reuses Settings/Connections controls and remains reopenable from Settings.
- Navigation uses Activity, Connections, and Settings. Activity is for briefly checking current/waiting work and playback intervention in a mostly unattended stream utility. Every visible element needs a purpose.
- Closing the audio-owner tab cancels active work and pauses the queue; the server stays running. Reopening requires Resume. Explicit shutdown belongs outside Activity; its exact placement is not decided.
- Local browser Settings may accept API keys for private backend storage. Never return saved keys to the page; show configured/not-configured metadata afterward. AGENTS.md reflects this approved entry flow.
- Settings changes let the current request finish with its original settings, then apply before the next request starts. Waiting work stays queued; preserve character selection, cancellation, bounded queues, and late-result rejection.
- Save validates and stores settings locally. Connection checks and response/voice tests are separate explicit actions. Saving never invokes providers or creates Twitch rewards. The existence of these controls does not authorize live trials or account actions.
- Compact rows show each question once; expansion reveals only its response. Waiting entries without a response need no dropdown. Past entries are read-only, with no replay or dedicated review workflow. Development controls, testing, and Quit do not belong on Activity.
- Viewers choose a personality through one shared Channel Points reward using `Name: question`. Each personality has an assigned voice. Missing/unknown names are rejected and refunded after Twitch confirms; no default character. Tyrone is the first example; adding profiles is supported.
- Functional pieces precede final model selection, quality evaluation, persona/prompt editing, voice selection, and fine-tuning. Easy model switching matters; generation and hosted speech remain independently replaceable.
- The initial connected functional trial uses a free OpenRouter model after discussing and verifying free access. No final model, paid account, funded balance, budget, spending, or paid fallback is authorized.

StreamElements Activity Feed is inspiration, not an approved design to copy. Conversation-style layouts were ruled out. Reference screenshot: `C:/Users/yby/.t3/userdata/attachments/652a6045-80b4-42b0-8ee4-fe55fe78a36c-7ccdbe75-29a2-4603-9ac9-2b61603f4651.png`.

### Proposed contents and unresolved choices

| Area | Proposed contents |
| --- | --- |
| Activity | Playback controls, current/waiting requests, read-only past dialogue |
| Connections | Twitch authorization/connection, explicit reward setup |
| Settings | Generation provider/model, independent speech provider, character/voice assignments, playback preferences |
| Guided setup | Reuse the same controls on first use and when reopened |

Exact routes, section contents, diagnostics placement, setup readiness criteria, missing-prerequisite/install handling, and shutdown placement remain open. The mockup's three-step setup, settings index, and Application subsection are proposals. No framework, major rewrite, tray app, service, native shell, or installer is approved.

Validated backend-owned reads/writes to existing `.local/` files, preserving environment precedence and recovery state, are proposed implementation details. Resolve validation, Save/apply presentation, and settings requiring relaunch before integration. Account authorization remains explicit and follows supported provider flows. Keep offline validation distinct from connected checks and inference/TTS trials.

## Current implementation

Repository: private [Joseph2xy/placeholder](https://github.com/Joseph2xy/placeholder), branch `master`. Naming is temporary. The repository includes the Codex repair, selected sidebar mockup, workflow decisions, and cleanup described below.

- The browser mockup at http://127.0.0.1:5174/designs.html uses the selected dark sidebar and synthetic Activity/Connections/Settings/setup controls. Run `npm run preview`. It has no app APIs, private-config access, persistence, provider/Twitch calls, or audio. Use placeholder keys only. Functional configuration application, startup readiness, character creation, and tab-close lifetime are not implemented by the mockup.
- The functional frontend is still the working app. `/testing` submits to its shared queue without owning audio. One control tab owns audio; closing/refreshing it cancels active work and pauses the queue. Quit or Ctrl+C stops the server. Browser-management integration is still pending.
- Replay was removed end to end: functional UI, HTTP endpoint, queue method, public flags, cache, and obsolete tests/instructions. Current audio is released at terminal outcomes. History remains bounded and read-only. The duplicate current question/response panel was removed; response expansion survives control updates.
- The existing hidden Windows launcher starts/reuses the app, opens the browser, and exits. The Windows setup wizard remains necessary until browser setup works. Audition scripts remain for the later quality stage, and fixed Twitch scripts remain for separately authorized account/reward setup.
- `.generated/` owns current builds and check output; `.local/` owns private configuration/recovery/logs. The mockup is excluded from production build inputs, production fingerprints, and transfer packages. Dependencies, runtime modules, tests, configuration examples, and character files have active purposes.
- Codex CLI **0.162.0** remains the exact guarded version and passed the offline dialogue-only boundary probe. No global installation/provider change or new live Codex trial occurred.

### Cleanup limit

Automatic approval review rejected disposable-folder batch removal, then narrower deletion of `.local/web` and the verification ZIP, stating only **"blocked by policy"**. No removal occurred. The obsolete `.local/web` build and scratch `.generated/releases/Tyrone-20261009-144956-c70f0669.zip` remain unresolved; do not describe them as needed recovery files or treat rejection as a permanent project rule. Credentials, account state, setup progress, and launcher logs were preserved. Current `.generated/web`, boundary-check output, and Vite caches serve active development/test workflows. No archive or second implementation was created.

## Temporary development settings and deferred work

Ignored `.local/generation.env` still selects `nvidia/nemotron-3.5-lightning:free` with a temporary 4,096-token ceiling and temporary user-supplied key. These are development settings, not final choices. Both authorized three-request generation-only trial budgets are exhausted. No accepted usable live OpenRouter dialogue exists; the user accepts that gap while focusing on functionality. Replace temporary OpenRouter/Fish keys before ongoing use and reverify access, allowance, and commercial terms before connected use. Never reproduce saved keys.

Live Twitch authorization/reward creation, live speech trials, OBS linking, destination-PC checks, and final provider/persona/voice evaluation require separate discussion. No real Twitch app/channel/reward is configured. No further trial/spending is authorized. Demo isolation from incomplete private Twitch settings and actionable queue error guidance remain recommendations awaiting discussion.

Avatars, vision, microphone input, autonomous commentary, local model hosting, subscriptions/donations remain outside current scope, open to later discussion. Naming remains deferred; `Stream characters`/`Stream controls` are descriptive labels.

Next: resolve remaining workflow details using the sidebar mockup, then integrate the authorized browser-management component. Replace/remove the functional frontend, wizard, and mockup only when their replacements work. Preserve dialogue-only generation, privacy, queue/refund/cancellation behavior, and audio ownership. Theme/UI refinement stays in its separate later pass.
