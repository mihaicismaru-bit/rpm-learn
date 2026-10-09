import assert from 'node:assert/strict';
import {lesson} from '../../../s2b/v2.6/fixture.mjs';
import {EventType,makeEvent,makeTimeSlicePayload,nextSequenceCandidate} from '../../../s2b/v2.6/model.mjs';
import {LessonPlayerSessionController} from '../../../s3/lesson-player/v0.1/session-controller.mjs';
import {S3MemoryEventStore,correctLessonResponse} from '../../../s3/lesson-player/v0.1/s3-test-support.mjs';
import {buildLegalConfigurationCandidate,evaluateLegalConfigurationSimulationFromS6} from './legal-configuration-candidate.mjs';

// Diagnostic: S6 proves learning-time events, not calendar-week legal allocation.
const scope={subjectId:'week-gap-learner',organisationId:'week-gap-org',role:'LEARNER'};
const candidate=buildLegalConfigurationCandidate({
  configId:'S10-WEEK-GAP-DIAGNOSTIC',configVersion:'test-v1',
  weeklyRequirementMs:1,minimumPeriodWeeks:1,recoveryAllowed:false,
  recoveryWindowWeeks:0,sourceAuthorityRef:'TEST-ONLY-NOT-LEGAL-AUTHORITY'
});
const store=new S3MemoryEventStore();let tick=1000;
const controller=new LessonPlayerSessionController({
  lesson,eventStore:store,scope,sessionId:'s10-week-gap-session',now:()=>tick+=1000
});
const view=await controller.start();
await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
const answered=[...store.events].reverse().find(e=>e.type===EventType.ITEM_ANSWERED);
assert.ok(answered);
const chain=await store.inspectSequenceChain(lesson.lessonId,lesson.contentVersion);
await store.append(makeEvent({
  type:EventType.TIME_SLICE,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,
  seq:nextSequenceCandidate(chain.contiguousHead),itemId:answered.itemId,
  payload:makeTimeSlicePayload({
    previousMono:100,currentMono:2100,previousWall:10000,currentWall:12000,
    foreground:true,basis:'meaningful_interaction',sourceEventType:answered.type,
    sourceEventId:answered.eventId,sourceEventSeq:answered.seq
  }),
  ts:20000,sessionId:answered.sessionId,subjectId:answered.subjectId,
  organisationId:answered.organisationId,role:answered.role
}));
const evaluate=weekLabel=>evaluateLegalConfigurationSimulationFromS6({
  candidate,subjectId:scope.subjectId,organisationId:scope.organisationId,
  weeklySources:[{weekLabel,lesson,events:store.events}]
});
const original=evaluate('2026-W40'),reassigned=evaluate('2048-W01');
for(const report of [original,reassigned]){
  assert.equal(report.sourceProvenance,'S6_REPLAY_VALIDATED');
  assert.equal(report.status,'SIMULATION_ONLY_LEGAL_BLUEPRINT_REQUIRED');
  assert.equal(report.weeks.length,1);
  assert.equal(report.weeks[0].validatedLearningTimeMs,2000);
  assert.equal(report.weeks[0].simulationStatus,'SIMULATED_MEETS_RULE');
  // Explicitly disallow any future claim of week-attribution authority.
  assert.notEqual(report.weekAttributionAuthority,true);
  assert.notEqual(report.weeks[0].weekAttributionAuthority,true);
  for(const field of ['legalClaim','legalBlueprintFinal','productionComplianceAuthority','certificateAuthority'])
    assert.equal(report[field],false,field);
}
assert.notEqual(original.weeks[0].weekLabel,reassigned.weeks[0].weekLabel);
// A PASS marker means that the attribution GAP is reproduced, not fixed.
// Calendar, jurisdiction and timezone mapping require separately approved rules.
console.log('RPM_S10_S6_WEEK_ATTRIBUTION_GAP_REPRODUCED same-S6-ledger-reassigned-week no-legal-or-certificate-authority');
