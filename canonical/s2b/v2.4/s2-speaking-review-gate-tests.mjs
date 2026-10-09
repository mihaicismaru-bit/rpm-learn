import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lesson } from './fixture.mjs';
import {
  EventType, makeEvent, analyseLearningReplay, validateEventSemantics,
  EVENT_SEMANTIC_POLICY_VERSION
} from './model.mjs';

const scope={subjectId:'speaking-learner',organisationId:'speaking-org',role:'LEARNER'};
const mk=(seq,id,type,itemId=null,payload={},sessionId='speaking-s')=>makeEvent({
  type,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,seq,itemId,payload,
  ts:3000+seq,sessionId,eventId:id,...scope
});
const answer=(seq,id,itemId,response)=>mk(seq,id,EventType.ITEM_ANSWERED,itemId,{
  response,correct:true,humanReviewRequired:false,advance:true
});

assert.equal(EVENT_SEMANTIC_POLICY_VERSION,4);
const beforeSpeaking=[
  answer(1,'sp-e1','E01','Nu înțeleg.'),
  answer(2,'sp-e2','E02','Mai încet, vă rog.'),
  answer(3,'sp-e3','E03',['MAI','ÎNCET','VĂ','ROG']),
  answer(4,'sp-e4','E04','Vreau să aud din nou.'),
  answer(5,'sp-e5','E05','Unde scriu?')
];
const submission=mk(6,'sp-submit',EventType.SPEAKING_SUBMITTED,'E06',{teacherReviewRequired:true,placeholder:true});
const replay=analyseLearningReplay(lesson,[...beforeSpeaking,submission]);
assert.equal(replay.valid,true);
assert.equal(replay.state.cursor,5,'speaking submission must not advance beyond E06 before human review');
assert.equal(replay.state.xp,50,'speaking submission must not grant XP before human review');
assert.deepEqual(replay.state.speakingPending,['E06']);
assert.equal(replay.state.completed,false);

const resubmit=mk(7,'sp-resubmit',EventType.SPEAKING_SUBMITTED,'E06',{teacherReviewRequired:true,placeholder:true});
const resubmitGate=validateEventSemantics(lesson,resubmit,{state:replay.state});
assert.equal(resubmitGate.code,'SPEAKING_REVIEW_PENDING_RESUBMIT_FORBIDDEN');

const syntheticFinalState={...replay.state,cursor:lesson.items.length,speakingPending:['E06']};
const prematureCompletion=mk(7,'sp-complete',EventType.LESSON_COMPLETED,null,{});
const completionGate=validateEventSemantics(lesson,prematureCompletion,{state:syntheticFinalState});
assert.equal(completionGate.code,'LESSON_COMPLETION_SPEAKING_REVIEW_PENDING');

const model=fs.readFileSync(new URL('./model.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
for(const marker of [
  'EVENT_SEMANTIC_POLICY_VERSION = 4',
  'SPEAKING_REVIEW_PENDING_RESUBMIT_FORBIDDEN',
  'LESSON_COMPLETION_SPEAKING_REVIEW_PENDING',
  'Submission is evidence awaiting human review'
]) assert.ok(model.includes(marker),`speaking gate model missing ${marker}`);
for(const marker of ['În așteptarea validării umane','trimiterea nu acordă XP']) assert.ok(app.includes(marker),`speaking gate UI missing ${marker}`);
console.log('RPM_S2_SPEAKING_REVIEW_GATE_PASS pending-no-path-advance pending-no-xp resubmit-block completion-block ui-hold');
