import assert from 'node:assert/strict';
import {lesson} from '../../../s2b/v2.6/fixture.mjs';
import {EventType,makeEvent,makeTimeSlicePayload,nextSequenceCandidate} from '../../../s2b/v2.6/model.mjs';
import {LessonPlayerSessionController} from '../../../s3/lesson-player/v0.1/session-controller.mjs';
import {S3MemoryEventStore,correctLessonResponse} from '../../../s3/lesson-player/v0.1/s3-test-support.mjs';
import {
  buildLegalConfigurationCandidate,
  evaluateLegalConfigurationSimulationFromS6,
  LegalConfigurationError
} from './legal-configuration-candidate.mjs';

const scope={subjectId:'learner-s10-bound',organisationId:'org-s10-bound',role:'LEARNER'};
const candidate=buildLegalConfigurationCandidate({
  configId:'S10-S6-BOUND-TEST',configVersion:'test-v1',weeklyRequirementMs:1,
  minimumPeriodWeeks:1,recoveryAllowed:false,recoveryWindowWeeks:0,
  sourceAuthorityRef:'TEST-ONLY-NOT-LEGAL-AUTHORITY'
});

async function source(){
  const store=new S3MemoryEventStore();let tick=1000;
  const controller=new LessonPlayerSessionController({lesson,eventStore:store,scope,sessionId:'s10-s6-session',now:()=>tick+=1000});
  const view=await controller.start();
  await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  const answered=[...store.events].reverse().find(event=>event.type===EventType.ITEM_ANSWERED);
  const chain=await store.inspectSequenceChain(lesson.lessonId,lesson.contentVersion);
  const payload=makeTimeSlicePayload({
    previousMono:100,currentMono:2100,previousWall:10000,currentWall:12000,foreground:true,
    basis:'meaningful_interaction',sourceEventType:answered.type,sourceEventId:answered.eventId,sourceEventSeq:answered.seq
  });
  const event=makeEvent({
    type:EventType.TIME_SLICE,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,
    seq:nextSequenceCandidate(chain.contiguousHead),itemId:answered.itemId,payload,ts:20000,
    sessionId:answered.sessionId,subjectId:answered.subjectId,organisationId:answered.organisationId,role:answered.role
  });
  await store.append(event);
  return {lesson,events:store.events};
}
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof LegalConfigurationError&&e.code===code,code);

const validSource=await source();
const report=evaluateLegalConfigurationSimulationFromS6({
  candidate,subjectId:scope.subjectId,organisationId:scope.organisationId,
  weeklySources:[{weekLabel:'2026-W40',...validSource}]
});
assert.equal(report.sourceProvenance,'S6_REPLAY_VALIDATED');
assert.equal(report.subjectId,scope.subjectId);
assert.equal(report.organisationId,scope.organisationId);
assert.equal(report.weeks.length,1);
assert.equal(report.weeks[0].validatedLearningTimeMs,2000);
assert.equal(report.weeks[0].provenance.learningTimeLedgerVersion,1);
assert.equal(report.weeks[0].provenance.learningTimeEntryCount,1);
assert.equal(report.legalClaim,false);
assert.equal(report.productionComplianceAuthority,false);
assert.equal(report.certificateAuthority,false);

reject(()=>evaluateLegalConfigurationSimulationFromS6({
  candidate,subjectId:'other-learner',organisationId:scope.organisationId,
  weeklySources:[{weekLabel:'2026-W40',...validSource}]
}),'LEGAL_CONFIG_S6_SCOPE_MISMATCH');

reject(()=>evaluateLegalConfigurationSimulationFromS6({
  candidate,subjectId:scope.subjectId,organisationId:scope.organisationId,
  weeklySources:[
    {weekLabel:'2026-W40',...validSource},
    {weekLabel:'2026-W41',...validSource}
  ]
}),'LEGAL_CONFIG_S6_SOURCE_REUSE_FORBIDDEN');

const tampered=structuredClone(validSource.events);
tampered[0].seq=999;
reject(()=>evaluateLegalConfigurationSimulationFromS6({
  candidate,subjectId:scope.subjectId,organisationId:scope.organisationId,
  weeklySources:[{weekLabel:'2026-W40',lesson,events:tampered}]
}),'LEGAL_CONFIG_S6_REPLAY_INVALID');

console.log('RPM_S10_S6_REPLAY_BOUND_PROVENANCE_PASS rebuilds-ledger-from-events tenant-subject-bound source-reuse-blocked tamper-fail-closed no-legal-certificate-authority');
