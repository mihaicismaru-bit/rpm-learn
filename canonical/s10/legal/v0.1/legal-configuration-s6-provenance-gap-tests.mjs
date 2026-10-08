import assert from 'node:assert/strict';
import {buildLegalConfigurationCandidate,evaluateLegalConfigurationSimulation,LegalConfigurationError} from './legal-configuration-candidate.mjs';

// S10 SECURITY GAP REGRESSION (diagnostic, not closure): S10 simulation accepts a
// caller-declared S6 entryCount without rebuilding or authenticating the S6 ledger.
// A synthetic positive entry count cannot be considered source event provenance.
const candidate=buildLegalConfigurationCandidate({
  configId:'S10-PROVENANCE-DIAGNOSTIC-NOT-LEGAL',
  configVersion:'diagnostic-v1',weeklyRequirementMs:100,minimumPeriodWeeks:2,
  recoveryAllowed:false,recoveryWindowWeeks:0,sourceAuthorityRef:'SYNTHETIC-ONLY'
});
const evidence=(count)=>['2026-W40','2026-W41'].map(weekLabel=>({
  weekLabel,validatedLearningTimeMs:100,
  provenance:{learningTimeLedgerVersion:1,learningTimeEntryCount:count}
}));
assert.throws(
  ()=>evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:evidence(0)}),
  e=>e instanceof LegalConfigurationError&&e.code==='LEGAL_CONFIG_UNSOURCED_TIME_FORBIDDEN'
);
// No lesson/event IDs, S6 replay chain, subject or tenant data are supplied here.
// These synthetic rows nevertheless simulate full weekly completion.
const simulated=evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:evidence(1)});
assert.equal(simulated.minimumPeriodObserved,true);
assert.deepEqual(simulated.weeks.map(x=>x.simulationStatus),
  ['SIMULATED_MEETS_RULE','SIMULATED_MEETS_RULE']);
assert.equal(simulated.totalValidatedLearningTimeMs,200);
for(const key of ['legalClaim','legalBlueprintFinal','productionComplianceAuthority','certificateAuthority'])
  assert.equal(simulated[key],false);
assert.equal(Object.isFrozen(simulated),true);
console.log('RPM_S10_S6_UNBOUND_PROVENANCE_GAP_REPRODUCED synthetic-count-not-replay-attestation simulation-only no-legal-certificate-authority');
