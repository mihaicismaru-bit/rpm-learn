export const ACCEPTANCE_CONTRACT_VERSION = 2;

export const EVIDENCE_ASSERTION_REQUIREMENTS = Object.freeze({
  'adult-content-contract-guard': Object.freeze(['adult-lesson-content-contract']),
  'child-adolescent-source-lane-blocked': Object.freeze(['child-adolescent-source-lane-blocked']),
  'indexeddb-recovery': Object.freeze(['indexeddb-active-time-replay','indexeddb-xp-replay']),
  'event-idempotency-conflict-guard': Object.freeze(['event-idempotent-retry','event-id-reuse-conflict']),
  'identity-scoped-event-store': Object.freeze(['multi-learner-same-seq-isolated','cross-subject-event-append-blocked']),
  'snapshot-subject-isolation': Object.freeze(['snapshot-subject-isolation']),
  'tenant-boundary-guard': Object.freeze(['tenant-boundary-allow']),
  'content-version-immutability': Object.freeze(['content-version-immutability','content-migration-human-gate']),
  'time-attribution-source-guard': Object.freeze(['orphan-time-source-blocked','automatic-event-time-attribution-blocked']),
  'idle-gap-retrocredit-guard': Object.freeze(['idle-gap-retrocredit-suppressed']),
  'audio-start-no-time-credit': Object.freeze(['audio-start-time-credit-blocked']),
  'audio-lifecycle-start-end-linkage': Object.freeze(['audio-end-start-linkage-pass','audio-orphan-end-blocked','audio-duplicate-end-tail-quarantine']),
  'time-source-event-linkage': Object.freeze(['orphan-time-source-blocked']),
  'single-time-attribution': Object.freeze(['duplicate-time-attribution-blocked']),
  'legacy-time-replay-quarantine': Object.freeze(['legacy-time-replay-quarantine']),
  'event-sequence-continuity': Object.freeze(['event-sequence-continuity-gap-blocked']),
  'replay-sequence-quarantine': Object.freeze(['replay-sequence-gap-quarantine']),
  'sequence-commit-after-persist': Object.freeze(['sequence-commit-after-persist','sequence-commit-mismatch-blocked']),
  'sequence-chain-quarantine-guard': Object.freeze(['quarantined-chain-extension-blocked']),
  'contiguous-chain-head': Object.freeze(['contiguous-chain-head-detected']),
  'cross-role-event-guard': Object.freeze(['cross-role-event-append-blocked']),
  'event-semantic-integrity-guard': Object.freeze(['forged-answer-score-blocked','semantic-replay-tail-quarantine']),
  'speaking-review-final-path-gate': Object.freeze(['speaking-review-path-hold','speaking-pending-no-xp','speaking-pending-resubmit-blocked','speaking-pending-completion-blocked']),
  'canonical-item-path-guard': Object.freeze(['future-item-answer-path-blocked','future-speaking-path-blocked']),
  'path-replay-tail-quarantine': Object.freeze(['path-replay-tail-quarantine']),
  'semantic-replay-tail-quarantine': Object.freeze(['semantic-replay-tail-quarantine']),
  'learner-route-guard': Object.freeze(['learner-route-allow','teacher-blocked-from-learner-route']),
  'employer-speaking-firewall': Object.freeze(['employer-speaking-firewall']),
  'service-worker-preflight': Object.freeze(['service-worker-api','service-worker-registration','pwa-cache-present','manifest-runtime-contract'])
});

export const POST_OFFLINE_EVIDENCE_ASSERTIONS = Object.freeze([
  'service-worker-control',
  'offline-learner-shell-reload'
]);

export function verifyPreOfflineEvidence(snapshot) {
  if (!snapshot || snapshot.contractVersion !== ACCEPTANCE_CONTRACT_VERSION || !Array.isArray(snapshot.checks)) {
    const err = new Error('ACCEPTANCE_RUNTIME_CONTRACT_MISSING');
    err.code = 'ACCEPTANCE_RUNTIME_CONTRACT_MISSING';
    throw err;
  }
  const observed = new Set(snapshot.checks);
  const missing = [];
  for (const [claim, requirements] of Object.entries(EVIDENCE_ASSERTION_REQUIREMENTS)) {
    for (const check of requirements) if (!observed.has(check)) missing.push(`${claim}:${check}`);
  }
  if (missing.length) {
    const err = new Error(`ACCEPTANCE_RUNTIME_ASSERTION_COVERAGE_MISSING:${missing.join(',')}`);
    err.code = 'ACCEPTANCE_RUNTIME_ASSERTION_COVERAGE_MISSING';
    err.missing = missing;
    throw err;
  }
  return Object.freeze(Object.keys(EVIDENCE_ASSERTION_REQUIREMENTS));
}

export function deriveEvidenceAssertions(snapshot, { serviceWorkerControl = false, offlineLearnerShellReload = false } = {}) {
  const assertions = [...verifyPreOfflineEvidence(snapshot)];
  if (!serviceWorkerControl || !offlineLearnerShellReload) {
    const err = new Error('POST_OFFLINE_ASSERTIONS_INCOMPLETE');
    err.code = 'POST_OFFLINE_ASSERTIONS_INCOMPLETE';
    throw err;
  }
  assertions.push(...POST_OFFLINE_EVIDENCE_ASSERTIONS);
  if (new Set(assertions).size !== assertions.length) {
    const err = new Error('EVIDENCE_ASSERTION_DUPLICATE');
    err.code = 'EVIDENCE_ASSERTION_DUPLICATE';
    throw err;
  }
  return Object.freeze(assertions);
}
