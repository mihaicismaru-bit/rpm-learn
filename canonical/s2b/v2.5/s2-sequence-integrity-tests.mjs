import assert from 'node:assert/strict';
import fs from 'node:fs';
import { lesson } from './fixture.mjs';
import { EventType, makeEvent, validateSequenceContinuity, analyseReplaySequence, reduceLessonState, EVENT_SEQUENCE_POLICY_VERSION } from './model.mjs';

const mk=(seq,id,type=EventType.ITEM_ANSWERED,itemId='E01',payload={response:'Nu înțeleg.',correct:true,humanReviewRequired:false,advance:true},overrides={})=>makeEvent({
  type,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,seq,itemId,payload,ts:1000+seq,
  sessionId:'seq-session',eventId:id,subjectId:'seq-learner',organisationId:'seq-org',role:'LEARNER',...overrides
});
const e1=mk(1,'seq-e1');
const e2=mk(2,'seq-e2',EventType.ITEM_PRESENTED,'E02',{});
const e3=mk(3,'seq-e3',EventType.ITEM_ANSWERED,'E02',{response:'Mai încet, vă rog.',correct:true,humanReviewRequired:false,advance:true});
assert.equal(EVENT_SEQUENCE_POLICY_VERSION,3);
assert.equal(validateSequenceContinuity(e1,null).valid,true);
assert.equal(validateSequenceContinuity(e2,e1).code,'EVENT_SEQUENCE_CONTINUITY_PASS');
assert.equal(validateSequenceContinuity(e3,null).code,'EVENT_SEQUENCE_PREDECESSOR_MISSING');
assert.equal(validateSequenceContinuity(e3,{...e2,subjectId:'other'}).code,'EVENT_SEQUENCE_PREDECESSOR_MISMATCH');
const good=analyseReplaySequence(lesson,[e3,e1,e2]);
assert.equal(good.valid,true);
assert.equal(good.events.length,3);
const gap=analyseReplaySequence(lesson,[e1,e3]);
assert.equal(gap.valid,false);
assert.equal(gap.code,'REPLAY_SEQUENCE_GAP_OR_DUPLICATE');
assert.equal(gap.events.length,1);
assert.equal(gap.quarantinedCount,1);
const gapState=reduceLessonState(lesson,[e1,e3]);
assert.equal(gapState.attempts.E01,1);
assert.equal(gapState.attempts.E02,undefined,'events after a sequence gap must be quarantined from replay');

const store=fs.readFileSync(new URL('./event-store.mjs',import.meta.url),'utf8');
for (const marker of ['validateSequenceContinuity','event.seq - 1','new EventConflictError(continuity.code']) assert.ok(store.includes(marker),`store continuity guard missing ${marker}`);
console.log('RPM_S2_SEQUENCE_INTEGRITY_PASS append-predecessor-guard contiguous-replay-prefix gap-quarantine');
