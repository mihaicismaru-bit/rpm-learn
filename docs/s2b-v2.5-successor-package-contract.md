# RPM LEARN — S2B v2.5 successor package contract

Status: HARDENING ONLY / NOT PROMOTED / S3 CLOSED

## Authority
- SSOT: RPM_LEARN_MASTER — Product Blueprint & Build Control.
- Predecessor runtime build: S2B v2.4.
- v2.4 remains immutable historical evidence and must not be silently edited.

## Why v2.5 package identity is required
The v2.4 SHA256SUMS scope includes historical runtime browser evidence. Runtime acceptance evidence is produced by executing a build and must not be source-package material. Because the exact historical evidence sidecar is not recoverable from an authoritative source, v2.4 package closure remains fail-closed.

## v2.5+ package-scope rules
1. Source-package SHA256SUMS contains only source code, static assets, schemas, package metadata and build-fingerprint material.
2. RPM_S2B_BROWSER_ACCEPTANCE_EVIDENCE_* files are excluded from source-package checksum scope.
3. Runtime evidence is stored separately and must bind the exact build fingerprint, acceptance-contract version and runtime environment.
4. Missing or mismatched source-package checksums fail closed.
5. Historical runtime evidence found in source-package SHA256SUMS is a scope violation and requires a successor package.
6. No retroactive rewrite of v2.4 bytes or manifests.
7. Promotion requires fingerprint PASS, checksum-closure PASS, deterministic/static QA PASS and readback.
8. S3 remains closed until exact-build real-browser acceptance PASS.

## Current predecessor closure
- v2.4 fingerprint scope: 38/39 present.
- Missing fingerprint-bound file: icon-512.png.
- Exact recovered icon identity: 7,507 bytes; SHA-256 81361b3985fd938ed7ed35bb4fbd50cc2879a6ce523b83d80f92caa35cb33fa6; Git blob c245479d8d0c03dffe1dbd58d1bdc0f16f006aed.
- No substitute bytes are permitted.
- main remains unchanged.
- gh-pages is TEST / NOT PRODUCTION only.

## Product boundaries
RPM-UX-BASELINE-LOCK-01 remains active. Final Romanian voice quality is deferred. AM22N is read-only/adult-only. Learning Engine != Compliance Engine. XP, gamification and screen time are not automatically validated compliance time. Production, real learner/employer data, legal claims and real certificates remain OFF.

## Next exact action
Persist package-gate v2, assemble v2.5 corrected package metadata from the exact validated source set, close icon transport, run repository/package QA, then promote only through controlled gate/readback. Real-browser acceptance remains the final S2B gate.
