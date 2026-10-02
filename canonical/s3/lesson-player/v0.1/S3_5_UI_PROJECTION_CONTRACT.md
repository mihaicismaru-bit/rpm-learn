# S3.5 UI projection contract — preflight only

Status: PRE-FLIGHT ONLY. S3.4 hosted KPI gate remains required before DOM integration.

The adapter projection is a pure mapping from the S3 runtime frame to a render model. It does not mutate DOM, allocate event sequences, write EventStore, recompute authoritative scoring, enable audio, submit speaking evidence, approve speaking, convert XP or screen time to validated learning time, or infer certificate/legal validity.

Fail-closed status mapping:
- ACTIVE: render current runtime item; answer only when runtime says answerable.
- AWAITING_HUMAN_REVIEW: read-only hold.
- READY_TO_COMPLETE: completion action only when current is null, canComplete is true, and speakingPending is empty.
- COMPLETED: read-only.
- INTEGRITY_BLOCKED: read-only; no answer, completion, audio, or speaking action.
- Unknown status: reject projection.

Deferred capabilities remain S4.1 audio mechanics, S4.2 speaking submission and S4.3 human review. Audio-capable items may expose that audio exists, but S3.5 preflight must not enable an audio action. Speaking items remain visible but non-actionable until the dedicated speaking lane exists.

Baseline remains RPM-UX-BASELINE-LOCK-01. Required anchors stay roleBadge, lessonTitle, progress, xp, time, prompt, audioBtn, exerciseBody and feedback. The legacy checkBtn mismatch is explicitly non-contractual.
