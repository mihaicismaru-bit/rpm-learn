import assert from 'node:assert/strict';
import {
  composeSafePlayerUiRender,
  createSafeRenderCommandSessionPort
} from './player-ui-safe-render-pipeline.mjs';
import { PlayerUiRenderModelInvariantError } from './player-ui-render-model-invariants.mjs';

function frame(overrides = {}) {
  return {
    lessonId: 'RLS07-BINDING',
    contentVersion: 'rls07-binding@1.0.0',
    sourceLane: 'RLS-07',
    status: 'ACTIVE',
    progress: { completedItems: 0, totalItems: 2, ratio: 0 },
    current: {
      itemId: 'E01',
      kind: 'READ_CHOOSE',
      prompt: 'Alege.',
      answerable: true,
      requiresHumanReview: false,
      choices: ['A', 'B'],
      correctAnswer: 'A',
      internalScore: 1
    },
    canComplete: false,
    speakingPending: [],
    replay: { code: 'LEARNING_REPLAY_CONTIGUOUS_AND_SEMANTIC', internalEventIds: ['hidden'] },
    xp: 1000,
    activeMs: 999999,
    ...overrides
  };
}

{
  const out = composeSafePlayerUiRender(frame());
  assert.equal(out.pipelineVersion, 1);
  assert.equal(out.safeRenderModel.sourceLane, 'RLS-07');
  assert.equal(out.safeRenderModel.projectionVersion, 2);
  assert.equal(Object.isFrozen(out), true);
  assert.equal(Object.isFrozen(out.safeRenderModel), true);
  assert.equal(Object.isFrozen(out.renderPlan), true);
  for (const key of ['xp', 'activeMs', 'replay']) assert.equal(key in out.safeRenderModel, false);
  for (const key of ['correctAnswer', 'internalScore']) assert.equal(key in out.safeRenderModel.current, false);
  assert.equal(
    out.renderPlan.commands.some(command => ['#checkBtn', '#xp', '#time'].includes(command.anchor)),
    false
  );
}

{
  const invalidActiveSpeaking = frame({
    current: {
      itemId: 'E02',
      kind: 'LISTEN_REPEAT',
      prompt: 'Repetă.',
      answerable: true,
      requiresHumanReview: false,
      audioText: 'Mai încet, vă rog.'
    }
  });
  assert.throws(
    () => composeSafePlayerUiRender(invalidActiveSpeaking),
    error => error instanceof PlayerUiRenderModelInvariantError &&
      error.code === 'UI_MODEL_ACTIVE_INVARIANT_FAILED'
  );
}

{
  const invalidHumanReviewKind = frame({
    status: 'AWAITING_HUMAN_REVIEW',
    current: {
      itemId: 'E03',
      kind: 'READ_CHOOSE',
      prompt: 'Alege.',
      answerable: false,
      requiresHumanReview: true,
      choices: ['A', 'B']
    },
    speakingPending: ['E03']
  });
  assert.throws(
    () => composeSafePlayerUiRender(invalidHumanReviewKind),
    error => error instanceof PlayerUiRenderModelInvariantError &&
      error.code === 'UI_MODEL_HUMAN_REVIEW_INVARIANT_FAILED'
  );
}

{
  const ready = composeSafePlayerUiRender(frame({
    status: 'READY_TO_COMPLETE',
    progress: { completedItems: 2, totalItems: 2, ratio: 1 },
    current: null,
    canComplete: true
  }));
  assert.deepEqual(ready.renderPlan.interaction, { kind: 'COMPLETE', enabled: true, readOnly: false });
}

{
  const calls = [];
  const controller = {
    start: async () => {
      calls.push('start');
      return frame({
        current: {
          itemId: 'E04',
          kind: 'LISTEN_REPEAT',
          prompt: 'Repetă.',
          answerable: true,
          requiresHumanReview: false,
          audioText: 'Nu înțeleg.'
        }
      });
    },
    refresh: async () => frame(),
    answer: async () => frame(),
    complete: async () => frame({
      status: 'COMPLETED',
      progress: { completedItems: 2, totalItems: 2, ratio: 1 },
      current: null,
      canComplete: false
    })
  };
  const port = createSafeRenderCommandSessionPort(controller);
  await assert.rejects(
    port.start(),
    error => error instanceof PlayerUiRenderModelInvariantError &&
      error.code === 'UI_MODEL_ACTIVE_INVARIANT_FAILED'
  );
  assert.deepEqual(calls, ['start']);
}

console.log('RPM_S3_5_SAFE_RENDER_INVARIANT_BINDING_PASS sanitizer-to-validator-to-render fail-closed-human-review fail-closed-active-speaking protected-anchors session-port-propagation');
