import assert from 'node:assert/strict';
import { buildEmployerLearnerView, EmployerOsError } from './employer-os.mjs';

const teacherView={
  teacherOsVersion:1,teacherId:'teacher',organisationId:'org-s8',learnerSubjectId:'learner-s8',lessonId:'L1',contentVersion:'v1',
  learnerStatus:'AWAITING_HUMAN_REVIEW',progress:{completedItems:4,totalItems:8,ratio:.5},validatedLearningTimeMs:120000,lastActivityTs:1000,
  skillProgress:[{skill:'secret-skill',state:'LEARNING'}],
  speakingReviewQueue:[{speakingEventId:'sp1',mediaRef:'media://private',evidenceClass:'pronunciation_validity'}],
  flags:[],missedLearning:{status:'DEFERRED_TO_COMPLIANCE_ENGINE'},assessmentEvidence:[{evidenceClass:'secret',attempts:2}],
  evidenceBinding:{masteryRuleVersion:'0.1',masteryReplayHeadSeq:10,learningTimeLedgerVersion:1,learningTimeEntryCount:3},
  rawLearnerResponsesExposed:false,xpExposed:false,gamificationExposed:false,certificateAuthority:false,legalAuthority:false,complianceRuleAuthority:false
};
const employer={employerId:'employer-s8',organisationId:'org-s8',role:'EMPLOYER'};
const validations=[
  {organisationId:'org-s8',learnerSubjectId:'learner-s8',lessonId:'L1',contentVersion:'v1',validationKind:'PERIODIC',decision:'VALID',validatedAt:100},
  {organisationId:'org-s8',learnerSubjectId:'learner-s8',lessonId:'L1',contentVersion:'v1',validationKind:'FINAL',decision:'RETRY',validatedAt:200}
];
const reports=[{reportId:'rep-1',type:'WEEKLY_PROGRESS',status:'AVAILABLE',periodLabel:'2026-W40',organisationId:'org-s8',learnerSubjectId:'learner-s8'}];
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof EmployerOsError&&e.code===code,code);

{
  const view=buildEmployerLearnerView({teacherView,teacherValidations:validations,reportIndex:reports,employer});
  assert.equal(view.learnerStatus,'IN_REVIEW');assert.equal(view.progress.ratio,.5);assert.equal(view.validatedLearningTimeMs,120000);
  assert.equal(view.weeklyStatus.status,'LEGAL_CONFIG_REQUIRED');assert.equal(view.deficitAlert.status,'LEGAL_CONFIG_REQUIRED');
  assert.equal(view.validations.total,2);assert.equal(view.validations.latestPeriodic.decision,'VALID');assert.equal(view.validations.latestFinal.decision,'RETRY');assert.equal(view.validations.finalValidated,false);
  assert.deepEqual(view.reportsAvailable,[{reportId:'rep-1',type:'WEEKLY_PROGRESS',status:'AVAILABLE',periodLabel:'2026-W40'}]);
  for(const field of ['learnerAnswerDetailExposed','skillPedagogyExposed','speakingMediaExposed','speakingReviewEvidenceExposed','xpExposed','gamificationExposed'])assert.equal(view[field],false);
  const serialized=JSON.stringify(view);
  assert.equal(serialized.includes('secret-skill'),false);assert.equal(serialized.includes('media://private'),false);assert.equal(serialized.includes('pronunciation_validity'),false);
  assert.equal(view.certificateAuthority,false);assert.equal(view.legalAuthority,false);assert.equal(view.complianceDecisionAuthority,false);
  assert.equal(Object.isFrozen(view),true);
}
{
  reject(()=>buildEmployerLearnerView({teacherView,teacherValidations:validations,reportIndex:reports,employer:{employerId:'foreign',organisationId:'foreign-org',role:'EMPLOYER'}}),'EMPLOYER_OS_CROSS_TENANT_FORBIDDEN');
  reject(()=>buildEmployerLearnerView({teacherView,teacherValidations:validations,reportIndex:reports,employer:{employerId:'teacher',organisationId:'org-s8',role:'TEACHER'}}),'EMPLOYER_OS_ROLE_FORBIDDEN');
}
{
  const foreign=[...validations,{organisationId:'foreign-org',learnerSubjectId:'learner-s8',lessonId:'L1',contentVersion:'v1',validationKind:'PERIODIC',decision:'VALID',validatedAt:300}];
  reject(()=>buildEmployerLearnerView({teacherView,teacherValidations:foreign,reportIndex:reports,employer}),'EMPLOYER_OS_CROSS_TENANT_VALIDATION_FORBIDDEN');
}
{
  const badReports=[{...reports[0],organisationId:'foreign-org'}];
  reject(()=>buildEmployerLearnerView({teacherView,teacherValidations:validations,reportIndex:badReports,employer}),'EMPLOYER_OS_REPORT_SCOPE_MISMATCH');
}
console.log('RPM_S8_EMPLOYER_OS_PASS employer-role-tenant-scoped enrolled-status progress validated-time validation-summary report-index privacy-minimized no-answer-skill-speaking-media-review-evidence-xp-gamification-leak weekly-deficit-legal-config-required no-certificate-legal-compliance-authority');
