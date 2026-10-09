import assert from 'node:assert/strict';
import { buildEmployerLearnerView, EmployerOsError } from './employer-os.mjs';

const baseTeacherView={
  teacherOsVersion:1,teacherId:'teacher',organisationId:'org-s8',learnerSubjectId:'learner-s8',lessonId:'L1',contentVersion:'v1',
  learnerStatus:'IN_PROGRESS',progress:{completedItems:2,totalItems:4,ratio:.5},validatedLearningTimeMs:90000,lastActivityTs:1000,
  skillProgress:[{skill:'private-skill',state:'LEARNING'}],speakingReviewQueue:[{mediaRef:'private-media'}],flags:[],missedLearning:{status:'DEFERRED_TO_COMPLIANCE_ENGINE'},assessmentEvidence:[{raw:'private'}],evidenceBinding:{},
  rawLearnerResponsesExposed:false,xpExposed:false,gamificationExposed:false,certificateAuthority:false,legalAuthority:false,complianceRuleAuthority:false
};
const employer={employerId:'employer-s8',organisationId:'org-s8',role:'EMPLOYER'};
const validations=[{organisationId:'org-s8',learnerSubjectId:'learner-s8',lessonId:'L1',contentVersion:'v1',validationKind:'PERIODIC',decision:'VALID',validatedAt:100}];
const reject=(teacherPatch,code,validationPatch=null)=>assert.throws(()=>{
  const teacherView=structuredClone(baseTeacherView);
  Object.assign(teacherView,teacherPatch);
  const teacherValidations=validationPatch?[{...validations[0],...validationPatch}]:validations;
  buildEmployerLearnerView({teacherView,teacherValidations,reportIndex:[],employer});
},e=>e instanceof EmployerOsError&&e.code===code,code);

{
  const a=buildEmployerLearnerView({teacherView:structuredClone(baseTeacherView),teacherValidations:structuredClone(validations),reportIndex:[],employer});
  const b=buildEmployerLearnerView({teacherView:structuredClone(baseTeacherView),teacherValidations:structuredClone(validations),reportIndex:[],employer});
  assert.deepEqual(a,b);
  const s=JSON.stringify(a);
  for(const secret of ['private-skill','private-media','"raw":"private"'])assert.equal(s.includes(secret),false,secret);
}
reject({progress:{completedItems:2,totalItems:4,ratio:.5,extra:true}},'EMPLOYER_OS_PROGRESS_SHAPE_INVALID');
reject({progress:{completedItems:5,totalItems:4,ratio:1}},'EMPLOYER_OS_PROGRESS_INVALID');
reject({progress:{completedItems:1.5,totalItems:4,ratio:.375}},'EMPLOYER_OS_PROGRESS_INVALID');
reject({progress:{completedItems:2,totalItems:4,ratio:.6}},'EMPLOYER_OS_PROGRESS_RATIO_INVALID');
reject({progress:{completedItems:0,totalItems:0,ratio:.1}},'EMPLOYER_OS_PROGRESS_RATIO_INVALID');
reject({validatedLearningTimeMs:-1},'EMPLOYER_OS_VALIDATED_TIME_INVALID');
reject({validatedLearningTimeMs:1.25},'EMPLOYER_OS_VALIDATED_TIME_INVALID');
reject({rawLearnerResponsesExposed:true},'EMPLOYER_OS_UPSTREAM_PRIVACY_CONTAMINATION');
reject({xpExposed:true},'EMPLOYER_OS_UPSTREAM_PRIVACY_CONTAMINATION');
reject({gamificationExposed:true},'EMPLOYER_OS_UPSTREAM_PRIVACY_CONTAMINATION');
reject({certificateAuthority:true},'EMPLOYER_OS_UPSTREAM_AUTHORITY_CONTAMINATION');
reject({},'EMPLOYER_OS_VALIDATION_RECORD_INVALID',{validatedAt:-1});
reject({},'EMPLOYER_OS_VALIDATION_RECORD_INVALID',{validatedAt:Number.NaN});
reject({lessonId:''},'EMPLOYER_OS_STRING_REQUIRED');
reject({contentVersion:''},'EMPLOYER_OS_STRING_REQUIRED');
console.log('RPM_S8_EMPLOYER_OS_HARDENING_PASS deterministic-view progress-shape-arithmetic validated-time-nonnegative upstream-privacy-authority-fail-closed validation-time-finite private-teacher-fields-stripped');
