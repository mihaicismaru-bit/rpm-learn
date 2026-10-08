export const LEGAL_CONFIGURATION_CANDIDATE_VERSION=1;
export class LegalConfigurationError extends Error{constructor(code){super(code);this.name='LegalConfigurationError';this.code=code;}}
const fail=code=>{throw new LegalConfigurationError(code);};
const freeze=v=>{if(!v||typeof v!=='object'||Object.isFrozen(v))return v;for(const x of Object.values(v))freeze(x);return Object.freeze(v);};
const req=(v,code)=>{if(typeof v!=='string'||!v.trim())fail(code);return v;};
const pos=(v,code)=>{if(!Number.isSafeInteger(v)||v<=0)fail(code);return v;};
const nonneg=(v,code)=>{if(!Number.isSafeInteger(v)||v<0)fail(code);return v;};
// Copy own plain-data fields once, before checking their values. Accessor getters
// can otherwise pass validation then change the simulated legal requirement.
function dataSnapshot(input,expected,code){
  if(!input||typeof input!=='object'||Array.isArray(input))fail(code);
  try{
    const proto=Object.getPrototypeOf(input);
    if(proto!==Object.prototype&&proto!==null)fail(code);
    const descriptors=Object.getOwnPropertyDescriptors(input);
    if(Object.keys(descriptors).sort().join(',')!==expected.sort().join(','))fail(code);
    const out=Object.create(null);
    for(const key of expected){
      const d=descriptors[key];
      if(!d||!Object.prototype.hasOwnProperty.call(d,'value'))fail(code);
      out[key]=d.value;
    }
    return out;
  }catch(error){if(error instanceof LegalConfigurationError)throw error;fail(code);}
}

export function buildLegalConfigurationCandidate(input){
  input=dataSnapshot(input,['configId','configVersion','weeklyRequirementMs','minimumPeriodWeeks','recoveryAllowed','recoveryWindowWeeks','sourceAuthorityRef'],'LEGAL_CONFIG_SHAPE_INVALID');
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
  c=dataSnapshot(c,['candidateVersion','configId','configVersion','weeklyRequirementMs','minimumPeriodWeeks','recoveryAllowed','recoveryWindowWeeks','sourceAuthorityRef','status','legalBlueprintFinal','productionComplianceAuthority','certificateAuthority'],'LEGAL_CONFIG_CANDIDATE_REQUIRED');
  if(c.candidateVersion!==1||c.status!=='LEGAL_APPROVAL_REQUIRED'||c.legalBlueprintFinal!==false||c.productionComplianceAuthority!==false||c.certificateAuthority!==false)fail('LEGAL_CONFIG_CANDIDATE_REQUIRED');
  const validated=buildLegalConfigurationCandidate({
    configId:c.configId,configVersion:c.configVersion,weeklyRequirementMs:c.weeklyRequirementMs,
    minimumPeriodWeeks:c.minimumPeriodWeeks,recoveryAllowed:c.recoveryAllowed,
    recoveryWindowWeeks:c.recoveryWindowWeeks,sourceAuthorityRef:c.sourceAuthorityRef
  });
  for(const key of Object.keys(validated))if(!Object.is(c[key],validated[key]))fail('LEGAL_CONFIG_CANDIDATE_REQUIRED');
  return validated;
}
const safeSum=(rows,project)=>{
  let total=0;for(const row of rows){
    total+=project(row);
    if(!Number.isSafeInteger(total))fail('LEGAL_CONFIG_TOTAL_OVERFLOW');
  }
  return total;
};
function assertEvidence(rows){
  if(!Array.isArray(rows))fail('LEGAL_CONFIG_WEEKLY_EVIDENCE_REQUIRED');
  // Array#map can be shadowed; sparse arrays can falsely satisfy minimumPeriodWeeks.
  // Capture the exact own-index descriptors before processing any evidence value.
  let source;
  try{
    if(Object.getPrototypeOf(rows)!==Array.prototype)fail('LEGAL_CONFIG_WEEKLY_EVIDENCE_SHAPE_INVALID');
    const n=rows.length;
    const own=Reflect.ownKeys(rows);
    if(own.length!==n+1||!own.includes('length'))fail('LEGAL_CONFIG_WEEKLY_EVIDENCE_SHAPE_INVALID');
    source=[];
    for(let i=0;i<n;i++){
      const d=Object.getOwnPropertyDescriptor(rows,String(i));
      if(!d||!Object.prototype.hasOwnProperty.call(d,'value'))fail('LEGAL_CONFIG_WEEKLY_EVIDENCE_SHAPE_INVALID');
      source.push(d.value);
    }
  }catch(error){if(error instanceof LegalConfigurationError)throw error;fail('LEGAL_CONFIG_WEEKLY_EVIDENCE_SHAPE_INVALID');}
  const seen=new Set();
  return source.map(row=>{
    row=dataSnapshot(row,['weekLabel','validatedLearningTimeMs','provenance'],'LEGAL_CONFIG_WEEKLY_EVIDENCE_SHAPE_INVALID');
    req(row.weekLabel,'LEGAL_CONFIG_WEEK_LABEL_REQUIRED');if(row.weekLabel!==row.weekLabel.trim()||row.weekLabel!==row.weekLabel.normalize('NFKC')||/[\p{Default_Ignorable_Code_Point}\p{Cc}]/u.test(row.weekLabel))fail('LEGAL_CONFIG_WEEK_LABEL_NOT_CANONICAL');nonneg(row.validatedLearningTimeMs,'LEGAL_CONFIG_WEEKLY_TIME_INVALID');
    if(seen.has(row.weekLabel))fail('LEGAL_CONFIG_DUPLICATE_WEEK');seen.add(row.weekLabel);
    row.provenance=dataSnapshot(row.provenance,['learningTimeEntryCount','learningTimeLedgerVersion'],'LEGAL_CONFIG_PROVENANCE_INVALID');
    if(row.provenance.learningTimeLedgerVersion!==1||!Number.isSafeInteger(row.provenance.learningTimeEntryCount)||row.provenance.learningTimeEntryCount<0)fail('LEGAL_CONFIG_PROVENANCE_INVALID');
    if(row.validatedLearningTimeMs>0&&row.provenance.learningTimeEntryCount===0)fail('LEGAL_CONFIG_UNSOURCED_TIME_FORBIDDEN');
    return freeze({weekLabel:row.weekLabel,validatedLearningTimeMs:row.validatedLearningTimeMs,provenance:freeze({...row.provenance})});
  }).sort((a,b)=>a.weekLabel<b.weekLabel?-1:a.weekLabel>b.weekLabel?1:0);
}
export function evaluateLegalConfigurationSimulation(payload){
  // The top-level request is also an untrusted boundary: never invoke its accessors.
  const {candidate:sourceCandidate,weeklyEvidence}=dataSnapshot(payload,['candidate','weeklyEvidence'],'LEGAL_CONFIG_SIMULATION_INPUT_INVALID');
  const candidate=assertCandidate(sourceCandidate);const rows=assertEvidence(weeklyEvidence);
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
    totalValidatedLearningTimeMs:safeSum(rows,r=>r.validatedLearningTimeMs),
    totalDeficitMs:safeSum(weeks,r=>r.deficitMs),
    legalBlueprintFinal:false,productionComplianceAuthority:false,certificateAuthority:false,legalClaim:false
  });
}

export function requireFinalLegalBlueprint(){
  fail('LEGAL_BLUEPRINT_FINAL_REQUIRED');
}
