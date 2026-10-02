# S3.3 Completion & Recovery Contract

Status target: KPI PASS before S3.4 opens.

The recovery surface is pedagogical-state based. It intentionally excludes sequence-head
movement caused by a new session start, while preserving lesson/content identity, status,
progress, current item, XP, active learning time, mastery, speaking holds and replay health.

Required invariants:
- READY_TO_COMPLETE remains equivalent after reload.
- A persisted COMPLETED lesson is reopened read-only and does not gain a post-completion session event.
- Repeated completion is idempotent: exactly one LESSON_COMPLETED event.
- Premature completion writes nothing.
- A failed completion write leaves READY_TO_COMPLETE unchanged and recoverable.
- Invalid replay is exposed as INTEGRITY_BLOCKED and no automatic repair event is written.
- Speaking approval, compliance-time conversion, legal validity and certificates remain outside S3.3.
