# RPM LEARN — S1C hardened local PWA shell v0.2

Status: development prototype only; not production; not deployed.

This package implements the RLS07-P0-HELP-01 adult preA1 vertical slice with:
- immutable `contentVersion` identity and AM22N source anchors;
- append-only IndexedDB learning-event store;
- idempotent event replay by `eventId`;
- hard conflict detection for reused `eventId`, lesson/version sequence collisions and session sequence collisions;
- deterministic state replay/recovery;
- attempt, active-time, speaking-submission and mastery state;
- explicit content-head activation and a guard against silent migration to a new content version;
- same-version content immutability (a version cannot be silently edited in place);
- browser E2E acceptance page exercising real IndexedDB behavior;
- service-worker PWA shell;
- strict separation from employer/compliance/certificate functionality.

## Migration rule
A different `contentVersion` for the same lesson is blocked by default. The event history for the old version remains untouched. Activation of a new version requires an explicit migration object with `fromVersion`, `toVersion`, a supported strategy (`restart` or `explicit_map`) and `humanApproved: true`. No migration is executed automatically by this package.

## Tests
Unit / pure logic:

`node tests.mjs`

Browser E2E (requires an HTTP origin, not `file://`): open `browser-e2e.html` in Chromium. The acceptance marker is `RPM_BROWSER_E2E_PASS`.

## Boundaries
No authentication, server sync, employer data, legal-compliance calculation, real audio recording, certificate generation or production telemetry is included. Screen time, XP and gamification do not become validated compliance time. Speaking remains a human-review gate.

## RPM-S2A — role-aware learner shell (development only)

- `access.mjs` defines the future auth boundary without implementing production authentication.
- Roles: LEARNER / TEACHER / EMPLOYER / ADMIN.
- Only the learner route is live in S2A. Teacher, employer and admin routes are stage-gated until their roadmap sprints.
- `createDevSession()` is explicitly `DEV_MOCK_ONLY` and `UNAUTHENTICATED_DEV_SIMULATION`; it must not be reused as production identity.
- Employer permissions are intentionally narrow and do not include learner answers, raw speaking evidence, or teacher-review capability.
- Speaking remains human-review gated; no role rule converts pedagogy, XP, or screen time into compliance time.

## RPM-S2B static PWA preflight

Browser execution is still an open gate, but static defects that would have broken offline use are repaired:
- the service worker now precaches `access.mjs`, which `app.mjs` imports;
- 192x192 and 512x512 app icons are present and referenced by the manifest;
- manifest has explicit `id` and `scope`;
- navigation has an offline shell fallback;
- old RPM LEARN caches are removed on activation;
- `pwa-contract-tests.mjs` asserts the dependency/cache/installability contract.

This does not constitute browser-runtime PASS. The S2B browser gate remains open.

## S2B browser acceptance v0.3
`browser-acceptance.html` is the real-browser pre-offline self-test for IndexedDB replay, event conflict/idempotency, content-version immutability, learner role guard, employer privacy firewall, service-worker registration, cache population and manifest runtime checks.

`browser-acceptance-runner.mjs` is the fail-closed CDP runner. It additionally toggles the browser offline and reloads `index.html` to prove the cached learner shell survives offline navigation. It reports `BROWSER_NAVIGATION_BLOCKED` rather than fabricating PASS when a managed-browser policy blocks localhost.

This is development QA only. Production auth, real learner/employer data, legal compliance calculation, certificate issuance and external release remain OFF.

## S2B browser gate v0.4 — machine-readable fail-closed evidence
The browser runner now writes `RPM_S2B_BROWSER_ACCEPTANCE_EVIDENCE.json` for every run. A managed-browser navigation block is classified as `MANAGED_BROWSER_URL_POLICY` and remains `BLOCKED`, never PASS. A successful run records the exact browser, phase and acceptance assertions. This evidence file is QA provenance only and does not activate production, compliance or certificate behavior.

## S2B browser gate v0.5 portability
The runtime acceptance runner is now host/browser portable without weakening the acceptance criteria. Default mode still serves the capsule on localhost and launches Chromium. `RPM_ORIGIN=https://...` can target the same static capsule on an external standards-compliant origin. `RPM_LAUNCH_BROWSER=0` plus `RPM_CDP_HOST`/`RPM_CDP_PORT` can attach to an already-running CDP browser. Evidence schema is `rpm-s2b-browser-evidence/v2` and records execution mode. These switches do not bypass browser policy; a managed navigation block remains BLOCKED and S3 remains closed.

## S2B v0.6 acceptance traceability hardening
This capsule keeps the real-browser gate fail-closed and adds two controls without changing any acceptance criterion:

1. **Transitive offline dependency closure test** (`pwa-dependency-closure-tests.mjs`). Starting from the real learner module entrypoint, it follows local ES-module imports recursively and requires every reachable learner dependency to be present in the service-worker precache. It also requires the offline page, manifest and manifest icons to be cached. This prevents a repeat of the S2A `access.mjs` omission class when new modules are introduced.
2. **Build-bound machine evidence.** `build-fingerprint.mjs` creates `RPM_S2B_BUILD_FINGERPRINT.json` from the exact learner/PWA/runtime acceptance files. Browser evidence schema v3 embeds the build ID and combined SHA-256, so a later runtime PASS is valid only for the exact tested capsule rather than an unspecified build.

No production auth, real learner/employer data, legal compliance calculation, certificate issuance or external release is enabled. `Learning Engine != Compliance Engine` remains unchanged.


## S2B v0.7 identity/tenant hardening
- DEV session envelope is explicit (`rpm-session/v1`) and remains unauthenticated simulation only.
- Learning events are now v2 and bind `subjectId` + `organisationId`.
- IndexedDB event uniqueness is scoped per organisation + learner; two learners no longer collide on the same lesson sequence number.
- EventStore is scope-bound and rejects cross-subject/cross-tenant appends.
- Learner snapshots moved to `lesson_snapshots_v2`, keyed by organisation + subject + lesson + content version.
- Tenant-boundary helpers are fail-closed; employer/teacher stage gates remain unchanged.
- No real auth, real learner/employer data, compliance calculation, certificate issuance, or production release was introduced.

Runtime acceptance v0.7 additionally proves, when a standards browser is available, that two learners may use the same lesson sequence without collision, cross-subject appends are rejected, and scoped snapshots do not bleed between learners.


## S2B v0.8 — active-time integrity hardening
- Active learning duration is derived from a monotonic browser clock (`performance.now`) rather than wall-clock deltas. Wall-clock timestamps remain audit metadata only.
- Time-slice append policy now fail-closes on negative/non-finite/>45s durations and invalid basis/clock markers.
- Speaking submissions cannot be persisted without `teacherReviewRequired:true`.
- Wall-clock rollback is detected and recorded without inflating valid active time.
- This remains a learning-time integrity control, not a legal compliance determination.

### v0.8 QA result
All deterministic/static suites pass, including the new active-time integrity contract. Chromium 144 still fails closed before application execution with `ERR_BLOCKED_BY_ADMINISTRATOR`; machine evidence classifies this as `MANAGED_BROWSER_URL_POLICY`. No browser-runtime PASS is claimed.
Build fingerprint: `404bd340aa48939bf346f94d6ef9ba6fd08b9ed17ba4351bb2b2ad019bb72fb2`.


## S2B v0.9 — active-time attribution hardening
- Runtime time policy bumped to EVENT_POLICY_VERSION 2.
- TIME_SLICE events carry explicit policyVersion, basis and sourceEventType; automatic lifecycle/render events cannot be used as active-time sources.
- Only ITEM_ANSWERED and SPEAKING_SUBMITTED can attribute meaningful-interaction time; AUDIO_STARTED is audit-only, and only AUDIO_ENDED can attribute audio-playback time.
- eligible/duration consistency, monotonic clock marker and wall-clock audit metadata fail closed before persistence.
- ITEM_PRESENTED, SESSION_STARTED and LESSON_COMPLETED remain persistence/audit events but never trigger active-time credit.
- Foreground time requires both visible document state and document focus; focus/visibility changes reset the monotonic anchor conservatively.
- Build fingerprint now also binds policy/schema files and the attribution regression suite.

RLS-08 source maturity note (read-only AM22N): AR-388 now establishes the 16+ A1 Learner Book CORE P0–P10 v0.1 as MANUSCRIPT_CORE_COMPLETE / PRODUCTIZATION_OPEN / NOT RELEASED; workbook/teacher-guide/assessment stack is still incomplete, so no A1 lesson compilation is opened in RPM LEARN yet.


## S2B v1.0 — source-linked active-time integrity

Development-only hardening. The learner action/source event is persisted before any derived `TIME_SLICE`. Every time slice must carry the exact `sourceEventId` and `sourceEventSeq`; EventStore verifies that source provenance in the same learner/organisation/session/lesson/version/item scope and allows at most one time slice per source event. Orphan or mismatched time credits fail closed. Replay revalidates the current event policy, so legacy/invalid time slices do not contribute to active time after a policy upgrade.

If derived time persistence fails, the learning action remains recorded and the system conservatively grants no time credit. This is intentional: losing time credit is safer than creating unverifiable time. This hardening does not activate Compliance Engine calculations, production auth, real learner/employer data, certificates, or legal-compliance claims. Speaking/final-path validity remains human-gated.


## S2B v1.1 — sequence integrity hardening
New event appends after sequence 1 require the exact predecessor event in the same organisation + learner + lesson + content-version chain. Deterministic replay accepts only the contiguous prefix starting at sequence 1; events after a sequence gap/duplicate are quarantined from derived learner state and validated-time totals. This is local integrity hardening only, not a legal compliance claim. Browser runtime acceptance remains fail-closed until the real-browser evidence gate passes.


## S2B v1.2 — sequence allocation failure-recovery hardening
- UI/audio event writes are serialized through one append queue.
- `seq` is now a committed persistence cursor, not a pre-incremented attempt counter.
- Source events and derived TIME_SLICE events receive a candidate sequence, but the cursor advances only after IndexedDB reports `appended`.
- A rejected TIME_SLICE therefore grants zero time **and** consumes zero sequence numbers; the next valid learner event can continue at the immediate next persisted sequence.
- `EVENT_SEQUENCE_POLICY_VERSION=2`; pure QA covers cursor validation, commit mismatch blocking and failed-persistence no-hole recovery.
- This is still development-only S2 hardening. It does not claim browser-runtime acceptance, legal compliance, production auth, real learner/employer data, or certificate validity.


## S2B v1.3 — sequence chain quarantine / no-auto-heal hardening
- Replay analysis exposes the last **contiguous** committed head separately from the maximum observed sequence.
- EventStore rechecks the complete persisted lesson/version chain inside the append transaction. If an existing gap or duplicate has already quarantined a tail, any new mutation fails closed with `EVENT_SEQUENCE_CHAIN_QUARANTINED`.
- A chain such as `1,3` can therefore neither be extended as `1,3,4` nor silently healed by later inserting `2`, because either action could make previously quarantined evidence appear valid again.
- Learner boot uses `contiguousHead`, never max observed seq. A compromised local chain becomes read-only and requires explicit recovery; no new time is credited.
- Sequence policy version is 3 and service-worker cache is `rpm-learn-s2b-v8`.

This remains development-only Learning Engine integrity work. It does not activate Compliance Engine legal decisions, production identity, real learner/employer data, certificate issuance, or external release.

## S2B v1.4 — role-bound learner event stream hardening
- `LearningEvent` remains schema v2 but is now explicitly **learner-role only**: `role` is required and must equal `LEARNER`. Teacher, Employer and Admin activity belongs to separate future OS/control streams and cannot be injected into the learner event ledger.
- EventStore requires a learner-bound scope at construction and rejects missing/non-learner roles. Event scope comparison now includes role as well as learner and organisation.
- Sequence continuity binds role, and replay validates the full event policy before accepting each sequence element. A legacy/corrupt cross-role event therefore breaks the contiguous trusted prefix and quarantines the tail instead of granting XP, mastery or validated active time.
- Browser acceptance adds `cross-role-event-append-blocked`; machine evidence adds `cross-role-event-guard`. Service-worker cache is `rpm-learn-s2b-v9`.
- `Learning Engine != Compliance Engine` remains enforced. This is development integrity hardening only: no production identity, real learner/employer data, legal compliance decision, final certificate, or external release is enabled.



## S2B v1.5 — semantic learner-event integrity hardening
- `EVENT_SEMANTIC_POLICY_VERSION=1` adds a second fail-closed validation layer after structural/event-policy checks.
- Deterministic `ITEM_ANSWERED` evidence is no longer trusted at face value: replay and append recompute scoring from the persisted `response` and canonical immutable lesson item, then require exact agreement for `correct`, human-review and advance flags.
- Learner-authored `MASTERY_APPLIED` events are forbidden. Mastery remains a derived Learning Engine state, not a client-writable claim.
- Audio and speaking events must bind to compatible canonical items; speaking remains human-review gated.
- `LESSON_COMPLETED` is rejected while replay state is incomplete.
- EventStore requires the activated immutable lesson before append and uses semantic replay analysis for chain health. A raw/legacy forged semantic event breaks the trusted prefix and quarantines that event plus the remaining tail instead of merely ignoring the bad event.
- Browser acceptance adds forged-score blocking and semantic-tail quarantine assertions. Service-worker cache is `rpm-learn-s2b-v10`.

This remains development-only Learning Engine integrity work. It does not open S3, activate Compliance Engine legal decisions, production identity, real learner/employer data, certificates, or external release.


## S2B v1.6 — canonical lesson-path integrity hardening
- `EVENT_SEMANTIC_POLICY_VERSION=2` binds state-changing learner item events to the canonical current item in the immutable lesson sequence.
- `ITEM_PRESENTED`, `ITEM_ANSWERED`, `AUDIO_STARTED` and `SPEAKING_SUBMITTED` fail closed with `EVENT_ITEM_PATH_MISMATCH` when a client attempts to jump ahead or write another item while a different item is current.
- Item mutations are blocked after the canonical path has ended. `AUDIO_ENDED` may arrive after the cursor advanced, but it can never target a future item (`AUDIO_END_FUTURE_ITEM_FORBIDDEN`).
- Replay applies the same path rule. A raw/legacy future-item event breaks the trusted contiguous prefix and quarantines that event plus its later tail, so a forged checkpoint or speaking submission cannot skip required learner steps, grant XP/mastery, or create a shortcut to completion.
- Browser acceptance now proves future-answer and future-speaking blocking plus path-tail quarantine. Service-worker cache is `rpm-learn-s2b-v11`.

This is development-only Learning Engine integrity hardening. It does not open S3 until the exact build passes the real-browser acceptance gate, and it does not activate Compliance Engine legal decisions, real learner/employer data, certificates, or external release.


## S2B v1.7 — anti-idle retrocredit active-time hardening
- `EVENT_POLICY_VERSION=4` closes retroactive idle-time credit: a meaningful-interaction gap longer than the 45-second continuity window yields zero derived active time instead of being clipped to 45 seconds.
- `TIME_SLICE` evidence now carries `rawDurationMs` and `idleGapSuppressed`; persisted slices must match deterministic duration derivation exactly. Forged duration claims fail closed.
- `AUDIO_STARTED` is audit-only and can no longer source meaningful-interaction time. Listening credit is sourced only by provenance-bound `AUDIO_ENDED` using explicit monotonic audio-start anchors.
- Continuous audio remains conservatively capped at 45 seconds in this S2 prototype; background/focus loss still yields zero credit.
- Browser acceptance adds policy-v4 idle-gap and continuous-audio derivation assertions. Service-worker cache is `rpm-learn-s2b-v12`.

This is development-only Learning Engine integrity work. Validated learning time is not legal/compliance time, and S3 remains closed until the exact build receives real-browser acceptance.


## S2B v1.8 — speaking review / final-path gate hardening
- `EVENT_SEMANTIC_POLICY_VERSION=3` makes a speaking submission explicitly **pending evidence**, not a pedagogical pass.
- `SPEAKING_SUBMITTED` may add the item to `speakingPending`, but it grants **0 XP**, does not alter mastery and does **not advance the learner cursor**. The canonical path therefore stops on the speaking item until a future trusted human-review workflow exists.
- A second learner submission while the same item is already pending fails closed with `SPEAKING_REVIEW_PENDING_RESUBMIT_FORBIDDEN`; this prevents repeated pending submissions from being used as a progression/time-farming mechanism.
- `LESSON_COMPLETED` also fails closed with `LESSON_COMPLETION_SPEAKING_REVIEW_PENDING` whenever unresolved speaking evidence remains, even if a corrupt/legacy state tries to present the cursor as complete.
- The learner UI renders a pending-review hold instead of another submit control after submission. Teacher approval is intentionally not synthesized in S2; that future trusted review belongs to Teacher OS and remains human-gated.
- Browser acceptance adds speaking-path-hold, no-XP, resubmit-block and pending-completion assertions. Service-worker cache is `rpm-learn-s2b-v13`.

This is development-only Learning Engine integrity work. It preserves `Learning Engine != Compliance Engine`; no certificate, legal-compliance claim, real employer/learner data, production authentication or release is enabled.

## S2B v1.9 — audio lifecycle provenance hardening
- `EVENT_SEMANTIC_POLICY_VERSION=4` binds every `AUDIO_ENDED` event to one exact, previously accepted `AUDIO_STARTED` event in the same learner, organisation, session, lesson, content version and item scope.
- `AUDIO_STARTED.payload.textRef` must equal the canonical item ID; a client cannot relabel another audio item as the active source.
- `AUDIO_ENDED` must persist `audioStartEventId` + `audioStartEventSeq`; missing, unknown or mismatched starts fail closed.
- One audio start may be closed only once. A second end referencing the same start fails with `AUDIO_START_ALREADY_CLOSED`, and replay quarantines that event plus the later tail.
- Derived listening time remains source-linked only to the accepted `AUDIO_ENDED` event and conservatively capped by the v1.7 active-time policy. This closes the prior possibility of manufacturing an `AUDIO_ENDED` record without an accepted start.
- Browser acceptance adds audio start/end linkage, orphan-end blocking and duplicate-end tail quarantine. Service-worker cache is `rpm-learn-s2b-v14`.

This remains development-only Learning Engine integrity work. It does not convert local learning evidence into legal/compliance time, does not activate real identities or employer data, and does not issue certificates or release production.


## S2B v2.0 — adult lesson-content contract / compiler input guard

`LESSON_CONTENT_POLICY_VERSION=1` now validates each lesson object before it can be activated in IndexedDB. The active RPM adult compiler boundary is fail-closed to RLS-07 16+ preA1, RLS-08 16+ A1, and RLS-09 16+ A2; child/adolescent source lanes cannot be activated. Source artifact IDs must be non-empty and unique, the source-observed date must be explicit, item IDs must be unique, item types/core fields must be valid, deterministic scoring structures must match their canonical item data, checkpoint answers/minimum score must be internally consistent, audio-capable items must carry audio text, and speaking remains bound to `human_review + teacherReviewRequired=true`. This is a Learning Engine content-integrity guard, not a claim that RLS-08/RLS-09 are released; AM22N release gates remain authoritative and read-only. Service-worker cache: `rpm-learn-s2b-v15`.


## S2B v2.1 — build fingerprint self-integrity + adult content-contract promotion

The unpromoted v2.0 candidate exposed a release-engineering defect: its recorded fingerprint was generated before the final file set stopped changing. v2.1 supersedes that candidate, preserves the adult RLS-07/RLS-08/RLS-09 lesson-content guard, and adds a build-fingerprint self-check plus fail-closed verification inside the browser acceptance runner. A stale or tampered file now fails before any runtime assertion can be credited. Service-worker cache: `rpm-learn-s2b-v16`. This remains development-only; S3 stays closed until a real browser acceptance PASS.


## S2B v2.2 — browser-acceptance cache-coherence repair
The v2.1 acceptance page still asserted the prior `rpm-learn-s2b-v15` cache while the service worker had already advanced to `rpm-learn-s2b-v16`. A real browser capable of reaching the test origin would therefore fail `pwa-cache-present` even if the service worker itself behaved correctly. v2.2 repairs that internal harness defect and advances the service-worker cache to `rpm-learn-s2b-v18`.

`browser-acceptance-static-tests.mjs` now reads the service-worker `CACHE` constant and fails closed unless every cache reference in `browser-acceptance.html` matches it exactly. This prevents a stale acceptance assertion from surviving static QA again. The adult RLS-07/RLS-08/RLS-09 content boundary, all event/time/sequence/speaking/audio guards, and `Learning Engine != Compliance Engine` remain unchanged. Production, real learner/employer data, legal-compliance claims and certificate issuance remain OFF.


## S2B v2.3 — runtime evidence-claim integrity
v2.2 could still overstate browser evidence because the runner emitted a hardcoded assertion list after only checking the page-level PASS flag. One malformed entry also merged `audio-lifecycle-start-end-linkage` with `adult-content-contract`, and `audio-start-no-time-credit` had no direct real-browser check. v2.3 introduces a shared acceptance evidence contract. The browser page exports the exact checks it executed; the runner verifies each evidence claim against those observed checks before any PASS can be written; post-offline claims are appended only after service-worker control and offline learner-shell reload succeed. A direct browser check now proves that AUDIO_STARTED cannot be used as a TIME_SLICE source.

Build ID: `RPM-S2B-BROWSER-GATE-v2.3`. Service-worker cache: `rpm-learn-s2b-v18`. S3 remains closed until one real evidence-v3 PASS.


## S2B v2.4 — executable acceptance snapshot binding repair

v2.3 correctly introduced a shared evidence-claim contract, but the browser page stored machine check entries as display strings (`PASS <check>`) while `acceptance-contract.mjs` requires raw check names (`<check>`). A reachable standards-browser would therefore pass all in-page assertions and then fail closed in the runner at evidence-contract verification. v2.4 repairs the page/runner interface: the machine snapshot now stores raw check names only, the human-facing result adds the `PASS ` prefix only while rendering, and acceptance contract version advances to 2. Static QA explicitly rejects recurrence of display-prefixed machine evidence.

Build ID: `RPM-S2B-BROWSER-GATE-v2.4`. Service-worker cache: `rpm-learn-s2b-v19`. Real browser runtime acceptance remains the gate for closing S2B; S3 remains closed.


## S2B v2.6 — duplicate time-attribution runtime contract repair

This successor candidate fixes the real-browser pre-offline failure observed on v2.5 at `duplicate-time-attribution-blocked`. `EventStore.append()` now raises the canonical store-state `EventConflictError` with code `TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED` before semantic replay validation when a second `TIME_SLICE` targets an already-attributed source event. Replay remains fail-closed under semantic validation. No learning-time credit is widened or inferred, and `Learning Engine != Compliance Engine` remains unchanged.

Build ID: `RPM-S2B-BROWSER-GATE-v2.6`. This build is not promotable until its regenerated fingerprint, corrected 42-entry source checksum manifest, deterministic/static QA, and real-browser acceptance all pass. S3 remains closed.
