import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lesson } from './fixture.mjs';
import {
  EventType, makeEvent, validateEventPolicy, validateEventSemantics,
  analyseLearningReplay, reduceLessonState, EVENT_SEMANTIC_POLICY_VERSION
} from './model.mjs';

const scope={subjectId:'semantic-learner',organisationId:'semantic-org',role:'LEARNER'};
const mk=(seq,id,type,itemId=null,payload={},sessionId='semantic-s')=>makeEvent({
  type,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,seq,itemId,payload,
  ts:1000+seq,sessionId,eventId:id,...scope
});
const answer=(seq,id,itemId,response,correct)=>mk(seq,id,EventType.ITEM_ANSWERED,itemId,{
  response,correct,humanReviewRequired:false,advance:correct === true
});

assert.equal(EVENT_SEMANTIC_POLICY_VERSION,4);
const goodE1=answer(1,'sem-e1','E01','Nu înțeleg.',true);
assert.equal(validateEventSemantics(lesson,goodE1).valid,true);
const forged=answer(1,'sem-forged','E01','Am terminat.',true);
assert.equal(validateEventSemantics(lesson,forged).code,'ANSWER_SCORE_MISMATCH');
const missingResponse=mk(1,'sem-missing',EventType.ITEM_ANSWERED,'E01',{correct:true,humanReviewRequired:false,advance:true});
assert.equal(validateEventSemantics(lesson,missingResponse).code,'ANSWER_RESPONSE_REQUIRED');
const unknown=answer(1,'sem-unknown','NOPE','x',false);
assert.equal(validateEventSemantics(lesson,unknown).code,'EVENT_ITEM_NOT_FOUND');
const wrongSpeaking=mk(1,'sem-speaking',EventType.SPEAKING_SUBMITTED,'E01',{teacherReviewRequired:true,placeholder:true});
assert.equal(validateEventSemantics(lesson,wrongSpeaking).code,'SPEAKING_ITEM_HUMAN_REVIEW_BINDING_REQUIRED');
const directMastery=mk(1,'sem-mastery',EventType.MASTERY_APPLIED,null,{skill:'x',score:999,state:'STABLE'});
assert.equal(validateEventPolicy(directMastery).code,'LEARNER_DIRECT_MASTERY_MUTATION_FORBIDDEN');
const premature=mk(2,'sem-complete',EventType.LESSON_COMPLETED,null,{});
const prematureReplay=analyseLearningReplay(lesson,[goodE1,premature]);
assert.equal(prematureReplay.valid,false);
assert.equal(prematureReplay.code,'LESSON_COMPLETION_PREMATURE');
assert.equal(prematureReplay.contiguousHead,1);
assert.deepEqual(prematureReplay.quarantinedEventIds,['sem-complete']);

const source=goodE1;
const orphanTime=mk(2,'sem-time',EventType.TIME_SLICE,'E01',{
  policyVersion:4,eligible:true,durationMs:1000,basis:'meaningful_interaction',
  sourceEventType:EventType.ITEM_ANSWERED,sourceEventId:'missing',sourceEventSeq:1,
  rawDurationMs:1000,idleGapSuppressed:false,clockBasis:'performance.now',wallClockRollbackDetected:false,fromWallTs:1000,toWallTs:2000
});
const afterTail=answer(3,'sem-tail','E02','Mai încet, vă rog.',true);
const orphanReplay=analyseLearningReplay(lesson,[source,orphanTime,afterTail]);
assert.equal(orphanReplay.valid,false);
assert.equal(orphanReplay.code,'TIME_SLICE_SOURCE_EVENT_NOT_FOUND');
assert.equal(orphanReplay.contiguousHead,1);
assert.equal(reduceLessonState(lesson,[source,orphanTime,afterTail]).attempts.E02,undefined,'semantic corruption must quarantine the tail, not merely ignore one event');

const model=fs.readFileSync(new URL('./model.mjs',import.meta.url),'utf8');
const store=fs.readFileSync(new URL('./event-store.mjs',import.meta.url),'utf8');
for (const marker of ['EVENT_SEMANTIC_POLICY_VERSION = 4','validateEventSemantics','analyseLearningReplay','ANSWER_SCORE_MISMATCH','LESSON_COMPLETION_PREMATURE','LEARNER_DIRECT_MASTERY_MUTATION_FORBIDDEN']) {
  assert.ok(model.includes(marker),`semantic model missing ${marker}`);
}
for (const marker of ['analyseLearningReplay(lesson','validateEventSemantics(lesson','CONTENT_NOT_ACTIVATED']) {
  assert.ok(store.includes(marker),`semantic store guard missing ${marker}`);
}
console.log('RPM_S2_EVENT_SEMANTIC_INTEGRITY_PASS recomputed-score item-binding speaking-binding derived-mastery-block completion-gate semantic-tail-quarantine');
