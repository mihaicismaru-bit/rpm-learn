import {
  PlayerUiProjectionError,
  projectRuntimeFrame
} from './player-ui-projection.mjs';

export const PLAYER_UI_RENDER_SANITIZER_VERSION = 1;

function fail(code, detail = {}) {
  throw new PlayerUiProjectionError(code, detail);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value) fail('UI_SANITIZER_STRING_REQUIRED', { field });
  return value;
}

function optionalString(value, field) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !value) fail('UI_SANITIZER_STRING_INVALID', { field });
  return value;
}

function stringArray(value, field, min = 0) {
  if (!Array.isArray(value) || value.length < min) fail('UI_SANITIZER_ARRAY_INVALID', { field, min });
  const out = value.map((entry, index) => {
    if (typeof entry !== 'string' || !entry) fail('UI_SANITIZER_ARRAY_STRING_REQUIRED', { field, index });
    return entry;
  });
  if (new Set(out).size !== out.length) fail('UI_SANITIZER_ARRAY_DUPLICATE', { field });
  return Object.freeze(out);
}

function hash32(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function presentationOrder(tokens, seed) {
  const source = stringArray(tokens, 'current.tokens', 1);
  if (source.length < 2) return source;
  let ordered = source
    .map((token, index) => ({ token, index, rank: hash32(seed + '|' + token + '|' + index) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(entry => entry.token);
  if (ordered.every((token, index) => token === source[index])) {
    ordered = [...ordered.slice(1), ordered[0]];
  }
  return Object.freeze(ordered);
}

function sanitizeScenarios(scenarios) {
  if (!Array.isArray(scenarios) || scenarios.length < 1) fail('UI_SANITIZER_SCENARIOS_REQUIRED');
  return Object.freeze(scenarios.map((scenario, index) => {
    if (!scenario || typeof scenario !== 'object') fail('UI_SANITIZER_SCENARIO_INVALID', { index });
    return Object.freeze({
      text: requiredString(scenario.text, 'current.scenarios.text'),
      choices: stringArray(scenario.choices, 'current.scenarios.choices', 2)
    });
  }));
}

function sanitizeCurrent(current, lessonId, contentVersion) {
  if (current === null) return null;
  if (!current || typeof current !== 'object') fail('UI_SANITIZER_CURRENT_INVALID');
  const kind = requiredString(current.kind, 'current.kind');
  const safe = {
    itemId: requiredString(current.itemId, 'current.itemId'),
    kind,
    prompt: requiredString(current.prompt, 'current.prompt'),
    answerable: current.answerable === true,
    requiresHumanReview: current.requiresHumanReview === true
  };

  if (kind === 'LISTEN_CHOOSE') {
    safe.choices = stringArray(current.choices, 'current.choices', 2);
    safe.audioText = requiredString(current.audioText, 'current.audioText');
  } else if (kind === 'SCENARIO_CHOOSE' || kind === 'READ_CHOOSE') {
    safe.choices = stringArray(current.choices, 'current.choices', 2);
  } else if (kind === 'ORDER_WORDS') {
    safe.tokens = presentationOrder(
      current.tokens,
      lessonId + '|' + contentVersion + '|' + safe.itemId
    );
  } else if (kind === 'LISTEN_REPEAT') {
    safe.audioText = requiredString(current.audioText, 'current.audioText');
  } else if (kind === 'CHECKPOINT') {
    safe.scenarios = sanitizeScenarios(current.scenarios);
  } else {
    fail('UI_SANITIZER_ITEM_KIND_UNKNOWN', { kind });
  }
  return deepFreeze(safe);
}

function sanitizeProgress(progress) {
  if (!progress || typeof progress !== 'object') fail('UI_SANITIZER_PROGRESS_REQUIRED');
  const completedItems = progress.completedItems;
  const totalItems = progress.totalItems;
  const ratio = progress.ratio;
  if (!Number.isInteger(completedItems) || completedItems < 0) fail('UI_SANITIZER_PROGRESS_COMPLETED_INVALID');
  if (!Number.isInteger(totalItems) || totalItems <= 0 || completedItems > totalItems) fail('UI_SANITIZER_PROGRESS_TOTAL_INVALID');
  if (typeof ratio !== 'number' || !Number.isFinite(ratio) || Math.abs(ratio - completedItems / totalItems) > 1e-9) {
    fail('UI_SANITIZER_PROGRESS_RATIO_INVALID');
  }
  return Object.freeze({ completedItems, totalItems, ratio });
}

function sanitizeIntegrity(status, replay) {
  if (status !== 'INTEGRITY_BLOCKED') return Object.freeze({ blocked: false, code: 'OK' });
  const candidate = typeof replay?.code === 'string' ? replay.code : '';
  const code = /^[A-Z0-9_:-]{1,120}$/.test(candidate) ? candidate : 'INTEGRITY_BLOCKED';
  return Object.freeze({ blocked: true, code });
}

export function sanitizeProjectedRenderModel(projected, frame) {
  if (!projected || typeof projected !== 'object') fail('UI_SANITIZER_PROJECTED_REQUIRED');
  if (!frame || typeof frame !== 'object') fail('UI_SANITIZER_FRAME_REQUIRED');

  const lessonId = requiredString(projected.lessonId, 'lessonId');
  const contentVersion = requiredString(projected.contentVersion, 'contentVersion');
  if (lessonId !== frame.lessonId || contentVersion !== frame.contentVersion || projected.status !== frame.status) {
    fail('UI_SANITIZER_FRAME_BINDING_MISMATCH');
  }

  const sourceLane = optionalString(projected.sourceLane, 'sourceLane');
  if (sourceLane !== 'RLS-07') fail('UI_SANITIZER_SOURCE_LANE_BLOCKED', { sourceLane });

  const current = sanitizeCurrent(projected.current, lessonId, contentVersion);
  const speakingPending = stringArray(projected.speakingPending ?? [], 'speakingPending');
  const progress = sanitizeProgress(projected.progress);
  const actions = Object.freeze({
    answer: projected.actions?.answer === true,
    complete: projected.actions?.complete === true,
    audio: false,
    speaking: false
  });

  return Object.freeze({
    sanitizerVersion: PLAYER_UI_RENDER_SANITIZER_VERSION,
    projectionVersion: projected.projectionVersion,
    status: requiredString(projected.status, 'status'),
    mode: requiredString(projected.mode, 'mode'),
    lessonId,
    contentVersion,
    sourceLane,
    progress,
    current,
    speakingPending,
    capabilities: Object.freeze({
      audioAvailable: Boolean(current?.audioText),
      audioEnabled: false,
      speakingEnabled: false,
      humanReviewRequired: current?.requiresHumanReview === true || speakingPending.length > 0
    }),
    actions,
    message: optionalString(projected.message, 'message'),
    integrity: sanitizeIntegrity(projected.status, projected.replay)
  });
}

export function projectSafeRuntimeFrame(frame) {
  return sanitizeProjectedRenderModel(projectRuntimeFrame(frame), frame);
}

export function createSafePlayerUiSessionPort(controller) {
  const required = ['start', 'refresh', 'answer', 'complete'];
  for (const method of required) {
    if (typeof controller?.[method] !== 'function') {
      fail('UI_SAFE_SESSION_PORT_INVALID', { missingMethod: method });
    }
  }
  const invoke = async (method, args) => projectSafeRuntimeFrame(await controller[method](...args));
  return Object.freeze({
    start: (...args) => invoke('start', args),
    refresh: (...args) => invoke('refresh', args),
    answer: (...args) => invoke('answer', args),
    complete: (...args) => invoke('complete', args)
  });
}
