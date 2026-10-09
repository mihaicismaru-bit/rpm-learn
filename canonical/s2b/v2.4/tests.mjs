import assert from 'node:assert/strict';
import { lesson } from './fixture.mjs';
import {
  EventType, reduceLessonState, eligibleSliceMs, scoreItem,
  classifyAppend, assertImmutableContentVersion, validateContentActivation,
  validateEventPolicy, makeTimeSlicePayload, makeEvent
} from './model.mjs';

const base=(seq,type,itemId,payload={}, overrides={})=>({schemaVersion:2,eventId:`e${seq}`,sessionId:'s1',subjectId:'dev-learner',organisationId:'dev-org',role:'LEARNER',seq,type,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,itemId,ts:1000+seq*1000,payload,...overrides});

assert.equal(scoreItem(lesson.items[0], 'Nu înțeleg.').correct, true);
assert.equal(scoreItem(lesson.items[0], 'Am terminat.').correct, false);
assert.equal(scoreItem(lesson.items[2], ['MAI','ÎNCET','VĂ','ROG']).correct, true);
assert.equal(scoreItem(lesson.items[5], null).humanReviewRequired, true);
assert.equal(eligibleSliceMs(0, 100000, {foreground:true, meaningfulChange:true}), 0);
assert.equal(eligibleSliceMs(0, 100000, {foreground:true, meaningfulChange:false, audioPlaying:true}), 45000);
assert.equal(eligibleSliceMs(0, 1000, {foreground:false, meaningfulChange:true}), 0);
const rollbackSlice = makeTimeSlicePayload({previousMono:1000,currentMono:2500,previousWall:5000,currentWall:1000,foreground:true,basis:'meaningful_interaction',sourceEventType:EventType.ITEM_ANSWERED,sourceEventId:'e8',sourceEventSeq:8});
assert.equal(rollbackSlice.durationMs, 1500);
assert.equal(rollbackSlice.clockBasis, 'performance.now');
assert.equal(rollbackSlice.wallClockRollbackDetected, true);
assert.equal(validateEventPolicy(base(9,EventType.TIME_SLICE,'E01',{policyVersion:4,eligible:true,durationMs:45001,basis:'meaningful_interaction',sourceEventType:EventType.ITEM_ANSWERED,sourceEventId:'e8',sourceEventSeq:8,rawDurationMs:45001,idleGapSuppressed:false,clockBasis:'performance.now',wallClockRollbackDetected:false,fromWallTs:0,toWallTs:45001})).code,'TIME_SLICE_DURATION_OUT_OF_RANGE');
assert.equal(validateEventPolicy(base(10,EventType.SPEAKING_SUBMITTED,'E06',{placeholder:true})).code,'SPEAKING_REVIEW_GATE_REQUIRED');
assert.equal(validateEventPolicy(base(11,EventType.TIME_SLICE,'E01',{policyVersion:4,eligible:true,durationMs:1000,basis:'meaningful_interaction',sourceEventType:EventType.ITEM_ANSWERED,sourceEventId:'e10',sourceEventSeq:10,rawDurationMs:1000,idleGapSuppressed:false,clockBasis:'performance.now',wallClockRollbackDetected:false,fromWallTs:0,toWallTs:1000})).valid,true);

const evs=[
 base(1,EventType.ITEM_ANSWERED,'E01',{response:'Nu înțeleg.',correct:true,humanReviewRequired:false,advance:true}),
 base(2,EventType.TIME_SLICE,'E01',{policyVersion:4,eligible:true,durationMs:12000,basis:'meaningful_interaction',sourceEventType:EventType.ITEM_ANSWERED,sourceEventId:'e1',sourceEventSeq:1,rawDurationMs:12000,idleGapSuppressed:false,clockBasis:'performance.now',wallClockRollbackDetected:false,fromWallTs:0,toWallTs:12000}),
 base(3,EventType.ITEM_ANSWERED,'E02',{response:'Am terminat.',correct:false,humanReviewRequired:false,advance:false}),
 base(4,EventType.ITEM_ANSWERED,'E02',{response:'Mai încet, vă rog.',correct:true,humanReviewRequired:false,advance:true}),
 base(5,EventType.ITEM_ANSWERED,'E03',{response:['MAI','ÎNCET','VĂ','ROG'],correct:true,humanReviewRequired:false,advance:true}),
 base(6,EventType.ITEM_ANSWERED,'E04',{response:'Vreau să aud din nou.',correct:true,humanReviewRequired:false,advance:true}),
 base(7,EventType.ITEM_ANSWERED,'E05',{response:'Unde scriu?',correct:true,humanReviewRequired:false,advance:true}),
 base(8,EventType.SPEAKING_SUBMITTED,'E06',{teacherReviewRequired:true})
];
const st=reduceLessonState(lesson,evs);
assert.equal(st.cursor,5);
assert.equal(st.xp,46);
assert.equal(st.activeMs,12000);
assert.deepEqual(st.attempts,{E01:1,E02:2,E03:1,E04:1,E05:1});
assert.deepEqual(st.speakingPending,['E06']);
assert.equal(st.mastery.functional_help.state,'PRACTISING');

const legacyTime={...base(6,EventType.TIME_SLICE,'E01',{policyVersion:3,eligible:true,durationMs:45000,basis:'meaningful_interaction',sourceEventType:EventType.ITEM_ANSWERED,clockBasis:'performance.now',wallClockRollbackDetected:false,fromWallTs:0,toWallTs:45000}),schemaVersion:2};
const orphanCurrent=base(7,EventType.TIME_SLICE,'E01',{policyVersion:4,eligible:true,durationMs:45000,rawDurationMs:45000,idleGapSuppressed:false,basis:'meaningful_interaction',sourceEventType:EventType.ITEM_ANSWERED,sourceEventId:'missing',sourceEventSeq:1,clockBasis:'performance.now',wallClockRollbackDetected:false,fromWallTs:0,toWallTs:45000});
assert.equal(reduceLessonState(lesson,[legacyTime]).activeMs,0,'legacy time policy must not replay as active time');
assert.equal(validateEventPolicy(orphanCurrent).valid,true,'model policy validates structure; store enforces source existence');
assert.equal(validateEventPolicy({...base(8,'UNKNOWN_EVENT','E01',{}),type:'UNKNOWN_EVENT'}).code,'UNKNOWN_EVENT_TYPE');

const same = base(1, EventType.ITEM_ANSWERED, 'E01', {response:'Nu înțeleg.',correct:true,humanReviewRequired:false,advance:true});
assert.equal(classifyAppend(same, {byEventId: structuredClone(same)}).action, 'duplicate');
assert.equal(classifyAppend({...same, payload:{correct:false}}, {byEventId: same}).code, 'EVENT_ID_REUSE_MISMATCH');
assert.equal(classifyAppend(base(1, EventType.ITEM_PRESENTED, 'E01', {}, {eventId:'other'}), {byScopeLessonVersionSeq:same}).code, 'SCOPE_LESSON_VERSION_SEQ_COLLISION');
assert.equal(classifyAppend(base(1, EventType.ITEM_PRESENTED, 'E01', {}, {eventId:'other'}), {byScopeSessionSeq:same}).code, 'SCOPE_SESSION_SEQ_COLLISION');
assert.equal(classifyAppend({...same, subjectId:''}).code, 'INVALID_EVENT_IDENTITY');

assert.equal(assertImmutableContentVersion(structuredClone(lesson), lesson), true);
assert.throws(() => assertImmutableContentVersion({...lesson, title:'mutated title'}, lesson), /cannot be mutated|identity mismatch/i);
const head={lessonId:lesson.lessonId,contentVersion:lesson.contentVersion};
assert.equal(validateContentActivation(head, lesson).action, 'reuse');
const next={...lesson,contentVersion:'rpm-rls07-p0-help-01@0.2.0'};
assert.equal(validateContentActivation(head,next).code,'CONTENT_MIGRATION_REQUIRED');
assert.equal(validateContentActivation(head,next,{migrationId:'mig-1',fromVersion:lesson.contentVersion,toVersion:next.contentVersion,strategy:'restart',humanApproved:true}).action,'migrate');


// Policy v4 replay provenance: structurally-valid orphan and duplicate time slices fail closed.
const p4source = makeEvent({type:EventType.ITEM_ANSWERED,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,seq:1,itemId:'E01',payload:{response:'Nu înțeleg.',correct:true,humanReviewRequired:false,advance:true},ts:1000,sessionId:'p4',eventId:'p4-source',subjectId:'dev-learner',organisationId:'dev-org',role:'LEARNER'});
const p4time = makeEvent({type:EventType.TIME_SLICE,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,seq:2,itemId:'E01',payload:{policyVersion:4,eligible:true,durationMs:1000,basis:'meaningful_interaction',sourceEventType:EventType.ITEM_ANSWERED,sourceEventId:'p4-source',sourceEventSeq:1,rawDurationMs:1000,idleGapSuppressed:false,clockBasis:'performance.now',wallClockRollbackDetected:false,fromWallTs:1000,toWallTs:2000},ts:2000,sessionId:'p4',eventId:'p4-time',subjectId:'dev-learner',organisationId:'dev-org',role:'LEARNER'});
const p4dup = {...structuredClone(p4time), eventId:'p4-time-dup', seq:3, payload:{...p4time.payload, durationMs:500, rawDurationMs:500, fromWallTs:2000, toWallTs:2500}};
assert.equal(reduceLessonState(lesson,[p4source,p4time,p4dup]).activeMs,1000,'replay credits at most one time slice per source event');
assert.equal(reduceLessonState(lesson,[p4time]).activeMs,0,'replay rejects orphan policy-v4 time slices');

console.log('RPM S1C hardening unit tests: PASS');
