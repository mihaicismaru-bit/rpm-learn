import assert from 'node:assert/strict';
import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { EventType, makeEvent, makeTimeSlicePayload, nextSequenceCandidate } from '../../../s2b/v2.6/model.mjs';
import { LessonPlayerSessionController } from '../../../s3/lesson-player/v0.1/session-controller.mjs';
import { S3MemoryEventStore, correctLessonResponse } from '../../../s3/lesson-player/v0.1/s3-test-support.mjs';
import { buildValidatedLearningTimeLedger, LearningTimeLedgerError } from './validated-learning-time-ledger.mjs';

const scope={subjectId:'learner-s6',organisationId:'org-s6',role:'LEARNER'};
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof LearningTimeLedgerError&&e.code===code,code);

async function answeredStore({wrong=false}={}){
  const store=new S3MemoryEventStore();let tick=1000;
  const controller=new LessonPlayerSessionController({lesson,eventStore:store,scope,sessionId:'s6-session',now:()=>tick+=1000});
  const view=await controller.start();
  await controller.answer(view.currentItem.id,wrong?'Am terminat.':correctLessonResponse(view.currentItem));
  const source=[...store.events].reverse().find(event=>event.type===EventType.ITEM_ANSWERED);
  return {store,source};
}
async function appendSlice(store,source,{rawMs=2000,eligible=true}={}){
  const chain=await store.inspectSequenceChain(lesson.lessonId,lesson.contentVersion);
  const payload=makeTimeSlicePayload({
    previousMono:100,
    currentMono:100+rawMs,
    previousWall:10000,
    currentWall:10000+rawMs,
    foreground:true,
    basis:'meaningful_interaction',
    sourceEventType:source.type,
    sourceEventId:source.eventId,
    sourceEventSeq:source.seq
  });
  if(!eligible){
    payload.durationMs=0;payload.eligible=false;payload.rawDurationMs=0;payload.fromWallTs=10000;payload.toWallTs=10000;
  }
  const event=makeEvent({
    type:EventType.TIME_SLICE,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,
    seq:nextSequenceCandidate(chain.contiguousHead),itemId:source.itemId,payload,ts:20000,
    sessionId:source.sessionId,subjectId:source.subjectId,organisationId:source.organisationId,role:source.role
  });
  await store.append(event);
  return event;
}

{
  const {store,source}=await answeredStore();
  const slice=await appendSlice(store,source,{rawMs:2000});
  const ledger=buildValidatedLearningTimeLedger({lesson,events:store.events});
  assert.equal(ledger.validatedLearningTimeMs,2000);
  assert.equal(ledger.entryCount,1);
  assert.equal(ledger.entries[0].sourceEventId,source.eventId);
  assert.equal(ledger.entries[0].timeSliceEventId,slice.eventId);
  assert.equal(ledger.entries[0].result,'CORRECT');
  assert.equal(ledger.entries[0].attemptOrdinal,1);
  assert.equal(ledger.entries[0].evidenceClass,'listening_recognition');
  assert.equal(ledger.entries[0].provenanceStatus,'REPLAY_VALIDATED_SOURCE_BOUND');
  assert.equal(ledger.screenTimeAuthority,false);
  assert.equal(ledger.xpAuthority,false);
  assert.equal(ledger.gamificationAuthority,false);
  assert.equal(ledger.legalComplianceAuthority,false);
  assert.equal(ledger.weeklyComplianceRule,'DEFERRED_TO_S10_LEGAL_CONFIGURATION');
  assert.equal(ledger.deficitRecoveryRule,'DEFERRED_TO_S10_LEGAL_CONFIGURATION');
  assert.equal(Object.isFrozen(ledger),true);assert.equal(Object.isFrozen(ledger.entries[0]),true);
}

{
  const {store,source}=await answeredStore({wrong:true});
  await appendSlice(store,source,{rawMs:1500});
  const ledger=buildValidatedLearningTimeLedger({lesson,events:store.events});
  assert.equal(ledger.entries[0].result,'INCORRECT');
  assert.equal(ledger.validatedLearningTimeMs,1500);
}

{
  const {store,source}=await answeredStore();
  const chain=await store.inspectSequenceChain(lesson.lessonId,lesson.contentVersion);
  const payload=makeTimeSlicePayload({
    previousMono:100,currentMono:100+60000,previousWall:10000,currentWall:70000,foreground:true,
    basis:'meaningful_interaction',sourceEventType:source.type,sourceEventId:source.eventId,sourceEventSeq:source.seq
  });
  assert.equal(payload.durationMs,0);
  const event=makeEvent({
    type:EventType.TIME_SLICE,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,
    seq:nextSequenceCandidate(chain.contiguousHead),itemId:source.itemId,payload,ts:80000,
    sessionId:source.sessionId,subjectId:source.subjectId,organisationId:source.organisationId,role:source.role
  });
  await store.append(event);
  const ledger=buildValidatedLearningTimeLedger({lesson,events:store.events});
  assert.equal(ledger.validatedLearningTimeMs,0);
  assert.equal(ledger.entryCount,0);
  assert.equal(ledger.excludedTimeSliceCount,1);
}

{
  const {store,source}=await answeredStore();
  await appendSlice(store,source,{rawMs:2000});
  const a=buildValidatedLearningTimeLedger({lesson,events:store.events});
  const b=buildValidatedLearningTimeLedger({lesson,events:[...store.events].reverse()});
  assert.deepEqual(a,b);
}

{
  const {store,source}=await answeredStore();
  await appendSlice(store,source,{rawMs:2000});
  store.events[0].seq=77;
  reject(()=>buildValidatedLearningTimeLedger({lesson,events:store.events}),'LEARNING_TIME_REPLAY_INVALID');
}

{
  const bad=structuredClone(lesson);bad.source.lane='RLS-08';
  reject(()=>buildValidatedLearningTimeLedger({lesson:bad,events:[]}),'LEARNING_TIME_SOURCE_LANE_BLOCKED');
}

console.log('RPM_S6_VALIDATED_LEARNING_TIME_LEDGER_PASS replay-validated-timeslices source-bound user-session-lesson-item-start-end-duration-result-attempt-evidence idle-excluded no-silent-retro-correction no-screen-xp-gamification-contamination legal-weekly-deficit-recovery-deferred');
