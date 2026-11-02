# Streamer app research

Reviewed: 2026-10-13. This is the reusable reference for Twitch connection, setup, OBS handoff, everyday controls and distribution. It records public documentation/source observations, not installed-app or signed-in account tests. Read it before repeating comparative research; refresh only the facts needed for a new decision.

[Handoff](../PROJECT_HANDOFF.md) owns agreed scope and blockers, [README](../README.md) owns current user behavior, [architecture](architecture.md) owns implementation boundaries, and [verification](verification.md) owns MomoiTTS test evidence. Recommendations here do not authorize features, account actions or paid usage.

## Findings by app

### Tangia

Its public onboarding describes account sign-in, connecting an overlay to broadcasting software, then viewer interactions. It supports streaming tools with browser sources and offers a viewer page and Twitch extension. This is useful evidence for a short account-to-output setup and keeping interactions within the streaming context. It does not establish the exact Channel Points reward creation, ownership or refund implementation. [Official overview](https://www.tangia.co/).

The optional Monitor Overlay is a separate Windows app: install it, copy an overlay URL, configure it through a tray action, and use window capture if viewers should see it. This is a specialized display workflow, not a requirement for ordinary browser-source audio. [Monitor Overlay](https://www.tangia.co/monitor-overlay).

The public knowledge base was readable in the collaborative browser despite failing web extraction. [Account signup](https://help.tangia.co/c372bd0775754bddab1a055d33cb1821) explains account authorization and points to the dashboard. [The overlay](https://help.tangia.co/159c6b4d0bbf44308d5f5c0a7cc95c2c) separates instructions by broadcasting software, supplies the source URL, and finishes with a test event and audio checks. Its scene shutdown/refresh and monitoring advice should not be copied directly into MomoiTTS's persistent audio-player workflow.

[Custom AI persona](https://help.tangia.co/77c10a26bd2a4913a4b49a1e8097167e) is a particularly close reference: first create a custom voice model, then use Ask AI in TTS Studio, answer guided persona questions and save. An interaction is created automatically. This ties voice, persona and viewer action into an outcome instead of presenting them as unrelated technical settings.

**Useful for MomoiTTS:** one character-centered setup task, software-specific output instructions and an explicit test. Our agreed entry point remains one Twitch reward with `Name: question`; automatic interaction creation, voice cloning, extensions and a hosted viewer page are separate choices. Exact current reward ownership/refund behavior remains unverified.

### TTSLabs

The public site describes Twitch sign-in, optional StreamElements/Streamlabs linking, selecting enabled voices/clips, and audience-triggered speech. It advertises ordered playback, queue intervention controls and a shareable guide to enabled choices. These are product claims, not measured latency or reliability evidence. [Official site](https://ttslabs.ai/).

**Useful for MomoiTTS:** configure only choices intended to be live, present audience instructions clearly, and make queue intervention accessible. Our character availability and Skip/Clear controls fit that pattern. Replay, clips, filters, additional alert types and a hosted audience page are separate product decisions; the reference does not authorize them. The public page does not establish authorization scopes, reward ownership, refund semantics, exact OBS setup or closing behavior.

### TTS Monster

The [official app](https://tts.monster/) returned only a JavaScript-required shell through web extraction. Public browser inspection exposed its named voice catalog, integrations and FAQ, with Get Started leading to a dashboard and a separate developer API console. It presents a managed voice service rather than a general generation-and-speech configuration surface. Current dashboard setup, OBS handoff, Channel Points binding and queue controls were not independently established from a signed-out setup guide.

**Research status:** retain it as a relevant comparison, but do not treat remembered instructions, search snippets, third-party tutorials or old reward-name matching workflows as current requirements. A focused inspection of its public interface or official guide is worthwhile if a future decision specifically depends on its behavior. Signed-in actions require agreed authorization. No claim that it is missing a feature follows from this access limitation.

### StreamElements

Its overlay workflow separates dashboard configuration from broadcast rendering. The quick-start guide explains reusing an alert source across scenes and removing duplicate alert instances to avoid duplicate audio. [Quick-start guide](https://support.streamelements.com/hc/en-us/articles/10474662182162-Quick-Start-Guide).

Its [Twitch alert guide](https://support.streamelements.com/hc/en-us/articles/16789217829778-Setting-Up-Twitch-Alerts-with-StreamElements-Overlays) locates TTS inside the relevant alert editor: enable it and select a voice from a dropdown. The user edits the result they want, with deeper customization available afterward. This is a useful contrast with asking a new MomoiTTS recipient for a raw voice ID in a separate provider test dialog.

Its sound-command guide puts reward description, cost and cooldown together, then connects the playback widget and performs a test. That guide uses **StreamElements Loyalty points**, not Twitch Channel Points; it is a setup pattern, not evidence about Twitch refund permissions. [Sound-command setup](https://support.streamelements.com/hc/en-us/articles/10474425062546-How-to-Set-Up-Loyalty-Sound-Commands).

**Useful for MomoiTTS:** keep configuration, output connection and a deliberate audible test understandable as separate steps. Reuse one output source and verify duplicate capture. Donation/subscription TTS is a reference for everyday alert operation, not authorization to add those event types. [Twitch alert setup](https://support.streamelements.com/hc/en-us/articles/16789217829778-Setting-Up-Twitch-Alerts-with-StreamElements-Overlays).

### Sound Alerts

Its browser-source guide has a concrete handoff: copy the dashboard URL, create an OBS Browser source, enable OBS audio control, then play a dashboard test. It recommends Paste (Reference) when using that source in other scenes. Troubleshooting distinguishes source connectivity from muted/misrouted audio. [Browser-source guide](https://support.soundalerts.com/article/browser-source).

The [getting-started guide](https://support.soundalerts.com/article/getting-started-with-sound-alerts) establishes a deliberate order: Twitch-linked account, guided browser-source setup, return to the dashboard and play a test, then create alerts. The extension is optional. Audible output is a checkpoint before alert authoring. Its [TTS guide](https://support.soundalerts.com/article/text-to-speech-tts) starts after initial setup and keeps the alert's title, price and voice/language selection beside the alert being configured. Neither guide requires a real viewer event to establish output.

**Useful for MomoiTTS:** copyable output URL, concrete OBS instructions, an explicit output test, and connection/audio checks that identify the failing step. Dashboard controls and OBS playback are separate surfaces. The guide does not explicitly establish dashboard-tab closure behavior or recovery/refund guarantees.

### Streamer.bot, Speaker.bot and Mix It Up

Streamer.bot documents downloading/extracting a portable ZIP and launching its executable. Mix It Up documents both an installer and a ZIP, a first-launch wizard, account connection and updates. These show that portable distribution and guided setup are established streamer workflows. [Streamer.bot installation](https://docs.streamer.bot/get-started/installation), [Mix It Up getting started](https://mixitup.bot/docs/getting-started).

Mix It Up's first-launch wizard handles streaming login, optional bot login, import and default commands. Its [TTS action guide](https://mixitup.bot/docs/actions/text-to-speech-action) exposes service-specific voice choices and describes the difference between provided limited usage and bringing private provider credentials. Streamer.bot's [initial setup](https://docs.streamer.bot/get-started/setup) separates platform connection, broadcasting software and creating the first action. These local tools support guided tasks without requiring a hosted rewrite. Their optional automation and bot-account steps are unnecessary for our current scope.

Mix It Up's published window code contains a close handler and shutdown sequence; it is source evidence, not an installed-version test. [Close implementation](https://github.com/MixItUpBot/Desktop/blob/release/public/MixItUp.WPF/MainWindow.xaml.cs).

Earlier research recorded optional tray/close behavior in the [Streamer.bot 1.0.0 changelog](https://streamer.bot/changelogs/v1.0.0) and [Speaker.bot changelog](https://streamer.bot/changelogs/speaker.bot). The current extracted pages did not reproduce those entries, so refresh the specific version before relying on exact settings/defaults. No universal close-button convention was established.

**Useful for MomoiTTS:** one obvious launch/reopen action and one obvious Exit action. The user cares about effort and conflicts, not whether the app runs in the background. These references do not justify a desktop rewrite, tray feature, bot account or generic automation framework.

## Twitch constraints that references cannot settle

Registration ownership and broadcaster authorization are separate. Twitch requires an account with verified email and 2FA to register an app; it does not require a new dedicated account or matching mailbox. TTSLabs documents streamers signing in with their own Twitch accounts, but its public guide does not establish which maintainer account owns its registration. [Register an app](https://dev.twitch.tv/docs/authentication/register-app/), [TTSLabs](https://ttslabs.ai/).

Twitch's current creator guidance offers Channel Points to monetized streamers after creator onboarding, and its May 2026 announcement expands access beyond Affiliates/Partners. The API reference still lists non-Affiliate/Partner status among custom-reward rejection reasons. Check the actual broadcaster's reward API access before a trial rather than inferring it from a login, app registration or channel status alone. This review did not verify non-Affiliate API access. [Channel Points FAQ](https://help.twitch.tv/s/article/channel-points-faq), [Monetization for All](https://blog.twitch.tv/en/2026/05/13/monetization-for-all), [Create reward API](https://dev.twitch.tv/docs/api/reference/#create-custom-rewards).

Twitch restricts reward updates and redemption-status updates to the app that created the reward. Receiving events or seeing a reward does not establish permission to refund it. For MomoiTTS's automatic settlement, create an app-owned reward explicitly and retain its ID across title edits. Changing the app registration is therefore consequential to existing reward ownership. [Update reward](https://dev.twitch.tv/docs/api/reference/#update-custom-reward), [Update redemption status](https://dev.twitch.tv/docs/api/reference/#update-redemption-status).

Twitch documents a device-code flow for Public clients and recommends Public clients for open platforms such as Windows. This supports local authorization without distributing a client secret. Public device-flow refresh tokens rotate and can expire after inactivity, so reauthorization must be recoverable. This comes from Twitch documentation, not proof that the reference apps use the same mechanism. [Device-code authorization](https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow).

## Implications for MomoiTTS

| Pattern supported by the guides | MomoiTTS implication |
| --- | --- |
| Setup ends at a tested result, not a list of saved fields. | Guide to one working character reply and confirmed OBS output. Configured, connected, playback completed and user-confirmed audibility are different facts. |
| External handoffs return to a clear checkpoint. | Keep the active setup step while Twitch approval runs; show the confirmed channel on return. Twitch controls its own activation wording. |
| Voice and alert choices sit beside the thing being created. | Bring character prompt/voice and the shared reward into the setup journey; avoid detours through general settings. |
| Test events establish output before audience usage. | Setup output testing should work with live viewer intake off. Keep actual recording/audibility confirmation explicit. |
| Managed voice apps present a catalog instead of provider plumbing. | Their simpler account setup cannot be reproduced by wording alone. Removing our API-key/model choices would require an agreed managed service, billing/access and provider design. |

These are recommendations inferred from the guides, not proof that all apps share one onboarding convention. Sound Alerts supplies the strongest detailed setup sequence; Tangia supplies the closest documented question-to-persona workflow. TTSLabs' public three-step pitch omits exact OBS setup, and TTS Monster's signed-in journey remains unverified. [Audit](audit.md) owns current conclusions; [architecture](architecture.md) owns the adopted journey. Provider/default changes remain separate decisions.

The research did not establish other apps' stale-request recovery, automatic reward pausing, queue capacity policy, crash settlement or guarantees against overlapping independent alerts. MomoiTTS's corresponding choices are product requirements verified through our own fixtures and eventual streamer trials, not copied industry guarantees.

Refresh specific linked sources when a decision depends on current UI, scopes, limits, pricing or terms. Signed-in journeys and refund/recovery guarantees remain unverified unless explicitly recorded above. No account actions, installations, provider usage or OBS changes were performed for this research.
