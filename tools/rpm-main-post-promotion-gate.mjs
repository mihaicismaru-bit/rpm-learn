import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  buildLegalConfigurationCandidate,
  evaluateLegalConfigurationSimulation,
  requireFinalLegalBlueprint,
  LegalConfigurationError
} from '../canonical/s10/legal/v0.1/legal-configuration-candidate.mjs';
import {
  requireCertificateIssuance,
  CertificateGateError
} from '../canonical/s11/certificate/v0.1/certificate-gate.mjs';
import {AUDIO_VOICE_POLICY} from '../canonical/s4/audio/v0.1/audio-mechanics.mjs';

// Deliberately synthetic inputs. These must never be read as an approved
// Romanian legal threshold or as authority to issue a certificate.
const candidate=buildLegalConfigurationCandidate({
  configId:'CI-SYNTHETIC-NOT-LEGAL',
  configVersion:'test-only',
  weeklyRequirementMs:1,
  minimumPeriodWeeks:1,
  recoveryAllowed:false,
  recoveryWindowWeeks:0,
  sourceAuthorityRef:'CI-SYNTHETIC-NOT-APPROVED'
});
const simulation=evaluateLegalConfigurationSimulation({
  candidate,
  weeklyEvidence:[{
    weekLabel:'2026-W40',
    validatedLearningTimeMs:1,
    provenance:{learningTimeLedgerVersion:1,learningTimeEntryCount:1}
  }]
});
assert.equal(simulation.weeks[0].simulationStatus,'SIMULATED_MEETS_RULE');
assert.equal(simulation.minimumPeriodObserved,true);
for(const record of [candidate,simulation,...simulation.weeks]){
  assert.equal(record.certificateAuthority,false);
  assert.equal(record.productionComplianceAuthority,false);
  assert.equal(record.legalBlueprintFinal,false);
}
assert.equal(simulation.legalClaim,false);
assert.equal(simulation.weekAttributionAuthority,false);
assert.equal(simulation.weekAttributionStatus,'UNVERIFIED_SIMULATION_INPUT');
assert.equal(simulation.weeks[0].legalClaim,false);
assert.equal(simulation.weeks[0].weekAttributionAuthority,false);
assert.equal(simulation.weeks[0].weekAttributionStatus,'UNVERIFIED_SIMULATION_INPUT');
assert.throws(
  ()=>requireFinalLegalBlueprint(),
  e=>e instanceof LegalConfigurationError&&e.code==='LEGAL_BLUEPRINT_FINAL_REQUIRED'
);
assert.throws(
  ()=>requireCertificateIssuance(),
  e=>e instanceof CertificateGateError&&e.code==='CERTIFICATE_FINAL_LEGAL_APPROVAL_REQUIRED'
);
assert.equal(AUDIO_VOICE_POLICY,'DEFERRED');
const readme=fs.readFileSync('README.md','utf8');
assert.match(readme,/gh-pages.*TEST \/ NOT PRODUCTION/);
assert.match(readme,/Learning Engine and Compliance Engine remain separate/);
console.log('RPM_MAIN_POST_PROMOTION_AUTHORITY_FENCE_PASS simulation-success-is-not-legal-approval week-attribution-unverified certificate-issuance-denied voice-deferred gh-pages-test-only');
