import assert from 'node:assert/strict';
import { PlayerUiProjectionError } from './player-ui-projection.mjs';
import { createSafePlayerUiSessionPort } from './player-ui-render-sanitizer.mjs';

function frame(overrides = {}) {
  return {
    lessonId: 'RLS07-SAFE-PORT-01',
    contentVersion: 'rls07-safe-port@1.0.0',
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
      internalScore: 99
    },
    canComplete: false,
    speakingPending: [],
    replay: { code: 'LEARNING_REPLAY_CONTIGUOUS_AND_SEMANTIC', eventIds: ['hidden'] },
    xp: 999,
    activeMs: 999999,
    complianceEvidence: { valid: true },
    certificateEligible: true,
    ...overrides
  };
}

function assertSafe(view) {
  assert.equal(view.sourceLane, 'RLS-07');
  assert.equal(Object.isFrozen(view), true);
  for (const key of ['xp', 'activeMs', 'replay', 'complianceEvidence', 'certificateEligible']) {
    assert.equal(key in view, false, key);
  }
  if (view.current) {
    assert.equal('correctAnswer' in view.current, false);
    assert.equal('internalScore' in view.current, false);
    assert.equal(Object.isFrozen(view.current), true);
  }
  assert.equal(view.actions.audio, false);
  assert.equal(view.actions.speaking, false);
  assert.equal(view.capabilities.audioEnabled, false);
  assert.equal(view.capabilities.speakingEnabled, false);
}

{
  const calls = [];
  const controller = {
    start: async (...args) => {
      calls.push(['start', ...args]);
      return frame();
    },
    refresh: async (...args) => {
      calls.push(['refresh', ...args]);
      return frame();
    },
    answer: async (...args) => {
      calls.push(['answer', ...args]);
      return frame({
        progress: { completedItems: 1, totalItems: 2, ratio: 0.5 },
        current: {
          itemId: 'E02',
          kind: 'READ_CHOOSE',
          prompt: 'Continuă.',
          answerable: true,
          requiresHumanReview: false,
          choices: ['C', 'D'],
          correctAnswer: 'C',
          internalScore: 88
        }
      });
    },
    complete: async (...args) => {
      calls.push(['complete', ...args]);
      return frame({
        status: 'COMPLETED',
        progress: { completedItems: 2, totalItems: 2, ratio: 1 },
        current: null,
        canComplete: false
      });
    },
    internalWrite: async () => {
      throw new Error('must-not-be-exposed');
    }
  };

  const port = createSafePlayerUiSessionPort(controller);
  assert.equal(Object.isFrozen(port), true);
  assert.deepEqual(Object.keys(port), ['start', 'refresh', 'answer', 'complete']);
  assert.equal('internalWrite' in port, false);

  assertSafe(await port.start('start-token'));
  assertSafe(await port.refresh('refresh-token'));
  assertSafe(await port.answer('E01', 'B'));
  assertSafe(await port.complete('complete-token'));

  assert.deepEqual(calls, [
    ['start', 'start-token'],
    ['refresh', 'refresh-token'],
    ['answer', 'E01', 'B'],
    ['complete', 'complete-token']
  ]);
}

{
  const blockedController = {
    start: async () => frame({ sourceLane: 'CHILD-LANE' }),
    refresh: async () => frame(),
    answer: async () => frame(),
    complete: async () => frame()
  };
  const port = createSafePlayerUiSessionPort(blockedController);
  await assert.rejects(
    port.start(),
    error => error instanceof PlayerUiProjectionError && error.code === 'UI_SANITIZER_SOURCE_LANE_BLOCKED'
  );
}

{
  assert.throws(
    () => createSafePlayerUiSessionPort({
      start: async () => frame(),
      refresh: async () => frame(),
      answer: async () => frame()
    }),
    error => error instanceof PlayerUiProjectionError &&
      error.code === 'UI_SAFE_SESSION_PORT_INVALID' &&
      error.detail.missingMethod === 'complete'
  );
}

{
  const expected = new Error('controller-failure');
  const controller = {
    start: async () => frame(),
    refresh: async () => frame(),
    answer: async () => { throw expected; },
    complete: async () => frame()
  };
  const port = createSafePlayerUiSessionPort(controller);
  await assert.rejects(port.answer('E01', 'A'), error => error === expected);
}

console.log(
  'RPM_S3_5_SAFE_SESSION_PORT_PASS narrow-facade args-preserved private-fields-stripped ' +
  'RLS07-only no-compliance-certificate-authority deferred-audio-speaking fail-closed'
);
