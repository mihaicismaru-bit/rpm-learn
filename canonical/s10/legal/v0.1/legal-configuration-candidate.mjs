export const LEGAL_CONFIGURATION_CANDIDATE_VERSION=1;
export class LegalConfigurationError extends Error{constructor(code){super(code);this.name='LegalConfigurationError';this.code=code;}}
const fail=code=>{throw new LegalConfigurationError(code);};
const freeze=v=>{if(!v||typeof v!=='object'||Object.isFrozen(v))return v;for(const x of Object.values(v))freeze(x);return Object.freeze(v);};
const req=(v,code)=>{if(typeof v!=='string'||!v.trim())fail(code);return v;};
const pos=(v,code)=>{if(!Number.isInteger(v)||v<=0)fail(code);return v;};
const nonneg=(v,code)=>{if(!Number.isInteger(v)||v<0)fail(code);return v;};

export function buildLegalConfigurationCandidate(input){
  const keys=['configId','configVersion','weeklyRequirementMs','minimumPeriodWeeks','recoveryAllowed','recoveryWindowWeeks','sourceAuthorityRef'].sort().join(',');
  if(!input||Object.keys(input).sort().join(',')!==keys)fail('LEGAL_CONFIG_SHAPE_INVALID');
  req(input.configId,'LEGAL_CONFIG_ID_REQUIRED');req(input.configVersion,'LEGAL_CONFIG_VERSION_REQUIRED');req(input.sourceAuthorityRef,'LEGAL_CONFIG_SOURCE_REQUIRED');
  pos(input.weeklyRequirementMs,'LEGAL_CONFIG_WEEKLY_REQUIREMENT_INVALID');pos(input.minimumPeriodWeeks,'LEGAL_CONFIG_MINIMUM_PERIOD_INVALID');
  if(typeof input.recoveryAllowed!=='boolean')fail('LEGAL_CONFIG_RECOVERY_FLAG_INVALID');
  nonneg(input.recoveryWindowWeeks,'LEGAL_CONFIG_RECOVERY_WINDOW_INVALID');
  if(!input.recoveryAllowed&&input.recoveryWindowWeeks!==0)fail('LEGAL_CONFIG_RECOVERY_WINDOW_FORBIDDEN');
  if(input.recoveryAllowed&&input.recoveryWindowWeeks===0)fail('LEGAL_CONFIG_RECOVERY_WINDOW_REQUIRED');
  return freeze({
    candidateVersion:LEGAL_CONFIGURATION_CANDIDATE_VERSION,...input,
    status:'LEGAL_APPROVAL_REQUIRED',legalBlueprintFinal:false,productionComplianceAuthority:false,certificateAuthority:false
  });
}

function assertCandidate(c){
  if(!c||c.candidateVersion!==1||c.status!=='LEGAL_APPROVAL_REQUIRED'||c.legalBlueprintFinal!==false||c.productionComplianceAuthority!==false||c.certificateAuthority!==false)fail('LEGAL_CONFIG_CANDIDATE_REQUIRED');
}
function assertEvidence(rows){
  if(!Array.isArray(rows))fail('LEGAL_CONFIG_WEEKLY_EVIDENCE_REQUIRED');
  const seen=new Set();
  return rows.map(row=>{
    if(!row||Object.keys(row).sort().join(',')!=='provenance,validatedLearningTimeMs,weekLabel')fail('LEGAL_CONFIG_WEEKLY_EVIDENCE_SHAPE_INVALID');
    req(row.weekLabel,'LEGAL_CONFIG_WEEK_LABEL_REQUIRED');nonneg(row.validatedLearningTimeMs,'LEGAL_CONFIG_WEEKLY_TIME_INVALID');
    if(seen.has(row.weekLabel))fail('LEGAL_CONFIG_DUPLICATE_WEEK');seen.add(row.weekLabel);
    if(!row.provenance||row.provenance.learningTimeLedgerVersion!==1||!Number.isInteger(row.provenance.learningTimeEntryCount)||row.provenance.learningTimeEntryCount<0)fail('LEGAL_CONFIG_PROVENANCE_INVALID');
    return freeze({weekLabel:row.weekLabel,validatedLearningTimeMs:row.validatedLearningTimeMs,provenance:freeze({...row.provenance})});
  }).sort((a,b)=>a.weekLabel.localeCompare(b.weekLabel));
}
export function evaluateLegalConfigurationSimulation({candidate,weeklyEvidence}){
  assertCandidate(candidate);const rows=assertEvidence(weeklyEvidence);
  const weeks=rows.map(row=>{
    const deficitMs=Math.max(0,candidate.weeklyRequirementMs-row.validatedLearningTimeMs);
    return freeze({
      weekLabel:row.weekLabel,validatedLearningTimeMs:row.validatedLearningTimeMs,requiredMs:candidate.weeklyRequirementMs,
      simulationStatus:deficitMs===0?'SIMULATED_MEETS_RULE':'SIMULATED_DEFICIT',deficitMs,
      recoveryEligibility:candidate.recoveryAllowed?'SIMULATED_RULE_ALLOWS_RECOVERY':'SIMULATED_RULE_DISALLOWS_RECOVERY',
      provenance:row.provenance,legalClaim:false
    });
  });
  const minimumPeriodObserved=rows.length>=candidate.minimumPeriodWeeks;
  return freeze({
    simulationVersion:1,configId:candidate.configId,configVersion:candidate.configVersion,
    status:'SIMULATION_ONLY_LEGAL_BLUEPRINT_REQUIRED',minimumPeriodObserved,weeks,
    totalValidatedLearningTimeMs:rows.reduce((s,r)=>s+r.validatedLearningTimeMs,0),
    totalDeficitMs:weeks.reduce((s,r)=>s+r.deficitMs,0),
    legalBlueprintFinal:false,productionComplianceAuthority:false,certificateAuthority:false,legalClaim:false
  });
}

export function requireFinalLegalBlueprint(){
  fail('LEGAL_BLUEPRINT_FINAL_REQUIRED');
}
