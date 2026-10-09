import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EventType, EVENT_POLICY_VERSION, eligibleSliceMs, makeEvent, makeTimeSlicePayload, validateEventPolicy } from './model.mjs';

assert.equal(EVENT_POLICY_VERSION, 4);
assert.equal(eligibleSliceMs(0, 45000, {foreground:true, meaningfulChange:true}), 45000);
assert.equal(eligibleSliceMs(0, 45001, {foreground:true, meaningfulChange:true}), 0, 'long idle gap must not retrocredit interaction time');
assert.equal(eligibleSliceMs(0, 100000, {foreground:true, meaningfulChange:false, audioPlaying:true}), 45000, 'continuous audio remains conservatively capped');

const idle = makeTimeSlicePayload({previousMono:0,currentMono:60000,previousWall:0,currentWall:60000,foreground:true,basis:'meaningful_interaction',sourceEventType:EventType.ITEM_ANSWERED,sourceEventId:'source-1',sourceEventSeq:1});
assert.equal(idle.durationMs,0);
assert.equal(idle.eligible,false);
assert.equal(idle.rawDurationMs,60000);
assert.equal(idle.idleGapSuppressed,true);

const good = makeTimeSlicePayload({previousMono:100,currentMono:1100,previousWall:1000,currentWall:2000,foreground:true,basis:'meaningful_interaction',sourceEventType:EventType.ITEM_ANSWERED,sourceEventId:'source-1',sourceEventSeq:1});
const event = makeEvent({type:EventType.TIME_SLICE,lessonId:'L',contentVersion:'v1',seq:2,itemId:'E01',payload:good,ts:2000,sessionId:'s',eventId:'time-1',subjectId:'u',organisationId:'o',role:'LEARNER'});
assert.equal(validateEventPolicy(event).valid,true);
assert.equal(validateEventPolicy({...event,payload:{...good,sourceEventType:EventType.AUDIO_STARTED}}).code,'TIME_SLICE_SOURCE_EVENT_INVALID');
assert.equal(validateEventPolicy({...event,payload:{...good,rawDurationMs:60000,durationMs:45000,idleGapSuppressed:false}}).code,'TIME_SLICE_IDLE_RETROCREDIT_FORBIDDEN');
assert.equal(validateEventPolicy({...event,payload:{...good,durationMs:500}}).code,'TIME_SLICE_DURATION_DERIVATION_MISMATCH');

const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
assert.ok(app.includes('AUDIO_STARTED is audit-only'));
assert.ok(!app.includes("append(EventType.AUDIO_STARTED, item.id, { textRef: item.id }, { timeBasis: 'meaningful_interaction' })"));
assert.ok(app.includes("{ timeBasis: 'audio_playback', timeFromMono: audioStartMono, timeFromWall: audioStartWall }"));
console.log('RPM_S2_TIME_IDLE_RETROCREDIT_PASS hard-gap-suppression no-audio-start-credit exact-duration-derivation audio-cap');
