import assert from 'node:assert/strict';
import {
  PlayerUiProjectionError,
  projectRuntimeFrame
} from './player-ui-projection.mjs';
import {
  PLAYER_UI_RENDER_SANITIZER_VERSION,
  sanitizeProjectedRenderModel,
  projectSafeRuntimeFrame,
  createSafePlayerUiSessionPort
} from './player-ui-render-sanitizer.mjs';

function activeFrame(overrides = {}) {
  return {
    lessonId: 'RLS07-UI-SAFE-01',
    contentVersion: 'rls07-ui-safe@1.0.0',
    sourceLane: 'RLS-07',
    status: 'ACTIVE',
    progress: { completedItems: 0, totalItems: 2, ratio: 0 },
    current: {
      itemId: 'E01',
      kind: 'READ_CHOOSE',
      prompt: 'Alege răspunsul corect.',
      answerable: true,
      requiresHumanReview: false,
      choices: ['A', 'B'],
      correctAnswer: 'A',
      scoringWeight: 99,
      internalExplanation: 'must not reach UI'
    },
    canComplete: false,
    speakingPending: [],
    replay: {
      code: 'LEARNING_REPLAY_CONTIGUOUS_AND_SEMANTIC',
      contiguousHead: 3,
      quarantinedCount: 0,
      internalEventIds: ['private-event-1']
    },
    scoreAuthority: { rawScore: 1 },
    eventStore: { internal: true },
    provenanceInternal: { artifactRevision: 'private' },
    ...overrides
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof PlayerUiProjectionError && error.code === code);
}

{
  const raw = activeFrame();
  const safe = projectSafeRuntimeFrame(raw);
  assert.equal(safe.sanitizerVersion, PLAYER_UI_RENDER_SANITIZER_VERSION);
  assert.deepEqual(
    Object.keys(safe).sort(),
    [
      'actions','capabilities','contentVersion','current','integrity','lessonId',
      'message','mode','progress','projectionVersion','sanitizerVersion',
      'sourceLane','speakingPending','status'
    ].sort()
  );
  assert.equal('scoreAuthority' in safe, false);
  assert.equal('eventStore' in safe, false);
  assert.equal('provenanceInternal' in safe, false);
  assert.equal('correctAnswer' in safe.current, false);
  assert.equal('scoringWeight' in safe.current, false);
  assert.equal('internalExplanation' in safe.current, false);
  assert.equal('replay' in safe, false);
  assert.deepEqual(safe.integrity, { blocked: false, code: 'OK' });
  assert.deepEqual(safe.actions, { answer: true, complete: false, audio: false, speaking: false });
  assert.equal(safe.capabilities.audioEnabled, false);
  assert.equal(safe.capabilities.speakingEnabled, false);
  assert.ok(Object.isFrozen(safe));
  assert.ok(Object.isFrozen(safe.current));
  assert.ok(Object.isFrozen(safe.progress));
}

{
  const orderFrame = activeFrame({
    current: {
      itemId: 'E-ORDER',
      kind: 'ORDER_WORDS',
      prompt: 'Pune cuvintele în ordine.',
      answerable: true,
      requiresHumanReview: false,
      tokens: ['eu', 'merg', 'acasă'],
      correctOrder: ['eu', 'merg', 'acasă']
    }
  });
  const a = projectSafeRuntimeFrame(orderFrame);
  const b = projectSafeRuntimeFrame(structuredClone(orderFrame));
  assert.deepEqual(a.current.tokens, b.current.tokens);
  assert.deepEqual([...a.current.tokens].sort(), ['acasă', 'eu', 'merg'].sort());
  assert.notDeepEqual(a.current.tokens, orderFrame.current.tokens);
  assert.equal('correctOrder' in a.current, false);
}

{
  const projected = projectRuntimeFrame(activeFrame({
    status: 'INTEGRITY_BLOCKED',
    current: null,
    replay: {
      code: 'REPLAY_SEQUENCE_GAP_OR_DUPLICATE',
      contiguousHead: 2,
      quarantinedCount: 1,
      privateEvidence: ['must-not-leak']
    }
  }));
  const safe = sanitizeProjectedRenderModel(projected, {
    ...activeFrame(),
    status: 'INTEGRITY_BLOCKED',
    current: null,
    replay: projected.replay
  });
  assert.deepEqual(safe.integrity, { blocked: true, code: 'REPLAY_SEQUENCE_GAP_OR_DUPLICATE' });
  assert.equal('replay' in safe, false);
}

{
  const projected = projectRuntimeFrame(activeFrame({
    status: 'INTEGRITY_BLOCKED',
    current: null,
    replay: { code: 'unsafe lowercase detail', privateEvidence: ['must-not-leak'] }
  }));
  const frame = {
    ...activeFrame(),
    status: 'INTEGRITY_BLOCKED',
    current: null,
    replay: projected.replay
  };
  const safe = sanitizeProjectedRenderModel(projected, frame);
  assert.deepEqual(safe.integrity, { blocked: true, code: 'INTEGRITY_BLOCKED' });
}

expectCode(
  () => projectSafeRuntimeFrame(activeFrame({ sourceLane: 'CHILD-LANE' })),
  'UI_SANITIZER_SOURCE_LANE_BLOCKED'
);

{
  const projected = projectRuntimeFrame(activeFrame());
  expectCode(
    () => sanitizeProjectedRenderModel(projected, activeFrame({ lessonId: 'RLS07-OTHER' })),
    'UI_SANITIZER_FRAME_BINDING_MISMATCH'
  );
}

{
  const calls = [];
  const controller = {
    start: async () => { calls.push('start'); return activeFrame(); },
    refresh: async () => { calls.push('refresh'); return activeFrame(); },
    answer: async () => {
      calls.push('answer');
      return activeFrame({
        progress: { completedItems: 1, totalItems: 2, ratio: 0.5 },
        current: {
          itemId: 'E02',
          kind: 'LISTEN_CHOOSE',
          prompt: 'Ascultă și alege.',
          answerable: true,
          requiresHumanReview: false,
          choices: ['Da', 'Nu'],
          audioText: 'Bună ziua.',
          correctAnswer: 'Da',
          internalScore: 100
        }
      });
    },
    complete: async () => {
      calls.push('complete');
      return {
        ...activeFrame(),
        status: 'COMPLETED',
        progress: { completedItems: 2, totalItems: 2, ratio: 1 },
        current: null,
        canComplete: false
      };
    },
    internalWrite: async () => { throw new Error('must not leak'); }
  };
  const port = createSafePlayerUiSessionPort(controller);
  assert.deepEqual(Object.keys(port), ['start', 'refresh', 'answer', 'complete']);
  assert.equal('internalWrite' in port, false);
  assert.ok(Object.isFrozen(port));

  const started = await port.start();
  const refreshed = await port.refresh();
  const answered = await port.answer('E01', 'A');
  const completed = await port.complete();

  for (const safe of [started, refreshed, answered, completed]) {
    assert.equal('scoreAuthority' in safe, false);
    assert.equal('eventStore' in safe, false);
    assert.equal('replay' in safe, false);
    assert.equal(safe.actions.audio, false);
    assert.equal(safe.actions.speaking, false);
  }
  assert.equal(answered.capabilities.audioAvailable, true);
  assert.equal(answered.capabilities.audioEnabled, false);
  assert.equal('correctAnswer' in answered.current, false);
  assert.equal('internalScore' in answered.current, false);
  assert.equal(completed.status, 'COMPLETED');
  assert.deepEqual(calls, ['start', 'refresh', 'answer', 'complete']);
}

expectCode(
  () => createSafePlayerUiSessionPort({ start(){}, refresh(){}, answer(){} }),
  'UI_SAFE_SESSION_PORT_INVALID'
);

console.log('RPM_S3_5_UI_RENDER_SANITIZER_EXECUTABLE_PASS whitelist-only private-runtime-fields-stripped deterministic-order-words bounded-integrity RLS07-only safe-session-port audio-speaking-deferred');
