import assert from 'node:assert/strict';
import {lesson} from '../canonical/s2b/v2.6/fixture.mjs';
import {deriveLessonPlayerView} from '../canonical/s3/lesson-player/v0.1/lesson-player-engine.mjs';
import {LessonPlayerSessionController} from '../canonical/s3/lesson-player/v0.1/session-controller.mjs';
import {S3MemoryEventStore,correctLessonResponse} from '../canonical/s3/lesson-player/v0.1/s3-test-support.mjs';
import {createSpeakingSubmissionService} from '../canonical/s4/speaking/v0.1/speaking-submission.mjs';
import {createHumanReviewBridgeService} from '../canonical/s4/review/v0.1/human-review-bridge.mjs';

class ReviewStore{
  constructor(){this.rows=[]}
  async open(){}
  async listReviews(){return this.rows.map(x=>structuredClone(x))}
  async appendReview(r){this.rows.push(structuredClone(r));return {status:'appended'}}
}
const scope={subjectId:'resume-learner',organisationId:'resume-org',role:'LEARNER'};
const reviewer={reviewerId:'resume-teacher',organisationId:'resume-org',role:'TEACHER'};

async function staged(){
  const reviews=new ReviewStore();
  const store=new S3MemoryEventStore({trustedHumanReviewProvider:async()=>reviews.rows});
  let t=1000;
  const controller=new LessonPlayerSessionController({lesson,eventStore:store,scope,sessionId:'resume-session',now:()=>++t});
  let view=await controller.start();
  while(view.currentItem&&view.currentItem.id!=='E06')view=await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  const speaking=createSpeakingSubmissionService({lesson,eventStore:store,scope,sessionId:'resume-speaking',now:()=>++t});
  await speaking.submit({itemId:'E06',mediaRef:'demo://resume/e06',clientSubmissionId:'resume-sub-1'});
  const event=store.events.find(x=>x.type==='SPEAKING_SUBMITTED');
  return {reviews,store,controller,speaking,event,now:()=>++t};
}
{
  const f=await staged();
  const bridge=createHumanReviewBridgeService({reviewStore:f.reviews,reviewer,now:f.now});
  await bridge.review({speakingEvent:f.event,clientReviewId:'resume-review-valid',decision:'VALID'});
  const view=await f.controller.refresh();
  assert.equal(view.status,'ACTIVE');
  assert.equal(view.currentItem.id,'E07');
  assert.deepEqual(view.speakingPending,[]);
  assert.equal(view.xp,50,'review resolution must not grant XP');
  assert.equal(view.activeMs,0,'review resolution must not grant time');
}
{
  const f=await staged();
  const bridge=createHumanReviewBridgeService({reviewStore:f.reviews,reviewer,now:f.now});
  await bridge.review({speakingEvent:f.event,clientReviewId:'resume-review-forge',decision:'VALID'});
  const valid=f.reviews.rows[0];
  for(const [mutate,code] of [
    [r=>{r.authority.pathAdvance=true},'TRUSTED_HUMAN_REVIEW_AUTHORITY_ESCALATION'],
    [r=>{r.organisationId='other-org'},'TRUSTED_HUMAN_REVIEW_PROVENANCE_MISMATCH'],
    [r=>{r.learnerSubjectId='other-user'},'TRUSTED_HUMAN_REVIEW_PROVENANCE_MISMATCH']
  ]){
    const bad=structuredClone(valid);mutate(bad);
    const view=deriveLessonPlayerView(lesson,f.store.events,{trustedHumanReviews:[bad]});
    assert.equal(view.status,'INTEGRITY_BLOCKED');
    assert.equal(view.replay.code,code);
  }
  const duplicate=structuredClone(valid);duplicate.reviewId+='-duplicate';duplicate.clientReviewId+='-duplicate';
  const dupView=deriveLessonPlayerView(lesson,f.store.events,{trustedHumanReviews:[valid,duplicate]});
  assert.equal(dupView.status,'INTEGRITY_BLOCKED');
  assert.equal(dupView.replay.code,'TRUSTED_HUMAN_REVIEW_DUPLICATE');
}
{
  const f=await staged();
  const bridge=createHumanReviewBridgeService({reviewStore:f.reviews,reviewer,now:f.now});
  await bridge.review({speakingEvent:f.event,clientReviewId:'resume-review-retry',decision:'RETRY'});
  let view=await f.controller.refresh();
  assert.equal(view.status,'ACTIVE');
  assert.equal(view.currentItem.id,'E06');
  assert.deepEqual(view.speakingPending,[]);
  const retrySpeaking=createSpeakingSubmissionService({lesson,eventStore:f.store,scope,sessionId:'resume-speaking-2',now:f.now});
  const next=await retrySpeaking.submit({itemId:'E06',mediaRef:'demo://resume/e06/retry',clientSubmissionId:'resume-sub-2'});
  assert.equal(next.status,'PENDING_HUMAN_REVIEW');
  view=await f.controller.refresh();
  assert.equal(view.status,'AWAITING_HUMAN_REVIEW');
}
console.log('RPM_REVIEW_RESUME_SECURITY_PASS valid-resumes-E07 zero-xp-time forged-authority-scope-duplicate-blocked retry-resubmission-enabled');
