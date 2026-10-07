import assert from 'node:assert/strict';
import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { EventType, makeEvent } from '../../../s2b/v2.6/model.mjs';
import { LessonPlayerContractError } from './lesson-player-engine.mjs';
import { LessonPlayerSessionError } from './session-controller.mjs';
import { CompletionRecoverySession } from './completion-recovery.mjs';
import { S3MemoryEventStore, correctLessonResponse } from './s3-test-support.mjs';

const scope={subjectId:'learner-s33',organisationId:'org-s33',role:'LEARNER'};

function activeLesson(){
  const x=structuredClone(lesson);
  x.lessonId='RLS07-P0-HELP-RECOVERY';
  x.contentVersion='rpm-rls07-p0-help-recovery@0.1.0';
  x.items=x.items.filter(i=>i.type!=='listen_repeat');
  return x;
}
function session(store,l,id){
  let t=1000;
  return new CompletionRecoverySession({lesson:l,eventStore:store,scope,sessionId:id,now:()=>t+=1000});
}
async function ready(s){
  let v=await s.start();
  while(v.currentItem){
    const i=v.currentItem;
    v=await s.answer(i.id,correctLessonResponse(i));
  }
  assert.equal(v.status,'READY_TO_COMPLETE');
  return v;
}

{
  const l=activeLesson(), store=new S3MemoryEventStore(), a=session(store,l,'ready-a');
  await ready(a);
  const before=a.recoveryState(), n=store.events.length;
  const b=session(store,l,'ready-b');
  const v=await b.start();
  assert.equal(v.status,'READY_TO_COMPLETE');
  assert.deepEqual(b.recoveryState(),before);
  assert.equal(store.events.length,n+1);
  assert.equal(store.events.at(-1).type,EventType.SESSION_STARTED);
}

{
  const l=activeLesson(), store=new S3MemoryEventStore(), a=session(store,l,'done-a');
  await ready(a);
  let v=await a.complete();
  assert.equal(v.status,'COMPLETED');
  const state=a.recoveryState(), n=store.events.length;
  assert.equal(store.events.filter(e=>e.type===EventType.LESSON_COMPLETED).length,1);
  v=await a.complete();
  assert.equal(v.status,'COMPLETED');
  assert.equal(store.events.length,n);
  const b=session(store,l,'done-b');
  v=await b.start();
  assert.equal(v.status,'COMPLETED');
  assert.deepEqual(b.recoveryState(),state);
  assert.equal(store.events.length,n);
}

{
  const l=activeLesson(), store=new S3MemoryEventStore(), s=session(store,l,'early');
  await s.start();
  const n=store.events.length;
  await assert.rejects(s.complete(),e=>e instanceof LessonPlayerContractError&&e.code==='LESSON_PLAYER_COMPLETION_GATE_CLOSED');
  assert.equal(store.events.length,n);
  assert.equal(store.events.some(e=>e.type===EventType.LESSON_COMPLETED),false);
}

{
  const l=activeLesson(), store=new S3MemoryEventStore(), a=session(store,l,'write-a');
  await ready(a);
  const state=a.recoveryState(), n=store.events.length;
  store.failNext=true;
  await assert.rejects(a.complete(),e=>e instanceof LessonPlayerSessionError&&e.code==='SESSION_EVENT_PERSIST_FAILED');
  assert.deepEqual(a.recoveryState(),state);
  assert.equal(store.events.length,n);
  const b=session(store,l,'write-b');
  await b.start();
  assert.deepEqual(b.recoveryState(),state);
  assert.equal((await b.complete()).status,'COMPLETED');
}

{
  const l=activeLesson(), store=new S3MemoryEventStore();
  store.events=[
    makeEvent({type:EventType.SESSION_STARTED,lessonId:l.lessonId,contentVersion:l.contentVersion,seq:1,itemId:null,payload:{recoveredFromSeq:0},ts:1000,sessionId:'seed',eventId:'seed-1',...scope}),
    makeEvent({type:EventType.ITEM_PRESENTED,lessonId:l.lessonId,contentVersion:l.contentVersion,seq:3,itemId:l.items[0].id,payload:{cursor:0},ts:3000,sessionId:'seed',eventId:'seed-3',...scope})
  ];
  const s=session(store,l,'invalid-sequence');
  const n=store.events.length, v=await s.start();
  assert.equal(v.status,'INTEGRITY_BLOCKED');
  assert.equal(s.recoveryState().integrityBlocked,true);
  assert.equal(store.events.length,n);
  await assert.rejects(s.answer(l.items[0].id,correctLessonResponse(l.items[0])),e=>e instanceof LessonPlayerSessionError&&e.code==='RECOVERY_INTEGRITY_BLOCKED');
  await assert.rejects(s.complete(),e=>e instanceof LessonPlayerSessionError&&e.code==='RECOVERY_INTEGRITY_BLOCKED');
  assert.equal(store.events.length,n);
}

await import('./s3-hosted-regression-extension.mjs');
await import('./s3-5-hosted-regression-extension.mjs');
await import('../../../s4/audio/v0.1/audio-mechanics-tests.mjs');
await import('../../../s4/speaking/v0.1/speaking-submission-tests.mjs');
await import('../../../s4/review/v0.1/human-review-bridge-tests.mjs');
await import('../../../s5/mastery/v0.1/mastery-engine-tests.mjs');
await import('../../../s5/review/v0.1/spaced-review-tests.mjs');
await import('../../../s5/gamification/v0.1/gamification-engine-tests.mjs');

console.log('RPM_S3_3_COMPLETION_RECOVERY_PASS ready-reload-equivalence completion-idempotent premature-blocked failed-write-stable invalid-sequence-readonly');
