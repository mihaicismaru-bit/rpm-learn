import assert from 'node:assert/strict';
import {
  PlayerUiProjectionError,
  createPlayerUiSessionPort,
  projectRuntimeFrame
} from './player-ui-projection.mjs';

function frame(overrides = {}) {
  return {
    lessonId: 'RLS07-PREFLIGHT-01',
    contentVersion: 'rls07-preflight@1.0.0',
    sourceLane: 'RLS-07',
    status: 'ACTIVE',
    progress: { completedItems: 0, totalItems: 2, ratio: 0 },
    current: {
      itemId: 'E01',
      kind: 'READ_CHOOSE',
      prompt: 'Alege.',
      answerable: true,
      requiresHumanReview: false,
      choices: ['A', 'B']
    },
    canComplete: false,
    speakingPending: [],
    replay: { code: 'LEARNING_REPLAY_CONTIGUOUS_AND_SEMANTIC', contiguousHead: 1 },
    ...overrides
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof PlayerUiProjectionError && error.code === code);
}

{
  const input = frame();
  const before = structuredClone(input);
  const projected = projectRuntimeFrame(input);
  assert.equal(projected.mode, 'ITEM');
  assert.equal(projected.actions.answer, true);
  assert.equal(projected.actions.complete, false);
  assert.equal(projected.actions.audio, false);
  assert.equal(projected.actions.speaking, false);
  assert.deepEqual(input, before);
  assert.deepEqual(projectRuntimeFrame(input), projected);
}

{
  const projected = projectRuntimeFrame(frame({
    current: {
      itemId: 'E02',
      kind: 'LISTEN_REPEAT',
      prompt: 'Repetă.',
      answerable: false,
      requiresHumanReview: true,
      audioText: 'Mai încet, vă rog.'
    }
  }));
  assert.equal(projected.actions.answer, false);
  assert.equal(projected.actions.audio, false);
  assert.equal(projected.actions.speaking, false);
  assert.equal(projected.capabilities.audioAvailable, true);
  assert.equal(projected.capabilities.audioEnabled, false);
  assert.equal(projected.capabilities.humanReviewRequired, true);
}

{
  const projected = projectRuntimeFrame(frame({
    status: 'AWAITING_HUMAN_REVIEW',
    current: {
      itemId: 'E02',
      kind: 'LISTEN_REPEAT',
      prompt: 'Repetă.',
      answerable: false,
      requiresHumanReview: true,
      audioText: 'Mai încet, vă rog.'
    },
    speakingPending: ['E02']
  }));
  assert.equal(projected.mode, 'HUMAN_REVIEW_HOLD');
  assert.deepEqual(projected.actions, { answer: false, complete: false, audio: false, speaking: false });
}

{
  const projected = projectRuntimeFrame(frame({
    status: 'READY_TO_COMPLETE',
    progress: { completedItems: 2, totalItems: 2, ratio: 1 },
    current: null,
    canComplete: true
  }));
  assert.equal(projected.mode, 'COMPLETION');
  assert.equal(projected.actions.complete, true);
}

{
  const projected = projectRuntimeFrame(frame({
    status: 'COMPLETED',
    progress: { completedItems: 2, totalItems: 2, ratio: 1 },
    current: null,
    canComplete: false
  }));
  assert.equal(projected.mode, 'COMPLETED');
  assert.deepEqual(projected.actions, { answer: false, complete: false, audio: false, speaking: false });
}

{
  const projected = projectRuntimeFrame(frame({
    status: 'INTEGRITY_BLOCKED',
    current: null,
    replay: { code: 'REPLAY_SEQUENCE_GAP_OR_DUPLICATE', contiguousHead: 2, quarantinedCount: 1 }
  }));
  assert.equal(projected.mode, 'INTEGRITY_BLOCK');
  assert.deepEqual(projected.actions, { answer: false, complete: false, audio: false, speaking: false });
}

expectCode(() => projectRuntimeFrame(frame({ status: 'UNKNOWN' })), 'UI_PROJECTION_STATUS_UNKNOWN');
expectCode(
  () => projectRuntimeFrame(frame({ status: 'READY_TO_COMPLETE', current: null, canComplete: false })),
  'UI_PROJECTION_COMPLETION_INVARIANT_FAILED'
);
expectCode(
  () => projectRuntimeFrame(frame({ status: 'AWAITING_HUMAN_REVIEW', speakingPending: [] })),
  'UI_PROJECTION_HUMAN_REVIEW_PENDING_REQUIRED'
);

{
  const calls = [];
  const controller = {
    start: async () => { calls.push('start'); return 1; },
    refresh: async () => { calls.push('refresh'); return 2; },
    answer: async () => { calls.push('answer'); return 3; },
    complete: async () => { calls.push('complete'); return 4; }
  };
  const port = createPlayerUiSessionPort(controller);
  assert.deepEqual(Object.keys(port), ['start', 'refresh', 'answer', 'complete']);
  assert.equal(await port.start(), 1);
  assert.equal(await port.refresh(), 2);
  assert.equal(await port.answer('E01', 'A'), 3);
  assert.equal(await port.complete(), 4);
  assert.deepEqual(calls, ['start', 'refresh', 'answer', 'complete']);
}

expectCode(() => createPlayerUiSessionPort({ start(){}, refresh(){}, answer(){} }), 'UI_SESSION_PORT_INVALID');

console.log('RPM_S3_5_UI_PROJECTION_PREFLIGHT_PASS deterministic-readonly-status-map session-port audio-speaking-deferred');
