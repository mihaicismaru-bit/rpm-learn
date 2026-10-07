import assert from 'node:assert/strict';
import {buildLegalConfigurationCandidate,evaluateLegalConfigurationSimulation} from './legal-configuration-candidate.mjs';

// Deterministic simulation QA only. No legal, production-compliance, or certificate authority.
// Keep this suite independent of the additive reject-vector tests so that failures isolate cleanly.
let seed=0x52a10d09;
const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
const pick=n=>next()%n;
const plain=v=>JSON.parse(JSON.stringify(v));
for(let i=0;i<384;i++){
  const weeklyRequirementMs=1+pick(900000);
  const minimumPeriodWeeks=1+pick(8);
  const recoveryAllowed=pick(2)===0;
  const candidate=buildLegalConfigurationCandidate({
    configId:`S10-TEST-${i}`,configVersion:'test-v1',weeklyRequirementMs,
    minimumPeriodWeeks,recoveryAllowed,recoveryWindowWeeks:recoveryAllowed?1+pick(4):0,
    sourceAuthorityRef:'TEST-ONLY-NOT-LEGAL-AUTHORITY'
  });
  const count=pick(7);
  const rows=Array.from({length:count},(_,j)=>{
    const validatedLearningTimeMs=pick(1200000);
    return {
      weekLabel:`2026-W${String(j+1).padStart(2,'0')}`,
      validatedLearningTimeMs,
      provenance:{learningTimeLedgerVersion:1,learningTimeEntryCount:validatedLearningTimeMs?1+pick(6):0}
    };
  });
  const priorRows=plain(rows);
  const original=evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:rows});
  const reordered=evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:plain(rows).reverse()});
  const replay=evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:plain(rows)});
  assert.deepEqual(original,reordered,'weekly input order must not affect simulation');
  assert.deepEqual(original,replay,'simulation replay must be deterministic');
  assert.deepEqual(rows,priorRows,'input evidence must not be mutated');
  assert.equal(original.minimumPeriodObserved,count>=minimumPeriodWeeks);
  assert.equal(original.totalValidatedLearningTimeMs,rows.reduce((s,r)=>s+r.validatedLearningTimeMs,0));
  assert.equal(original.totalDeficitMs,rows.reduce((s,r)=>s+Math.max(0,weeklyRequirementMs-r.validatedLearningTimeMs),0));
  assert.deepEqual(original.weeks.map(w=>w.weekLabel),rows.map(r=>r.weekLabel));
  assert.equal(original.status,'SIMULATION_ONLY_LEGAL_BLUEPRINT_REQUIRED');
  for(const key of ['legalClaim','certificateAuthority','productionComplianceAuthority','legalBlueprintFinal'])assert.equal(original[key],false,key);
  assert.equal(Object.isFrozen(original),true);
  assert.equal(Object.isFrozen(original.weeks),true);
  for(const row of original.weeks){
    assert.equal(Object.isFrozen(row),true);
    assert.equal(Object.isFrozen(row.provenance),true);
    assert.equal(row.legalClaim,false);
    assert.equal(row.recoveryEligibility,recoveryAllowed?'SIMULATED_RULE_ALLOWS_RECOVERY':'SIMULATED_RULE_DISALLOWS_RECOVERY');
  }
}
console.log('RPM_S10_LEGAL_CONFIG_REPLAY_INVARIANTS_PASS 384-deterministic-cases order-invariant replay-pure deep-frozen-source-bound simulated-arithmetic no-legal-certificate-authority');
