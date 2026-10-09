# RPM LEARN — Review Resume Integration v0.1

Status: TEST / NOT PRODUCTION.

This integration closes the visible E06 human-review resume gap without granting learner-side review authority.

- S4.3 review records are supplied to replay only through an explicit trusted review provider.
- A VALID review must bind exactly to speaking event id/seq, learner, tenant, lesson, content version, item, submission id, source observation and source artifacts.
- Review authority flags must all remain false.
- VALID clears the pending speaking hold and advances the pedagogical cursor only.
- RETRY/NEEDS_SUPPORT clears the old pending hold but does not advance, enabling a new speaking submission.
- Human review resolution grants no XP, mastery delta, validated time, certificate authority or legal authority.
- Existing replay behavior is unchanged when no trusted review provider is supplied.
- Functional product flow now targets Learner -> Speaking -> Teacher VALID -> E07/E08 -> Completion -> Teacher FINAL VALID -> Employer/Reports.
- Certificate issuance remains fail-closed pending final legal approval.

Fingerprint regeneration diagnostic is branch-only and cannot count as PASS; exact successor values must be persisted before promotion.

Successor v2.6.2 final identity includes cache-v20 acceptance + PWA contract alignment; awaiting exact hosted fingerprint persistence.
