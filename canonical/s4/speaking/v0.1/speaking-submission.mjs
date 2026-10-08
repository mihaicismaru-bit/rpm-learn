import { EventType, analyseLearningReplay, validateLessonContentContract } from '../../../s2b/v2.6/model.mjs';
import { deriveLessonPlayerView } from '../../../s3/lesson-player/v0.1/lesson-player-engine.mjs';
import { EventStoreSessionWriter } from '../../../s3/lesson-player/v0.1/session-controller.mjs';

export const SPEAKING_SUBMISSION_VERSION = 1;
export const SPEAKING_REVIEW_POLICY = 'HUMAN_REVIEW_REQUIRED';

export class SpeakingSubmissionError extends Error {
  constructor(code, detail = {}) { super(code); this.name = 'SpeakingSubmissionError'; this.code = code; this.detail = detail; }
}
const fail = (code, detail = {}) => { throw new SpeakingSubmissionError(code, detail); };
const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const req = (value, field, max = 512) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('SPEAKING_STRING_REQUIRED', { field, max });
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
const SPEAKING_EVENT_KEYS = Object.freeze(['schemaVersion','eventId','sessionId','subjectId','organisationId','role','seq','type','lessonId','contentVersion','itemId','ts','payload']);
const SPEAKING_PAYLOAD_KEYS = Object.freeze(['speakingSubmissionVersion','clientSubmissionId','mediaRef','evidenceClass','teacherReviewRequired','reviewPolicy','reviewState','sourceLane','sourceArtifactIds','sourceObserved','autoApproved','advance','xpDelta','masteryDelta','validatedTimeAuthority','certificateAuthority','legalAuthority']);
const SPEAKING_DESCRIPTOR_KEYS = Object.freeze(['speakingSubmissionVersion','lessonId','contentVersion','sourceLane','audience','itemId','evidenceClass','mediaRef','clientSubmissionId','reviewPolicy','sourceArtifactIds','sourceObserved']);
const stable = value => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]))
    : value;
const same = (a, b) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function assertScope(scope) {
  if (!scope || Object.keys(scope).sort().join('|') !== 'organisationId|role|subjectId') fail('SPEAKING_SCOPE_SHAPE_INVALID');
  req(scope.subjectId, 'scope.subjectId', 256); req(scope.organisationId, 'scope.organisationId', 256);
  if (scope.role !== 'LEARNER') fail('SPEAKING_SCOPE_ROLE_FORBIDDEN', { role: scope.role ?? null });
  return freeze({ ...scope });
}
function assertRls07Lesson(lesson) {
  const contract = validateLessonContentContract(lesson);
  if (!contract.valid) fail('SPEAKING_LESSON_CONTRACT_INVALID', { code: contract.code });
  if (contract.lane !== 'RLS-07' || lesson.source?.lane !== 'RLS-07' || lesson.source?.audience !== '16+') {
    fail('SPEAKING_SOURCE_LANE_BLOCKED', { lane: lesson.source?.lane ?? null, audience: lesson.source?.audience ?? null });
  }
}
function assertScopedEvents(events, lesson, scope) {
  if (!Array.isArray(events)) fail('SPEAKING_EVENTS_REQUIRED');
  for (const event of events) {
    if (event?.lessonId !== lesson.lessonId || event?.contentVersion !== lesson.contentVersion) fail('SPEAKING_STORE_CONTENT_ESCAPE', { eventId: event?.eventId ?? null });
    if (event?.subjectId !== scope.subjectId || event?.organisationId !== scope.organisationId || event?.role !== scope.role) {
      fail('SPEAKING_EVENT_SCOPE_MISMATCH', { eventId: event?.eventId ?? null });
    }
  }
}
function artifactIds(lesson) {
  const ids = [...(lesson.source?.artifactIds || [])].sort();
  if (!ids.length || ids.some(x => typeof x !== 'string' || !x.trim())) fail('SPEAKING_SOURCE_ARTIFACTS_REQUIRED');
  return freeze(ids);
}
function existingByClientId(events, clientSubmissionId) {
  return events.find(e => e?.type === EventType.SPEAKING_SUBMITTED && e?.payload?.clientSubmissionId === clientSubmissionId) || null;
}
function assertExistingMatches(event, lesson, request) {
  exactKeys(event, SPEAKING_EVENT_KEYS, 'SPEAKING_EVENT_SHAPE_INVALID');
  exactKeys(event.payload, SPEAKING_PAYLOAD_KEYS, 'SPEAKING_EVENT_PAYLOAD_SHAPE_INVALID');
  const p = event.payload;
  const item = lesson.items.find(candidate => candidate.id === request.itemId) || null;
  const ok = event.type === EventType.SPEAKING_SUBMITTED && event.lessonId === lesson.lessonId && event.contentVersion === lesson.contentVersion && event.itemId === request.itemId &&
    p.speakingSubmissionVersion === SPEAKING_SUBMISSION_VERSION && p.clientSubmissionId === request.clientSubmissionId && p.mediaRef === request.mediaRef &&
    p.evidenceClass === item?.evidenceClass && p.teacherReviewRequired === true && p.reviewPolicy === SPEAKING_REVIEW_POLICY &&
    p.reviewState === 'PENDING_HUMAN_REVIEW' && p.sourceLane === 'RLS-07' && p.sourceObserved === lesson.source.sourceObserved &&
    same(p.sourceArtifactIds, artifactIds(lesson)) && p.autoApproved === false && p.advance === false && p.xpDelta === 0 &&
    p.masteryDelta === 0 && p.validatedTimeAuthority === false && p.certificateAuthority === false && p.legalAuthority === false;
  if (!ok) fail('SPEAKING_CLIENT_ID_REUSE_MISMATCH', { clientSubmissionId: request.clientSubmissionId, existingEventId: event?.eventId ?? null });
}

export function createSpeakingSubmissionDescriptor({ lesson, events, scope, itemId, mediaRef, clientSubmissionId }) {
  assertRls07Lesson(lesson); const safeScope = assertScope(scope); assertScopedEvents(events, lesson, safeScope);
  req(itemId, 'itemId', 256); req(mediaRef, 'mediaRef'); req(clientSubmissionId, 'clientSubmissionId', 128);
  const view = deriveLessonPlayerView(lesson, events);
  if (view.status === 'INTEGRITY_BLOCKED') fail('SPEAKING_REPLAY_INTEGRITY_BLOCKED', { replayCode: view.replay?.code ?? null });
  if (view.speakingPending?.includes(itemId)) fail('SPEAKING_REVIEW_PENDING_RESUBMIT_FORBIDDEN', { itemId });
  if (view.status !== 'ACTIVE' || !view.currentItem) fail('SPEAKING_PATH_NOT_SUBMITTABLE', { status: view.status });
  if (view.currentItem.id !== itemId) fail('SPEAKING_ITEM_PATH_MISMATCH', { expectedItemId: view.currentItem.id, observedItemId: itemId });
  if (view.currentItem.type !== 'listen_repeat' || view.currentItem.scoringRule?.kind !== 'human_review' || view.currentItem.teacherReviewRequired !== true || view.interaction?.kind !== 'SPEAKING' || view.interaction?.requiresHumanReview !== true) {
    fail('SPEAKING_HUMAN_REVIEW_BINDING_REQUIRED', { itemId });
  }
  return freeze({
    speakingSubmissionVersion: SPEAKING_SUBMISSION_VERSION,
    lessonId: lesson.lessonId, contentVersion: lesson.contentVersion, sourceLane: 'RLS-07', audience: '16+', itemId,
    evidenceClass: req(view.currentItem.evidenceClass, 'currentItem.evidenceClass', 256), mediaRef, clientSubmissionId,
    reviewPolicy: SPEAKING_REVIEW_POLICY, sourceArtifactIds: artifactIds(lesson), sourceObserved: req(lesson.source.sourceObserved, 'lesson.source.sourceObserved', 32)
  });
}

export function createSpeakingSubmissionIntent(descriptor) {
  exactKeys(descriptor, SPEAKING_DESCRIPTOR_KEYS, 'SPEAKING_DESCRIPTOR_SHAPE_INVALID');
  if (descriptor.speakingSubmissionVersion !== SPEAKING_SUBMISSION_VERSION) fail('SPEAKING_DESCRIPTOR_VERSION_UNSUPPORTED');
  if (descriptor.sourceLane !== 'RLS-07' || descriptor.audience !== '16+') fail('SPEAKING_SOURCE_LANE_BLOCKED');
  if (descriptor.reviewPolicy !== SPEAKING_REVIEW_POLICY) fail('SPEAKING_REVIEW_POLICY_INVALID');
  req(descriptor.lessonId, 'descriptor.lessonId', 256); req(descriptor.contentVersion, 'descriptor.contentVersion', 256);
  req(descriptor.itemId, 'descriptor.itemId', 256); req(descriptor.evidenceClass, 'descriptor.evidenceClass', 256);
  req(descriptor.mediaRef, 'descriptor.mediaRef'); req(descriptor.clientSubmissionId, 'descriptor.clientSubmissionId', 128);
  req(descriptor.sourceObserved, 'descriptor.sourceObserved', 32);
  if (!Array.isArray(descriptor.sourceArtifactIds) || descriptor.sourceArtifactIds.length < 1 || descriptor.sourceArtifactIds.some(x => typeof x !== 'string' || !x.trim())) fail('SPEAKING_DESCRIPTOR_SOURCE_ARTIFACTS_INVALID');
  return freeze({
    type: EventType.SPEAKING_SUBMITTED,
    itemId: descriptor.itemId,
    payload: {
      speakingSubmissionVersion: 1, clientSubmissionId: descriptor.clientSubmissionId, mediaRef: descriptor.mediaRef,
      evidenceClass: descriptor.evidenceClass, teacherReviewRequired: true, reviewPolicy: SPEAKING_REVIEW_POLICY,
      reviewState: 'PENDING_HUMAN_REVIEW', sourceLane: 'RLS-07', sourceArtifactIds: [...descriptor.sourceArtifactIds],
      sourceObserved: descriptor.sourceObserved, autoApproved: false, advance: false, xpDelta: 0, masteryDelta: 0,
      validatedTimeAuthority: false, certificateAuthority: false, legalAuthority: false
    }
  });
}

function project(event, persistence) {
  if (!Number.isInteger(event?.seq) || event.seq < 1) fail('SPEAKING_EVENT_SEQ_INVALID', { seq: event?.seq ?? null });
  return freeze({
    speakingSubmissionVersion: 1, persistence, status: 'PENDING_HUMAN_REVIEW', eventId: req(event.eventId, 'event.eventId', 256), seq: event.seq,
    lessonId: event.lessonId, contentVersion: event.contentVersion, itemId: event.itemId,
    clientSubmissionId: event.payload.clientSubmissionId, mediaRef: event.payload.mediaRef,
    teacherReviewRequired: true, reviewPolicy: SPEAKING_REVIEW_POLICY, autoApproved: false, pathAdvanced: false,
    xpDelta: 0, masteryDelta: 0, validatedTimeAuthority: false, certificateAuthority: false, legalAuthority: false
  });
}

export function createSpeakingSubmissionService({ lesson, eventStore, scope, sessionId, now = () => Date.now() }) {
  assertRls07Lesson(lesson); const safeScope = assertScope(scope); req(sessionId, 'sessionId', 256);
  for (const method of ['open','activateContent','listEvents','inspectSequenceChain','append']) if (typeof eventStore?.[method] !== 'function') fail('SPEAKING_STORE_PORT_INVALID', { missingMethod: method });
  const writer = new EventStoreSessionWriter({ eventStore, lesson, scope: safeScope, sessionId, now });
  return Object.freeze({
    async submit(request) {
      if (!request || Object.keys(request).sort().join('|') !== 'clientSubmissionId|itemId|mediaRef') fail('SPEAKING_REQUEST_SHAPE_INVALID');
      req(request.itemId, 'request.itemId', 256); req(request.mediaRef, 'request.mediaRef'); req(request.clientSubmissionId, 'request.clientSubmissionId', 128);
      await eventStore.open(); await eventStore.activateContent(lesson);
      const beforeEvents = await eventStore.listEvents(lesson.lessonId, lesson.contentVersion); assertScopedEvents(beforeEvents, lesson, safeScope);
      const beforeReplay = analyseLearningReplay(lesson, beforeEvents);
      if (!beforeReplay.valid) fail('SPEAKING_REPLAY_BEFORE_SUBMIT_INVALID', { code: beforeReplay.code });
      const existing = existingByClientId(beforeEvents, request.clientSubmissionId);
      if (existing) { assertExistingMatches(existing, lesson, request); return project(existing, 'IDEMPOTENT_REPLAY'); }
      const beforeView = deriveLessonPlayerView(lesson, beforeEvents);
      const descriptor = createSpeakingSubmissionDescriptor({ lesson, events: beforeEvents, scope: safeScope, ...request });
      let persisted;
      try { persisted = await writer.appendIntent(createSpeakingSubmissionIntent(descriptor)); }
      catch (error) { fail('SPEAKING_PERSIST_FAILED', { cause: error?.code ?? error?.message ?? String(error) }); }
      const afterEvents = await eventStore.listEvents(lesson.lessonId, lesson.contentVersion); assertScopedEvents(afterEvents, lesson, safeScope);
      const readback = afterEvents.find(e => e.eventId === persisted.eventId) || null;
      if (!readback) fail('SPEAKING_PERSIST_READBACK_MISSING', { eventId: persisted.eventId });
      assertExistingMatches(readback, lesson, request);
      const replay = analyseLearningReplay(lesson, afterEvents); if (!replay.valid) fail('SPEAKING_REPLAY_AFTER_PERSIST_INVALID', { code: replay.code });
      const afterView = deriveLessonPlayerView(lesson, afterEvents);
      if (afterView.status !== 'AWAITING_HUMAN_REVIEW' || !afterView.speakingPending.includes(request.itemId) ||
          afterView.progress.completedItems !== beforeView.progress.completedItems || afterView.xp !== beforeView.xp ||
          afterView.activeMs !== beforeView.activeMs || !same(afterView.mastery, beforeView.mastery) || afterView.canComplete !== false) {
        fail('SPEAKING_AUTHORITY_CONTAMINATION_DETECTED');
      }
      return project(readback, 'PERSISTED');
    }
  });
}
