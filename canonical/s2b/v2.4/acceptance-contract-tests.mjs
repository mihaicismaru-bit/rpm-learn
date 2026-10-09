import assert from 'node:assert/strict';
import { ACCEPTANCE_CONTRACT_VERSION, EVIDENCE_ASSERTION_REQUIREMENTS, POST_OFFLINE_EVIDENCE_ASSERTIONS, verifyPreOfflineEvidence, deriveEvidenceAssertions } from './acceptance-contract.mjs';

assert.equal(ACCEPTANCE_CONTRACT_VERSION,2);
const checks=[...new Set(Object.values(EVIDENCE_ASSERTION_REQUIREMENTS).flat())];
const snapshot={contractVersion:ACCEPTANCE_CONTRACT_VERSION,checks};
const pre=verifyPreOfflineEvidence(snapshot);
assert.deepEqual(pre,Object.keys(EVIDENCE_ASSERTION_REQUIREMENTS));
const full=deriveEvidenceAssertions(snapshot,{serviceWorkerControl:true,offlineLearnerShellReload:true});
assert.deepEqual(full,[...Object.keys(EVIDENCE_ASSERTION_REQUIREMENTS),...POST_OFFLINE_EVIDENCE_ASSERTIONS]);
assert.equal(new Set(full).size,full.length);
const broken={contractVersion:ACCEPTANCE_CONTRACT_VERSION,checks:checks.filter(x=>x!=='audio-start-time-credit-blocked')};
assert.throws(()=>verifyPreOfflineEvidence(broken),/ACCEPTANCE_RUNTIME_ASSERTION_COVERAGE_MISSING/);
const displayPrefixed={contractVersion:ACCEPTANCE_CONTRACT_VERSION,checks:checks.map(x=>`PASS ${x}`)};
assert.throws(()=>verifyPreOfflineEvidence(displayPrefixed),/ACCEPTANCE_RUNTIME_ASSERTION_COVERAGE_MISSING/);
assert.throws(()=>deriveEvidenceAssertions(snapshot,{serviceWorkerControl:true,offlineLearnerShellReload:false}),/POST_OFFLINE_ASSERTIONS_INCOMPLETE/);
console.log('RPM_S2_ACCEPTANCE_EVIDENCE_CONTRACT_PASS runtime-check-binding raw-machine-check-names display-prefix-rejected no-unearned-claims typo-safe post-offline-gates');
