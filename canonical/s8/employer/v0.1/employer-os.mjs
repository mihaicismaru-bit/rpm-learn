export const EMPLOYER_OS_VERSION=1;

export class EmployerOsError extends Error{
  constructor(code,detail={}){super(code);this.name='EmployerOsError';this.code=code;this.detail=detail;}
}
const fail=(code,detail={})=>{throw new EmployerOsError(code,detail);};
const freeze=value=>{if(!value||typeof value!=='object'||Object.isFrozen(value))return value;for(const child of Object.values(value))freeze(child);return Object.freeze(value);};
const req=(value,field,max=512)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail('EMPLOYER_OS_STRING_REQUIRED',{field,max});return value;};
const exactKeys=(value,expected,code)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(code);const a=Object.keys(value).sort(),w=[...expected].sort();if(a.length!==w.length||a.some((k,i)=>k!==w[i]))fail(code,{actual:a,expected:w});};

function assertEmployer(employer){
  exactKeys(employer,['employerId','organisationId','role'],'EMPLOYER_OS_EMPLOYER_SHAPE_INVALID');
  req(employer.employerId,'employer.employerId',256);req(employer.organisationId,'employer.organisationId',256);
  if(employer.role!=='EMPLOYER')fail('EMPLOYER_OS_ROLE_FORBIDDEN',{role:employer.role??null});
  return freeze({...employer});
}
function assertTeacherView(teacherView,safeEmployer){
  if(!teacherView||teacherView.teacherOsVersion!==1)fail('EMPLOYER_OS_TEACHER_VIEW_REQUIRED');
  req(teacherView.organisationId,'teacherView.organisationId',256);req(teacherView.learnerSubjectId,'teacherView.learnerSubjectId',256);req(teacherView.lessonId,'teacherView.lessonId',256);req(teacherView.contentVersion,'teacherView.contentVersion',256);
  if(teacherView.organisationId!==safeEmployer.organisationId)fail('EMPLOYER_OS_CROSS_TENANT_FORBIDDEN');
  exactKeys(teacherView.progress,['completedItems','totalItems','ratio'],'EMPLOYER_OS_PROGRESS_SHAPE_INVALID');
  const {completedItems,totalItems,ratio}=teacherView.progress;
  if(!Number.isInteger(completedItems)||!Number.isInteger(totalItems)||completedItems<0||totalItems<0||completedItems>totalItems)fail('EMPLOYER_OS_PROGRESS_INVALID');
  const expectedRatio=totalItems===0?0:completedItems/totalItems;
  if(typeof ratio!=='number'||!Number.isFinite(ratio)||ratio<0||ratio>1||Math.abs(ratio-expectedRatio)>Number.EPSILON*8)fail('EMPLOYER_OS_PROGRESS_RATIO_INVALID');
  if(!Number.isInteger(teacherView.validatedLearningTimeMs)||teacherView.validatedLearningTimeMs<0)fail('EMPLOYER_OS_VALIDATED_TIME_INVALID');
  if(teacherView.rawLearnerResponsesExposed!==false||teacherView.xpExposed!==false||teacherView.gamificationExposed!==false)fail('EMPLOYER_OS_UPSTREAM_PRIVACY_CONTAMINATION');
  if(teacherView.certificateAuthority!==false||teacherView.legalAuthority!==false||teacherView.complianceRuleAuthority!==false)fail('EMPLOYER_OS_UPSTREAM_AUTHORITY_CONTAMINATION');
  return teacherView;
}
function operationalStatus(status){
  if(status==='COMPLETED')return 'COMPLETED';
  if(status==='AWAITING_HUMAN_REVIEW')return 'IN_REVIEW';
  if(status==='REVIEW_RESOLVED_PATH_PENDING'||status==='IN_PROGRESS')return 'IN_PROGRESS';
  return 'UNKNOWN';
}
function validationSummary(records,teacherView){
  if(!Array.isArray(records))fail('EMPLOYER_OS_VALIDATIONS_REQUIRED');
  const matching=records.filter(record=>record?.organisationId===teacherView.organisationId&&record?.learnerSubjectId===teacherView.learnerSubjectId&&record?.lessonId===teacherView.lessonId&&record?.contentVersion===teacherView.contentVersion);
  const foreign=records.filter(record=>record?.learnerSubjectId===teacherView.learnerSubjectId&&record?.organisationId!==teacherView.organisationId);
  if(foreign.length)fail('EMPLOYER_OS_CROSS_TENANT_VALIDATION_FORBIDDEN');
  const safe=matching.map(record=>{
    if(!['PERIODIC','FINAL'].includes(record.validationKind)||!['VALID','RETRY','NEEDS_SUPPORT'].includes(record.decision)||!Number.isFinite(record.validatedAt)||record.validatedAt<0)fail('EMPLOYER_OS_VALIDATION_RECORD_INVALID');
    return {validationKind:record.validationKind,decision:record.decision,validatedAt:record.validatedAt};
  }).sort((a,b)=>a.validatedAt-b.validatedAt||a.validationKind.localeCompare(b.validationKind));
  const latest=kind=>[...safe].reverse().find(record=>record.validationKind===kind)||null;
  return freeze({
    total:safe.length,
    latestPeriodic:latest('PERIODIC'),
    latestFinal:latest('FINAL'),
    finalValidated:latest('FINAL')?.decision==='VALID'
  });
}
function safeReports(reportIndex,organisationId,learnerSubjectId){
  if(!Array.isArray(reportIndex))fail('EMPLOYER_OS_REPORT_INDEX_REQUIRED');
  return reportIndex.map(report=>{
    exactKeys(report,['reportId','type','status','periodLabel','organisationId','learnerSubjectId'],'EMPLOYER_OS_REPORT_SHAPE_INVALID');
    if(report.organisationId!==organisationId||report.learnerSubjectId!==learnerSubjectId)fail('EMPLOYER_OS_REPORT_SCOPE_MISMATCH');
    req(report.reportId,'report.reportId',256);req(report.type,'report.type',128);req(report.status,'report.status',64);req(report.periodLabel,'report.periodLabel',128);
    return freeze({reportId:report.reportId,type:report.type,status:report.status,periodLabel:report.periodLabel});
  }).sort((a,b)=>a.reportId.localeCompare(b.reportId));
}

export function buildEmployerLearnerView({teacherView,teacherValidations=[],reportIndex=[],employer}){
  const safeEmployer=assertEmployer(employer);
  assertTeacherView(teacherView,safeEmployer);
  const validations=validationSummary(teacherValidations,teacherView);
  const reports=safeReports(reportIndex,safeEmployer.organisationId,teacherView.learnerSubjectId);
  return freeze({
    employerOsVersion:EMPLOYER_OS_VERSION,
    employerId:safeEmployer.employerId,
    organisationId:safeEmployer.organisationId,
    learnerSubjectId:teacherView.learnerSubjectId,
    enrollmentStatus:'ENROLLED',
    learnerStatus:operationalStatus(teacherView.learnerStatus),
    progress:freeze({
      completedItems:teacherView.progress.completedItems,
      totalItems:teacherView.progress.totalItems,
      ratio:teacherView.progress.ratio
    }),
    validatedLearningTimeMs:teacherView.validatedLearningTimeMs,
    weeklyStatus:freeze({status:'LEGAL_CONFIG_REQUIRED',compliant:null,rule:'S10_LEGAL_CONFIGURATION_REQUIRED'}),
    deficitAlert:freeze({status:'LEGAL_CONFIG_REQUIRED',deficitMs:null,rule:'S10_LEGAL_CONFIGURATION_REQUIRED'}),
    validations,
    reportsAvailable:reports,
    learnerAnswerDetailExposed:false,
    skillPedagogyExposed:false,
    speakingMediaExposed:false,
    speakingReviewEvidenceExposed:false,
    xpExposed:false,
    gamificationExposed:false,
    certificateAuthority:false,
    legalAuthority:false,
    complianceDecisionAuthority:false
  });
}
