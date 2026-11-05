# Current-state audit

Reviewed 2026-10-13. This document owns review conclusions and unresolved product choices. [Architecture](architecture.md) owns implemented boundaries; [verification](verification.md) owns evidence.

## Product and architecture

The agreed goal remains a mostly unattended Channel Points question-to-character-speech utility. One local process gives intake, cancellation, sequential playback and settlement a clear owner. Independent generation and speech adapters, explicit configuration saves and separate generation/speech/OBS checks make failures diagnosable. Existing offline evidence does not justify a service split, desktop rewrite, generic plugin system or provider replacement.

The standalone app controls its own audio queue. OBS owns routing and the mix; independent alerts can overlap. Public reference apps support the setup/output/control patterns, but do not establish refund or recovery guarantees. [Streamer app research](streamer-app-research.md) owns those findings and their limits.

## Review conclusions

- Runtime boundaries remain appropriate for the agreed utility: fixed HTTP operations, private credential storage, trusted character instructions, dialogue-only generation and independently replaceable speech. No service split, generic plugin system or provider replacement is justified by offline evidence.
- Setup and Settings share configuration forms and bounded provider actions. Test evidence follows relevant settings, not reward/playback edits. OBS completion must belong to the current run; retries, disconnects, page departure and settings changes cannot restore stale confirmation.
- Explicit setup audio shares the existing player/queue while viewer intake stays off. It has its own admission path, leaves viewer cooldown accounting intact and cancels on relevant edits or departure. Viewer capacity, cancellation, deduplication and refund behavior remain independently enforced.
- Public distribution contains no private state or development tooling. Source dependencies and retained UI primitives have current consumers; unused local variants and superseded preview binaries are removed. Private settings, account caches and recovery files remain.

## Remaining choices and limits

| Topic | Current assessment |
| --- | --- |
| Character catalog authoring | Browser add/remove/rename remains an agreed recorded follow-up. Current prompt/voice/availability editing and trusted-file catalog operations remain. |
| Provider selection and quality | OpenRouter generation is explicit; no final model or persona/voice evaluation is settled. Fish free access is provisional. The user guide owns current offer/billing limits. |
| Dialogue retention/review | Private durable logging serves scope. Retention and review tooling remain undecided; no history deletion or database/replay workflow is adopted. |
| Preview/live contention | Manual previews can overlap live work. Measure actual contention before adding an intake/refund policy. |
| Storage latency | Synchronous flushed logging may stall on slow disks. Measure before trading durability for buffering. |
| Unsaved Exit | Explicit Exit prioritizes stopping operation and discards unsaved browser drafts. Save deliberate configuration changes before exiting. |
| Interrupted remote writes | A timed-out reward creation can succeed remotely before its local ID is saved. Inspect the app-owned reward before retrying; cancellation is not remote rollback. |
| Crash settlement | An abrupt failure between playback and journal settlement can refund a just-played reply. Filesystem/hardware failures are not covered by an exactly-once guarantee. |

## Trial assessment

The guided journey is implemented, but model/voice choices remain manual. Public reference guides support character-centered setup and deliberate output checkpoints; their managed accounts/voice catalogs do not establish that our provider choices can be hidden without a separate service/billing decision.

Offline mocks establish control flow and failure boundaries, not provider quality, real Twitch settlement or OBS tracks. Resolve the receiving broadcaster, provider access and bounded usage before a live trial. [Research](streamer-app-research.md) owns comparisons, [verification](verification.md) owns evidence, and the [trial runbook](streamer-trial.md) owns proposed live checks.
