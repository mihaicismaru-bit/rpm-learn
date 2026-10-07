import assert from 'node:assert/strict';
import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { LessonPlayerSessionController } from '../../../s3/lesson-player/v0.1/session-controller.mjs';
import { S3MemoryEventStore, correctLessonResponse } from '../../../s3/lesson-player/v0.1/s3-test-support.mjs';
import { createSpeakingSubmissionService } from '../../speaking/v0.1/speaking-submission.mjs';
import { HumanReviewBridgeError, createHumanReviewBridgeService } from './human-review-bridge.mjs';

const learnerScope = { subjectId: 'learner-s43', organisationId: 'org-s43', role: 'LEARNER' };
const reviewer = { reviewerId: 'teacher-s43', organisationId: 'org-s43', role: 'TEACHER' };
const reject = async (promise, code) => assert.rejects(promise, error => error instanceof HumanReviewBridgeError && error.code === code, code);
const throws = (fn, code) => assert.throws(fn, error => error instanceof HumanReviewBridgeError && error.code === code, code);

class MemoryReviewStore {
  constructor() {
    this.reviews = [];
    this.failNext = false;
  }
  async open() { return true; }
  async listReviews() { return this.reviews.map(record => structuredClone(record)); }
  async appendReview(record) {
    if (this.failNext) {
      this.failNext = false;
      throw Object.assign(new Error('simulated review store failure'), { code: 'SIMULATED_REVIEW_STORE_FAILURE' });
    }
    const existing = this.reviews.find(candidate => candidate.reviewId === record.reviewId);
    if (existing) return { status: 'duplicate', record: structuredClone(existing) };
    this.reviews.push(structuredClone(record));
    return { status: 'appended', record: structuredClone(record) };
  }
}

async function submittedSpeakingEvent(clientSubmissionId = 'submission-1') {
  const eventStore = new S3MemoryEventStore();
  let tick = 1000;
  const controller = new LessonPlayerSessionController({
    lesson,
    eventStore,
    scope: learnerScope,
    sessionId: 'learner-session',
    now: () => (tick += 1000)
  });
  let view = await controller.start();
  while (view.currentItem && view.currentItem.id !== 'E06') {
    view = await controller.answer(view.currentItem.id, correctLessonResponse(view.currentItem));
  }
  assert.equal(view.currentItem.id, 'E06');
  const submission = createSpeakingSubmissionService({
    lesson,
    eventStore,
    scope: learnerScope,
    sessionId: 'speaking-submit',
    now: () => (tick += 1000)
  });
  await submission.submit({
    itemId: 'E06',
    mediaRef: `media://E06/${clientSubmissionId}`,
    clientSubmissionId
  });
  const speakingEvent = eventStore.events.find(event => event.type === 'SPEAKING_SUBMITTED');
  assert.ok(speakingEvent);
  return structuredClone(speakingEvent);
}

{
  const speakingEvent = await submittedSpeakingEvent('approved-source');
  const store = new MemoryReviewStore();
  let now = 50000;
  const service = createHumanReviewBridgeService({ reviewStore: store, reviewer, now: () => ++now });
  const result = await service.review({ speakingEvent, clientReviewId: 'review-approved-1', decision: 'APPROVED' });
  assert.equal(result.persistence, 'PERSISTED');
  assert.equal(result.status, 'APPROVED');
  assert.equal(result.reviewResolved, true);
  assert.equal(result.humanAuthority, 'HUMAN_ONLY');
  assert.equal(result.pathAdvanced, false);
  assert.equal(result.xpDelta, 0);
  assert.equal(result.masteryDelta, 0);
  assert.equal(result.validatedTimeAuthority, false);
  assert.equal(result.certificateAuthority, false);
  assert.equal(result.legalAuthority, false);
  assert.equal(store.reviews.length, 1);
}

{
  const speakingEvent = await submittedSpeakingEvent('rejected-source');
  const store = new MemoryReviewStore();
  const service = createHumanReviewBridgeService({ reviewStore: store, reviewer, now: () => 60001 });
  const result = await service.review({ speakingEvent, clientReviewId: 'review-rejected-1', decision: 'REJECTED' });
  assert.equal(result.status, 'REJECTED');
  assert.equal(result.pathAdvanced, false);
  assert.equal(store.reviews.length, 1);
}

{
  const speakingEvent = await submittedSpeakingEvent('idem-source');
  const store = new MemoryReviewStore();
  const service = createHumanReviewBridgeService({ reviewStore: store, reviewer, now: () => 70001 });
  const request = { speakingEvent, clientReviewId: 'review-idem-1', decision: 'APPROVED' };
  const first = await service.review(request);
  const second = await service.review(request);
  assert.equal(second.persistence, 'IDEMPOTENT_REPLAY');
  assert.equal(second.reviewId, first.reviewId);
  assert.equal(store.reviews.length, 1);
  await reject(service.review({ ...request, decision: 'REJECTED' }), 'HUMAN_REVIEW_CLIENT_ID_REUSE_MISMATCH');
  await reject(service.review({ ...request, clientReviewId: 'review-idem-2' }), 'HUMAN_REVIEW_EVIDENCE_ALREADY_DECIDED');
}

{
  const speakingEvent = await submittedSpeakingEvent('tenant-source');
  const store = new MemoryReviewStore();
  const foreignReviewer = { reviewerId: 'teacher-foreign', organisationId: 'org-foreign', role: 'TEACHER' };
  const service = createHumanReviewBridgeService({ reviewStore: store, reviewer: foreignReviewer, now: () => 80001 });
  await reject(service.review({ speakingEvent, clientReviewId: 'review-foreign', decision: 'APPROVED' }), 'HUMAN_REVIEW_CROSS_TENANT_FORBIDDEN');
  throws(() => createHumanReviewBridgeService({
    reviewStore: store,
    reviewer: { reviewerId: 'learner-as-reviewer', organisationId: 'org-s43', role: 'LEARNER' }
  }), 'HUMAN_REVIEW_ROLE_FORBIDDEN');
}

{
  const speakingEvent = await submittedSpeakingEvent('self-source');
  const store = new MemoryReviewStore();
  const selfReviewer = { reviewerId: speakingEvent.subjectId, organisationId: speakingEvent.organisationId, role: 'TEACHER' };
  const service = createHumanReviewBridgeService({ reviewStore: store, reviewer: selfReviewer, now: () => 90001 });
  await reject(service.review({ speakingEvent, clientReviewId: 'review-self', decision: 'APPROVED' }), 'HUMAN_REVIEW_SELF_REVIEW_FORBIDDEN');
}

{
  const speakingEvent = await submittedSpeakingEvent('tamper-source');
  const store = new MemoryReviewStore();
  const service = createHumanReviewBridgeService({ reviewStore: store, reviewer, now: () => 100001 });
  speakingEvent.payload.certificateEligible = true;
  await reject(service.review({ speakingEvent, clientReviewId: 'review-tamper', decision: 'APPROVED' }), 'HUMAN_REVIEW_SPEAKING_PAYLOAD_SHAPE_INVALID');
}

{
  const speakingEvent = await submittedSpeakingEvent('retry-source');
  const store = new MemoryReviewStore();
  const service = createHumanReviewBridgeService({ reviewStore: store, reviewer, now: () => 110001 });
  store.failNext = true;
  await reject(service.review({ speakingEvent, clientReviewId: 'review-retry', decision: 'APPROVED' }), 'HUMAN_REVIEW_PERSIST_FAILED');
  assert.equal(store.reviews.length, 0);
  const result = await service.review({ speakingEvent, clientReviewId: 'review-retry', decision: 'APPROVED' });
  assert.equal(result.persistence, 'PERSISTED');
  assert.equal(store.reviews.length, 1);
}

console.log('RPM_S4_3_HUMAN_REVIEW_BRIDGE_PASS human-only-decision approved-rejected immutable-history idempotent-review cross-tenant-role-self-review-blocked speaking-evidence-exact-shape persistence-readback no-path-xp-mastery-validtime-certificate-legal-authority');
