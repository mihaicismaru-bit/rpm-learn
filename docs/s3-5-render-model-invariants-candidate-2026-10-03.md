# S3.5 render-model invariant candidate

Status: NON-DOM HARDENING ONLY. S3.4 remains HOSTED GATE PENDING.

A local executable candidate was built for exact safe-render-model validation before render-command mapping. It validates exact top-level and nested shapes, projectionVersion=2 / sanitizerVersion=1, RLS-07 source lane, progress arithmetic, status↔mode, capability derivation, integrity binding, speakingPending uniqueness and human-review status rules, per-kind current-item whitelists, and no extra action/capability authority.

Local deterministic marker:
`RPM_S3_5_RENDER_MODEL_INVARIANTS_PASS exact-nested-shapes status-mode progress capability-integrity human-review no-extra-authority`

The candidate is NOT wired into the repository runtime and is NOT a repo/hosted PASS because executable source writes were blocked before mutation. No DOM integration, TEST publication, main merge, gh-pages promotion, audio/speaking activation, validated-time authority, certificate authority, or legal-validity authority is claimed.
