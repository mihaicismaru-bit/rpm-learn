import assert from 'node:assert/strict';
import {
  AUDIO_MECHANICS_VERSION,
  AudioMechanicsError,
  bindPersistedAudioStart,
  createAudioDriverCommand,
  createAudioDriverPort,
  createAudioEndIntent,
  createAudioPlaybackDescriptor,
  createAudioStartIntent
} from './audio-mechanics.mjs';

function activeAudioModel() {
  return {
    sanitizerVersion: 1,
    projectionVersion: 2,
    status: 'ACTIVE',
    mode: 'ITEM',
    lessonId: 'RLS07-AUDIO-01',
    contentVersion: 'rls07-audio@1.0.0',
    sourceLane: 'RLS-07',
    progress: { completedItems: 0, totalItems: 2, ratio: 0 },
    current: {
      itemId: 'E01',
      kind: 'LISTEN_CHOOSE',
      prompt: 'Ascultă.',
      answerable: true,
      requiresHumanReview: false,
      choices: ['A','B'],
      audioText: 'Mai încet, vă rog.'
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

function humanReviewAudioModel() {
  const model = activeAudioModel();
  model.status = 'AWAITING_HUMAN_REVIEW';
  model.mode = 'HUMAN_REVIEW_HOLD';
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

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof AudioMechanicsError && error.code === code, code);
}

const descriptor = createAudioPlaybackDescriptor(activeAudioModel());
assert.equal(descriptor.audioMechanicsVersion, AUDIO_MECHANICS_VERSION);
assert.equal(descriptor.sourceLane, 'RLS-07');
assert.equal(descriptor.textRef, 'E01');
assert.equal(descriptor.voicePolicy, 'DEFERRED');
assert.equal(descriptor.finalRomanianVoice, false);
assert.equal(Object.isFrozen(descriptor), true);

const holdDescriptor = createAudioPlaybackDescriptor(humanReviewAudioModel());
assert.equal(holdDescriptor.itemId, 'E02');
assert.equal(holdDescriptor.audioText, 'Bună ziua.');

{
  const model = activeAudioModel();
  delete model.current.audioText;
  model.current.kind = 'READ_CHOOSE';
  model.capabilities.audioAvailable = false;
  expectCode(() => createAudioPlaybackDescriptor(model), 'AUDIO_ITEM_NOT_AVAILABLE');
}
{
  const model = activeAudioModel();
  model.sourceLane = 'RLS-08';
  assert.throws(() => createAudioPlaybackDescriptor(model), error => error?.code === 'UI_MODEL_SOURCE_LANE_BLOCKED');
}
{
  const model = activeAudioModel();
  model.current.internalScore = 99;
  assert.throws(() => createAudioPlaybackDescriptor(model), error => error?.code === 'UI_MODEL_CURRENT_SHAPE_INVALID');
}

const startIntent = createAudioStartIntent(descriptor);
assert.deepEqual(startIntent.payload, { textRef: 'E01' });
assert.deepEqual(startIntent.authority, {
  validatedTime: false,
  xp: false,
  compliance: false,
  certificate: false,
  speaking: false
});

const persistedStart = {
  type: 'AUDIO_STARTED',
  lessonId: descriptor.lessonId,
  contentVersion: descriptor.contentVersion,
  itemId: descriptor.itemId,
  payload: { textRef: descriptor.textRef },
  eventId: 'audio-start-1',
  seq: 7
};
const lease = bindPersistedAudioStart(descriptor, persistedStart);
assert.deepEqual(lease, {
  leaseVersion: 1,
  audioStartEventId: 'audio-start-1',
  audioStartEventSeq: 7,
  lessonId: descriptor.lessonId,
  contentVersion: descriptor.contentVersion,
  itemId: descriptor.itemId,
  textRef: descriptor.textRef
});
expectCode(
  () => bindPersistedAudioStart(descriptor, { ...persistedStart, itemId: 'E99' }),
  'AUDIO_PERSISTED_START_MISMATCH'
);
expectCode(
  () => bindPersistedAudioStart(descriptor, { ...persistedStart, seq: 0 }),
  'AUDIO_PERSISTED_START_SEQ_INVALID'
);

const command = createAudioDriverCommand(descriptor, lease);
assert.deepEqual(command, {
  commandVersion: 1,
  action: 'PLAY',
  audioStartEventId: 'audio-start-1',
  itemId: 'E01',
  text: 'Mai încet, vă rog.',
  voicePolicy: 'DEFERRED',
  finalRomanianVoice: false
});
for (const key of ['durationMs','validatedTime','xp','complianceEvidence','certificate','speaking']) {
  assert.equal(key in command, false, key);
}

const endIntent = createAudioEndIntent(lease);
assert.deepEqual(endIntent.payload, { audioStartEventId: 'audio-start-1', audioStartEventSeq: 7 });
assert.equal(endIntent.authority.validatedTime, false);
assert.equal(endIntent.authority.xp, false);
assert.equal(endIntent.authority.compliance, false);
assert.equal(endIntent.authority.speaking, false);

{
  const calls = [];
  const port = createAudioDriverPort({
    async play(value) { calls.push(['play', value.audioStartEventId]); },
    async stop(value) { calls.push(['stop', value]); }
  });
  assert.deepEqual(await port.play(command), { status: 'PLAYING', audioStartEventId: 'audio-start-1' });
  assert.deepEqual(await port.play(command), { status: 'ALREADY_PLAYING', audioStartEventId: 'audio-start-1' });
  assert.deepEqual(calls, [['play','audio-start-1']]);
  assert.equal(port.snapshot().validatedTimeAuthority, false);
  assert.equal(port.snapshot().speakingAuthority, false);
  await assert.rejects(
    port.stop('wrong-start'),
    error => error instanceof AudioMechanicsError && error.code === 'AUDIO_STOP_LEASE_MISMATCH'
  );
  assert.deepEqual(await port.stop('audio-start-1'), { status: 'STOPPED', audioStartEventId: 'audio-start-1' });
  assert.deepEqual(await port.stop('audio-start-1'), { status: 'ALREADY_STOPPED', audioStartEventId: 'audio-start-1' });
  assert.deepEqual(calls, [['play','audio-start-1'],['stop','audio-start-1']]);
}

{
  let attempts = 0;
  const port = createAudioDriverPort({
    async play() {
      attempts += 1;
      if (attempts === 1) throw new Error('temporary');
    },
    async stop() {}
  });
  await assert.rejects(
    port.play(command),
    error => error instanceof AudioMechanicsError && error.code === 'AUDIO_DRIVER_PLAY_FAILED'
  );
  assert.equal(port.snapshot().activeStartEventId, null);
  assert.deepEqual(await port.play(command), { status: 'PLAYING', audioStartEventId: 'audio-start-1' });
  assert.equal(attempts, 2);
}

console.log(
  'RPM_S4_1_AUDIO_MECHANICS_PASS canonical-text-ref persisted-start-provenance ' +
  'driver-idempotency overlap-stop-guard failure-retry RLS07-only no-time-xp-compliance-speaking-authority voice-deferred'
);
