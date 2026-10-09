# Set up the character app on Windows

Extract the entire ZIP into a writable folder before running a shortcut. Keep all files together. The package contains no private settings or accounts. App naming and final theme, model, persona, and voice refinement remain deferred.

## Start locally

1. Double-click **Try Tyrone Demo.cmd**. If Node.js 24.12 or newer or app dependencies are missing, the launcher offers an explicit download/install action. Node installation may need administrator approval; reopen the shortcut afterward. Dependency installation downloads pinned packages and builds the browser interface.
2. The browser opens a setup checklist on first use. You can leave setup incomplete and open Activity. Demo uses synthetic dialogue and a two-second tone, with no generation, speech, or Twitch usage.
3. Keep the main page open and enable audio if prompted. In **Settings → Application**, open the separate testing page. Click **Resume** in Activity and submit `Tyrone: How do I improve at ranked?` from the testing page. That page submits work without owning audio.
4. Check Pause/Resume, Skip current, and Stop and clear. Past entries are read-only. Closing or refreshing the audio-owning tab cancels active work and pauses the queue; reopen and click Resume. The server stays running until **Settings → Application → Shut down app** or Ctrl+C.

**Setup Tyrone.cmd** runs the same prerequisite bootstrap and opens the normal app. **Launch Tyrone.cmd** starts/reuses normal mode. Shut down before switching between normal and demo modes; a settings/mode mismatch does not stop an existing server automatically.

## Configure through Settings

Each section has its own **Save** and **Discard changes**. Unsaved drafts survive navigation within the tab. API keys and voice IDs are replacement fields: leaving them blank keeps existing values. Saved secrets are never returned to the page. Saving validates and writes local files; it does not contact providers.

- **Generation:** explicitly choose OpenRouter or Codex. OpenRouter requires a private key and an exact model ID; no final model is selected. Advanced settings expose the token ceiling. This development integration permits only zero-price routes without fallback. Discuss and verify current free access and allowance before connected tests.
- **Speech:** save the streamer's own Fish API key. Current speech uses `s2.1-pro-free`; verify access, allowance, and commercial terms before live use.
- **Character voices:** assign each file-based character a 32-character Fish voice ID. Character prompts/catalog entries remain editable files; browser character creation is outside this initial version.
- **Playback:** set the default volume for the next app launch. Activity has live volume/mute controls.
- **Application:** reopen the checklist, refresh file-based profiles, inspect redacted diagnostics, restart, or shut down. Restart warns when it will cancel current work and clear waiting work, and returns paused.

Provider/voice changes allow the current request to finish with its original settings and apply before the next request starts. Environment overrides take precedence over saved file values; the page explains when they remain active.

OpenRouter/Fish connection checks and response/voice tests are separate explicit actions. Codex uses its single local prerequisite check. The Testing page offers full question-to-playback, response-only and voice-only modes. Response tests generate dialogue only; voice tests send a fixed phrase through the playback queue. Normal-mode tests use configured provider allowance. Successful local configuration or authentication does not establish model/voice access, sufficient allowance, or quality. This guide is not authorization to run connected trials.

Codex preparation is separate from installing this app. With your helper, install official Codex CLI **0.162.0** and run `codex login` using the streamer's ChatGPT account before selecting Codex in Settings. The app does not install/update Codex or start sign-in; it only offers Check prerequisites. Other versions remain rejected until the dialogue-only boundary is checked. The check verifies executable/version, not sign-in or allowance. A ChatGPT subscription does not imply unlimited or API-billed access.

## Characters and daily use

`characters/catalog.json` supplies a unique `id`, selection `name`, `promptFile`, and `voiceIdEnv` for each character. Prompt paths are relative to that catalog, commonly under `characters/prompts/`. Add the prompt/catalog entry in files, then use **Refresh file-based profiles** and assign its voice. Final persona/voice evaluation can happen later.

The testing form uses `Name: question`; missing/unknown names and empty questions are rejected. Keep the main page open for playback. One tab owns audio, while other management tabs remain silent. Pause holds speech and the next request; Skip cancels one; Stop and clear cancels everything and stays paused. Browser changes do not require relaunch except where explicitly marked.

Private settings, credentials, recovery state, and launcher logs stay under `.local/`. Do not share that folder or account caches. Diagnostics redact provider failures; report symptoms to your helper.

## Later integration

Connections explains that Twitch is deferred in this local milestone. Normal startup does not load/connect Twitch. Existing `twitch:login` and `twitch:reward` scripts remain for separately agreed broadcaster authorization and explicit reward creation. Live-only intake, remembered connection choice, and stream-end behavior belong to that later integration; they are not delivered by local setup.

OBS linking and routing are also deferred. This setup does not change OBS or authorize provider trials, paid usage, Twitch account changes, or final model/voice selection.
