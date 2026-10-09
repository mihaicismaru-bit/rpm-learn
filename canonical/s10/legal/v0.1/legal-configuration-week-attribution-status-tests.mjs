import assert from 'node:assert/strict';
import {lesson} from '../../../s2b/v2.6/fixture.mjs';
import {EventType,makeEvent,makeTimeSlicePayload,nextSequenceCandidate} from '../../../s2b/v2.6/model.mjs';
import {LessonPlayerSessionController} from '../../../s3/lesson-player/v0.1/session-controller.mjs';
import {S3MemoryEventStore,correctLessonResponse} from '../../../s3/lesson-player/v0.1/s3-test-support.mjs';
import {buildLegalConfigurationCandidate,evaluateLegalConfigurationSimulationFromS6} from './legal-configuration-candidate.mjs';

const scope={subjectId:'learner-week-status',organisationId:'org-week-status',role:'LEARNER'};
const candidate=buildLegalConfigurationCandidate({
  configId:'WEEK-ATTRIBUTION-STATUS-TEST',configVersion:'v1',weeklyRequirementMs:1,
  minimumPeriodWeeks:1,recoveryAllowed:false,recoveryWindowWeeks:0,
  sourceAuthorityRef:'TEST-ONLY-NOT-LEGAL-AUTHORITY'
});

const store=new S3MemoryEventStore();let tick=1000;
const controller=new LessonPlayerSessionController({lesson,eventStore:store,scope,sessionId:'week-status-session',now:()=>tick+=1000});
const view=await controller.start();
await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
const answered=[...store.events].reverse().find(event=>event.type===EventType.ITEM_ANSWERED);
const chain=await store.inspectSequenceChain(lesson.lessonId,lesson.contentVersion);
const payload=makeTimeSlicePayload({
  previousMono:100,currentMono:1100,previousWall:10000,currentWall:11000,foreground:true,
  basis:'meaningful_interaction',sourceEventType:answered.type,sourceEventId:answered.eventId,sourceEventSeq:answered.seq
});
await store.append(makeEvent({
  type:EventType.TIME_SLICE,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,
  seq:nextSequenceCandidate(chain.contiguousHead),itemId:answered.itemId,payload,ts:20000,
  sessionId:answered.sessionId,subjectId:answered.subjectId,organisationId:answered.organisationId,role:answered.role
}));

const report=evaluateLegalConfigurationSimulationFromS6({
  candidate,subjectId:scope.subjectId,organisationId:scope.organisationId,
  weeklySources:[{weekLabel:'2026-W40',lesson,events:store.events}]
});
assert.equal(report.weekAttributionAuthority,false);
assert.equal(report.weekAttributionStatus,'UNVERIFIED_SIMULATION_INPUT');
assert.equal(report.weeks[0].weekAttributionAuthority,false);
assert.equal(report.weeks[0].weekAttributionStatus,'UNVERIFIED_SIMULATION_INPUT');
assert.equal(report.legalClaim,false);
assert.equal(report.productionComplianceAuthority,false);
assert.equal(report.certificateAuthority,false);
console.log('RPM_S10_WEEK_ATTRIBUTION_FAIL_CLOSED_PASS explicit-unverified-marker no-week-authority no-legal-certificate-authority');
