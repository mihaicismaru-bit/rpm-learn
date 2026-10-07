# S3.4 — RLS-07 Content Loader

Status: implementation checkpoint on controlled S3 branch. Not production.

## Source authority

The loader is pinned to the three Drive artifacts verified on 2026-10-02:

- AR-245 — Teacher Guide — RLS-07 — 16+ — preA1
- AR-191 — Workbook — RLS-07 — 16+ — preA1
- AR-233 — Assessment Pack — RLS-07 — 16+ — preA1

The source authority stores Drive artifact IDs, roles and verified revision IDs. Runtime activation requires the lesson artifact set to match the bound provenance set exactly.

## Contract

- RLS-07 only.
- Audience must remain 16+ and level preA1.
- Every lesson passes the S2 lesson-content contract before registration.
- Exact duplicate lessonId+contentVersion is detected and reused idempotently.
- Same lessonId+contentVersion cannot silently change content.
- Provenance cannot silently change under the same identity.
- Source revision drift fails closed.
- A new contentVersion cannot become active without the existing explicit migration gate.
- Registry reads return clones so callers cannot mutate stored state by reference.
- No certificate, CEFR certification or compliance meaning is inferred by the loader.

## Boundaries

Learning Engine != Compliance Engine. AM22N remains read-only/adult-only. Speaking, final-path, certificate and legal validity remain human/legal gated. No production or real learner/employer data is enabled by this sprint.
