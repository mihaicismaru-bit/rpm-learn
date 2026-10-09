import {
  LessonPlayerContractError,
  deriveLessonPlayerView,
  planAnswerIntent
} from './lesson-player-engine.mjs';

export const LESSON_RUNTIME_VERSION = 1;

export const RuntimeKind = Object.freeze({
  LISTEN_CHOOSE: 'LISTEN_CHOOSE',
  SCENARIO_CHOOSE: 'SCENARIO_CHOOSE',
  ORDER_WORDS: 'ORDER_WORDS',
  LISTEN_REPEAT: 'LISTEN_REPEAT',
  READ_CHOOSE: 'READ_CHOOSE',
  CHECKPOINT: 'CHECKPOINT'
});

function runtimeError(code, detail = {}) {
  throw new LessonPlayerContractError(code, detail);
}

function freezeChoices(choices = []) {
  return Object.freeze([...choices]);
}

export function describeRuntimeItem(item) {
  if (!item || typeof item !== 'object') runtimeError('LESSON_RUNTIME_ITEM_REQUIRED');

  const base = {
    runtimeVersion: LESSON_RUNTIME_VERSION,
    itemId: item.id,
    itemType: item.type,
    skill: item.skill,
    difficulty: item.difficulty,
    prompt: item.prompt,
    evidenceClass: item.evidenceClass
  };

  if (item.type === 'listen_choose') {
    return Object.freeze({
      ...base,
      kind: RuntimeKind.LISTEN_CHOOSE,
      responseShape: 'single_choice',
      choices: freezeChoices(item.choices),
      audioText: item.audioText,
      answerable: true,
      requiresHumanReview: false
    });
  }
  if (item.type === 'scenario_choose') {
    return Object.freeze({
      ...base,
      kind: RuntimeKind.SCENARIO_CHOOSE,
      responseShape: 'single_choice',
      choices: freezeChoices(item.choices),
      answerable: true,
      requiresHumanReview: false
    });
  }
  if (item.type === 'order_words') {
    return Object.freeze({
      ...base,
      kind: RuntimeKind.ORDER_WORDS,
      responseShape: 'ordered_tokens',
      tokens: Object.freeze([...item.tokens]),
      answerable: true,
      requiresHumanReview: false
    });
  }
  if (item.type === 'listen_repeat') {
    return Object.freeze({
      ...base,
      kind: RuntimeKind.LISTEN_REPEAT,
      responseShape: 'external_human_review',
      audioText: item.audioText,
      answerable: false,
      requiresHumanReview: true,
      actionPolicy: 'DEFER_TO_SPEAKING_WORKFLOW'
    });
  }
  if (item.type === 'read_choose') {
    return Object.freeze({
      ...base,
      kind: RuntimeKind.READ_CHOOSE,
      responseShape: 'single_choice',
      choices: freezeChoices(item.choices),
      answerable: true,
      requiresHumanReview: false
    });
  }
  if (item.type === 'checkpoint') {
    return Object.freeze({
      ...base,
      kind: RuntimeKind.CHECKPOINT,
      responseShape: 'scenario_choices',
      scenarios: Object.freeze(item.scenarios.map(s => Object.freeze({
        text: s.text,
        choices: freezeChoices(s.choices)
      }))),
      answerable: true,
      requiresHumanReview: false
    });
  }

  runtimeError('LESSON_RUNTIME_UNSUPPORTED_ITEM_TYPE', { itemId: item.id ?? null, itemType: item.type ?? null });
}

export function deriveLessonRuntimeFrame(lesson, events = []) {
  const view = deriveLessonPlayerView(lesson, events);
  return Object.freeze({
    runtimeVersion: LESSON_RUNTIME_VERSION,
    lessonId: view.lessonId,
    contentVersion: view.contentVersion,
    sourceLane: view.sourceLane,
    status: view.status,
    progress: view.progress,
    current: view.currentItem ? describeRuntimeItem(view.currentItem) : null,
    canComplete: view.canComplete,
    speakingPending: view.speakingPending,
    replay: view.replay
  });
}

export function validateRuntimeResponse(item, response) {
  const descriptor = describeRuntimeItem(item);
  if (!descriptor.answerable) {
    runtimeError('LESSON_RUNTIME_RESPONSE_DEFERRED_TO_HUMAN_WORKFLOW', {
      itemId: descriptor.itemId,
      kind: descriptor.kind
    });
  }

  if (descriptor.responseShape === 'single_choice') {
    if (typeof response !== 'string' || !descriptor.choices.includes(response)) {
      runtimeError('LESSON_RUNTIME_SINGLE_CHOICE_RESPONSE_INVALID', { itemId: descriptor.itemId });
    }
    return true;
  }

  if (descriptor.responseShape === 'ordered_tokens') {
    if (!Array.isArray(response) || response.length !== descriptor.tokens.length) {
      runtimeError('LESSON_RUNTIME_ORDER_RESPONSE_INVALID', { itemId: descriptor.itemId });
    }
    const wanted = [...descriptor.tokens].sort();
    const observed = [...response].sort();
    if (wanted.some((token, index) => token !== observed[index])) {
      runtimeError('LESSON_RUNTIME_ORDER_RESPONSE_INVALID', { itemId: descriptor.itemId });
    }
    return true;
  }

  if (descriptor.responseShape === 'scenario_choices') {
    if (!Array.isArray(response) || response.length !== descriptor.scenarios.length) {
      runtimeError('LESSON_RUNTIME_CHECKPOINT_RESPONSE_INVALID', { itemId: descriptor.itemId });
    }
    for (let i = 0; i < descriptor.scenarios.length; i++) {
      if (!descriptor.scenarios[i].choices.includes(response[i])) {
        runtimeError('LESSON_RUNTIME_CHECKPOINT_RESPONSE_INVALID', { itemId: descriptor.itemId, scenarioIndex: i });
      }
    }
    return true;
  }

  runtimeError('LESSON_RUNTIME_RESPONSE_SHAPE_UNSUPPORTED', {
    itemId: descriptor.itemId,
    responseShape: descriptor.responseShape
  });
}

export function planRuntimeResponse(lesson, events, itemId, response) {
  const view = deriveLessonPlayerView(lesson, events);
  if (!view.currentItem) runtimeError('LESSON_RUNTIME_NO_CURRENT_ITEM', { status: view.status });
  if (view.currentItem.id !== itemId) {
    runtimeError('LESSON_RUNTIME_ITEM_PATH_MISMATCH', {
      expectedItemId: view.currentItem.id,
      observedItemId: itemId
    });
  }
  validateRuntimeResponse(view.currentItem, response);
  return planAnswerIntent(lesson, events, itemId, response);
}
