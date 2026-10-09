import assert from 'node:assert/strict';
import {buildLegalConfigurationCandidate,evaluateLegalConfigurationSimulation,LegalConfigurationError} from './legal-configuration-candidate.mjs';
const candidate=buildLegalConfigurationCandidate({configId:'TEST-ONLY-WEEK-IDENTITY',configVersion:'test-v1',weeklyRequirementMs:100,minimumPeriodWeeks:2,recoveryAllowed:false,recoveryWindowWeeks:0,sourceAuthorityRef:'TEST-NOT-LEGAL'});
const week=weekLabel=>({weekLabel,validatedLearningTimeMs:100,provenance:{learningTimeLedgerVersion:1,learningTimeEntryCount:1}});
const evaluate=labels=>evaluateLegalConfigurationSimulation({candidate,weeklyEvidence:labels.map(week)});
const adversarial=[['2026-W40','2026-W40\u200B'],['café','cafe\u0301'],['W40','\uFF3740'],['2026-W40','2026-W40\0']];
for(const [canonical,ambiguous] of adversarial){
 assert.throws(()=>evaluate([canonical,ambiguous]),e=>e instanceof LegalConfigurationError&&e.code==='LEGAL_CONFIG_WEEK_LABEL_NOT_CANONICAL',JSON.stringify([canonical,ambiguous]));
 assert.throws(()=>evaluate([ambiguous]),e=>e instanceof LegalConfigurationError&&e.code==='LEGAL_CONFIG_WEEK_LABEL_NOT_CANONICAL',JSON.stringify(ambiguous));
}
const valid=evaluate(['2026-W40','2026-W41']);
assert.equal(valid.weeks.length,2);assert.equal(valid.minimumPeriodObserved,true);assert.equal(valid.totalValidatedLearningTimeMs,200);
for(const key of ['legalClaim','productionComplianceAuthority','certificateAuthority','legalBlueprintFinal'])assert.equal(valid[key],false);
console.log('RPM_S10_LEGAL_CONFIG_WEEK_IDENTITY_PASS 4-ambiguous-label-reject-vectors NFC-NFKC-invisible-control no-double-counting simulation-only');
