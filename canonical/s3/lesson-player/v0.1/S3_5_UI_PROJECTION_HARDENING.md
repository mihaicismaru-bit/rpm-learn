# S3.5 UI projection hardening — preflight

Status: PRE-FLIGHT ONLY. S3.4 hosted gate remains required before any DOM integration or TEST publication.

This hardening checkpoint materializes the previously documented pure projection boundary without touching the locked S2 interface.

Implemented preflight surfaces:
- pure runtime-frame to render-model projection;
- explicit status handling for ACTIVE, AWAITING_HUMAN_REVIEW, READY_TO_COMPLETE, COMPLETED and INTEGRITY_BLOCKED;
- fail-closed rejection of unknown status and inconsistent completion/human-review states;
- answer action exposed only when the runtime descriptor is answerable and not human-review gated;
- completion action exposed only for a valid READY_TO_COMPLETE frame;
- audio availability may be described, but audio action remains disabled until S4.1;
- speaking action remains disabled until S4.2 and human approval remains outside S3.5;
- a four-method session facade exposes only start, refresh, answer and complete.

The projection owns no scoring, event sequencing, persistence, learning-time conversion, speaking approval, certificate validity or legal inference.

RPM-UX-BASELINE-LOCK-01 remains unchanged. No DOM file, S2 baseline file, main branch or gh-pages content is modified by this checkpoint.
