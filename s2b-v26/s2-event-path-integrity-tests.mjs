import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lesson } from './fixture.mjs';
import {
  EventType, makeEvent, initialState, validateEventSemantics,
  analyseLearningReplay, EVENT_SEMANTIC_POLICY_VERSION
} from './model.mjs';

const scope={subjectId:'path-learner',organisationId:'path-org',role:'LEARNER'};
const mk=(seq,id,type,itemId=null,payload={},sessionId='path-s')=>makeEvent({
  type,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,seq,itemId,payload,
  ts:2000+seq,sessionId,eventId:id,...scope
});
const answer=(seq,id,itemId,response,correct=true)=>mk(seq,id,EventType.ITEM_ANSWERED,itemId,{
  response,correct,humanReviewRequired:false,advance:correct === true
});

assert.equal(EVENT_SEMANTIC_POLICY_VERSION,4);
const start=initialState(lesson);
assert.equal(validateEventSemantics(lesson,answer(1,'path-e1','E01','Nu înțeleg.',true),{state:start}).valid,true);
assert.equal(validateEventSemantics(lesson,answer(1,'path-future','E08',['Nu înțeleg.','Repetați, vă rog.','Am terminat.'],true),{state:start}).code,'EVENT_ITEM_PATH_MISMATCH');
assert.equal(validateEventSemantics(lesson,mk(1,'path-future-speaking',EventType.SPEAKING_SUBMITTED,'E06',{teacherReviewRequired:true,placeholder:true}),{state:start}).code,'EVENT_ITEM_PATH_MISMATCH');
assert.equal(validateEventSemantics(lesson,mk(1,'path-future-audio-start',EventType.AUDIO_STARTED,'E04',{}),{state:start}).code,'EVENT_ITEM_PATH_MISMATCH');
assert.equal(validateEventSemantics(lesson,mk(1,'path-future-audio-end',EventType.AUDIO_ENDED,'E04',{}),{state:start}).code,'AUDIO_END_FUTURE_ITEM_FORBIDDEN');

const e1=answer(1,'path-good-e1','E01','Nu înțeleg.',true);
const futureCheckpoint=answer(2,'path-skip-e8','E08',['Nu înțeleg.','Repetați, vă rog.','Am terminat.'],true);
const tail=answer(3,'path-tail-e2','E02','Mai încet, vă rog.',true);
const replay=analyseLearningReplay(lesson,[e1,futureCheckpoint,tail]);
assert.equal(replay.valid,false);
assert.equal(replay.code,'EVENT_ITEM_PATH_MISMATCH');
assert.equal(replay.contiguousHead,1);
assert.deepEqual(replay.quarantinedEventIds,['path-skip-e8','path-tail-e2']);
assert.equal(replay.state.cursor,1,'future item must not jump learner cursor');
assert.equal(replay.state.attempts.E08,undefined,'future checkpoint attempt must not enter derived state');
assert.equal(replay.state.xp,10,'future item must not grant XP');

const model=fs.readFileSync(new URL('./model.mjs',import.meta.url),'utf8');
const store=fs.readFileSync(new URL('./event-store.mjs',import.meta.url),'utf8');
for (const marker of ['EVENT_SEMANTIC_POLICY_VERSION = 4','EVENT_ITEM_PATH_MISMATCH','EVENT_ITEM_AFTER_PATH_END','AUDIO_END_FUTURE_ITEM_FORBIDDEN']) {
  assert.ok(model.includes(marker),`path-integrity model missing ${marker}`);
}
assert.ok(store.includes('state: chainState.state'),'EventStore append must validate against canonical replay state');
console.log('RPM_S2_EVENT_PATH_INTEGRITY_PASS current-item-guard future-answer-block future-speaking-block future-audio-block replay-tail-quarantine');
