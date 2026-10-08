import assert from 'node:assert/strict';
import {lesson} from '../../../s2b/v2.6/fixture.mjs';
import {EventType,makeEvent,makeTimeSlicePayload,nextSequenceCandidate} from '../../../s2b/v2.6/model.mjs';
import {LessonPlayerSessionController} from '../../../s3/lesson-player/v0.1/session-controller.mjs';
import {S3MemoryEventStore,correctLessonResponse} from '../../../s3/lesson-player/v0.1/s3-test-support.mjs';
import {buildLegalConfigurationCandidate,evaluateLegalConfigurationSimulationFromS6,LegalConfigurationError} from './legal-configuration-candidate.mjs';

// Integration-only S6 -> S10 evidence boundary. No legal, compliance or certificate authority.
const scope={subjectId:'scope-test-learner',organisationId:'scope-test-organisation',role:'LEARNER'};
const candidate=buildLegalConfigurationCandidate({
  configId:'S10-SCOPE-LANE-QA',configVersion:'test-v1',weeklyRequirementMs:1,
  minimumPeriodWeeks:1,recoveryAllowed:false,recoveryWindowWeeks:0,
  sourceAuthorityRef:'TEST-ONLY-NOT-LEGAL-AUTHORITY'
});
const store=new S3MemoryEventStore();
let tick=1000;
const controller=new LessonPlayerSessionController({
  lesson,eventStore:store,scope,sessionId:'s10-scope-lane-session',now:()=>tick+=1000
});
const view=await controller.start();
await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
const answered=[...store.events].reverse().find(e=>e.type===EventType.ITEM_ANSWERED);
assert.ok(answered);
const chain=await store.inspectSequenceChain(lesson.lessonId,lesson.contentVersion);
const payload=makeTimeSlicePayload({
  previousMono:100,currentMono:2100,previousWall:10000,currentWall:12000,
  foreground:true,basis:'meaningful_interaction',sourceEventType:answered.type,
  sourceEventId:answered.eventId,sourceEventSeq:answered.seq
});
await store.append(makeEvent({
  type:EventType.TIME_SLICE,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,
  seq:nextSequenceCandidate(chain.contiguousHead),itemId:answered.itemId,payload,ts:20000,
  sessionId:answered.sessionId,subjectId:answered.subjectId,
  organisationId:answered.organisationId,role:answered.role
}));

const source={weekLabel:'2026-W40',lesson,events:store.events};
const run=(weeklySources,subjectId=scope.subjectId,organisationId=scope.organisationId)=>
  evaluateLegalConfigurationSimulationFromS6({candidate,subjectId,organisationId,weeklySources});
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof LegalConfigurationError&&e.code===code,code);
const accepted=run([source]);
assert.equal(accepted.sourceProvenance,'S6_REPLAY_VALIDATED');
assert.equal(accepted.weeks[0].validatedLearningTimeMs,2000);
assert.equal(accepted.weeks[0].provenance.learningTimeEntryCount,1);
for(const key of ['legalClaim','legalBlueprintFinal','productionComplianceAuthority','certificateAuthority'])
  assert.equal(accepted[key],false,key);
assert.deepEqual(run([{...source,events:[...source.events].reverse()}]),accepted);
reject(()=>run([source],'someone-else'), 'LEGAL_CONFIG_S6_SCOPE_MISMATCH');
reject(()=>run([source],scope.subjectId,'another-organisation'), 'LEGAL_CONFIG_S6_SCOPE_MISMATCH');
reject(()=>run([{...source,lesson:{...lesson,source:{...lesson.source,lane:'RLS-08'}}}]),
  'LEGAL_CONFIG_S6_REPLAY_INVALID');
reject(()=>run([{...source,lesson:{...lesson,source:{...lesson.source,audience:'9-15'}}}]),
  'LEGAL_CONFIG_S6_REPLAY_INVALID');
reject(()=>run([{...source,validatedLearningTimeMs:5000000}]),
  'LEGAL_CONFIG_WEEKLY_S6_SOURCE_SHAPE_INVALID');
reject(()=>run([{...source,xp:999999}]),'LEGAL_CONFIG_WEEKLY_S6_SOURCE_SHAPE_INVALID');
reject(()=>run([{...source,certificateAuthority:true}]),
  'LEGAL_CONFIG_WEEKLY_S6_SOURCE_SHAPE_INVALID');
reject(()=>run([source,{...source,weekLabel:'2026-W41'}]),
  'LEGAL_CONFIG_S6_SOURCE_REUSE_FORBIDDEN');
const tampered=structuredClone(source.events);
tampered[0].seq=999;
reject(()=>run([{...source,events:tampered}]),'LEGAL_CONFIG_S6_REPLAY_INVALID');
console.log('RPM_S10_S6_SCOPE_ADULT_LANE_PASS replay-invariance learner-tenant-scope adult-RLS07-only caller-time-xp-certificate-fields-denied duplicate-source-denied no-legal-authority');
