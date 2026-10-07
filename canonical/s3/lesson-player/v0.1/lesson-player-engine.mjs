import {
  EventType,
  analyseLearningReplay,
  scoreItem,
  validateLessonContentContract
} from '../../../s2b/v2.6/model.mjs';

export const LESSON_PLAYER_ENGINE_VERSION = 1;

export class LessonPlayerContractError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = 'LessonPlayerContractError';
    this.code = code;
    this.detail = detail;
  }
}

function assertLesson(lesson) {
  const contract = validateLessonContentContract(lesson);
  if (!contract.valid) throw new LessonPlayerContractError(contract.code, contract);
  return contract;
}

export function interactionForItem(item) {
  if (!item) return null;
  if (['listen_choose', 'scenario_choose', 'read_choose'].includes(item.type)) {
    return Object.freeze({ kind: 'CHOICE', answerable: true, requiresHumanReview: false });
  }
  if (item.type === 'order_words') {
    return Object.freeze({ kind: 'ORDER_WORDS', answerable: true, requiresHumanReview: false });
  }
  if (item.type === 'checkpoint') {
    return Object.freeze({ kind: 'CHECKPOINT', answerable: true, requiresHumanReview: false });
  }
  if (item.type === 'listen_repeat') {
    return Object.freeze({
      kind: 'SPEAKING',
      answerable: false,
      requiresHumanReview: true,
      actionPolicy: 'DEFER_TO_SPEAKING_WORKFLOW'
    });
  }
  throw new LessonPlayerContractError('LESSON_PLAYER_UNSUPPORTED_ITEM_TYPE', { itemId: item.id ?? null, type: item.type ?? null });
}

export function deriveLessonPlayerView(lesson, events = []) {
  const contentContract = assertLesson(lesson);
  const replay = analyseLearningReplay(lesson, events);

  if (!replay.valid) {
    return Object.freeze({
      engineVersion: LESSON_PLAYER_ENGINE_VERSION,
      status: 'INTEGRITY_BLOCKED',
      lessonId: lesson.lessonId,
      contentVersion: lesson.contentVersion,
      sourceLane: contentContract.lane,
      progress: Object.freeze({
        completedItems: replay.state.cursor,
        totalItems: lesson.items.length,
        ratio: lesson.items.length ? replay.state.cursor / lesson.items.length : 0
      }),
      currentItem: null,
      interaction: null,
      canComplete: false,
      speakingPending: Object.freeze([...replay.state.speakingPending]),
      replay: Object.freeze({
        code: replay.code,
        contiguousHead: replay.contiguousHead,
        maxObservedSeq: replay.maxObservedSeq,
        quarantinedCount: replay.quarantinedCount,
        breakInfo: replay.breakInfo
      })
    });
  }

  const state = replay.state;
  const currentItem = state.cursor < lesson.items.length ? lesson.items[state.cursor] : null;
  const pendingCurrentSpeaking = !!currentItem && state.speakingPending.includes(currentItem.id);
  let status = 'ACTIVE';
  if (pendingCurrentSpeaking || (state.cursor >= lesson.items.length && state.speakingPending.length > 0)) status = 'AWAITING_HUMAN_REVIEW';
  else if (state.cursor >= lesson.items.length && state.completed) status = 'COMPLETED';
  else if (state.cursor >= lesson.items.length) status = 'READY_TO_COMPLETE';

  return Object.freeze({
    engineVersion: LESSON_PLAYER_ENGINE_VERSION,
    status,
    lessonId: lesson.lessonId,
    contentVersion: lesson.contentVersion,
    sourceLane: contentContract.lane,
    progress: Object.freeze({
      completedItems: state.cursor,
      totalItems: lesson.items.length,
      ratio: lesson.items.length ? state.cursor / lesson.items.length : 0
    }),
    currentItem,
    interaction: currentItem ? interactionForItem(currentItem) : null,
    xp: state.xp,
    activeMs: state.activeMs,
    mastery: Object.freeze({ ...state.mastery }),
    speakingPending: Object.freeze([...state.speakingPending]),
    canComplete: status === 'READY_TO_COMPLETE',
    replay: Object.freeze({
      code: replay.code,
      contiguousHead: replay.contiguousHead,
      maxObservedSeq: replay.maxObservedSeq,
      quarantinedCount: replay.quarantinedCount,
      breakInfo: null
    })
  });
}

export function planAnswerIntent(lesson, events, itemId, response) {
  const view = deriveLessonPlayerView(lesson, events);
  if (view.status === 'INTEGRITY_BLOCKED') {
    throw new LessonPlayerContractError('LESSON_PLAYER_INTEGRITY_BLOCKED', view.replay);
  }
  if (view.status !== 'ACTIVE' || !view.currentItem) {
    throw new LessonPlayerContractError('LESSON_PLAYER_NOT_ANSWERABLE', { status: view.status });
  }
  if (view.currentItem.id !== itemId) {
    throw new LessonPlayerContractError('LESSON_PLAYER_ITEM_PATH_MISMATCH', {
      expectedItemId: view.currentItem.id,
      observedItemId: itemId
    });
  }
  if (!view.interaction?.answerable) {
    throw new LessonPlayerContractError('LESSON_PLAYER_ANSWER_DEFERRED_TO_HUMAN_WORKFLOW', {
      itemId,
      interactionKind: view.interaction?.kind ?? null
    });
  }

  const scored = scoreItem(view.currentItem, response);
  if (scored.humanReviewRequired) {
    throw new LessonPlayerContractError('LESSON_PLAYER_HUMAN_REVIEW_SCORE_FORBIDDEN', { itemId });
  }

  return Object.freeze({
    type: EventType.ITEM_ANSWERED,
    itemId,
    payload: Object.freeze({
      response,
      correct: scored.correct,
      humanReviewRequired: false,
      advance: scored.correct === true
    })
  });
}

export function planCompletionIntent(lesson, events) {
  const view = deriveLessonPlayerView(lesson, events);
  if (!view.canComplete) {
    throw new LessonPlayerContractError('LESSON_PLAYER_COMPLETION_GATE_CLOSED', {
      status: view.status,
      speakingPending: [...view.speakingPending],
      completedItems: view.progress.completedItems,
      totalItems: view.progress.totalItems
    });
  }
  return Object.freeze({
    type: EventType.LESSON_COMPLETED,
    itemId: null,
    payload: Object.freeze({ speakingPending: [] })
  });
}
