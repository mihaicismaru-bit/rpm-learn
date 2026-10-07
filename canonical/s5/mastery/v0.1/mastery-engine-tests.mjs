import assert from 'node:assert/strict';
import { lesson } from '../../s2b/v2.6/fixture.mjs';
import { LessonPlayerSessionController } from '../../s3/lesson-player/v0.1/session-controller.mjs';
import { S3MemoryEventStore, correctLessonResponse } from '../../s3/lesson-player/v0.1/s3-test-support.mjs';
import { createSpeakingSubmissionService } from '../../s4/speaking/v0.1/speaking-submission.mjs';
import { createHumanReviewBridgeService } from '../../s4/review/v0.1/human-review-bridge.mjs';
import { MasteryEngineError, deriveMasterySnapshot } from './mastery-engine.mjs';

const scope = { subjectId:'learner-s51', organisationId:'org-s51', role:'LEARNER' };
const reviewer = { reviewerId:'teacher-s51', organisationId:'org-s51', role:'TEACHER' };
const reject = (fn, code) => assert.throws(fn, error => error instanceof MasteryEngineError && error.code === code, code);

class ReviewStore {
  constructor() { this.reviews=[]; }
  async open() {}
  async listReviews() { return this.reviews.map(x=>structuredClone(x)); }
  async appendReview(record) { this.reviews.push(structuredClone(record)); return {status:'appended'}; }
}

async function controllerFor(inputLesson, id='mastery') {
  const store = new S3MemoryEventStore(); let tick=1000;
  const controller = new LessonPlayerSessionController({lesson:inputLesson,eventStore:store,scope,sessionId:id,now:()=>tick+=1000});
  const view = await controller.start();
  return {store,controller,view};
}

{
  const {store,controller,view} = await controllerFor(lesson,'first');
  const after = await controller.answer(view.currentItem.id, correctLessonResponse(view.currentItem));
  assert.ok(after);
  const snapshot = deriveMasterySnapshot({lesson,events:store.events});
  const row = snapshot.skills.find(x=>x.skill==='listening_help');
  assert.equal(row.score,2); assert.equal(row.state,'LEARNING'); assert.equal(row.correctFirstAttempt,1);
  assert.equal(snapshot.xpAuthority,false); assert.equal(snapshot.gamificationAuthority,false); assert.equal(snapshot.validatedTimeAuthority,false);
  assert.equal(snapshot.complianceAuthority,false); assert.equal(snapshot.certificateAuthority,false); assert.equal(snapshot.legalAuthority,false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot,'xp'),false);
  assert.equal(Object.prototype.hasOwnProperty.call(snapshot,'activeMs'),false);
}

{
  const {store,controller,view} = await controllerFor(lesson,'retry');
  await controller.answer(view.currentItem.id,'Am terminat.');
  const current = (await controller.refresh()).currentItem;
  await controller.answer(current.id, correctLessonResponse(current));
  const snapshot = deriveMasterySnapshot({lesson,events:store.events});
  const row = snapshot.skills.find(x=>x.skill==='listening_help');
  assert.equal(row.score,1); assert.equal(row.correctAfterRetry,1); assert.equal(row.wrongAnswers,1);
  assert.equal(row.reviewSignal,'NEAR_TERM_REQUIRED');
}

{
  const {store,controller} = await controllerFor(lesson,'speaking');
  let view=await controller.refresh();
  while(view.currentItem && view.currentItem.id!=='E06') view=await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  const speaking=createSpeakingSubmissionService({lesson,eventStore:store,scope,sessionId:'s51-speaking',now:()=>20000+store.events.length});
  await speaking.submit({itemId:'E06',mediaRef:'media://s51/e06',clientSubmissionId:'s51-sub'});
  const speakingEvent=store.events.find(e=>e.type==='SPEAKING_SUBMITTED');
  const pending=deriveMasterySnapshot({lesson,events:store.events,humanReviews:[]});
  const pendingSkill=pending.skills.find(x=>x.skill==='speaking_help');
  assert.equal(pendingSkill.score,0); assert.equal(pendingSkill.state,'NEW'); assert.equal(pendingSkill.teacherValidated,false);

  const reviewStore=new ReviewStore();
  const bridge=createHumanReviewBridgeService({reviewStore,reviewer,now:()=>30001});
  await bridge.review({speakingEvent:structuredClone(speakingEvent),clientReviewId:'s51-review',decision:'VALID'});
  const valid=deriveMasterySnapshot({lesson,events:store.events,humanReviews:reviewStore.reviews});
  const row=valid.skills.find(x=>x.skill==='speaking_help');
  assert.equal(row.score,2); assert.equal(row.state,'LEARNING'); assert.equal(row.speakingValidations,1); assert.equal(row.teacherValidated,true);
}

{
  const {store,controller} = await controllerFor(lesson,'support');
  let view=await controller.refresh();
  while(view.currentItem && view.currentItem.id!=='E06') view=await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  const speaking=createSpeakingSubmissionService({lesson,eventStore:store,scope,sessionId:'s51-support',now:()=>40000+store.events.length});
  await speaking.submit({itemId:'E06',mediaRef:'media://s51/support',clientSubmissionId:'s51-support-sub'});
  const speakingEvent=store.events.find(e=>e.type==='SPEAKING_SUBMITTED');
  const reviewStore=new ReviewStore();
  const bridge=createHumanReviewBridgeService({reviewStore,reviewer,now:()=>50001});
  await bridge.review({speakingEvent:structuredClone(speakingEvent),clientReviewId:'s51-support-review',decision:'NEEDS_SUPPORT'});
  const snapshot=deriveMasterySnapshot({lesson,events:store.events,humanReviews:reviewStore.reviews});
  const row=snapshot.skills.find(x=>x.skill==='speaking_help');
  assert.equal(row.score,0); assert.equal(row.teacherValidated,false); assert.equal(row.reviewSignal,'SUPPORT_REQUIRED');
}

{
  const noSpeaking=structuredClone(lesson);
  noSpeaking.lessonId='RLS07-P0-HELP-NOSPEAK';
  noSpeaking.contentVersion='rpm-rls07-p0-help-nospeak@0.1.0';
  noSpeaking.items=noSpeaking.items.filter(item=>item.id!=='E06');
  const {store,controller}=await controllerFor(noSpeaking,'checkpoint');
  let view=await controller.refresh();
  while(view.currentItem) view=await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  const snapshot=deriveMasterySnapshot({lesson:noSpeaking,events:store.events});
  const checkpoint=snapshot.skills.find(x=>x.skill==='help_checkpoint');
  assert.equal(checkpoint.checkpointPasses,1); assert.equal(checkpoint.score,2); assert.equal(checkpoint.state,'LEARNING');
}

{
  const {store,controller,view}=await controllerFor(lesson,'stable');
  await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  const a=deriveMasterySnapshot({lesson,events:store.events});
  const b=deriveMasterySnapshot({lesson,events:[...store.events].reverse()});
  assert.deepEqual(a,b);
  assert.equal(Object.isFrozen(a),true); assert.equal(Object.isFrozen(a.skills),true); assert.equal(Object.isFrozen(a.skills[0]),true);
}

{
  const bad=structuredClone(lesson); bad.source.lane='RLS-08';
  reject(()=>deriveMasterySnapshot({lesson:bad,events:[]}), 'MASTERY_SOURCE_LANE_BLOCKED');
}

console.log('RPM_S5_1_MASTERY_ENGINE_PASS states-NEW-LEARNING-PRACTISING-STABLE first-attempt-weighted retry-weighted wrong-review-signal checkpoint-promotes speaking-requires-VALID support-signal deterministic-frozen pedagogical-only no-xp-gamification-validtime-compliance-certificate-legal-authority');
