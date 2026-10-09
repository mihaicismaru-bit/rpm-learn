import assert from 'node:assert/strict';
import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { LessonPlayerSessionController } from '../../../s3/lesson-player/v0.1/session-controller.mjs';
import { S3MemoryEventStore, correctLessonResponse } from '../../../s3/lesson-player/v0.1/s3-test-support.mjs';
import { createSpeakingSubmissionService } from '../../../s4/speaking/v0.1/speaking-submission.mjs';
import { createHumanReviewBridgeService } from '../../../s4/review/v0.1/human-review-bridge.mjs';
import { deriveMasterySnapshot } from '../../../s5/mastery/v0.1/mastery-engine.mjs';
import { buildValidatedLearningTimeLedger } from '../../../s6/time/v0.1/validated-learning-time-ledger.mjs';
import { TeacherOsError, buildTeacherLearnerView, createTeacherValidationService } from './teacher-os.mjs';

const learnerScope={subjectId:'learner-s7',organisationId:'org-s7',role:'LEARNER'};
const teacher={teacherId:'teacher-s7',organisationId:'org-s7',role:'TEACHER'};
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof TeacherOsError&&e.code===code,code);
const rejectAsync=(p,code)=>assert.rejects(p,e=>e instanceof TeacherOsError&&e.code===code,code);
class Store{
  constructor(kind='reviews'){this.rows=[];this.kind=kind;}
  async open(){}
  async listReviews(){return this.rows.map(x=>structuredClone(x));}
  async appendReview(r){this.rows.push(structuredClone(r));return {status:'appended'};}
  async listValidations(){return this.rows.map(x=>structuredClone(x));}
  async appendValidation(r){this.rows.push(structuredClone(r));return {status:'appended'};}
}
async function speakingFixture(){
  const eventStore=new S3MemoryEventStore();let tick=1000;
  const controller=new LessonPlayerSessionController({lesson,eventStore,scope:learnerScope,sessionId:'s7',now:()=>tick+=1000});
  let view=await controller.start();
  while(view.currentItem&&view.currentItem.id!=='E06')view=await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  const speaking=createSpeakingSubmissionService({lesson,eventStore,scope:learnerScope,sessionId:'s7-speaking',now:()=>tick+=1000});
  await speaking.submit({itemId:'E06',mediaRef:'media://s7/e06',clientSubmissionId:'s7-sub'});
  const mastery=deriveMasterySnapshot({lesson,events:eventStore.events,humanReviews:[]});
  const time=buildValidatedLearningTimeLedger({lesson,events:eventStore.events});
  return {eventStore,mastery,time,speakingEvent:eventStore.events.find(e=>e.type==='SPEAKING_SUBMITTED')};
}
{
  const {eventStore,mastery,time}=await speakingFixture();
  const view=buildTeacherLearnerView({lesson,events:eventStore.events,masterySnapshot:mastery,learningTimeLedger:time,humanReviews:[],teacher});
  assert.equal(view.learnerStatus,'AWAITING_HUMAN_REVIEW');
  assert.equal(view.speakingReviewQueue.length,1);assert.equal(view.speakingReviewQueue[0].status,'PENDING');
  assert.equal(view.flags.some(x=>x.type==='SPEAKING_REVIEW_PENDING'),true);
  assert.equal(view.rawLearnerResponsesExposed,false);assert.equal(view.xpExposed,false);assert.equal(view.gamificationExposed,false);
  assert.equal(view.missedLearning.status,'DEFERRED_TO_COMPLIANCE_ENGINE');
  assert.equal(view.certificateAuthority,false);assert.equal(view.legalAuthority,false);
  assert.equal(Object.prototype.hasOwnProperty.call(view,'answers'),false);
}
{
  const {eventStore,time,speakingEvent}=await speakingFixture();
  const reviewStore=new Store();
  const bridge=createHumanReviewBridgeService({reviewStore,reviewer:{reviewerId:'teacher-s7',organisationId:'org-s7',role:'TEACHER'},now:()=>9001});
  await bridge.review({speakingEvent:structuredClone(speakingEvent),clientReviewId:'review-s7',decision:'VALID'});
  const mastery=deriveMasterySnapshot({lesson,events:eventStore.events,humanReviews:reviewStore.rows});
  const view=buildTeacherLearnerView({lesson,events:eventStore.events,masterySnapshot:mastery,learningTimeLedger:time,humanReviews:reviewStore.rows,teacher});
  assert.equal(view.speakingReviewQueue[0].status,'VALID');assert.equal(view.speakingReviewQueue[0].approvalState,'APPROVED');
  const speakingSkill=view.skillProgress.find(x=>x.skill==='speaking_help');assert.equal(speakingSkill.teacherValidated,true);
  assert.equal(view.learnerStatus,'IN_PROGRESS');
  const validationStore=new Store('validations');
  const service=createTeacherValidationService({validationStore,teacher,now:()=>10001});
  const periodic=await service.validate({teacherView:view,clientValidationId:'periodic-1',validationKind:'PERIODIC',decision:'VALID'});
  assert.equal(periodic.persistence,'PERSISTED');assert.equal(periodic.validationKind,'PERIODIC');assert.equal(periodic.decision,'VALID');
  assert.equal(periodic.masteryReplayHeadSeq,view.evidenceBinding.masteryReplayHeadSeq);
  assert.equal(periodic.learningTimeEntryCount,view.evidenceBinding.learningTimeEntryCount);
  assert.equal(periodic.certificateAuthority,false);assert.equal(periodic.legalAuthority,false);assert.equal(periodic.complianceAuthority,false);
  await rejectAsync(service.validate({teacherView:view,clientValidationId:'final-1',validationKind:'FINAL',decision:'VALID'}),'TEACHER_FINAL_VALIDATION_PATH_INCOMPLETE');
}

{
  const noSpeaking=structuredClone(lesson);
  noSpeaking.lessonId='RLS07-S7-NOSPEAK';
  noSpeaking.contentVersion='rpm-rls07-s7-nospeak@0.1.0';
  noSpeaking.items=noSpeaking.items.filter(item=>item.id!=='E06');
  const eventStore=new S3MemoryEventStore();let tick=20000;
  const controller=new LessonPlayerSessionController({lesson:noSpeaking,eventStore,scope:learnerScope,sessionId:'s7-final',now:()=>tick+=1000});
  let learnerView=await controller.start();
  while(learnerView.currentItem) learnerView=await controller.answer(learnerView.currentItem.id,correctLessonResponse(learnerView.currentItem));
  await controller.complete();
  const mastery=deriveMasterySnapshot({lesson:noSpeaking,events:eventStore.events,humanReviews:[]});
  const time=buildValidatedLearningTimeLedger({lesson:noSpeaking,events:eventStore.events});
  const view=buildTeacherLearnerView({lesson:noSpeaking,events:eventStore.events,masterySnapshot:mastery,learningTimeLedger:time,humanReviews:[],teacher});
  assert.equal(view.learnerStatus,'COMPLETED');
  const validationStore=new Store('validations');
  const service=createTeacherValidationService({validationStore,teacher,now:()=>21001});
  const final=await service.validate({teacherView:view,clientValidationId:'final-completed',validationKind:'FINAL',decision:'VALID'});
  assert.equal(final.validationKind,'FINAL');assert.equal(final.decision,'VALID');assert.equal(final.persistence,'PERSISTED');
  const replay=await service.validate({teacherView:view,clientValidationId:'final-completed',validationKind:'FINAL',decision:'VALID'});
  assert.equal(replay.persistence,'IDEMPOTENT_REPLAY');assert.equal(validationStore.rows.length,1);
  assert.equal(final.certificateAuthority,false);assert.equal(final.legalAuthority,false);
}

{
  const {eventStore,mastery,time}=await speakingFixture();
  const view=buildTeacherLearnerView({lesson,events:eventStore.events,masterySnapshot:mastery,learningTimeLedger:time,humanReviews:[],teacher});
  const service=createTeacherValidationService({validationStore:new Store('validations'),teacher});
  await rejectAsync(service.validate({teacherView:view,clientValidationId:'blocked-final',validationKind:'FINAL',decision:'VALID'}),'TEACHER_FINAL_VALIDATION_SPEAKING_PENDING');
}
{
  const {eventStore,mastery,time}=await speakingFixture();
  reject(()=>buildTeacherLearnerView({lesson,events:eventStore.events,masterySnapshot:mastery,learningTimeLedger:time,humanReviews:[],teacher:{teacherId:'foreign',organisationId:'foreign-org',role:'TEACHER'}}),'TEACHER_OS_CROSS_TENANT_FORBIDDEN');
  reject(()=>buildTeacherLearnerView({lesson,events:eventStore.events,masterySnapshot:mastery,learningTimeLedger:time,humanReviews:[],teacher:{teacherId:'learner',organisationId:'org-s7',role:'LEARNER'}}),'TEACHER_OS_ROLE_FORBIDDEN');
}
console.log('RPM_S7_TEACHER_OS_PASS tenant-role-scoped learner-status validated-time skill-progress speaking-review-queue flags assessment-summary no-raw-answer-xp-gamification-leak missed-learning-deferred speaking-review-reuse periodic-final-validation-human-only no-certificate-legal-compliance-authority');
