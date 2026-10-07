import assert from 'node:assert/strict';
import {buildLegalConfigurationCandidate,evaluateLegalConfigurationSimulation,requireFinalLegalBlueprint,LegalConfigurationError} from './legal-configuration-candidate.mjs';

const raw={configId:'TEST-LEGAL-01',configVersion:'test-v1',weeklyRequirementMs:120000,minimumPeriodWeeks:2,recoveryAllowed:true,recoveryWindowWeeks:1,sourceAuthorityRef:'TEST-ONLY-NOT-LEGAL-AUTHORITY'};
const candidate=buildLegalConfigurationCandidate(raw);
const evidence=[
 {weekLabel:'2026-W40',validatedLearningTimeMs:120000,provenance:{learningTimeLedgerVersion:1,learningTimeEntryCount:4}},
 {weekLabel:'2026-W41',validatedLearningTimeMs:90000,provenance:{learningTimeLedgerVersion:1,learningTimeEntryCount:3}}
];
{
 const a=evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:structuredClone(evidence)});
 const b=evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:structuredClone(evidence)});
 assert.deepEqual(a,b);assert.equal(Object.isFrozen(a),true);
 assert.equal(a.status,'SIMULATION_ONLY_LEGAL_BLUEPRINT_REQUIRED');
 assert.equal(a.weeks[0].simulationStatus,'SIMULATED_MEETS_RULE');assert.equal(a.weeks[0].deficitMs,0);
 assert.equal(a.weeks[1].simulationStatus,'SIMULATED_DEFICIT');assert.equal(a.weeks[1].deficitMs,30000);
 assert.equal(a.minimumPeriodObserved,true);assert.equal(a.totalDeficitMs,30000);
 assert.equal(a.legalBlueprintFinal,false);assert.equal(a.productionComplianceAuthority,false);assert.equal(a.certificateAuthority,false);assert.equal(a.legalClaim,false);
}
assert.throws(()=>buildLegalConfigurationCandidate({...raw,recoveryAllowed:false}),e=>e instanceof LegalConfigurationError&&e.code==='LEGAL_CONFIG_RECOVERY_WINDOW_FORBIDDEN');
assert.throws(()=>buildLegalConfigurationCandidate({...raw,weeklyRequirementMs:0}),e=>e instanceof LegalConfigurationError&&e.code==='LEGAL_CONFIG_WEEKLY_REQUIREMENT_INVALID');
assert.throws(()=>evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:[evidence[0],evidence[0]]}),e=>e instanceof LegalConfigurationError&&e.code==='LEGAL_CONFIG_DUPLICATE_WEEK');
assert.throws(()=>evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:[{...evidence[0],provenance:{learningTimeLedgerVersion:2,learningTimeEntryCount:4}}]}),e=>e instanceof LegalConfigurationError&&e.code==='LEGAL_CONFIG_PROVENANCE_INVALID');
assert.throws(()=>requireFinalLegalBlueprint(),e=>e instanceof LegalConfigurationError&&e.code==='LEGAL_BLUEPRINT_FINAL_REQUIRED');
console.log('RPM_S10_LEGAL_CONFIG_CANDIDATE_PASS parameterized-no-defaults weekly-minimum-period recovery-policy provenance-bound simulation-only no-legal-claim no-production-compliance-authority no-certificate-authority final-blueprint-required');
