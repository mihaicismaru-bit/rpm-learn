import assert from 'node:assert/strict';
import { buildPlayerUiRenderCommands } from './player-ui-render-commands.mjs';

function safeModel() {
  return {
    sanitizerVersion: 1,
    projectionVersion: 2,
    status: 'ACTIVE',
    mode: 'ITEM',
    lessonId: 'RLS07-UI-DETERMINISM-01',
    contentVersion: 'rls07-ui-determinism@1.0.0',
    sourceLane: 'RLS-07',
    progress: { completedItems: 1, totalItems: 3, ratio: 1 / 3 },
    current: {
      itemId: 'E02',
      kind: 'READ_CHOOSE',
      prompt: 'Alege.',
      answerable: true,
      requiresHumanReview: false,
      choices: ['Da', 'Nu']
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
    integrity: { blocked: false, code: 'OK' }
  };
}

{
  const a = safeModel();
  const b = structuredClone(a);
  const planA = buildPlayerUiRenderCommands(a);
  const planB = buildPlayerUiRenderCommands(b);

  assert.deepEqual(planA, planB);
  assert.equal(Object.isFrozen(planA), true);
  assert.equal(Object.isFrozen(planA.commands), true);
  assert.equal(Object.isFrozen(planA.interaction), true);

  const exercise = planA.commands.find(command => command.anchor === '#exerciseBody');
  assert.ok(exercise);
  assert.equal(Object.isFrozen(exercise.value), true);
  assert.equal(Object.isFrozen(exercise.value.choices), true);

  a.current.choices[0] = 'MUTATED';
  a.current.prompt = 'MUTATED';
  a.progress.completedItems = 2;

  assert.deepEqual(planA, planB);
  assert.deepEqual(exercise.value.choices, ['Da', 'Nu']);
  assert.equal(exercise.value.prompt, 'Alege.');
  assert.equal(planA.commands.find(command => command.anchor === '#progress').value, '1/3');
}

{
  const once = buildPlayerUiRenderCommands(safeModel());
  const twice = buildPlayerUiRenderCommands(structuredClone(safeModel()));
  assert.deepEqual(
    JSON.stringify(once),
    JSON.stringify(twice)
  );
}

{
  const plan = buildPlayerUiRenderCommands(safeModel());
  const anchors = plan.commands.map(command => command.anchor);
  assert.equal(new Set(anchors).size, anchors.length);
  assert.equal(anchors.some(anchor => ['#checkBtn','#xp','#time'].includes(anchor)), false);
  assert.deepEqual(plan.interaction, { kind: 'ANSWER', enabled: true, readOnly: false });
  assert.equal(plan.deferred.audio, 'S4.1');
  assert.equal(plan.deferred.speaking, 'S4.2');
  assert.equal(plan.deferred.humanReview, 'S4.3');
}

console.log('RPM_S3_5_RENDER_COMMAND_DETERMINISM_PASS replay-stable deep-frozen clone-safe protected-anchors deferred-authority');
