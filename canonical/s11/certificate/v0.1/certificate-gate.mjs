export const CERTIFICATE_GATE_VERSION=1;
export class CertificateGateError extends Error{constructor(code){super(code);this.name='CertificateGateError';this.code=code;}}
const fail=code=>{throw new CertificateGateError(code);};
const freeze=v=>{if(!v||typeof v!=='object'||Object.isFrozen(v))return v;for(const x of Object.values(v))freeze(x);return Object.freeze(v);};
const req=(v,code)=>{if(typeof v!=='string'||!v.trim())fail(code);return v;};
const exact=(v,keys,code)=>{if(!v||typeof v!=='object'||Array.isArray(v))fail(code);const a=Object.keys(v).sort(),b=[...keys].sort();if(a.length!==b.length||a.some((x,i)=>x!==b[i]))fail(code);return v;};

function assertReports(pack){
  if(pack?.reportsEvidenceVersion!==1)fail('CERTIFICATE_REPORTS_REQUIRED');
  if(pack.certificateAuthority!==false||pack.legalAuthority!==false||pack.complianceDecisionAuthority!==false)fail('CERTIFICATE_REPORT_AUTHORITY_CONTAMINATION');
  const final=pack.finalLearningPathReport;
  if(!final||final.reportVersion!==1||final.reportType!=='FINAL_LEARNING_PATH_REPORT')fail('CERTIFICATE_FINAL_REPORT_REQUIRED');
  req(final.organisationId,'CERTIFICATE_ORGANISATION_REQUIRED');
  req(final.learnerSubjectId,'CERTIFICATE_LEARNER_REQUIRED');
  if(final.certificateAuthority!==false||final.legalAuthority!==false||final.complianceDecisionAuthority!==false)fail('CERTIFICATE_FINAL_REPORT_AUTHORITY_CONTAMINATION');
  if(final.status!=='TEACHER_VALIDATED')fail('CERTIFICATE_HUMAN_FINAL_VALIDATION_REQUIRED');
  if(!final.finalValidation||final.finalValidation.validationKind!=='FINAL'||final.finalValidation.decision!=='VALID'||final.finalValidation.speakingPendingCount!==0)fail('CERTIFICATE_FINAL_VALIDATION_INVALID');
  return final;
}

function assertLegalSimulation(sim){
  if(!sim||sim.simulationVersion!==1)fail('CERTIFICATE_S10_SIMULATION_REQUIRED');
  if(sim.legalClaim!==false||sim.productionComplianceAuthority!==false||sim.certificateAuthority!==false||sim.legalBlueprintFinal!==false)fail('CERTIFICATE_S10_AUTHORITY_CONTAMINATION');
  if(sim.weekAttributionAuthority!==false||sim.weekAttributionStatus!=='UNVERIFIED_SIMULATION_INPUT')fail('CERTIFICATE_WEEK_ATTRIBUTION_MUST_BE_UNVERIFIED');
  if(sim.sourceProvenance!=='S6_REPLAY_VALIDATED')fail('CERTIFICATE_S6_PROVENANCE_REQUIRED');
  req(sim.subjectId,'CERTIFICATE_S10_SUBJECT_REQUIRED');
  req(sim.organisationId,'CERTIFICATE_S10_ORGANISATION_REQUIRED');
  return sim;
}

export function buildCertificateGateCandidate({reportsEvidencePack,legalSimulation}){
  const final=assertReports(reportsEvidencePack);
  const legal=assertLegalSimulation(legalSimulation);
  if(final.learnerSubjectId!==legal.subjectId||final.organisationId!==legal.organisationId)fail('CERTIFICATE_SCOPE_MISMATCH');
  const provenance=final.provenance;
  if(!provenance||!Array.isArray(provenance.validationIds)||!provenance.validationIds.includes(final.finalValidation.validationId))fail('CERTIFICATE_FINAL_VALIDATION_PROVENANCE_MISSING');
  return freeze({
    certificateGateVersion:CERTIFICATE_GATE_VERSION,
    organisationId:final.organisationId,
    learnerSubjectId:final.learnerSubjectId,
    lessonId:req(final.provenance.lessonId,'CERTIFICATE_LESSON_REQUIRED'),
    contentVersion:req(final.provenance.contentVersion,'CERTIFICATE_CONTENT_VERSION_REQUIRED'),
    finalValidationId:req(final.finalValidation.validationId,'CERTIFICATE_VALIDATION_ID_REQUIRED'),
    validatedLearningTimeMs:final.validatedLearningTimeMs,
    status:'LEGAL_APPROVAL_REQUIRED',
    eligibility:'TECHNICAL_EVIDENCE_READY',
    legalBlueprintFinal:false,
    weekAttributionAuthority:false,
    certificateIssuanceAuthority:false,
    autoIssued:false,
    certificateId:null,
    issuedAt:null
  });
}

export function requireCertificateIssuance(){
  fail('CERTIFICATE_FINAL_LEGAL_APPROVAL_REQUIRED');
}
