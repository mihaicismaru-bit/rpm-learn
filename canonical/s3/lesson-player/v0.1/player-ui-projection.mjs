export const PLAYER_UI_PROJECTION_VERSION = 1;

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

function readonlyArray(value) {
  return Object.freeze([...(Array.isArray(value) ? value : [])]);
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

  const speakingPending = readonlyArray(frame.speakingPending);
  const actions = baseActions();
  let mode;
  let message = null;

  if (frame.status === 'ACTIVE') {
    if (!frame.current) fail('UI_PROJECTION_ACTIVE_CURRENT_REQUIRED');
    mode = 'ITEM';
    actions.answer = frame.current.answerable === true && frame.current.requiresHumanReview !== true;
  } else if (frame.status === 'AWAITING_HUMAN_REVIEW') {
    if (speakingPending.length === 0) fail('UI_PROJECTION_HUMAN_REVIEW_PENDING_REQUIRED');
    mode = 'HUMAN_REVIEW_HOLD';
    message = 'În așteptarea validării umane.';
  } else if (frame.status === 'READY_TO_COMPLETE') {
    if (frame.current !== null || frame.canComplete !== true || speakingPending.length !== 0) {
      fail('UI_PROJECTION_COMPLETION_INVARIANT_FAILED');
    }
    mode = 'COMPLETION';
    actions.complete = true;
  } else if (frame.status === 'COMPLETED') {
    if (frame.canComplete === true) fail('UI_PROJECTION_COMPLETED_CANNOT_COMPLETE_AGAIN');
    mode = 'COMPLETED';
    message = 'Lecție finalizată.';
  } else {
    mode = 'INTEGRITY_BLOCK';
    message = 'Istoric local blocat pentru protecția integrității.';
  }

  const current = frame.current ? Object.freeze({ ...frame.current }) : null;
  const audioAvailable = Boolean(current?.audioText);

  return Object.freeze({
    projectionVersion: PLAYER_UI_PROJECTION_VERSION,
    status: frame.status,
    mode,
    lessonId: frame.lessonId,
    contentVersion: frame.contentVersion,
    sourceLane: frame.sourceLane ?? null,
    progress: frame.progress ? Object.freeze({ ...frame.progress }) : null,
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
    replay: frame.replay ? Object.freeze({ ...frame.replay }) : null
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
