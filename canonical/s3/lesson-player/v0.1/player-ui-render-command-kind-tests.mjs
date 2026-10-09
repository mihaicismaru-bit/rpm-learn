import assert from 'node:assert/strict';
import { buildPlayerUiRenderCommands } from './player-ui-render-commands.mjs';

function model(current, overrides = {}) {
  return {
    sanitizerVersion: 1,
    projectionVersion: 2,
    status: 'ACTIVE',
    mode: 'ITEM',
    lessonId: 'RLS07-UI-KINDS-01',
    contentVersion: 'rls07-ui-kinds@1.0.0',
    sourceLane: 'RLS-07',
    progress: { completedItems: 0, totalItems: 6, ratio: 0 },
    current,
    speakingPending: [],
    capabilities: {
      audioAvailable: Boolean(current?.audioText),
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

function exercise(plan) {
  const command = plan.commands.find(entry => entry.anchor === '#exerciseBody');
  assert.ok(command);
  assert.equal(command.type, 'RENDER_SAFE_ITEM');
  assert.equal(plan.commands.some(entry => ['#checkBtn','#xp','#time'].includes(entry.anchor)), false);
  return command.value;
}

const cases = [
  {
    current: {
      itemId: 'K01', kind: 'LISTEN_CHOOSE', prompt: 'Ascultă și alege.',
      answerable: true, requiresHumanReview: false,
      choices: ['A','B'], audioText: 'Bună ziua.'
    },
    expectedKeys: ['answerable','audioText','choices','itemId','kind','prompt','requiresHumanReview']
  },
  {
    current: {
      itemId: 'K02', kind: 'SCENARIO_CHOOSE', prompt: 'Alege situația.',
      answerable: true, requiresHumanReview: false, choices: ['A','B']
    },
    expectedKeys: ['answerable','choices','itemId','kind','prompt','requiresHumanReview']
  },
  {
    current: {
      itemId: 'K03', kind: 'READ_CHOOSE', prompt: 'Citește și alege.',
      answerable: true, requiresHumanReview: false, choices: ['A','B']
    },
    expectedKeys: ['answerable','choices','itemId','kind','prompt','requiresHumanReview']
  },
  {
    current: {
      itemId: 'K04', kind: 'ORDER_WORDS', prompt: 'Pune în ordine.',
      answerable: true, requiresHumanReview: false, tokens: ['Bună','ziua']
    },
    expectedKeys: ['answerable','itemId','kind','prompt','requiresHumanReview','tokens']
  },
  {
    current: {
      itemId: 'K05', kind: 'CHECKPOINT', prompt: 'Verificare.',
      answerable: true, requiresHumanReview: false,
      scenarios: [{ text: 'La recepție', choices: ['A','B'] }]
    },
    expectedKeys: ['answerable','itemId','kind','prompt','requiresHumanReview','scenarios']
  }
];

for (const entry of cases) {
  const plan = buildPlayerUiRenderCommands(model(entry.current));
  assert.deepEqual(plan.interaction, { kind: 'ANSWER', enabled: true, readOnly: false });
  const payload = exercise(plan);
  assert.deepEqual(Object.keys(payload).sort(), [...entry.expectedKeys].sort());
  assert.equal(Object.isFrozen(payload), true);
}

{
  const current = {
    itemId: 'K06', kind: 'LISTEN_REPEAT', prompt: 'Repetă.',
    answerable: false, requiresHumanReview: true, audioText: 'Mulțumesc.'
  };
  const hold = model(current, {
    status: 'AWAITING_HUMAN_REVIEW',
    mode: 'HUMAN_REVIEW_HOLD',
    speakingPending: ['K06'],
    capabilities: {
      audioAvailable: true,
      audioEnabled: false,
      speakingEnabled: false,
      humanReviewRequired: true
    },
    actions: { answer: false, complete: false, audio: false, speaking: false },
    message: 'În așteptarea validării umane.'
  });
  const plan = buildPlayerUiRenderCommands(hold);
  assert.deepEqual(plan.interaction, { kind: 'NONE', enabled: false, readOnly: true });
  assert.deepEqual(Object.keys(exercise(plan)).sort(),
    ['answerable','audioText','itemId','kind','prompt','requiresHumanReview'].sort());
}

console.log('RPM_S3_5_RENDER_COMMAND_KIND_MATRIX_PASS all-safe-item-kinds protected-anchors human-review-readonly audio-speaking-deferred');
