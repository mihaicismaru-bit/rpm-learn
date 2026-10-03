export const PLAYER_UI_PROJECTION_VERSION = 2;

export class PlayerUiProjectionError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = 'PlayerUiProjectionError';
    this.code = code;
    this.detail = detail;
  }
}

const KNOWN_STATUS = new Set([
  'ACTIVE',
  'AWAITING_HUMAN_REVIEW',
  'READY_TO_COMPLETE',
  'COMPLETED',
  'INTEGRITY_BLOCKED'
]);

function fail(code, detail = {}) {
  throw new PlayerUiProjectionError(code, detail);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function readonlyClone(value) {
  if (value === undefined || value === null) return value ?? null;
  return deepFreeze(structuredClone(value));
}

function readonlyStringArray(value, field) {
  if (value === undefined || value === null) return Object.freeze([]);
  if (!Array.isArray(value)) fail('UI_PROJECTION_ARRAY_REQUIRED', { field });
  const copy = value.map((entry, index) => {
    if (typeof entry !== 'string' || !entry) {
      fail('UI_PROJECTION_ARRAY_STRING_REQUIRED', { field, index });
    }
    return entry;
  });
  if (new Set(copy).size !== copy.length) fail('UI_PROJECTION_ARRAY_DUPLICATE', { field });
  return Object.freeze(copy);
}

function validateProgress(progress) {
  if (!progress || typeof progress !== 'object') fail('UI_PROJECTION_PROGRESS_REQUIRED');
  const { completedItems, totalItems, ratio } = progress;
  if (!Number.isInteger(completedItems) || completedItems < 0) fail('UI_PROJECTION_PROGRESS_COMPLETED_INVALID');
  if (!Number.isInteger(totalItems) || totalItems <= 0) fail('UI_PROJECTION_PROGRESS_TOTAL_INVALID');
  if (completedItems > totalItems) fail('UI_PROJECTION_PROGRESS_RANGE_INVALID');
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    fail('UI_PROJECTION_PROGRESS_RATIO_INVALID');
  }
  const expected = completedItems / totalItems;
  if (Math.abs(ratio - expected) > 1e-9) {
    fail('UI_PROJECTION_PROGRESS_RATIO_MISMATCH', { expected, actual: ratio });
  }
  return readonlyClone(progress);
}

function baseActions() {
  return {
    answer: false,
    complete: false,
    audio: false,
    speaking: false
  };
}

export function projectRuntimeFrame(frame) {
  if (!frame || typeof frame !== 'object') fail('UI_PROJECTION_FRAME_REQUIRED');
  if (!KNOWN_STATUS.has(frame.status)) {
    fail('UI_PROJECTION_STATUS_UNKNOWN', { status: frame.status ?? null });
  }
  if (typeof frame.lessonId !== 'string' || !frame.lessonId) fail('UI_PROJECTION_LESSON_ID_REQUIRED');
  if (typeof frame.contentVersion !== 'string' || !frame.contentVersion) fail('UI_PROJECTION_CONTENT_VERSION_REQUIRED');

  const progress = validateProgress(frame.progress);
  const speakingPending = readonlyStringArray(frame.speakingPending, 'speakingPending');
  const actions = baseActions();
  let mode;
  let message = null;

  if (frame.status === 'ACTIVE') {
    if (!frame.current) fail('UI_PROJECTION_ACTIVE_CURRENT_REQUIRED');
    if (frame.canComplete === true || speakingPending.length !== 0 || progress.ratio >= 1) {
      fail('UI_PROJECTION_ACTIVE_INVARIANT_FAILED');
    }
    mode = 'ITEM';
    actions.answer = frame.current.answerable === true && frame.current.requiresHumanReview !== true;
  } else if (frame.status === 'AWAITING_HUMAN_REVIEW') {
    if (!frame.current) fail('UI_PROJECTION_HUMAN_REVIEW_CURRENT_REQUIRED');
    if (speakingPending.length === 0) fail('UI_PROJECTION_HUMAN_REVIEW_PENDING_REQUIRED');
    if (
      frame.canComplete === true ||
      frame.current.requiresHumanReview !== true ||
      frame.current.answerable === true ||
      typeof frame.current.itemId !== 'string' ||
      !speakingPending.includes(frame.current.itemId) ||
      progress.ratio >= 1
    ) {
      fail('UI_PROJECTION_HUMAN_REVIEW_INVARIANT_FAILED');
    }
    mode = 'HUMAN_REVIEW_HOLD';
    message = 'În așteptarea validării umane.';
  } else if (frame.status === 'READY_TO_COMPLETE') {
    if (
      frame.current !== null ||
      frame.canComplete !== true ||
      speakingPending.length !== 0 ||
      progress.completedItems !== progress.totalItems ||
      progress.ratio !== 1
    ) {
      fail('UI_PROJECTION_COMPLETION_INVARIANT_FAILED');
    }
    mode = 'COMPLETION';
    actions.complete = true;
  } else if (frame.status === 'COMPLETED') {
    if (
      frame.current !== null ||
      frame.canComplete === true ||
      speakingPending.length !== 0 ||
      progress.completedItems !== progress.totalItems ||
      progress.ratio !== 1
    ) {
      fail('UI_PROJECTION_COMPLETED_INVARIANT_FAILED');
    }
    mode = 'COMPLETED';
    message = 'Lecție finalizată.';
  } else {
    if (frame.current !== null || frame.canComplete === true) {
      fail('UI_PROJECTION_INTEGRITY_BLOCK_INVARIANT_FAILED');
    }
    mode = 'INTEGRITY_BLOCK';
    message = 'Istoric local blocat pentru protecția integrității.';
  }

  const current = readonlyClone(frame.current);
  const audioAvailable = Boolean(current?.audioText);

  return Object.freeze({
    projectionVersion: PLAYER_UI_PROJECTION_VERSION,
    status: frame.status,
    mode,
    lessonId: frame.lessonId,
    contentVersion: frame.contentVersion,
    sourceLane: frame.sourceLane ?? null,
    progress,
    current,
    speakingPending,
    capabilities: Object.freeze({
      audioAvailable,
      audioEnabled: false,
      speakingEnabled: false,
      humanReviewRequired: current?.requiresHumanReview === true || speakingPending.length > 0
    }),
    actions: Object.freeze(actions),
    message,
    replay: readonlyClone(frame.replay)
  });
}

export function createPlayerUiSessionPort(controller) {
  const required = ['start', 'refresh', 'answer', 'complete'];
  for (const method of required) {
    if (typeof controller?.[method] !== 'function') {
      fail('UI_SESSION_PORT_INVALID', { missingMethod: method });
    }
  }
  return Object.freeze({
    start: (...args) => controller.start(...args),
    refresh: (...args) => controller.refresh(...args),
    answer: (...args) => controller.answer(...args),
    complete: (...args) => controller.complete(...args)
  });
}
