import assert from 'node:assert/strict';
import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { EventType } from '../../../s2b/v2.6/model.mjs';
import { deriveLessonPlayerView } from '../../../s3/lesson-player/v0.1/lesson-player-engine.mjs';
import { LessonPlayerSessionController } from '../../../s3/lesson-player/v0.1/session-controller.mjs';
import { S3MemoryEventStore, correctLessonResponse } from '../../../s3/lesson-player/v0.1/s3-test-support.mjs';
import { SpeakingSubmissionError, createSpeakingSubmissionDescriptor, createSpeakingSubmissionIntent, createSpeakingSubmissionService } from './speaking-submission.mjs';

const scope = { subjectId: 'learner-s42', organisationId: 'org-s42', role: 'LEARNER' };
const reject = async (p, code) => assert.rejects(p, e => e instanceof SpeakingSubmissionError && e.code === code, code);
const throws = (fn, code) => assert.throws(fn, e => e instanceof SpeakingSubmissionError && e.code === code, code);
async function staged() {
  const store = new S3MemoryEventStore(); let t = 1000;
  const controller = new LessonPlayerSessionController({ lesson, eventStore: store, scope, sessionId: 'stage', now: () => (t += 1000) });
  let view = await controller.start();
  while (view.currentItem && view.currentItem.id !== 'E06') view = await controller.answer(view.currentItem.id, correctLessonResponse(view.currentItem));
  assert.equal(view.status, 'ACTIVE'); assert.equal(view.currentItem.id, 'E06'); assert.equal(view.interaction.kind, 'SPEAKING');
  return { store, view };
}
{
  const { store } = await staged(); const events = await store.listEvents(lesson.lessonId, lesson.contentVersion);
  const d = createSpeakingSubmissionDescriptor({ lesson, events, scope, itemId: 'E06', mediaRef: 'media://E06/1', clientSubmissionId: 'sub-1' });
  const i = createSpeakingSubmissionIntent(d);
  assert.equal(d.sourceLane, 'RLS-07'); assert.equal(d.audience, '16+'); assert.equal(i.type, EventType.SPEAKING_SUBMITTED);
  assert.equal(i.payload.teacherReviewRequired, true); assert.equal(i.payload.reviewState, 'PENDING_HUMAN_REVIEW');
  assert.equal(i.payload.autoApproved, false); assert.equal(i.payload.advance, false); assert.equal(i.payload.xpDelta, 0); assert.equal(i.payload.masteryDelta, 0);
  assert.equal(i.payload.validatedTimeAuthority, false); assert.equal(i.payload.certificateAuthority, false); assert.equal(i.payload.legalAuthority, false);
}
{
  const { store, view: before } = await staged(); let t = 20000;
  const svc = createSpeakingSubmissionService({ lesson, eventStore: store, scope, sessionId: 'submit', now: () => (t += 1000) });
  const req = { itemId: 'E06', mediaRef: 'media://E06/1', clientSubmissionId: 'sub-1' }; const n = store.events.length;
  const a = await svc.submit(req); assert.equal(a.persistence, 'PERSISTED'); assert.equal(a.status, 'PENDING_HUMAN_REVIEW'); assert.equal(store.events.length, n + 1);
  const after = deriveLessonPlayerView(lesson, await store.listEvents(lesson.lessonId, lesson.contentVersion));
  assert.equal(after.status, 'AWAITING_HUMAN_REVIEW'); assert.deepEqual(after.speakingPending, ['E06']); assert.equal(after.progress.completedItems, before.progress.completedItems);
  assert.equal(after.xp, before.xp); assert.equal(after.activeMs, before.activeMs); assert.deepEqual(after.mastery, before.mastery); assert.equal(after.canComplete, false);
  const svc2 = createSpeakingSubmissionService({ lesson, eventStore: store, scope, sessionId: 'reload', now: () => (t += 1000) });
  const b = await svc2.submit(req); assert.equal(b.persistence, 'IDEMPOTENT_REPLAY'); assert.equal(b.eventId, a.eventId); assert.equal(store.events.length, n + 1);
  await reject(svc2.submit({ ...req, mediaRef: 'media://E06/different' }), 'SPEAKING_CLIENT_ID_REUSE_MISMATCH');
  await reject(svc2.submit({ ...req, clientSubmissionId: 'sub-2' }), 'SPEAKING_REVIEW_PENDING_RESUBMIT_FORBIDDEN');
}
{
  const { store } = await staged();
  const foreign = createSpeakingSubmissionService({ lesson, eventStore: store, scope: { subjectId: 'other', organisationId: 'other-org', role: 'LEARNER' }, sessionId: 'foreign' });
  await reject(foreign.submit({ itemId: 'E06', mediaRef: 'media://E06/x', clientSubmissionId: 'foreign' }), 'SPEAKING_EVENT_SCOPE_MISMATCH');
  throws(() => createSpeakingSubmissionService({ lesson, eventStore: store, scope: { subjectId: 'teacher', organisationId: 'org-s42', role: 'TEACHER' }, sessionId: 'teacher' }), 'SPEAKING_SCOPE_ROLE_FORBIDDEN');
}
{
  const { store } = await staged(); const svc = createSpeakingSubmissionService({ lesson, eventStore: store, scope, sessionId: 'retry' }); const n = store.events.length;
  store.failNext = true; await reject(svc.submit({ itemId: 'E06', mediaRef: 'media://E06/retry', clientSubmissionId: 'retry-1' }), 'SPEAKING_PERSIST_FAILED'); assert.equal(store.events.length, n);
  const ok = await svc.submit({ itemId: 'E06', mediaRef: 'media://E06/retry', clientSubmissionId: 'retry-1' }); assert.equal(ok.persistence, 'PERSISTED'); assert.equal(store.events.length, n + 1);
}
{
  const rls08 = structuredClone(lesson); rls08.lessonId = 'RLS08-P0-HELP-01'; rls08.contentVersion = 'rpm-rls08@0.1.0'; rls08.source.lane = 'RLS-08'; rls08.source.level = 'A1';
  throws(() => createSpeakingSubmissionDescriptor({ lesson: rls08, events: [], scope, itemId: 'E06', mediaRef: 'media://E06/x', clientSubmissionId: 'blocked' }), 'SPEAKING_SOURCE_LANE_BLOCKED');
}
{
  const { store } = await staged(); const events = await store.listEvents(lesson.lessonId, lesson.contentVersion);
  const d = createSpeakingSubmissionDescriptor({ lesson, events, scope, itemId: 'E06', mediaRef: 'media://E06/shape', clientSubmissionId: 'shape-1' });
  throws(() => createSpeakingSubmissionIntent({ ...d, unexpectedAuthority: true }), 'SPEAKING_DESCRIPTOR_SHAPE_INVALID');
}
{
  const { store } = await staged(); let t = 30000;
  const svc = createSpeakingSubmissionService({ lesson, eventStore: store, scope, sessionId: 'tamper', now: () => (t += 1000) });
  const req = { itemId: 'E06', mediaRef: 'media://E06/tamper', clientSubmissionId: 'tamper-1' };
  await svc.submit(req);
  const speaking = store.events.find(e => e.type === EventType.SPEAKING_SUBMITTED);
  speaking.payload.validatedTimeMs = 999;
  const reload = createSpeakingSubmissionService({ lesson, eventStore: store, scope, sessionId: 'tamper-reload', now: () => (t += 1000) });
  await reject(reload.submit(req), 'SPEAKING_EVENT_PAYLOAD_SHAPE_INVALID');
  delete speaking.payload.validatedTimeMs;
  speaking.authority = { validatedTime: true };
  await reject(reload.submit(req), 'SPEAKING_EVENT_SHAPE_INVALID');
}
{
  const { store } = await staged(); let t = 40000;
  const svc = createSpeakingSubmissionService({ lesson, eventStore: store, scope, sessionId: 'replay', now: () => (t += 1000) });
  const req = { itemId: 'E06', mediaRef: 'media://E06/replay', clientSubmissionId: 'replay-1' };
  await svc.submit(req);
  store.events[0].seq = 999;
  const reload = createSpeakingSubmissionService({ lesson, eventStore: store, scope, sessionId: 'replay-reload', now: () => (t += 1000) });
  await reject(reload.submit(req), 'SPEAKING_REPLAY_BEFORE_SUBMIT_INVALID');
}

console.log('RPM_S4_2_SPEAKING_SUBMISSION_PASS evidence-only pending-human-review RLS07-provenance idempotent-replay resubmission-blocked persistence-readback cross-scope-blocked no-path-xp-mastery-validtime-certificate-legal-authority exact-descriptor-event-payload-shapes replay-before-idempotent-return');
