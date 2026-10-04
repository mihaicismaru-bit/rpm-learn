import assert from 'node:assert/strict';
import {
  PlayerUiRenderCommandError,
  buildPlayerUiRenderCommands
} from './player-ui-render-commands.mjs';

function active(overrides = {}) {
  return {
    sanitizerVersion: 1,
    projectionVersion: 2,
    status: 'ACTIVE',
    mode: 'ITEM',
    lessonId: 'RLS07-UI-BOUNDARY-01',
    contentVersion: 'rls07-ui-boundary@1.0.0',
    sourceLane: 'RLS-07',
    progress: { completedItems: 0, totalItems: 2, ratio: 0 },
    current: {
      itemId: 'E01',
      kind: 'READ_CHOOSE',
      prompt: 'Alege.',
      answerable: true,
      requiresHumanReview: false,
      choices: ['A','B']
    },
    speakingPending: [],
    capabilities: {
      audioAvailable: false,
      audioEnabled: false,
      speakingEnabled: false,
      humanReviewRequired: false
    },
    actions: { answer: true, complete: false, audio: false, speaking: false },
    message: null,
    integrity: { blocked: false, code: 'OK' },
    ...overrides
  };
}

function expectCode(model, code) {
  assert.throws(
    () => buildPlayerUiRenderCommands(model),
    error => error && error.code === code,
    code
  );
}

{
  const plan = buildPlayerUiRenderCommands(active());
  assert.deepEqual(plan.interaction, { kind: 'ANSWER', enabled: true, readOnly: false });
  assert.equal(plan.commands.some(command => ['#checkBtn','#xp','#time'].includes(command.anchor)), false);
  assert.deepEqual(plan.untouchedAnchors, ['#roleBadge','#lessonTitle','#xp','#time']);
  const exercise = plan.commands.find(command => command.anchor === '#exerciseBody').value;
  assert.deepEqual(exercise.choices, ['A','B']);
}

expectCode({ ...active(), xp: 10 }, 'UI_RENDER_SAFE_MODEL_SHAPE_INVALID');
expectCode({ ...active(), sourceLane: 'CHILD-LANE' }, 'UI_RENDER_SOURCE_LANE_BLOCKED');
expectCode(
  { ...active(), actions: { answer: true, complete: false, audio: true, speaking: false } },
  'UI_RENDER_DEFERRED_ACTION_ENABLED'
);
expectCode(
  {
    ...active(),
    capabilities: {
      audioAvailable: false,
      audioEnabled: false,
      speakingEnabled: true,
      humanReviewRequired: false
    }
  },
  'UI_RENDER_DEFERRED_CAPABILITY_ENABLED'
);
expectCode({ ...active(), status: 'UNKNOWN' }, 'UI_RENDER_STATUS_UNKNOWN');

expectCode({ ...active(), projectionVersion: 1 }, 'UI_MODEL_PROJECTION_VERSION_UNSUPPORTED');
expectCode(
  { ...active(), progress: { completedItems: 0, totalItems: 2, ratio: 0.25 } },
  'UI_MODEL_PROGRESS_RATIO_MISMATCH'
);
expectCode({ ...active(), mode: 'COMPLETION' }, 'UI_MODEL_STATUS_MODE_MISMATCH');
{
  const raw = active();
  raw.current = { ...raw.current, internalScore: 99 };
  expectCode(raw, 'UI_MODEL_CURRENT_SHAPE_INVALID');
}

{
  const hold = active({
    status: 'AWAITING_HUMAN_REVIEW',
    mode: 'HUMAN_REVIEW_HOLD',
    current: {
      itemId: 'E02',
      kind: 'LISTEN_REPEAT',
      prompt: 'Repetă.',
      answerable: false,
      requiresHumanReview: true,
      audioText: 'Bună ziua.'
    },
    speakingPending: ['E02'],
    capabilities: {
      audioAvailable: true,
      audioEnabled: false,
      speakingEnabled: false,
      humanReviewRequired: true
    },
    actions: { answer: false, complete: false, audio: false, speaking: false },
    message: 'În așteptarea validării umane.'
  });
  assert.deepEqual(buildPlayerUiRenderCommands(hold).interaction, { kind: 'NONE', enabled: false, readOnly: true });
  expectCode(
    { ...hold, actions: { answer: true, complete: false, audio: false, speaking: false } },
    'UI_RENDER_HUMAN_REVIEW_INVARIANT_FAILED'
  );
}

{
  const ready = active({
    status: 'READY_TO_COMPLETE',
    mode: 'COMPLETION',
    progress: { completedItems: 2, totalItems: 2, ratio: 1 },
    current: null,
    actions: { answer: false, complete: true, audio: false, speaking: false }
  });
  assert.deepEqual(buildPlayerUiRenderCommands(ready).interaction, { kind: 'COMPLETE', enabled: true, readOnly: false });
  expectCode({ ...ready, current: active().current }, 'UI_RENDER_COMPLETION_INVARIANT_FAILED');
}

{
  const blocked = active({
    status: 'INTEGRITY_BLOCKED',
    mode: 'INTEGRITY_BLOCK',
    current: null,
    actions: { answer: false, complete: false, audio: false, speaking: false },
    integrity: { blocked: true, code: 'REPLAY_SEQUENCE_GAP_OR_DUPLICATE' }
  });
  assert.deepEqual(buildPlayerUiRenderCommands(blocked).interaction, { kind: 'NONE', enabled: false, readOnly: true });
  expectCode(
    { ...blocked, integrity: { blocked: false, code: 'OK' } },
    'UI_RENDER_INTEGRITY_BLOCK_INVARIANT_FAILED'
  );
}

console.log('RPM_S3_5_RENDER_COMMAND_BOUNDARY_PASS protected-anchors raw-authority-rejected projection-pin progress-arithmetic status-mode RLS07-only deferred-actions status-gates');
