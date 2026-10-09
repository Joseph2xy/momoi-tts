# Verification record

Updated 2026-10-09. Local/mock evidence establishes the checked behavior, not production reliability, provider quality, or current allowance. Commands live in [README](../README.md); outstanding decisions/cleanup live in [handoff](../PROJECT_HANDOFF.md).

## Current checks

The retained activity-feed preview passed build/strict TypeScript and formatting after cleanup. Browser checks established white question/expanded/detail text, collapsed details, pinned activity, pause/skip preserving the feed, and no desktop or 390px iframe horizontal overflow. Earlier synthetic checks also exercised remove/history, clear, replay, mute, stop, manual input/literal viewer text, and preparing/blocked/empty/failed states. The Tania Rascia palette was inspected through the browser; the latest bars/control structure remains provisional.

Desktop screenshot capture worked for the initial activity-feed theme but failed on the subsequent colour revision. Resize timed out without changing the top-level viewport; narrow layout checks used a same-origin 390px iframe. This is synthetic frontend evidence, not real playback, backend cancellation, Twitch/provider integration, or final visual acceptance. Production frontend/inputs are unchanged; existing offline evidence below still applies.

The organization pass passed `npm run build`, `npm run test:offline` (ten test files), and `npm run format:check`. Strict server/browser TypeScript checks reject unused locals/parameters. Tests use synthetic dialogue/audio, dummy credentials, captured fetches, and loopback HTTP/WebSocket endpoints; no live allowance is consumed.

| Area | Checked behavior |
| --- | --- |
| Characters | Trusted catalog/path validation, unique names/IDs, missing/invalid private voices, case/spacing and question bounds, two distinct personality/voice routes through actual adapters, public-state privacy, original-character replay |
| Queue | One active/two waiting, per-viewer bounds, cooldowns, duplicate protection, expiry, phase deadlines, bounded history/cache, late generation/speech rejection, cancellation/failure recovery |
| Application/playback | Runtime disposal cancels delayed generation before speech; pause/hold/skip semantics, five-minute holds, single owner, stale release/events, progress, audio/ranges, replay/completion retries, page departure and explicit Resume |
| OpenRouter | Exact model/token settings, separate character/viewer messages, no tools/plugins/fallback and zero-price caps; only final content consumed; incomplete/tool-call/oversized/malformed replies discarded; abort/timeouts and redacted errors |
| Speech | Fish request/voice mapping, cancellation/timeouts, MP3 validation/size bounds, redacted errors |
| HTTP/frontend | Built index/assets, WAV playback acknowledgements, loopback/same-origin validation, private/generated/catalog/prompt paths excluded |
| Launcher | Configuration proof/privacy, mismatch refusal, cold child propagation, repeated-launch reuse without rewriting the new browser index |
| Twitch intake | Invalid/missing personality refunds, reward/channel filtering, deduplication, capacity, native moderation races, cancellation, durable retry/restart reconciliation without replay |
| Actual Twurple SDK | Broadcaster auth/refresh, idempotent required-text reward setup, add/update subscriptions, ambiguous settlement reconciliation, moderation, reconnect/revocation against mock endpoints |

`npm run check:tools` was attempted after formatting/relocation and stopped at the unchanged version guard: installed Codex 0.162.0, required 0.160.1. It created no fake-provider request or live request. The full `npm test` suite includes this same check and is not claimed to pass. Neither the guard nor the global installation was changed.

## Browser and operational paths

The subsequent screen separation passed build, all ten offline test files, and formatting. HTTP checks serve both `/` and `/testing` with their assets and assert the main screen excludes the manual form. In an isolated port-3213 demo, T3 preview loaded both pages in separate tabs; the testing page had no audio element and its form submission completed with WAV playback in the control tab. Preview snapshots and some focused interactions failed; submission was exercised with the real form through browser evaluation. Refreshing the testing tab preserved connected audio and an unpaused queue; unknown-name submission was rejected without adding a request. The isolated review demo was stopped. No live provider or Twitch calls were made.

After reorganization, T3 preview loaded the isolated demo on port 3211 from `.generated/web/`. Returning after page departure required Resume. A mixed-case Tyrone input containing HTML-like text rendered literally, generated simulated dialogue, and played the WAV to completion. Unknown-name input displayed its rejection and did not add a request. Cached replay completed with the original character label. Quit stopped the review server. Desktop document width showed no overflow. Snapshot capture failed twice; page inspection used T3 evaluation and focused click/type/wait tools. No fresh mobile/layout screenshot is claimed. Browser JS/CSS output hashes matched the pre-reorganization build.

All three moved PowerShell scripts passed syntax checks. The setup `Check` action resolved Node/dependencies from the new script location without account actions. The moved Windows launcher started a separate demo on port 3212 with explicit dummy/disconnected settings; health confirmed demo mode and Quit stopped it. The graphical wizard and private editors were not visually rerendered. An older demo already running on port 3210 was left running, so its old build remains necessary until it exits.

Packaging ran successfully. ZIP inspection confirmed the relocated catalog/prompts, three public templates, flat browser source, runtime/playback modules, and nested launch/setup/build scripts. Private files, generated output, dependencies, and superseded paths were excluded. The verification ZIP was removed after inspection. This pass did not repeat destination-PC or fresh-install testing; earlier same-PC extraction/install/demo checks predate the new layout.

## Connected provider evidence retained for later decisions

OpenRouter generation-only trials on 2026-10-08 used two separately authorized three-request budgets. Read-only key/catalog checks advertised free-tier allowance and zero-price endpoints. All three `google/gemma-4-26b-a4b-it:free` requests returned HTTP 429, with upstream throttling identified in redacted metadata. No dialogue or successful cancellation evidence resulted from that route.

On `nvidia/nemotron-3.5-lightning:free`, normal and hostile-input requests returned HTTP 200 but ended at `finish_reason: length`, at development ceilings of 1,024 then 4,096 tokens. They reported 1,039 and 3,597 reasoning tokens respectively and cost 0. Both incomplete responses were rejected before speech. A third request was client-aborted with a 100 ms timer and returned cancellation after about 111 ms. This establishes client cancellation, not remote cancellation/refunds. Immediate account metadata reported 49 free requests remaining and zero daily credit usage; counters may settle later. No usable live OpenRouter dialogue or full generation-to-speech run has been accepted. Both budgets are exhausted, and further trials/reasoning controls are deferred. References: [OpenRouter limits](https://openrouter.ai/docs/api_reference/limits), [NVIDIA route and trial/logging disclosures](https://openrouter.ai/nvidia/nemotron-3.5-lightning:free).

Earlier Codex CLI 0.160.1 captured `tools: []` against a fake provider. Separate live runs returned four replies within 60 words in approximately 6–10 seconds and reported no tool actions; a viewer file-access override received an in-character refusal. The fake-provider capture does not establish every live transport boundary. No new success is claimed for 0.162.0.

Earlier Fish `s2.1-pro-free` calls produced valid MP3s, including one complete Codex-to-speech-to-playback run of about 31.6 seconds. These are functional samples, not latency guarantees or quality judgments. Its recorded [free API announcement](https://fish.audio/blog/s2-1-pro-free-api/) named November 30, 2026 as the offer end; current access, allowance, and commercial terms require rechecking before streaming. Recordings were removed, and temporary keys need replacement before ongoing use.

Official Grok CLI 1.0.50 (`c58f321264ba`) failed the offline zero-tool probe: tested allowlists/removals and ACP controls still exposed tools including `run_terminal_command`. No malicious execution/live usage occurred and no adapter was added. This finding concerns the tested version; obsolete downloaded artifacts remain listed only in the handoff.

Later quality research can consult [Itzi role-play evaluations](https://itzi.app/benchmarks/roleplay), [EQBench creative writing](https://eqbench.com/creative_writing.html), and [SillyTavern OpenRouter guidance](https://docs.sillytavern.app/usage/api-connections/openrouter/). None is a verdict on this app's final persona, model, or voice.

## Remaining limits

Live Twitch authorization/eligibility, reward creation, moderation/refunds, and redemption-to-playback remain unverified. Twurple mock checks do not substitute for real Twitch. Its refresh/validation scheduling has no hour-long live-session evidence. A crash between playback completion and durable outcome recording can refund a just-played reply; recovery never automatically replays it.

Earlier single-page browser checks established held audio, secondary-tab silence, refresh cancellation with preserved waiting work, explicit Resume, and a one-shot injected autoplay-denial branch. These are browser/demo results, not natural-policy, OBS, or destination-PC evidence. OBS capture/routing/monitoring and source lifecycle remain deferred. Final model/persona/voice evaluation, production latency, settled billing, ongoing allowance, and commercial licensing are not established by these checks.
