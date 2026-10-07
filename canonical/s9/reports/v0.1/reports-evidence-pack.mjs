export const REPORTS_EVIDENCE_VERSION=1;
export class ReportsEvidenceError extends Error{constructor(code){super(code);this.name='ReportsEvidenceError';this.code=code;}}
const fail=code=>{throw new ReportsEvidenceError(code);};
const freeze=v=>{if(!v||typeof v!=='object'||Object.isFrozen(v))return v;for(const x of Object.values(v))freeze(x);return Object.freeze(v);};
const req=(v,code)=>{if(typeof v!=='string'||!v.trim())fail(code);return v;};
const nonneg=(v,code)=>{if(!Number.isInteger(v)||v<0)fail(code);return v;};
const progress=p=>{
  if(!p||Object.keys(p).sort().join(',')!=='completedItems,ratio,totalItems')fail('REPORTS_PROGRESS_SHAPE_INVALID');
  nonneg(p.completedItems,'REPORTS_PROGRESS_INVALID');nonneg(p.totalItems,'REPORTS_PROGRESS_INVALID');
  if(p.completedItems>p.totalItems)fail('REPORTS_PROGRESS_INVALID');
  const ratio=p.totalItems?p.completedItems/p.totalItems:0;
  if(typeof p.ratio!=='number'||!Number.isFinite(p.ratio)||Math.abs(p.ratio-ratio)>Number.EPSILON*8)fail('REPORTS_PROGRESS_INVALID');
  return freeze({completedItems:p.completedItems,totalItems:p.totalItems,ratio:p.ratio});
};
const deferred=()=>freeze({status:'LEGAL_CONFIG_REQUIRED',compliant:null,deficitMs:null,recoveryStatus:null,rule:'S10_LEGAL_CONFIGURATION_REQUIRED'});
function validateInputs(t,e,p){
  if(t?.teacherOsVersion!==1)fail('REPORTS_TEACHER_VIEW_REQUIRED');
  if(e?.employerOsVersion!==1)fail('REPORTS_EMPLOYER_VIEW_REQUIRED');
  for(const k of ['organisationId','learnerSubjectId','lessonId','contentVersion'])req(t[k],'REPORTS_TEACHER_SCOPE_INVALID');
  if(e.organisationId!==t.organisationId||e.learnerSubjectId!==t.learnerSubjectId)fail('REPORTS_EMPLOYER_SCOPE_MISMATCH');
  const tp=progress(t.progress),ep=progress(e.progress);
  if(JSON.stringify(tp)!==JSON.stringify(ep))fail('REPORTS_PROGRESS_MISMATCH');
  nonneg(t.validatedLearningTimeMs,'REPORTS_VALIDATED_TIME_INVALID');nonneg(e.validatedLearningTimeMs,'REPORTS_VALIDATED_TIME_INVALID');
  if(t.validatedLearningTimeMs!==e.validatedLearningTimeMs)fail('REPORTS_VALIDATED_TIME_MISMATCH');
  if(t.rawLearnerResponsesExposed!==false||t.xpExposed!==false||t.gamificationExposed!==false)fail('REPORTS_TEACHER_PRIVACY_CONTAMINATION');
  for(const k of ['learnerAnswerDetailExposed','skillPedagogyExposed','speakingMediaExposed','speakingReviewEvidenceExposed','xpExposed','gamificationExposed'])if(e[k]!==false)fail('REPORTS_EMPLOYER_PRIVACY_CONTAMINATION');
  if(t.certificateAuthority!==false||t.legalAuthority!==false||t.complianceRuleAuthority!==false)fail('REPORTS_TEACHER_AUTHORITY_CONTAMINATION');
  if(e.certificateAuthority!==false||e.legalAuthority!==false||e.complianceDecisionAuthority!==false)fail('REPORTS_EMPLOYER_AUTHORITY_CONTAMINATION');
  if(!p||Object.keys(p).sort().join(',')!=='generatedAt,monthLabel,weekLabel')fail('REPORTS_PERIOD_SHAPE_INVALID');
  req(p.weekLabel,'REPORTS_PERIOD_INVALID');req(p.monthLabel,'REPORTS_PERIOD_INVALID');nonneg(p.generatedAt,'REPORTS_PERIOD_INVALID');
  const b=t.evidenceBinding;if(!b)fail('REPORTS_PROVENANCE_REQUIRED');
  req(b.masteryRuleVersion,'REPORTS_PROVENANCE_INVALID');
  for(const k of ['masteryReplayHeadSeq','learningTimeLedgerVersion','learningTimeEntryCount'])nonneg(b[k],'REPORTS_PROVENANCE_INVALID');
  return tp;
}
function validations(rows,t){
  if(!Array.isArray(rows))fail('REPORTS_VALIDATIONS_REQUIRED');
  return rows.map(r=>{
    if(r?.teacherValidationVersion!==1||!['PERIODIC','FINAL'].includes(r.validationKind)||!['VALID','RETRY','NEEDS_SUPPORT'].includes(r.decision))fail('REPORTS_VALIDATION_INVALID');
    if(r.organisationId!==t.organisationId||r.learnerSubjectId!==t.learnerSubjectId||r.lessonId!==t.lessonId||r.contentVersion!==t.contentVersion)fail('REPORTS_VALIDATION_SCOPE_MISMATCH');
    if(r.certificateAuthority!==false||r.legalAuthority!==false||r.complianceAuthority!==false)fail('REPORTS_VALIDATION_AUTHORITY_CONTAMINATION');
    for(const k of ['validatedAt','masteryReplayHeadSeq','learningTimeLedgerVersion','learningTimeEntryCount','validatedLearningTimeMs','speakingPendingCount'])nonneg(r[k],'REPORTS_VALIDATION_NUMERIC_INVALID');
    if(r.validatedLearningTimeMs>t.validatedLearningTimeMs)fail('REPORTS_VALIDATION_FUTURE_TIME_EVIDENCE');
    return freeze({validationId:req(r.validationId,'REPORTS_VALIDATION_ID_INVALID'),validationKind:r.validationKind,decision:r.decision,teacherId:req(r.teacherId,'REPORTS_VALIDATION_TEACHER_INVALID'),validatedAt:r.validatedAt,validatedLearningTimeMs:r.validatedLearningTimeMs,speakingPendingCount:r.speakingPendingCount});
  }).sort((a,b)=>a.validatedAt-b.validatedAt||a.validationId.localeCompare(b.validationId));
}
export function buildReportsEvidencePack({teacherView,employerView,teacherValidations=[],period}){
  const p=validateInputs(teacherView,employerView,period),v=validations(teacherValidations,teacherView);
  const final=[...v].reverse().find(x=>x.validationKind==='FINAL')||null;
  const finalValidated=teacherView.learnerStatus==='COMPLETED'&&final?.decision==='VALID'&&final.speakingPendingCount===0;
  const provenance=freeze({lessonId:teacherView.lessonId,contentVersion:teacherView.contentVersion,masteryRuleVersion:teacherView.evidenceBinding.masteryRuleVersion,masteryReplayHeadSeq:teacherView.evidenceBinding.masteryReplayHeadSeq,learningTimeLedgerVersion:teacherView.evidenceBinding.learningTimeLedgerVersion,learningTimeEntryCount:teacherView.evidenceBinding.learningTimeEntryCount,validationIds:v.map(x=>x.validationId)});
  const base=()=>({organisationId:teacherView.organisationId,learnerSubjectId:teacherView.learnerSubjectId,learnerStatus:employerView.learnerStatus,progress:p,validatedLearningTimeMs:teacherView.validatedLearningTimeMs,provenance,certificateAuthority:false,legalAuthority:false,complianceDecisionAuthority:false});
  const weekly=freeze({reportVersion:1,reportType:'WEEKLY_PROGRESS_RECORD',periodLabel:period.weekLabel,...base(),compliance:deferred()});
  const monthly=freeze({reportVersion:1,reportType:'MONTHLY_PROGRESS_REPORT',periodLabel:period.monthLabel,...base(),validationCount:v.length,compliance:deferred()});
  const finalReport=freeze({reportVersion:1,reportType:'FINAL_LEARNING_PATH_REPORT',status:finalValidated?'TEACHER_VALIDATED':'HUMAN_VALIDATION_REQUIRED',...base(),finalValidation:final});
  const employerPack=freeze({packVersion:1,packType:'EMPLOYER_EVIDENCE_PACK',enrollmentStatus:employerView.enrollmentStatus,...base(),validationSummary:freeze({total:v.length,finalValidated}),learnerAnswerDetailExposed:false,skillPedagogyExposed:false,speakingMediaExposed:false,speakingReviewEvidenceExposed:false,xpExposed:false,gamificationExposed:false,compliance:deferred()});
  return freeze({reportsEvidenceVersion:REPORTS_EVIDENCE_VERSION,generatedAt:period.generatedAt,weeklyProgressRecord:weekly,monthlyProgressReport:monthly,teacherValidationRecords:v,finalLearningPathReport:finalReport,employerEvidencePack:employerPack,syntheticComplianceReport:deferred(),certificateAuthority:false,legalAuthority:false,complianceDecisionAuthority:false});
}
