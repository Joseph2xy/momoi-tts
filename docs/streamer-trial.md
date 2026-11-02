# Controlled streamer trial

This is a proposed runbook, not authorization to connect accounts, change Twitch/OBS settings or use providers. [README](../README.md) owns setup and controls; [verification](verification.md) owns actual results.

## Before testing

Agree the receiving broadcaster first. Then settle one consequential choice at a time: provider accounts and exact models/allowance, one character's instructions and voice, reward title/price/cooldown, and finally the live window and maximum redemptions/provider requests or spend. Confirm authorization for the concrete actions before proceeding. Failed requests and speech previews count toward provider allowance too.

Check Channel Points access on the chosen channel. An existing Twitch login or app registration does not establish reward API access. If access requires creator onboarding, discuss that separately; do not complete it merely to validate the app.

Use the current self-contained ZIP on the receiving PC with its own private settings. Do not transfer development `.local/` files. Save configuration with replies off. Deliberate generation, speech and OBS tests require agreed allowance; confirm OBS monitoring and a short recording through one reused Browser source, checking duplicate Desktop Audio capture.

## Live checks

| Check | Required observation |
| --- | --- |
| Valid `Name: question` | One spoken reply, one Activity outcome, actual Twitch fulfillment and clear audio in the recording. |
| Invalid or unavailable character | No speech; Twitch confirms points returned. |
| Skip / replies off | Current/waiting work stops; no late audio; canceled redemptions are refunded. |
| Temporary source or Twitch gap | Unfinished work is discarded; fresh intake recovers only if replies remain enabled. Confirm pending settlement in Twitch after recovery. |
| Management closure / reopen | OBS operation continues; controls can be reopened using Launch without starting a second service. |
| Stream end / app restart | Replies turn off, unfinished work is canceled, no old work replays and reward availability follows readiness. |
| Other alerts and scene changes | No duplicate MomoiTTS audio; observe overlap with existing alerts and confirm the stream mix is usable. |

Stop on unexpected speech, duplicate audio, uncertain settlement or exhausted allowance. Turn replies off, keep the same account/client/reward for pending settlement, and confirm outcomes before changing configuration. A cancellation marked pending is not a confirmed refund.

Record the release hash, receiving Windows/OBS versions, selected models, elapsed reply time, observed outcomes and unresolved problems. Share only the evidence needed for review; private credentials, prompts and account caches stay on the receiving PC. An own-PC trial does not establish clean-recipient installation, and offline fixtures do not establish provider quality or real Twitch refunds.
