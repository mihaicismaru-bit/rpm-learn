export const PLAYER_UI_RENDER_COMMANDS_VERSION = 1;

export class PlayerUiRenderCommandError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = 'PlayerUiRenderCommandError';
    this.code = code;
    this.detail = detail;
  }
}

const SAFE_TOP_LEVEL_KEYS = Object.freeze([
  'sanitizerVersion','projectionVersion','status','mode','lessonId','contentVersion',
  'sourceLane','progress','current','speakingPending','capabilities','actions','message','integrity'
]);
const KNOWN_STATUS = new Set(['ACTIVE','AWAITING_HUMAN_REVIEW','READY_TO_COMPLETE','COMPLETED','INTEGRITY_BLOCKED']);
const OWNED_ANCHORS = Object.freeze(['#progress','#prompt','#audioBtn','#exerciseBody','#feedback']);
const UNTOUCHED_ANCHORS = Object.freeze(['#roleBadge','#lessonTitle','#xp','#time']);

function fail(code, detail = {}) {
  throw new PlayerUiRenderCommandError(code, detail);
}
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, i) => key !== wanted[i])) {
    fail(code, { actual, expected: wanted });
  }
}
function requiredString(value, field) {
  if (typeof value !== 'string' || !value) fail('UI_RENDER_STRING_REQUIRED', { field });
  return value;
}
function validateSafeModel(model) {
  exactKeys(model, SAFE_TOP_LEVEL_KEYS, 'UI_RENDER_SAFE_MODEL_SHAPE_INVALID');
  if (model.sanitizerVersion !== 1) fail('UI_RENDER_SANITIZER_VERSION_UNSUPPORTED');
  if (!KNOWN_STATUS.has(model.status)) fail('UI_RENDER_STATUS_UNKNOWN', { status: model.status });
  if (model.sourceLane !== 'RLS-07') fail('UI_RENDER_SOURCE_LANE_BLOCKED', { sourceLane: model.sourceLane });
  requiredString(model.lessonId, 'lessonId');
  requiredString(model.contentVersion, 'contentVersion');
  if (!model.progress || typeof model.progress !== 'object') fail('UI_RENDER_PROGRESS_REQUIRED');
  if (!model.actions || typeof model.actions !== 'object') fail('UI_RENDER_ACTIONS_REQUIRED');
  if (!model.capabilities || typeof model.capabilities !== 'object') fail('UI_RENDER_CAPABILITIES_REQUIRED');
  if (model.actions.audio !== false || model.actions.speaking !== false) fail('UI_RENDER_DEFERRED_ACTION_ENABLED');
  if (model.capabilities.audioEnabled !== false || model.capabilities.speakingEnabled !== false) fail('UI_RENDER_DEFERRED_CAPABILITY_ENABLED');
  if (!Array.isArray(model.speakingPending)) fail('UI_RENDER_SPEAKING_PENDING_INVALID');
  if (!model.integrity || typeof model.integrity !== 'object') fail('UI_RENDER_INTEGRITY_REQUIRED');
}
function command(type, anchor, value = null) {
  if (!OWNED_ANCHORS.includes(anchor)) fail('UI_RENDER_ANCHOR_NOT_OWNED', { anchor });
  return Object.freeze({ type, anchor, value });
}
function interactionFor(model) {
  if (model.status === 'ACTIVE') {
    if (!model.current || model.actions.answer !== true || model.actions.complete !== false) fail('UI_RENDER_ACTIVE_INVARIANT_FAILED');
    return Object.freeze({ kind: 'ANSWER', enabled: true, readOnly: false });
  }
  if (model.status === 'AWAITING_HUMAN_REVIEW') {
    if (!model.current || model.actions.answer !== false || model.actions.complete !== false) fail('UI_RENDER_HUMAN_REVIEW_INVARIANT_FAILED');
    return Object.freeze({ kind: 'NONE', enabled: false, readOnly: true });
  }
  if (model.status === 'READY_TO_COMPLETE') {
    if (model.current !== null || model.actions.answer !== false || model.actions.complete !== true) fail('UI_RENDER_COMPLETION_INVARIANT_FAILED');
    return Object.freeze({ kind: 'COMPLETE', enabled: true, readOnly: false });
  }
  if (model.status === 'COMPLETED') {
    if (model.current !== null || model.actions.answer !== false || model.actions.complete !== false) fail('UI_RENDER_COMPLETED_INVARIANT_FAILED');
    return Object.freeze({ kind: 'NONE', enabled: false, readOnly: true });
  }
  if (model.current !== null || model.actions.answer !== false || model.actions.complete !== false || model.integrity.blocked !== true) {
    fail('UI_RENDER_INTEGRITY_BLOCK_INVARIANT_FAILED');
  }
  return Object.freeze({ kind: 'NONE', enabled: false, readOnly: true });
}
function exercisePayload(model) {
  if (!model.current) return null;
  const current = structuredClone(model.current);
  return deepFreeze({
    itemId: requiredString(current.itemId, 'current.itemId'),
    kind: requiredString(current.kind, 'current.kind'),
    prompt: requiredString(current.prompt, 'current.prompt'),
    answerable: current.answerable === true,
    requiresHumanReview: current.requiresHumanReview === true,
    ...(Array.isArray(current.choices) ? { choices: Object.freeze([...current.choices]) } : {}),
    ...(Array.isArray(current.tokens) ? { tokens: Object.freeze([...current.tokens]) } : {}),
    ...(Array.isArray(current.scenarios) ? { scenarios: deepFreeze(structuredClone(current.scenarios)) } : {}),
    ...(typeof current.audioText === 'string' ? { audioText: current.audioText } : {})
  });
}

export function buildPlayerUiRenderCommands(safeRenderModel) {
  validateSafeModel(safeRenderModel);
  const interaction = interactionFor(safeRenderModel);
  const progressText = String(safeRenderModel.progress.completedItems) + '/' + String(safeRenderModel.progress.totalItems);
  const promptText = safeRenderModel.current?.prompt ?? safeRenderModel.message ?? '';
  const feedbackText = safeRenderModel.status === 'INTEGRITY_BLOCKED'
    ? 'INTEGRITY_BLOCKED:' + requiredString(safeRenderModel.integrity.code, 'integrity.code')
    : (safeRenderModel.message ?? '');
  const commands = Object.freeze([
    command('SET_TEXT','#progress',progressText),
    command('SET_TEXT','#prompt',promptText),
    command('SET_DISABLED','#audioBtn',true),
    command(safeRenderModel.current ? 'RENDER_SAFE_ITEM' : 'CLEAR','#exerciseBody',exercisePayload(safeRenderModel)),
    command('SET_TEXT','#feedback',feedbackText)
  ]);
  return deepFreeze({
    renderCommandsVersion: PLAYER_UI_RENDER_COMMANDS_VERSION,
    sourceLane: safeRenderModel.sourceLane,
    status: safeRenderModel.status,
    lessonId: safeRenderModel.lessonId,
    contentVersion: safeRenderModel.contentVersion,
    ownedAnchors: [...OWNED_ANCHORS],
    untouchedAnchors: [...UNTOUCHED_ANCHORS],
    interaction,
    commands,
    deferred: { audio: 'S4.1', speaking: 'S4.2', humanReview: 'S4.3' }
  });
}
