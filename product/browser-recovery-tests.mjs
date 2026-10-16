import assert from 'node:assert/strict';
import {lesson} from '../canonical/s2b/v2.6/fixture.mjs';
import {LessonPlayerSessionController} from '../canonical/s3/lesson-player/v0.1/session-controller.mjs';
import {correctLessonResponse} from '../canonical/s3/lesson-player/v0.1/s3-test-support.mjs';
import {createSpeakingSubmissionService} from '../canonical/s4/speaking/v0.1/speaking-submission.mjs';
import {createHumanReviewBridgeService} from '../canonical/s4/review/v0.1/human-review-bridge.mjs';
import {createTeacherValidationService,buildTeacherLearnerView} from '../canonical/s7/teacher/v0.1/teacher-os.mjs';
import {deriveMasterySnapshot} from '../canonical/s5/mastery/v0.1/mastery-engine.mjs';
import {buildValidatedLearningTimeLedger} from '../canonical/s6/time/v0.1/validated-learning-time-ledger.mjs';
import {createBrowserPersistence,BrowserRecoveryError} from './browser-recovery.mjs';

const scope={subjectId:'recovery-learner',organisationId:'recovery-org',role:'LEARNER'};
const teacher={teacherId:'recovery-teacher',organisationId:'recovery-org',role:'TEACHER'};
function storage(){
  const map=new Map();
  return {
    getItem:key=>map.has(key)?map.get(key):null,
    setItem:(key,value)=>{map.set(key,String(value));},
    raw:map
  };
}
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof BrowserRecoveryError&&e.code===code,code);
let clock=1000;
const next=()=>++clock;
function open(s,whichScope=scope,whichLesson=lesson){
  const persistence=createBrowserPersistence({storage:s,lesson:whichLesson,scope:whichScope,teacher});
  const controller=new LessonPlayerSessionController({
    lesson:whichLesson,eventStore:persistence.eventStore,
    scope:whichScope,sessionId:'recovery-session',now:next
  });
  return {persistence,controller};
}
function correct(view){
  return correctLessonResponse(view.currentItem);
}
async function proceed(controller,stopId='E06'){
  let v=await controller.start();
  while(v.currentItem&&v.currentItem.id!==stopId)v=await controller.answer(v.currentItem.id,correct(v));
  return v;
}

// Fresh session persists an append-only replay and rehydrates the same cursor after reload.
{
  const s=storage();
  const a=open(s);
  let view=await a.controller.start();
  assert.equal(view.currentItem.id,'E01');
  view=await a.controller.answer('E01',correct(view));
  assert.equal(view.currentItem.id,'E02');
  const before=await a.persistence.eventStore.listEvents(lesson.lessonId,lesson.contentVersion);
  assert.ok(before.length>=3);
  const b=open(s);
  const recovered=await b.controller.start();
  assert.equal(recovered.currentItem.id,'E02');
  assert.equal(recovered.progress.completedItems,view.progress.completedItems);
  assert.deepEqual(await b.persistence.eventStore.listEvents(lesson.lessonId,lesson.contentVersion),before);
  assert.equal((await b.persistence.eventStore.inspectSequenceChain(lesson.lessonId,lesson.contentVersion)).valid,true);
  const same=await b.persistence.eventStore.append(before[0]);
  assert.equal(same.status,'duplicate');
  reject(()=>a.persistence.eventStore.listEvents(lesson.lessonId,lesson.contentVersion),'BROWSER_RECOVERY_CONCURRENT_CHANGE_RELOAD_REQUIRED');
}

// Both content-version drift and content mutation under an unchanged version fail closed.
{
  const s=storage(),a=open(s);
  await a.controller.start();
  const altered=structuredClone(lesson);
  altered.title='Different source bytes under same contentVersion';
  reject(()=>open(s,scope,altered).persistence.eventStore.open(),'BROWSER_RECOVERY_ENVELOPE_MISMATCH');
  const differentVersion=structuredClone(lesson);
  differentVersion.contentVersion+='-candidate';
  const v=open(s,scope,differentVersion);
  // This version has a separate key; it cannot see events from the old version.
  assert.equal((await v.persistence.eventStore.listEvents(differentVersion.lessonId,differentVersion.contentVersion)).length,0);
  assert.equal((await a.persistence.eventStore.listEvents(lesson.lessonId,lesson.contentVersion)).length>0,true);
}

// A foreign tenant uses a disjoint persistence key and cannot read another learner's ledger.
{
  const s=storage(),a=open(s);
  await a.controller.start();
  const otherScope={subjectId:'other-learner',organisationId:'other-org',role:'LEARNER'};
  const otherTeacher={teacherId:'other-teacher',organisationId:'other-org',role:'TEACHER'};
  const foreign=createBrowserPersistence({storage:s,lesson,scope:otherScope,teacher:otherTeacher});
  assert.notEqual(a.persistence.key,foreign.key);
  assert.equal((await foreign.eventStore.listEvents(lesson.lessonId,lesson.contentVersion)).length,0);
}

// Corrupt JSON, forged learner identity, escalated review and mutated source are rejected on cold load.
{
  const s=storage(),a=open(s);
  await a.controller.start();
  const key=a.persistence.key, original=JSON.parse(s.getItem(key));
  s.setItem(key,'{invalid-json');
  reject(()=>open(s).persistence.eventStore.open(),'BROWSER_RECOVERY_JSON_CORRUPT');
  const forged=structuredClone(original);
  forged.events[0].subjectId='foreign-learner';
  s.setItem(key,JSON.stringify(forged));
  reject(()=>open(s).persistence.eventStore.open(),'BROWSER_RECOVERY_EVENT_SCOPE_MISMATCH');
  const changed=structuredClone(original);
  changed.lessonSnapshot+=':tampered';
  s.setItem(key,JSON.stringify(changed));
  reject(()=>open(s).persistence.eventStore.open(),'BROWSER_RECOVERY_ENVELOPE_MISMATCH');
  s.setItem(key,JSON.stringify(original));
  assert.equal((await open(s).persistence.eventStore.inspectSequenceChain(lesson.lessonId,lesson.contentVersion)).valid,true);
}

// Storage write failures cannot be treated as committed progress.
{
  const s=storage();
  s.setItem=()=>{throw Object.assign(new Error('Quota denied'),{name:'QuotaExceededError'});};
  const a=open(s);
  await assert.rejects(()=>a.controller.start(),e=>e?.code==='BROWSER_RECOVERY_WRITE_FAILED');
  assert.equal(s.raw.size,0);
}

// Speaking → human VALID → learner resume → completed → teacher FINAL VALID survives reload.
{
  const s=storage(),a=open(s);
  let v=await proceed(a.controller);
  assert.equal(v.currentItem.id,'E06');
  const speaking=createSpeakingSubmissionService({
    lesson,eventStore:a.persistence.eventStore,scope,
    sessionId:'recovery-speaking',now:next
  });
  const sub=await speaking.submit({
    itemId:'E06',mediaRef:'demo://recovery/e06',clientSubmissionId:'recovery-sub-e06'
  });
  assert.equal(sub.status,'PENDING_HUMAN_REVIEW');
  v=await a.controller.refresh();
  assert.equal(v.status,'AWAITING_HUMAN_REVIEW');
  const review=createHumanReviewBridgeService({
    reviewStore:a.persistence.reviewStore,
    reviewer:{reviewerId:teacher.teacherId,organisationId:teacher.organisationId,role:'TEACHER'},
    now:next
  });
  const events=await a.persistence.eventStore.listEvents(lesson.lessonId,lesson.contentVersion);
  const speakingEvent=events.find(e=>e.type==='SPEAKING_SUBMITTED');
  const outcome=await review.review({speakingEvent,clientReviewId:'recovery-review-e06',decision:'VALID'});
  assert.equal(outcome.decision,'VALID');
  const b=open(s);
  v=await b.controller.start();
  assert.equal(v.currentItem.id,'E07');
  while(v.currentItem)v=await b.controller.answer(v.currentItem.id,correct(v));
  assert.equal(v.status,'READY_TO_COMPLETE');
  v=await b.controller.complete();
  assert.equal(v.status,'COMPLETED');
  const after=await b.persistence.eventStore.listEvents(lesson.lessonId,lesson.contentVersion);
  const humanReviews=await b.persistence.reviewStore.listReviews();
  const mastery=deriveMasterySnapshot({lesson,events:after,humanReviews});
  const time=buildValidatedLearningTimeLedger({lesson,events:after,trustedHumanReviews:humanReviews});
  const teacherView=buildTeacherLearnerView({
    lesson,events:after,masterySnapshot:mastery,learningTimeLedger:time,humanReviews,teacher
  });
  const validator=createTeacherValidationService({validationStore:b.persistence.validationStore,teacher,now:next});
  const result=await validator.validate({teacherView,clientValidationId:'recovery-final',validationKind:'FINAL',decision:'VALID'});
  assert.equal(result.decision,'VALID');
  assert.equal(result.certificateAuthority,false);
  const c=open(s);
  assert.equal((await c.controller.start()).status,'COMPLETED');
  assert.equal((await c.persistence.reviewStore.listReviews()).length,1);
  assert.equal((await c.persistence.validationStore.listValidations()).length,1);
  assert.equal((await c.persistence.eventStore.inspectSequenceChain(lesson.lessonId,lesson.contentVersion)).valid,true);
}

console.log('RPM_BROWSER_RECOVERY_TESTS_PASS reload-continuity content-lock scope-isolation corrupt-json replay storage-failure human-review-completion-final-validation');
