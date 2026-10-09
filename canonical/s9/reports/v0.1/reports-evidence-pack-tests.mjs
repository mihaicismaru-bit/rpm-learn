import assert from 'node:assert/strict';
import {buildReportsEvidencePack,ReportsEvidenceError} from './reports-evidence-pack.mjs';

const teacher={
  teacherOsVersion:1,teacherId:'teacher-s9',organisationId:'org-s9',learnerSubjectId:'learner-s9',lessonId:'L1',contentVersion:'v1',
  learnerStatus:'COMPLETED',progress:{completedItems:8,totalItems:8,ratio:1},validatedLearningTimeMs:180000,lastActivityTs:1000,
  skillProgress:[{skill:'private-skill'}],speakingReviewQueue:[{mediaRef:'private-media'}],flags:[],assessmentEvidence:[{raw:'private-answer'}],
  evidenceBinding:{masteryRuleVersion:'0.1',masteryReplayHeadSeq:42,learningTimeLedgerVersion:1,learningTimeEntryCount:7},
  rawLearnerResponsesExposed:false,xpExposed:false,gamificationExposed:false,certificateAuthority:false,legalAuthority:false,complianceRuleAuthority:false
};
const employer={
  employerOsVersion:1,employerId:'employer-s9',organisationId:'org-s9',learnerSubjectId:'learner-s9',enrollmentStatus:'ENROLLED',learnerStatus:'COMPLETED',
  progress:{completedItems:8,totalItems:8,ratio:1},validatedLearningTimeMs:180000,weeklyStatus:{status:'LEGAL_CONFIG_REQUIRED'},deficitAlert:{status:'LEGAL_CONFIG_REQUIRED'},validations:{},reportsAvailable:[],
  learnerAnswerDetailExposed:false,skillPedagogyExposed:false,speakingMediaExposed:false,speakingReviewEvidenceExposed:false,xpExposed:false,gamificationExposed:false,
  certificateAuthority:false,legalAuthority:false,complianceDecisionAuthority:false
};
const validation=(kind,decision,at,pending=0)=>({
  teacherValidationVersion:1,validationId:`val-${kind}-${at}`,clientValidationId:`client-${kind}-${at}`,validationKind:kind,decision,teacherId:'teacher-s9',
  organisationId:'org-s9',learnerSubjectId:'learner-s9',lessonId:'L1',contentVersion:'v1',validatedAt:at,masteryRuleVersion:'0.1',
  masteryReplayHeadSeq:42,learningTimeLedgerVersion:1,learningTimeEntryCount:7,validatedLearningTimeMs:180000,speakingPendingCount:pending,
  certificateAuthority:false,legalAuthority:false,complianceAuthority:false
});
const rows=[validation('PERIODIC','VALID',100),validation('FINAL','VALID',200)];
const period={weekLabel:'2026-W40',monthLabel:'2026-10',generatedAt:300};
const build=(patch={})=>buildReportsEvidencePack({teacherView:structuredClone(patch.teacher??teacher),employerView:structuredClone(patch.employer??employer),teacherValidations:structuredClone(patch.rows??rows),period:structuredClone(patch.period??period)});
const reject=(patch,code)=>assert.throws(()=>build(patch),e=>e instanceof ReportsEvidenceError&&e.code===code,code);

{
  const a=build(),b=build();assert.deepEqual(a,b);assert.equal(Object.isFrozen(a),true);
  assert.equal(a.weeklyProgressRecord.reportType,'WEEKLY_PROGRESS_RECORD');assert.equal(a.monthlyProgressReport.reportType,'MONTHLY_PROGRESS_REPORT');
  assert.equal(a.finalLearningPathReport.status,'TEACHER_VALIDATED');assert.equal(a.employerEvidencePack.validationSummary.finalValidated,true);
  for(const x of [a.weeklyProgressRecord.compliance,a.monthlyProgressReport.compliance,a.employerEvidencePack.compliance,a.syntheticComplianceReport]){
    assert.equal(x.status,'LEGAL_CONFIG_REQUIRED');assert.equal(x.compliant,null);assert.equal(x.deficitMs,null);assert.equal(x.rule,'S10_LEGAL_CONFIGURATION_REQUIRED');
  }
  const employerJson=JSON.stringify(a.employerEvidencePack);
  for(const secret of ['private-skill','private-media','private-answer','teacher-s9'])assert.equal(employerJson.includes(secret),false,secret);
  assert.deepEqual(a.weeklyProgressRecord.provenance.validationIds,['val-PERIODIC-100','val-FINAL-200']);
  assert.equal(a.certificateAuthority,false);assert.equal(a.legalAuthority,false);assert.equal(a.complianceDecisionAuthority,false);
}
{
  const pending=build({rows:[rows[0]]});assert.equal(pending.finalLearningPathReport.status,'HUMAN_VALIDATION_REQUIRED');
  const retry=build({rows:[rows[0],validation('FINAL','RETRY',201)]});assert.equal(retry.finalLearningPathReport.status,'HUMAN_VALIDATION_REQUIRED');
}
{
  const bad=structuredClone(employer);bad.organisationId='foreign';reject({employer:bad},'REPORTS_EMPLOYER_SCOPE_MISMATCH');
  const time=structuredClone(employer);time.validatedLearningTimeMs=180001;reject({employer:time},'REPORTS_VALIDATED_TIME_MISMATCH');
  const privacy=structuredClone(employer);privacy.skillPedagogyExposed=true;reject({employer:privacy},'REPORTS_EMPLOYER_PRIVACY_CONTAMINATION');
  const xp=structuredClone(teacher);xp.xpExposed=true;reject({teacher:xp},'REPORTS_TEACHER_PRIVACY_CONTAMINATION');
}
{
  const foreign=validation('PERIODIC','VALID',101);foreign.organisationId='foreign';reject({rows:[foreign]},'REPORTS_VALIDATION_SCOPE_MISMATCH');
  const authority=validation('PERIODIC','VALID',102);authority.certificateAuthority=true;reject({rows:[authority]},'REPORTS_VALIDATION_AUTHORITY_CONTAMINATION');
  const future=validation('PERIODIC','VALID',103);future.validatedLearningTimeMs=180001;reject({rows:[future]},'REPORTS_VALIDATION_FUTURE_TIME_EVIDENCE');
}
console.log('RPM_S9_REPORTS_EVIDENCE_PACK_PASS deterministic stored-evidence-only weekly-monthly-teacher-validation-final-path employer-pack privacy-minimized provenance-bound legal-compliance-deferred final-human-validation no-xp-validtime-certificate-legal-authority');
