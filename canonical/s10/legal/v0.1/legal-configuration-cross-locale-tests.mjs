import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {buildLegalConfigurationCandidate,evaluateLegalConfigurationSimulation} from './legal-configuration-candidate.mjs';
const expected=['A-a','A-z','A-ä'];
function simulate(){
  const candidate=buildLegalConfigurationCandidate({configId:'S10-ORDER-TEST',configVersion:'0',weeklyRequirementMs:1,minimumPeriodWeeks:1,recoveryAllowed:false,recoveryWindowWeeks:0,sourceAuthorityRef:'TEST-ONLY-NOT-LEGAL-AUTHORITY'});
  const weeklyEvidence=['A-ä','A-z','A-a'].map(weekLabel=>({weekLabel,validatedLearningTimeMs:0,provenance:{learningTimeLedgerVersion:1,learningTimeEntryCount:0}}));
  const result=evaluateLegalConfigurationSimulation({candidate,weeklyEvidence});
  assert.equal(result.legalClaim,false);assert.equal(result.certificateAuthority,false);return result.weeks.map(w=>w.weekLabel);
}
if(process.argv.includes('--cross-locale-worker')){process.stdout.write(JSON.stringify(simulate()));}else{
  for(const locale of ['C','en_US.UTF-8','sv_SE.UTF-8','ro_RO.UTF-8']){
    const child=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--cross-locale-worker'],{env:{...process.env,LANG:locale,LC_ALL:locale},encoding:'utf8',timeout:5000});
    assert.equal(child.status,0,`${locale}: ${child.stderr}`);assert.deepEqual(JSON.parse(child.stdout),expected,`locale-sensitive ordering at ${locale}`);
  }
  console.log('RPM_S10_LEGAL_CONFIG_LOCALE_ORDER_PASS 4-locale-invariant UTF16-order simulation-only no-authority');
}
