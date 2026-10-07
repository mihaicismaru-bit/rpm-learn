import { EventType, analyseLearningReplay, validateLessonContentContract } from '../../../s2b/v2.6/model.mjs';

export const MASTERY_ENGINE_VERSION = 1;
export const MASTERY_RULE_VERSION = '0.1';
export const MASTERY_STATES = Object.freeze(['NEW','LEARNING','PRACTISING','STABLE']);
export const MASTERY_REVIEW_SIGNALS = Object.freeze(['NONE','NEAR_TERM_REQUIRED','SUPPORT_REQUIRED']);

export class MasteryEngineError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = 'MasteryEngineError';
    this.code = code;
    this.detail = detail;
  }
}

const fail = (code, detail = {}) => { throw new MasteryEngineError(code, detail); };
const freeze = value => {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const req = (value, field, max = 512) => {
  if (typeof value !== 'string' || !value.trim() || value.length > max) fail('MASTERY_STRING_REQUIRED', { field, max });
  return value;
};
const exactKeys = (value, expected, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail(code, { actual, expected: wanted });
};
const scoreState = score => score >= 6 ? 'STABLE' : score >= 3 ? 'PRACTISING' : score >= 1 ? 'LEARNING' : 'NEW';
const strongerSignal = (a, b) => {
  const rank = { NONE:0, NEAR_TERM_REQUIRED:1, SUPPORT_REQUIRED:2 };
  return rank[b] > rank[a] ? b : a;
};
const REVIEW_KEYS = Object.freeze(['humanReviewBridgeVersion','reviewId','clientReviewId','speakingEventId','speakingEventSeq','learnerSubjectId','organisationId','reviewerId','reviewerRole','decision','approvalState','reviewedAt','lessonId','contentVersion','itemId','sourceLane','sourceObserved','sourceArtifactIds','submissionClientId','reviewPolicy','authority']);
const REVIEW_AUTHORITY_KEYS = Object.freeze(['pathAdvance','xp','mastery','validatedTime','certificate','legal']);

function validateLesson(lesson) {
  if (lesson?.source?.lane !== 'RLS-07' || lesson?.source?.audience !== '16+') {
    fail('MASTERY_SOURCE_LANE_BLOCKED', { lane: lesson?.source?.lane ?? null, audience: lesson?.source?.audience ?? null });
  }
  const contract = validateLessonContentContract(lesson);
  if (!contract.valid) fail('MASTERY_LESSON_CONTRACT_INVALID', { code: contract.code });
  if (contract.lane !== 'RLS-07') fail('MASTERY_SOURCE_LANE_BLOCKED', { lane: contract.lane ?? null, audience: lesson.source?.audience ?? null });
  return contract;
}

function validateHumanReview(record, speakingEvent) {
  exactKeys(record, REVIEW_KEYS, 'MASTERY_REVIEW_SHAPE_INVALID');
  exactKeys(record.authority, REVIEW_AUTHORITY_KEYS, 'MASTERY_REVIEW_AUTHORITY_SHAPE_INVALID');
  if (record.humanReviewBridgeVersion !== 1 || !['VALID','RETRY','NEEDS_SUPPORT'].includes(record.decision)) fail('MASTERY_REVIEW_DECISION_INVALID');
  const expectedApproval = record.decision === 'VALID' ? 'APPROVED' : 'REJECTED';
  if (record.approvalState !== expectedApproval) fail('MASTERY_REVIEW_APPROVAL_STATE_INVALID');
  if (record.reviewerRole !== 'TEACHER' || record.sourceLane !== 'RLS-07' || record.reviewPolicy !== 'HUMAN_REVIEW_REQUIRED') fail('MASTERY_REVIEW_CONTRACT_INVALID');
  if (Object.values(record.authority).some(value => value !== false)) fail('MASTERY_REVIEW_AUTHORITY_ESCALATION');
  if (!speakingEvent) fail('MASTERY_REVIEW_SPEAKING_EVENT_NOT_FOUND', { speakingEventId: record.speakingEventId });
  const matches = record.speakingEventId === speakingEvent.eventId
    && record.speakingEventSeq === speakingEvent.seq
    && record.learnerSubjectId === speakingEvent.subjectId
    && record.organisationId === speakingEvent.organisationId
    && record.lessonId === speakingEvent.lessonId
    && record.contentVersion === speakingEvent.contentVersion
    && record.itemId === speakingEvent.itemId
    && record.submissionClientId === speakingEvent.payload?.clientSubmissionId;
  if (!matches) fail('MASTERY_REVIEW_PROVENANCE_MISMATCH', { reviewId: record.reviewId });
  req(record.reviewId, 'review.reviewId', 512);
  return record;
}

function emptySkill(skill, teacherValidationRequired) {
  return {
    skill,
    score: 0,
    state: 'NEW',
    attempts: 0,
    correctFirstAttempt: 0,
    correctAfterRetry: 0,
    wrongAnswers: 0,
    checkpointPasses: 0,
    speakingValidations: 0,
    teacherValidationRequired,
    teacherValidated: false,
    reviewSignal: 'NONE',
    sourceEventIds: [],
    sourceReviewIds: []
  };
}

function addUnique(list, value) {
  if (!list.includes(value)) list.push(value);
}

export function deriveMasterySnapshot({ lesson, events, humanReviews = [] }) {
  validateLesson(lesson);
  if (!Array.isArray(events)) fail('MASTERY_EVENTS_REQUIRED');
  if (!Array.isArray(humanReviews)) fail('MASTERY_REVIEWS_REQUIRED');

  const replay = analyseLearningReplay(lesson, events);
  if (!replay.valid) fail('MASTERY_REPLAY_INVALID', { code: replay.code, breakInfo: replay.breakInfo });
  const accepted = replay.events;
  const speakingById = new Map(accepted.filter(event => event.type === EventType.SPEAKING_SUBMITTED).map(event => [event.eventId, event]));
  const reviewsBySpeaking = new Map();

  for (const review of humanReviews) {
    const speaking = speakingById.get(review?.speakingEventId) || null;
    validateHumanReview(review, speaking);
    if (reviewsBySpeaking.has(review.speakingEventId)) fail('MASTERY_REVIEW_DUPLICATE_DECISION', { speakingEventId: review.speakingEventId });
    reviewsBySpeaking.set(review.speakingEventId, review);
  }

  const skills = new Map();
  for (const item of lesson.items) {
    req(item.skill, 'item.skill', 128);
    if (!skills.has(item.skill)) skills.set(item.skill, emptySkill(item.skill, item.scoringRule?.kind === 'human_review' || item.teacherReviewRequired === true));
    else if (item.scoringRule?.kind === 'human_review' || item.teacherReviewRequired === true) skills.get(item.skill).teacherValidationRequired = true;
  }

  const attemptsByItem = new Map();
  for (const event of accepted) {
    const item = lesson.items.find(candidate => candidate.id === event.itemId) || null;
    if (!item) continue;
    const skill = skills.get(item.skill);

    if (event.type === EventType.ITEM_ANSWERED) {
      const attempt = (attemptsByItem.get(item.id) || 0) + 1;
      attemptsByItem.set(item.id, attempt);
      skill.attempts += 1;
      addUnique(skill.sourceEventIds, event.eventId);
      if (event.payload?.correct === true) {
        if (attempt === 1) {
          skill.score += 2;
          skill.correctFirstAttempt += 1;
        } else {
          skill.score += 1;
          skill.correctAfterRetry += 1;
        }
        if (item.type === 'checkpoint') skill.checkpointPasses += 1;
      } else {
        skill.wrongAnswers += 1;
        skill.reviewSignal = strongerSignal(skill.reviewSignal, 'NEAR_TERM_REQUIRED');
      }
    }

    if (event.type === EventType.SPEAKING_SUBMITTED) {
      skill.attempts += 1;
      addUnique(skill.sourceEventIds, event.eventId);
      const review = reviewsBySpeaking.get(event.eventId) || null;
      if (!review) continue;
      addUnique(skill.sourceReviewIds, review.reviewId);
      if (review.decision === 'VALID') {
        skill.score += 2;
        skill.speakingValidations += 1;
        skill.teacherValidated = true;
      } else if (review.decision === 'RETRY') {
        skill.reviewSignal = strongerSignal(skill.reviewSignal, 'NEAR_TERM_REQUIRED');
      } else if (review.decision === 'NEEDS_SUPPORT') {
        skill.reviewSignal = strongerSignal(skill.reviewSignal, 'SUPPORT_REQUIRED');
      }
    }
  }

  const rows = [...skills.values()]
    .sort((a, b) => a.skill.localeCompare(b.skill))
    .map(skill => {
      skill.state = scoreState(skill.score);
      skill.sourceEventIds.sort();
      skill.sourceReviewIds.sort();
      return freeze({ ...skill });
    });

  return freeze({
    masteryEngineVersion: MASTERY_ENGINE_VERSION,
    masteryRuleVersion: MASTERY_RULE_VERSION,
    lessonId: lesson.lessonId,
    contentVersion: lesson.contentVersion,
    sourceLane: 'RLS-07',
    audience: '16+',
    states: [...MASTERY_STATES],
    hintPolicy: 'NOT_MODELED_V0_1_RETRY_WEIGHTING_ONLY',
    pedagogicalOnly: true,
    complianceAuthority: false,
    xpAuthority: false,
    gamificationAuthority: false,
    validatedTimeAuthority: false,
    certificateAuthority: false,
    legalAuthority: false,
    replayHeadSeq: replay.contiguousHead,
    skills: rows
  });
}
