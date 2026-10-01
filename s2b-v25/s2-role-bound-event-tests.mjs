import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lesson } from './fixture.mjs';
import { EventType, makeEvent, validateEventPolicy, validateSequenceContinuity, analyseReplaySequence, reduceLessonState, EVENT_SCOPE_POLICY_VERSION, LEARNING_EVENT_ROLE } from './model.mjs';

const mk=(seq,id,role='LEARNER',overrides={})=>makeEvent({
  type:EventType.ITEM_ANSWERED,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,
  seq,itemId:'E01',payload:{response:'Nu înțeleg.',correct:true,humanReviewRequired:false,advance:true},ts:1000+seq,sessionId:'role-s',eventId:id,
  subjectId:'role-learner',organisationId:'role-org',role,...overrides
});
assert.equal(EVENT_SCOPE_POLICY_VERSION,1);
assert.equal(LEARNING_EVENT_ROLE,'LEARNER');
const learner=mk(1,'role-e1');
const teacher=mk(2,'role-e2','TEACHER');
assert.equal(validateEventPolicy(learner).valid,true);
assert.equal(validateEventPolicy(teacher).code,'LEARNING_EVENT_ROLE_FORBIDDEN');
assert.equal(validateEventPolicy({...learner,role:null}).code,'LEARNING_EVENT_ROLE_FORBIDDEN');
assert.equal(validateSequenceContinuity(teacher,learner).code,'INVALID_EVENT_IDENTITY');
const replay=analyseReplaySequence(lesson,[learner,teacher]);
assert.equal(replay.valid,false);
assert.equal(replay.code,'LEARNING_EVENT_ROLE_FORBIDDEN');
assert.equal(replay.contiguousHead,1);
assert.deepEqual(replay.quarantinedEventIds,['role-e2']);
const state=reduceLessonState(lesson,[learner,teacher]);
assert.equal(state.attempts.E01,1,'cross-role injected event must not contribute to learner replay');
assert.equal(state.xp,10,'cross-role injected event must not grant learner XP');

const store=fs.readFileSync(new URL('./event-store.mjs',import.meta.url),'utf8');
for (const marker of ['STORE_ROLE_REQUIRED','STORE_ROLE_FORBIDDEN','EVENT_ROLE_MISMATCH','LEARNING_EVENT_ROLE']) {
  assert.ok(store.includes(marker),`role-bound EventStore missing ${marker}`);
}
const schema=JSON.parse(fs.readFileSync(new URL('./schemas/event.schema.json',import.meta.url),'utf8'));
assert.ok(schema.required.includes('role'),'LearningEvent schema must require role');
assert.equal(schema.properties.role.const,'LEARNER');
console.log('RPM_S2_ROLE_BOUND_EVENT_PASS learner-only-stream cross-role-policy-block replay-quarantine store-role-gate');
