export const PLAYER_UI_RENDER_MODEL_INVARIANTS_VERSION = 1;

export class PlayerUiRenderModelInvariantError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = 'PlayerUiRenderModelInvariantError';
    this.code = code;
    this.detail = detail;
  }
}

const TOP_LEVEL_KEYS = Object.freeze([
  'sanitizerVersion','projectionVersion','status','mode','lessonId','contentVersion',
  'sourceLane','progress','current','speakingPending','capabilities','actions','message','integrity'
]);
const STATUS_MODE = Object.freeze({
  ACTIVE: 'ITEM',
  AWAITING_HUMAN_REVIEW: 'HUMAN_REVIEW_HOLD',
  READY_TO_COMPLETE: 'COMPLETION',
  COMPLETED: 'COMPLETED',
  INTEGRITY_BLOCKED: 'INTEGRITY_BLOCK'
});
const CURRENT_KEYS = Object.freeze({
  LISTEN_CHOOSE: ['itemId','kind','prompt','answerable','requiresHumanReview','choices','audioText'],
  SCENARIO_CHOOSE: ['itemId','kind','prompt','answerable','requiresHumanReview','choices'],
  READ_CHOOSE: ['itemId','kind','prompt','answerable','requiresHumanReview','choices'],
  ORDER_WORDS: ['itemId','kind','prompt','answerable','requiresHumanReview','tokens'],
  LISTEN_REPEAT: ['itemId','kind','prompt','answerable','requiresHumanReview','audioText'],
  CHECKPOINT: ['itemId','kind','prompt','answerable','requiresHumanReview','scenarios']
});

function fail(code, detail = {}) {
  throw new PlayerUiRenderModelInvariantError(code, detail);
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(code, { actual, expected: wanted });
  }
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value) fail('UI_MODEL_STRING_REQUIRED', { field });
  return value;
}

function bool(value, field) {
  if (typeof value !== 'boolean') fail('UI_MODEL_BOOLEAN_REQUIRED', { field });
  return value;
}

function uniqueStrings(value, field, min = 0) {
  if (!Array.isArray(value) || value.length < min) fail('UI_MODEL_ARRAY_INVALID', { field, min });
  for (let index = 0; index < value.length; index++) {
    if (typeof value[index] !== 'string' || !value[index]) fail('UI_MODEL_ARRAY_STRING_REQUIRED', { field, index });
  }
  if (new Set(value).size !== value.length) fail('UI_MODEL_ARRAY_DUPLICATE', { field });
}

function validateProgress(progress) {
  exactKeys(progress, ['completedItems','totalItems','ratio'], 'UI_MODEL_PROGRESS_SHAPE_INVALID');
  const { completedItems, totalItems, ratio } = progress;
  if (!Number.isInteger(completedItems) || completedItems < 0) fail('UI_MODEL_PROGRESS_COMPLETED_INVALID');
  if (!Number.isInteger(totalItems) || totalItems <= 0 || completedItems > totalItems) fail('UI_MODEL_PROGRESS_TOTAL_INVALID');
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) fail('UI_MODEL_PROGRESS_RATIO_INVALID');
  const expected = completedItems / totalItems;
  if (Math.abs(ratio - expected) > 1e-9) fail('UI_MODEL_PROGRESS_RATIO_MISMATCH', { expected, actual: ratio });
}

function validateScenarios(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length < 1) fail('UI_MODEL_SCENARIOS_INVALID');
  for (const [index, scenario] of scenarios.entries()) {
    exactKeys(scenario, ['text','choices'], 'UI_MODEL_SCENARIO_SHAPE_INVALID');
    requiredString(scenario.text, `current.scenarios[${index}].text`);
    uniqueStrings(scenario.choices, `current.scenarios[${index}].choices`, 2);
  }
}

function validateCurrent(current) {
  if (current === null) return;
  if (!current || typeof current !== 'object' || Array.isArray(current)) fail('UI_MODEL_CURRENT_INVALID');
  const kind = requiredString(current.kind, 'current.kind');
  const keys = CURRENT_KEYS[kind];
  if (!keys) fail('UI_MODEL_CURRENT_KIND_UNKNOWN', { kind });
  exactKeys(current, keys, 'UI_MODEL_CURRENT_SHAPE_INVALID');
  requiredString(current.itemId, 'current.itemId');
  requiredString(current.prompt, 'current.prompt');
  bool(current.answerable, 'current.answerable');
  bool(current.requiresHumanReview, 'current.requiresHumanReview');

  if (kind === 'LISTEN_CHOOSE') {
    uniqueStrings(current.choices, 'current.choices', 2);
    requiredString(current.audioText, 'current.audioText');
  } else if (kind === 'SCENARIO_CHOOSE' || kind === 'READ_CHOOSE') {
    uniqueStrings(current.choices, 'current.choices', 2);
  } else if (kind === 'ORDER_WORDS') {
    uniqueStrings(current.tokens, 'current.tokens', 1);
  } else if (kind === 'LISTEN_REPEAT') {
    requiredString(current.audioText, 'current.audioText');
  } else if (kind === 'CHECKPOINT') {
    validateScenarios(current.scenarios);
  }
}

function validateActions(actions) {
  exactKeys(actions, ['answer','complete','audio','speaking'], 'UI_MODEL_ACTIONS_SHAPE_INVALID');
  bool(actions.answer, 'actions.answer');
  bool(actions.complete, 'actions.complete');
  bool(actions.audio, 'actions.audio');
  bool(actions.speaking, 'actions.speaking');
  if (actions.audio !== false || actions.speaking !== false) fail('UI_MODEL_DEFERRED_ACTION_ENABLED');
}

function validateCapabilities(capabilities, current, speakingPending) {
  exactKeys(
    capabilities,
    ['audioAvailable','audioEnabled','speakingEnabled','humanReviewRequired'],
    'UI_MODEL_CAPABILITIES_SHAPE_INVALID'
  );
  for (const key of ['audioAvailable','audioEnabled','speakingEnabled','humanReviewRequired']) bool(capabilities[key], `capabilities.${key}`);
  if (capabilities.audioEnabled !== false || capabilities.speakingEnabled !== false) fail('UI_MODEL_DEFERRED_CAPABILITY_ENABLED');
  const expectedAudio = Boolean(current?.audioText);
  const expectedHuman = current?.requiresHumanReview === true || speakingPending.length > 0;
  if (capabilities.audioAvailable !== expectedAudio) fail('UI_MODEL_AUDIO_CAPABILITY_MISMATCH');
  if (capabilities.humanReviewRequired !== expectedHuman) fail('UI_MODEL_HUMAN_REVIEW_CAPABILITY_MISMATCH');
}

function validateIntegrity(integrity, status) {
  exactKeys(integrity, ['blocked','code'], 'UI_MODEL_INTEGRITY_SHAPE_INVALID');
  bool(integrity.blocked, 'integrity.blocked');
  requiredString(integrity.code, 'integrity.code');
  if (status === 'INTEGRITY_BLOCKED') {
    if (integrity.blocked !== true || integrity.code === 'OK') fail('UI_MODEL_INTEGRITY_STATUS_MISMATCH');
  } else if (integrity.blocked !== false || integrity.code !== 'OK') {
    fail('UI_MODEL_INTEGRITY_STATUS_MISMATCH');
  }
}

function validateStatus(model) {
  const { status, mode, current, progress, speakingPending, actions, capabilities } = model;
  const expectedMode = STATUS_MODE[status];
  if (!expectedMode) fail('UI_MODEL_STATUS_UNKNOWN', { status });
  if (mode !== expectedMode) fail('UI_MODEL_STATUS_MODE_MISMATCH', { status, mode, expectedMode });

  if (status === 'ACTIVE') {
    if (
      !current ||
      current.kind === 'LISTEN_REPEAT' ||
      current.answerable !== true ||
      current.requiresHumanReview !== false ||
      speakingPending.length !== 0 ||
      actions.answer !== true ||
      actions.complete !== false ||
      capabilities.humanReviewRequired !== false ||
      progress.ratio >= 1
    ) fail('UI_MODEL_ACTIVE_INVARIANT_FAILED');
    return;
  }

  if (status === 'AWAITING_HUMAN_REVIEW') {
    if (
      !current ||
      current.kind !== 'LISTEN_REPEAT' ||
      current.answerable !== false ||
      current.requiresHumanReview !== true ||
      !speakingPending.includes(current.itemId) ||
      actions.answer !== false ||
      actions.complete !== false ||
      capabilities.humanReviewRequired !== true ||
      progress.ratio >= 1
    ) fail('UI_MODEL_HUMAN_REVIEW_INVARIANT_FAILED');
    return;
  }

  if (status === 'READY_TO_COMPLETE') {
    if (
      current !== null ||
      speakingPending.length !== 0 ||
      actions.answer !== false ||
      actions.complete !== true ||
      progress.completedItems !== progress.totalItems ||
      progress.ratio !== 1
    ) fail('UI_MODEL_READY_INVARIANT_FAILED');
    return;
  }

  if (status === 'COMPLETED') {
    if (
      current !== null ||
      speakingPending.length !== 0 ||
      actions.answer !== false ||
      actions.complete !== false ||
      progress.completedItems !== progress.totalItems ||
      progress.ratio !== 1
    ) fail('UI_MODEL_COMPLETED_INVARIANT_FAILED');
    return;
  }

  if (current !== null || actions.answer !== false || actions.complete !== false) {
    fail('UI_MODEL_INTEGRITY_BLOCK_INVARIANT_FAILED');
  }
}

export function validatePlayerUiRenderModel(model) {
  exactKeys(model, TOP_LEVEL_KEYS, 'UI_MODEL_TOP_LEVEL_SHAPE_INVALID');
  if (model.sanitizerVersion !== 1) fail('UI_MODEL_SANITIZER_VERSION_UNSUPPORTED');
  if (model.projectionVersion !== 2) fail('UI_MODEL_PROJECTION_VERSION_UNSUPPORTED');
  requiredString(model.status, 'status');
  requiredString(model.mode, 'mode');
  requiredString(model.lessonId, 'lessonId');
  requiredString(model.contentVersion, 'contentVersion');
  if (model.sourceLane !== 'RLS-07') fail('UI_MODEL_SOURCE_LANE_BLOCKED', { sourceLane: model.sourceLane });
  validateProgress(model.progress);
  validateCurrent(model.current);
  uniqueStrings(model.speakingPending, 'speakingPending');
  validateActions(model.actions);
  validateCapabilities(model.capabilities, model.current, model.speakingPending);
  if (model.message !== null && typeof model.message !== 'string') fail('UI_MODEL_MESSAGE_INVALID');
  validateIntegrity(model.integrity, model.status);
  validateStatus(model);
  return true;
}
