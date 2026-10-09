import assert from 'node:assert/strict';
import {
  PlayerUiRenderModelInvariantError,
  validatePlayerUiRenderModel
} from './player-ui-render-model-invariants.mjs';

function activeModel() {
  return {
    sanitizerVersion: 1,
    projectionVersion: 2,
    status: 'ACTIVE',
    mode: 'ITEM',
    lessonId: 'RLS07-TEST-01',
    contentVersion: 'rpm-rls07-test@0.1.0',
    sourceLane: 'RLS-07',
    progress: { completedItems: 0, totalItems: 2, ratio: 0 },
    current: {
      itemId: 'E01',
      kind: 'LISTEN_CHOOSE',
      prompt: 'Alege răspunsul.',
      answerable: true,
      requiresHumanReview: false,
      choices: ['Da', 'Nu'],
      audioText: 'Da.'
    },
    speakingPending: [],
    capabilities: {
      audioAvailable: true,
      audioEnabled: false,
      speakingEnabled: false,
      humanReviewRequired: false
    },
    actions: { answer: true, complete: false, audio: false, speaking: false },
    message: null,
    integrity: { blocked: false, code: 'OK' }
  };
}

function humanReviewModel() {
  const model = activeModel();
  model.status = 'AWAITING_HUMAN_REVIEW';
  model.mode = 'HUMAN_REVIEW_HOLD';
  model.progress = { completedItems: 1, totalItems: 2, ratio: 0.5 };
  model.current = {
    itemId: 'E02',
    kind: 'LISTEN_REPEAT',
    prompt: 'Repetă.',
    answerable: false,
    requiresHumanReview: true,
    audioText: 'Bună ziua.'
  };
  model.speakingPending = ['E02'];
  model.capabilities = {
    audioAvailable: true,
    audioEnabled: false,
    speakingEnabled: false,
    humanReviewRequired: true
  };
  model.actions = { answer: false, complete: false, audio: false, speaking: false };
  return model;
}

function readyModel() {
  const model = activeModel();
  model.status = 'READY_TO_COMPLETE';
  model.mode = 'COMPLETION';
  model.progress = { completedItems: 2, totalItems: 2, ratio: 1 };
  model.current = null;
  model.capabilities = {
    audioAvailable: false,
    audioEnabled: false,
    speakingEnabled: false,
    humanReviewRequired: false
  };
  model.actions = { answer: false, complete: true, audio: false, speaking: false };
  return model;
}

function completedModel() {
  const model = readyModel();
  model.status = 'COMPLETED';
  model.mode = 'COMPLETED';
  model.actions.complete = false;
  return model;
}

function blockedModel() {
  const model = activeModel();
  model.status = 'INTEGRITY_BLOCKED';
  model.mode = 'INTEGRITY_BLOCK';
  model.current = null;
  model.capabilities = {
    audioAvailable: false,
    audioEnabled: false,
    speakingEnabled: false,
    humanReviewRequired: false
  };
  model.actions = { answer: false, complete: false, audio: false, speaking: false };
  model.integrity = { blocked: true, code: 'REPLAY_INVALID' };
  return model;
}

function expectCode(source, code, mutate) {
  const candidate = structuredClone(source);
  mutate(candidate);
  assert.throws(
    () => validatePlayerUiRenderModel(candidate),
    error => error instanceof PlayerUiRenderModelInvariantError && error.code === code,
    code
  );
}

for (const model of [
  activeModel(),
  humanReviewModel(),
  readyModel(),
  completedModel(),
  blockedModel()
]) {
  assert.equal(validatePlayerUiRenderModel(model), true);
}

expectCode(activeModel(), 'UI_MODEL_TOP_LEVEL_SHAPE_INVALID', model => {
  model.xp = 100;
});
expectCode(activeModel(), 'UI_MODEL_PROJECTION_VERSION_UNSUPPORTED', model => {
  model.projectionVersion = 1;
});
expectCode(activeModel(), 'UI_MODEL_SOURCE_LANE_BLOCKED', model => {
  model.sourceLane = 'RLS-08';
});
expectCode(activeModel(), 'UI_MODEL_PROGRESS_RATIO_MISMATCH', model => {
  model.progress.ratio = 0.25;
});
expectCode(activeModel(), 'UI_MODEL_CURRENT_SHAPE_INVALID', model => {
  model.current.correctAnswer = 'Da';
});
expectCode(humanReviewModel(), 'UI_MODEL_ARRAY_DUPLICATE', model => {
  model.speakingPending.push('E02');
});
expectCode(activeModel(), 'UI_MODEL_DEFERRED_ACTION_ENABLED', model => {
  model.actions.audio = true;
});
expectCode(activeModel(), 'UI_MODEL_DEFERRED_CAPABILITY_ENABLED', model => {
  model.capabilities.speakingEnabled = true;
});
expectCode(activeModel(), 'UI_MODEL_AUDIO_CAPABILITY_MISMATCH', model => {
  model.capabilities.audioAvailable = false;
});
expectCode(activeModel(), 'UI_MODEL_STATUS_MODE_MISMATCH', model => {
  model.mode = 'COMPLETION';
});
expectCode(activeModel(), 'UI_MODEL_ACTIVE_INVARIANT_FAILED', model => {
  model.current = humanReviewModel().current;
  model.capabilities.humanReviewRequired = true;
});
expectCode(humanReviewModel(), 'UI_MODEL_HUMAN_REVIEW_INVARIANT_FAILED', model => {
  model.speakingPending = [];
});
expectCode(readyModel(), 'UI_MODEL_READY_INVARIANT_FAILED', model => {
  model.progress = { completedItems: 1, totalItems: 2, ratio: 0.5 };
});
expectCode(completedModel(), 'UI_MODEL_COMPLETED_INVARIANT_FAILED', model => {
  model.current = activeModel().current;
  model.capabilities.audioAvailable = true;
});
expectCode(blockedModel(), 'UI_MODEL_INTEGRITY_BLOCK_INVARIANT_FAILED', model => {
  model.current = activeModel().current;
  model.capabilities.audioAvailable = true;
});
expectCode(activeModel(), 'UI_MODEL_INTEGRITY_STATUS_MISMATCH', model => {
  model.integrity = { blocked: true, code: 'REPLAY_INVALID' };
});

console.log(
  'RPM_S3_5_RENDER_MODEL_INVARIANTS_TESTS_PASS ' +
  'positive-status-matrix exact-shapes projection-pin RLS07-only progress-arithmetic ' +
  'no-raw-authority no-duplicate-speaking deferred-audio-speaking capability-binding ' +
  'status-mode human-review completion-integrity fail-closed'
);
