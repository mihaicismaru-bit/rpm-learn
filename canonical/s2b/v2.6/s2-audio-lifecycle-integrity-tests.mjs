import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lesson } from './fixture.mjs';
import {
  EventType, makeEvent, analyseLearningReplay, validateEventSemantics,
  EVENT_SEMANTIC_POLICY_VERSION
} from './model.mjs';

const scope={subjectId:'audio-learner',organisationId:'audio-org',role:'LEARNER'};
const mk=(seq,id,type,itemId='E01',payload={},sessionId='audio-s')=>makeEvent({
  type,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,seq,itemId,payload,
  ts:6000+seq,sessionId,eventId:id,...scope
});

assert.equal(EVENT_SEMANTIC_POLICY_VERSION,4);

const badTextRef=validateEventSemantics(lesson,mk(1,'aud-start-bad',EventType.AUDIO_STARTED,'E01',{textRef:'E04'}),{
  state:{cursor:0,speakingPending:[]},eventById:new Map(),creditedTimeSources:new Set(),closedAudioStartIds:new Set()
});
assert.equal(badTextRef.code,'AUDIO_START_CANONICAL_TEXT_REF_MISMATCH');

const orphanEnd=analyseLearningReplay(lesson,[
  mk(1,'aud-end-orphan',EventType.AUDIO_ENDED,'E01',{audioStartEventId:'missing',audioStartEventSeq:1})
]);
assert.equal(orphanEnd.valid,false);
assert.equal(orphanEnd.code,'AUDIO_END_START_EVENT_NOT_FOUND');
assert.equal(orphanEnd.contiguousHead,0);

const start=mk(1,'aud-start-1',EventType.AUDIO_STARTED,'E01',{textRef:'E01'});
const wrongSeqEnd=analyseLearningReplay(lesson,[
  start,
  mk(2,'aud-end-wrong-seq',EventType.AUDIO_ENDED,'E01',{audioStartEventId:start.eventId,audioStartEventSeq:99})
]);
assert.equal(wrongSeqEnd.valid,false);
assert.equal(wrongSeqEnd.code,'AUDIO_END_START_EVENT_MISMATCH');
assert.equal(wrongSeqEnd.contiguousHead,1);

const end=mk(2,'aud-end-1',EventType.AUDIO_ENDED,'E01',{audioStartEventId:start.eventId,audioStartEventSeq:start.seq});
const validReplay=analyseLearningReplay(lesson,[start,end]);
assert.equal(validReplay.valid,true);
assert.deepEqual(validReplay.closedAudioStartEventIds,[start.eventId]);

const duplicateEnd=mk(3,'aud-end-dup',EventType.AUDIO_ENDED,'E01',{audioStartEventId:start.eventId,audioStartEventSeq:start.seq});
const tail=mk(4,'aud-tail',EventType.ITEM_PRESENTED,'E01',{});
const duplicateReplay=analyseLearningReplay(lesson,[start,end,duplicateEnd,tail]);
assert.equal(duplicateReplay.valid,false);
assert.equal(duplicateReplay.code,'AUDIO_START_ALREADY_CLOSED');
assert.equal(duplicateReplay.contiguousHead,2);
assert.equal(duplicateReplay.quarantinedCount,2);

const model=fs.readFileSync(new URL('./model.mjs',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
for(const marker of [
  'EVENT_SEMANTIC_POLICY_VERSION = 4',
  'AUDIO_START_CANONICAL_TEXT_REF_MISMATCH',
  'AUDIO_END_START_REFERENCE_REQUIRED',
  'AUDIO_END_START_EVENT_NOT_FOUND',
  'AUDIO_END_START_EVENT_MISMATCH',
  'AUDIO_START_ALREADY_CLOSED',
  'closedAudioStartEventIds'
]) assert.ok(model.includes(marker),`audio lifecycle model missing ${marker}`);
for(const marker of ['audioStartEventId','audioStartEventSeq']) assert.ok(app.includes(marker),`audio lifecycle app missing ${marker}`);
console.log('RPM_S2_AUDIO_LIFECYCLE_INTEGRITY_PASS canonical-start-ref end-start-provenance single-close replay-tail-quarantine');
