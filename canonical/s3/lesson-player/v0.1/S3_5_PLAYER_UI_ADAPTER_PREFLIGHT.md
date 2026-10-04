# S3.5 Player ↔ UI Adapter — preflight only

Status: PRE-FLIGHT ONLY — S3.4 hosted gate required before production integration.

This checkpoint does not modify the DOM, the S2 UX baseline, EventStore, scoring, audio mechanics, speaking review, compliance time, certificate logic, or legal semantics. It freezes only the adapter boundary so S3.5 can begin without rediscovering the S2 surface once S3.4 is green.

## Baseline lock

The adapter must preserve `RPM-UX-BASELINE-LOCK-01` and use the existing anchors: `#roleBadge`, `#lessonTitle`, `#progress`, `#xp`, `#time`, `#prompt`, `#audioBtn`, `#exerciseBody`, and `#feedback`.

A legacy mismatch is now explicit: `app.mjs` still queries `#checkBtn`, but the locked baseline HTML does not contain that element. S3.5 must not make `#checkBtn` part of its adapter contract. Integrity-block rendering must be safe without it.

## Adapter responsibility

The UI adapter may consume the S3 runtime frame and invoke only the session controller port `start / refresh / answer / complete`. It must not allocate event sequences, write EventStore directly, recompute authoritative scoring, approve speaking, convert XP/screen time to validated learning time, or infer certificate/legal validity.

Status mapping is fail-closed: `ACTIVE` renders the current runtime item; `AWAITING_HUMAN_REVIEW` renders a read-only speaking hold; `READY_TO_COMPLETE` exposes completion; `COMPLETED` is read-only; `INTEGRITY_BLOCKED` is read-only and must expose no answer/completion action.

## Deferred lanes

Audio lifecycle remains S4.1. Speaking submission remains S4.2. Human review remains S4.3. Final Romanian voice remains deferred.

## Gate to leave preflight

S3.5 implementation may start only after S3.4 has reproducible hosted QA for S2 baseline + S3.1 + S3.2 + S3.3 + all S3.4 loader invariants. Until then this branch is design/test hardening only and must not be promoted to `main` or `gh-pages`.
