import { EventType } from '../../../s2b/v2.6/model.mjs';
import { SPEAKING_REVIEW_POLICY, SPEAKING_SUBMISSION_VERSION } from '../../speaking/v0.1/speaking-submission.mjs';

export const HUMAN_REVIEW_BRIDGE_VERSION = 1;
export const HUMAN_REVIEW_AUTHORITY = 'HUMAN_ONLY';
export const HUMAN_REVIEWER_ROLE = 'TEACHER';
export const HUMAN_REVIEW_DECISIONS = Object.freeze(['VALID', 'RETRY', 'NEEDS_SUPPORT']);

export class HumanReviewBridgeError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = 'HumanReviewBridgeError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, detail = {}) => { throw new HumanReviewBridgeError(code, detail); };
const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const req = (value, field, max = 512) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('HUMAN_REVIEW_STRING_REQUIRED', { field, max });
  return value;
};
const exactKeys = (value, expected, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(code, { actual, expected: wanted });
  }
};
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
    : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

const SPEAKING_EVENT_KEYS = Object.freeze(['schemaVersion','eventId','sessionId','subjectId','organisationId','role','seq','type','lessonId','contentVersion','itemId','ts','payload']);
const SPEAKING_PAYLOAD_KEYS = Object.freeze(['speakingSubmissionVersion','clientSubmissionId','mediaRef','evidenceClass','teacherReviewRequired','reviewPolicy','reviewState','sourceLane','sourceArtifactIds','sourceObserved','autoApproved','advance','xpDelta','masteryDelta','validatedTimeAuthority','certificateAuthority','legalAuthority']);
const REVIEW_RECORD_KEYS = Object.freeze(['humanReviewBridgeVersion','reviewId','clientReviewId','speakingEventId','speakingEventSeq','learnerSubjectId','organisationId','reviewerId','reviewerRole','decision','approvalState','reviewedAt','lessonId','contentVersion','itemId','sourceLane','sourceObserved','sourceArtifactIds','submissionClientId','reviewPolicy','authority']);
const REVIEW_AUTHORITY_KEYS = Object.freeze(['pathAdvance','xp','mastery','validatedTime','certificate','legal']);

function assertReviewer(reviewer) {
  exactKeys(reviewer, ['reviewerId','organisationId','role'], 'HUMAN_REVIEW_REVIEWER_SHAPE_INVALID');
  req(reviewer.reviewerId, 'reviewer.reviewerId', 256);
  req(reviewer.organisationId, 'reviewer.organisationId', 256);
  if (reviewer.role !== HUMAN_REVIEWER_ROLE) fail('HUMAN_REVIEW_ROLE_FORBIDDEN', { role: reviewer.role ?? null });
  return freeze({ ...reviewer });
}

function assertSpeakingEvidence(event) {
  exactKeys(event, SPEAKING_EVENT_KEYS, 'HUMAN_REVIEW_SPEAKING_EVENT_SHAPE_INVALID');
  exactKeys(event.payload, SPEAKING_PAYLOAD_KEYS, 'HUMAN_REVIEW_SPEAKING_PAYLOAD_SHAPE_INVALID');
  if (event.type !== EventType.SPEAKING_SUBMITTED) fail('HUMAN_REVIEW_SPEAKING_EVENT_REQUIRED', { type: event.type ?? null });
  if (event.role !== 'LEARNER') fail('HUMAN_REVIEW_LEARNER_EVIDENCE_REQUIRED', { role: event.role ?? null });
  if (!Number.isInteger(event.seq) || event.seq < 1) fail('HUMAN_REVIEW_SPEAKING_SEQ_INVALID', { seq: event.seq ?? null });
  req(event.eventId, 'speakingEvent.eventId', 256);
  req(event.subjectId, 'speakingEvent.subjectId', 256);
  req(event.organisationId, 'speakingEvent.organisationId', 256);
  req(event.lessonId, 'speakingEvent.lessonId', 256);
  req(event.contentVersion, 'speakingEvent.contentVersion', 256);
  req(event.itemId, 'speakingEvent.itemId', 256);
  const payload = event.payload;
  const valid = payload.speakingSubmissionVersion === SPEAKING_SUBMISSION_VERSION
    && payload.teacherReviewRequired === true
    && payload.reviewPolicy === SPEAKING_REVIEW_POLICY
    && payload.reviewState === 'PENDING_HUMAN_REVIEW'
    && payload.sourceLane === 'RLS-07'
    && payload.autoApproved === false
    && payload.advance === false
    && payload.xpDelta === 0
    && payload.masteryDelta === 0
    && payload.validatedTimeAuthority === false
    && payload.certificateAuthority === false
    && payload.legalAuthority === false;
  if (!valid) fail('HUMAN_REVIEW_SPEAKING_CONTRACT_INVALID', { eventId: event.eventId });
  req(payload.clientSubmissionId, 'speakingEvent.payload.clientSubmissionId', 128);
  req(payload.mediaRef, 'speakingEvent.payload.mediaRef');
  req(payload.evidenceClass, 'speakingEvent.payload.evidenceClass', 256);
  req(payload.sourceObserved, 'speakingEvent.payload.sourceObserved', 32);
  if (!Array.isArray(payload.sourceArtifactIds) || payload.sourceArtifactIds.length < 1 || payload.sourceArtifactIds.some(value => typeof value !== 'string' || !value.trim())) {
    fail('HUMAN_REVIEW_SOURCE_ARTIFACTS_INVALID');
  }
  const deduped = [...new Set(payload.sourceArtifactIds)];
  if (deduped.length !== payload.sourceArtifactIds.length) fail('HUMAN_REVIEW_SOURCE_ARTIFACTS_DUPLICATE');
  return event;
}

function assertReviewRecord(record) {
  exactKeys(record, REVIEW_RECORD_KEYS, 'HUMAN_REVIEW_RECORD_SHAPE_INVALID');
  exactKeys(record.authority, REVIEW_AUTHORITY_KEYS, 'HUMAN_REVIEW_AUTHORITY_SHAPE_INVALID');
  if (record.humanReviewBridgeVersion !== HUMAN_REVIEW_BRIDGE_VERSION) fail('HUMAN_REVIEW_RECORD_VERSION_INVALID');
  if (!HUMAN_REVIEW_DECISIONS.includes(record.decision)) fail('HUMAN_REVIEW_DECISION_INVALID');
  if (record.approvalState !== (record.decision === 'VALID' ? 'APPROVED' : 'REJECTED')) fail('HUMAN_REVIEW_APPROVAL_STATE_MISMATCH');
  if (record.reviewerRole !== HUMAN_REVIEWER_ROLE || record.sourceLane !== 'RLS-07' || record.reviewPolicy !== SPEAKING_REVIEW_POLICY) fail('HUMAN_REVIEW_RECORD_CONTRACT_INVALID');
  if (!Number.isInteger(record.speakingEventSeq) || record.speakingEventSeq < 1 || !Number.isInteger(record.reviewedAt) || record.reviewedAt < 1) fail('HUMAN_REVIEW_RECORD_SEQUENCE_TIME_INVALID');
  if (Object.values(record.authority).some(value => value !== false)) fail('HUMAN_REVIEW_AUTHORITY_ESCALATION_FORBIDDEN');
  return record;
}

function buildRecord({ speakingEvent, reviewer, clientReviewId, decision, reviewedAt }) {
  const evidence = assertSpeakingEvidence(speakingEvent);
  if (evidence.organisationId !== reviewer.organisationId) {
    fail('HUMAN_REVIEW_CROSS_TENANT_FORBIDDEN', { evidenceOrganisationId: evidence.organisationId, reviewerOrganisationId: reviewer.organisationId });
  }
  if (reviewer.reviewerId === evidence.subjectId) fail('HUMAN_REVIEW_SELF_REVIEW_FORBIDDEN');
  if (!HUMAN_REVIEW_DECISIONS.includes(decision)) fail('HUMAN_REVIEW_DECISION_INVALID', { decision });
  req(clientReviewId, 'clientReviewId', 128);
  if (!Number.isInteger(reviewedAt) || reviewedAt < 1) fail('HUMAN_REVIEW_TIME_INVALID', { reviewedAt });
  return freeze({
    humanReviewBridgeVersion: HUMAN_REVIEW_BRIDGE_VERSION,
    reviewId: `${evidence.eventId}:${clientReviewId}`,
    clientReviewId,
    speakingEventId: evidence.eventId,
    speakingEventSeq: evidence.seq,
    learnerSubjectId: evidence.subjectId,
    organisationId: evidence.organisationId,
    reviewerId: reviewer.reviewerId,
    reviewerRole: reviewer.role,
    decision,
    approvalState: decision === 'VALID' ? 'APPROVED' : 'REJECTED',
    reviewedAt,
    lessonId: evidence.lessonId,
    contentVersion: evidence.contentVersion,
    itemId: evidence.itemId,
    sourceLane: 'RLS-07',
    sourceObserved: evidence.payload.sourceObserved,
    sourceArtifactIds: [...evidence.payload.sourceArtifactIds].sort(),
    submissionClientId: evidence.payload.clientSubmissionId,
    reviewPolicy: SPEAKING_REVIEW_POLICY,
    authority: {
      pathAdvance: false,
      xp: false,
      mastery: false,
      validatedTime: false,
      certificate: false,
      legal: false
    }
  });
}

function project(record, persistence) {
  assertReviewRecord(record);
  return freeze({
    humanReviewBridgeVersion: HUMAN_REVIEW_BRIDGE_VERSION,
    persistence,
    status: record.approvalState,
    reviewResolved: true,
    humanAuthority: HUMAN_REVIEW_AUTHORITY,
    reviewId: record.reviewId,
    speakingEventId: record.speakingEventId,
    speakingEventSeq: record.speakingEventSeq,
    learnerSubjectId: record.learnerSubjectId,
    organisationId: record.organisationId,
    reviewerId: record.reviewerId,
    reviewerRole: record.reviewerRole,
    decision: record.decision,
    approvalState: record.approvalState,
    lessonId: record.lessonId,
    contentVersion: record.contentVersion,
    itemId: record.itemId,
    sourceLane: record.sourceLane,
    pathAdvanced: false,
    xpDelta: 0,
    masteryDelta: 0,
    validatedTimeAuthority: false,
    certificateAuthority: false,
    legalAuthority: false
  });
}

export function createHumanReviewBridgeService({ reviewStore, reviewer, now = () => Date.now() }) {
  const safeReviewer = assertReviewer(reviewer);
  for (const method of ['open','listReviews','appendReview']) {
    if (typeof reviewStore?.[method] !== 'function') fail('HUMAN_REVIEW_STORE_PORT_INVALID', { missingMethod: method });
  }
  return Object.freeze({
    async review({ speakingEvent, clientReviewId, decision }) {
      assertSpeakingEvidence(speakingEvent);
      req(clientReviewId, 'clientReviewId', 128);
      if (!HUMAN_REVIEW_DECISIONS.includes(decision)) fail('HUMAN_REVIEW_DECISION_INVALID', { decision });
      await reviewStore.open();
      const history = await reviewStore.listReviews();
      if (!Array.isArray(history)) fail('HUMAN_REVIEW_STORE_HISTORY_INVALID');
      for (const record of history) assertReviewRecord(record);

      const existingByClient = history.find(record => record.clientReviewId === clientReviewId) || null;
      if (existingByClient) {
        const candidate = buildRecord({ speakingEvent, reviewer: safeReviewer, clientReviewId, decision, reviewedAt: existingByClient.reviewedAt });
        if (!same(existingByClient, candidate)) fail('HUMAN_REVIEW_CLIENT_ID_REUSE_MISMATCH', { clientReviewId });
        return project(existingByClient, 'IDEMPOTENT_REPLAY');
      }

      const existingForEvidence = history.find(record => record.speakingEventId === speakingEvent.eventId) || null;
      if (existingForEvidence) {
        fail('HUMAN_REVIEW_EVIDENCE_ALREADY_DECIDED', { speakingEventId: speakingEvent.eventId, reviewId: existingForEvidence.reviewId });
      }

      const record = buildRecord({ speakingEvent, reviewer: safeReviewer, clientReviewId, decision, reviewedAt: Number(now()) });
      let outcome;
      try {
        outcome = await reviewStore.appendReview(record);
      } catch (error) {
        fail('HUMAN_REVIEW_PERSIST_FAILED', { cause: error?.code ?? error?.message ?? String(error) });
      }
      if (!outcome || !['appended','duplicate'].includes(outcome.status)) fail('HUMAN_REVIEW_PERSIST_OUTCOME_INVALID');
      const readbackHistory = await reviewStore.listReviews();
      if (!Array.isArray(readbackHistory)) fail('HUMAN_REVIEW_STORE_HISTORY_INVALID');
      const readback = readbackHistory.find(candidate => candidate.reviewId === record.reviewId) || null;
      if (!readback) fail('HUMAN_REVIEW_PERSIST_READBACK_MISSING', { reviewId: record.reviewId });
      assertReviewRecord(readback);
      if (!same(readback, record)) fail('HUMAN_REVIEW_PERSIST_READBACK_MISMATCH', { reviewId: record.reviewId });
      return project(readback, outcome.status === 'duplicate' ? 'IDEMPOTENT_STORE' : 'PERSISTED');
    }
  });
}
