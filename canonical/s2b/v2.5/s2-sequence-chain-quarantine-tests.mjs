import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lesson } from './fixture.mjs';
import { EventType, makeEvent, analyseReplaySequence, EVENT_SEQUENCE_POLICY_VERSION } from './model.mjs';

const mk=(seq,id)=>makeEvent({
  type:EventType.ITEM_PRESENTED,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,
  seq,itemId:'E01',payload:{},ts:1000+seq,sessionId:'chain-q',eventId:id,
  subjectId:'chain-learner',organisationId:'chain-org',role:'LEARNER'
});
const e1=mk(1,'q-e1');
const e3=mk(3,'q-e3');
const q=analyseReplaySequence(lesson,[e1,e3]);
assert.equal(EVENT_SEQUENCE_POLICY_VERSION,3);
assert.equal(q.valid,false);
assert.equal(q.contiguousHead,1);
assert.equal(q.maxObservedSeq,3);
assert.equal(q.quarantinedCount,1);
assert.deepEqual(q.quarantinedEventIds,['q-e3']);

const store=fs.readFileSync(new URL('./event-store.mjs',import.meta.url),'utf8');
for (const marker of ['analyseLearningReplay','EVENT_SEQUENCE_CHAIN_QUARANTINED','inspectSequenceChain','contiguousHead','maxObservedSeq']) {
  assert.ok(store.includes(marker),`event-store chain quarantine guard missing ${marker}`);
}
const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
for (const marker of ['inspectSequenceChain','chain.contiguousHead','renderSequenceIntegrityBlock','SEQUENCE_CHAIN_QUARANTINED']) {
  assert.ok(app.includes(marker),`app boot chain quarantine control missing ${marker}`);
}
console.log('RPM_S2_SEQUENCE_CHAIN_QUARANTINE_PASS contiguous-head corrupted-tail-block no-auto-heal');
