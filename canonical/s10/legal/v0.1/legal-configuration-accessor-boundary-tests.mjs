import assert from 'node:assert/strict';
import {buildLegalConfigurationCandidate, evaluateLegalConfigurationSimulation, LegalConfigurationError} from './legal-configuration-candidate.mjs';

const base={configId:'ACCESSOR-TEST-ONLY',configVersion:'v1',weeklyRequirementMs:100,minimumPeriodWeeks:1,recoveryAllowed:false,recoveryWindowWeeks:0,sourceAuthorityRef:'SYNTHETIC-NOT-LEGAL'};
const candidate=buildLegalConfigurationCandidate(base);
const provenance={learningTimeLedgerVersion:1,learningTimeEntryCount:0};
const row={weekLabel:'2026-W40',validatedLearningTimeMs:0,provenance};
const evaluate=(c=candidate,e=[row])=>evaluateLegalConfigurationSimulation({candidate:c,weeklyEvidence:e});
const rejects=(fn,code)=>assert.throws(fn,e=>e instanceof LegalConfigurationError&&e.code===code);
const getter=(original,key)=>{const value={...original};let hits=0;Object.defineProperty(value,key,{enumerable:true,get(){hits++;return hits<=2?original[key]:0;}});return {value,readCount:()=>hits};};

// v3 bypass: first two reads pass the candidate validation; later reads
// change requiredMs to zero and falsely emit SIMULATED_MEETS_RULE.
const tampered=getter(candidate,'weeklyRequirementMs');
rejects(()=>evaluate(tampered.value),'LEGAL_CONFIG_CANDIDATE_REQUIRED');
assert.equal(tampered.readCount(),0,'validation must not invoke untrusted getters');

const buildTampered=getter(base,'weeklyRequirementMs');
rejects(()=>buildLegalConfigurationCandidate(buildTampered.value),'LEGAL_CONFIG_SHAPE_INVALID');
assert.equal(buildTampered.readCount(),0);

const weekTampered=getter(row,'validatedLearningTimeMs');
rejects(()=>evaluate(candidate,[weekTampered.value]),'LEGAL_CONFIG_WEEKLY_EVIDENCE_SHAPE_INVALID');
assert.equal(weekTampered.readCount(),0);

const provenanceTampered=getter(provenance,'learningTimeEntryCount');
rejects(()=>evaluate(candidate,[{...row,provenance:provenanceTampered.value}]),'LEGAL_CONFIG_PROVENANCE_INVALID');
assert.equal(provenanceTampered.readCount(),0);

// A class instance with matching enumerable keys is not JSON-like source data.
const exotic=Object.assign(Object.create({inherited:true}),candidate);
rejects(()=>evaluate(exotic),'LEGAL_CONFIG_CANDIDATE_REQUIRED');

const valid=evaluate();
assert.equal(valid.weeks[0].requiredMs,100);
assert.equal(valid.weeks[0].simulationStatus,'SIMULATED_DEFICIT');
assert.equal(valid.legalClaim,false);
assert.equal(valid.certificateAuthority,false);
console.log('RPM_S10_LEGAL_CONFIG_ACCESSOR_BOUNDARY_PASS 5-accessor-or-prototype-rejects no-getter-execution stable-requirement fail-closed simulation-only');
