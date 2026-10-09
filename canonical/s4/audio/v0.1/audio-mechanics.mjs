import { validatePlayerUiRenderModel } from '../../../s3/lesson-player/v0.1/player-ui-render-model-invariants.mjs';

export const AUDIO_MECHANICS_VERSION = 1;
export const AUDIO_VOICE_POLICY = 'DEFERRED';

export class AudioMechanicsError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = 'AudioMechanicsError';
    this.code = code;
    this.detail = detail;
  }
}

function fail(code, detail = {}) {
  throw new AudioMechanicsError(code, detail);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function requiredString(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail('AUDIO_STRING_REQUIRED', { field });
  return value;
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(code, { actual, expected: wanted });
  }
}

export function createAudioPlaybackDescriptor(safeRenderModel) {
  validatePlayerUiRenderModel(safeRenderModel);
  const current = safeRenderModel.current;
  if (!current || typeof current.audioText !== 'string' || !current.audioText.trim()) fail('AUDIO_ITEM_NOT_AVAILABLE');
  if (safeRenderModel.capabilities.audioAvailable !== true) fail('AUDIO_CAPABILITY_NOT_AVAILABLE');
  if (!['ACTIVE', 'AWAITING_HUMAN_REVIEW'].includes(safeRenderModel.status)) {
    fail('AUDIO_STATUS_NOT_PLAYABLE', { status: safeRenderModel.status });
  }
  return deepFreeze({
    audioMechanicsVersion: AUDIO_MECHANICS_VERSION,
    lessonId: requiredString(safeRenderModel.lessonId, 'lessonId'),
    contentVersion: requiredString(safeRenderModel.contentVersion, 'contentVersion'),
    sourceLane: 'RLS-07',
    itemId: requiredString(current.itemId, 'current.itemId'),
    textRef: requiredString(current.itemId, 'current.itemId'),
    audioText: requiredString(current.audioText, 'current.audioText'),
    voicePolicy: AUDIO_VOICE_POLICY,
    finalRomanianVoice: false
  });
}

export function createAudioStartIntent(descriptor) {
  exactKeys(descriptor, ['audioMechanicsVersion','lessonId','contentVersion','sourceLane','itemId','textRef','audioText','voicePolicy','finalRomanianVoice'], 'AUDIO_DESCRIPTOR_SHAPE_INVALID');
  if (descriptor.audioMechanicsVersion !== AUDIO_MECHANICS_VERSION) fail('AUDIO_DESCRIPTOR_VERSION_UNSUPPORTED');
  if (descriptor.sourceLane !== 'RLS-07') fail('AUDIO_SOURCE_LANE_BLOCKED');
  if (descriptor.voicePolicy !== AUDIO_VOICE_POLICY || descriptor.finalRomanianVoice !== false) fail('AUDIO_FINAL_VOICE_AUTHORITY_FORBIDDEN');
  if (descriptor.textRef !== descriptor.itemId) fail('AUDIO_TEXT_REF_MISMATCH');
  return deepFreeze({
    type: 'AUDIO_STARTED',
    lessonId: descriptor.lessonId,
    contentVersion: descriptor.contentVersion,
    itemId: descriptor.itemId,
    payload: { textRef: descriptor.textRef },
    authority: { validatedTime: false, xp: false, compliance: false, certificate: false, speaking: false }
  });
}

export function bindPersistedAudioStart(descriptor, persistedEvent) {
  const intent = createAudioStartIntent(descriptor);
  if (!persistedEvent || typeof persistedEvent !== 'object') fail('AUDIO_PERSISTED_START_REQUIRED');
  const same = persistedEvent.type === 'AUDIO_STARTED'
    && persistedEvent.lessonId === intent.lessonId
    && persistedEvent.contentVersion === intent.contentVersion
    && persistedEvent.itemId === intent.itemId
    && persistedEvent.payload?.textRef === intent.payload.textRef;
  if (!same) fail('AUDIO_PERSISTED_START_MISMATCH');
  const eventId = requiredString(persistedEvent.eventId, 'persistedEvent.eventId');
  if (!Number.isInteger(persistedEvent.seq) || persistedEvent.seq < 1) fail('AUDIO_PERSISTED_START_SEQ_INVALID');
  return deepFreeze({
    leaseVersion: 1,
    audioStartEventId: eventId,
    audioStartEventSeq: persistedEvent.seq,
    lessonId: intent.lessonId,
    contentVersion: intent.contentVersion,
    itemId: intent.itemId,
    textRef: intent.payload.textRef
  });
}

export function createAudioDriverCommand(descriptor, lease) {
  const rebound = bindPersistedAudioStart(descriptor, {
    type: 'AUDIO_STARTED',
    lessonId: lease?.lessonId,
    contentVersion: lease?.contentVersion,
    itemId: lease?.itemId,
    payload: { textRef: lease?.textRef },
    eventId: lease?.audioStartEventId,
    seq: lease?.audioStartEventSeq
  });
  return deepFreeze({
    commandVersion: 1,
    action: 'PLAY',
    audioStartEventId: rebound.audioStartEventId,
    itemId: rebound.itemId,
    text: descriptor.audioText,
    voicePolicy: AUDIO_VOICE_POLICY,
    finalRomanianVoice: false
  });
}

export function createAudioEndIntent(lease) {
  if (!lease || lease.leaseVersion !== 1) fail('AUDIO_LEASE_INVALID');
  const audioStartEventId = requiredString(lease.audioStartEventId, 'lease.audioStartEventId');
  if (!Number.isInteger(lease.audioStartEventSeq) || lease.audioStartEventSeq < 1) fail('AUDIO_LEASE_SEQ_INVALID');
  return deepFreeze({
    type: 'AUDIO_ENDED',
    lessonId: requiredString(lease.lessonId, 'lease.lessonId'),
    contentVersion: requiredString(lease.contentVersion, 'lease.contentVersion'),
    itemId: requiredString(lease.itemId, 'lease.itemId'),
    payload: { audioStartEventId, audioStartEventSeq: lease.audioStartEventSeq },
    authority: { validatedTime: false, xp: false, compliance: false, certificate: false, speaking: false }
  });
}

export function createAudioDriverPort(driver) {
  if (!driver || typeof driver.play !== 'function' || typeof driver.stop !== 'function') fail('AUDIO_DRIVER_CONTRACT_INVALID');
  let activeStartEventId = null;
  return Object.freeze({
    async play(command) {
      if (!command || command.commandVersion !== 1 || command.action !== 'PLAY') fail('AUDIO_DRIVER_COMMAND_INVALID');
      requiredString(command.audioStartEventId, 'command.audioStartEventId');
      if (command.voicePolicy !== AUDIO_VOICE_POLICY || command.finalRomanianVoice !== false) fail('AUDIO_FINAL_VOICE_AUTHORITY_FORBIDDEN');
      if (activeStartEventId === command.audioStartEventId) return Object.freeze({ status: 'ALREADY_PLAYING', audioStartEventId: activeStartEventId });
      if (activeStartEventId !== null) fail('AUDIO_OVERLAP_FORBIDDEN', { activeStartEventId });
      try {
        await driver.play(command);
        activeStartEventId = command.audioStartEventId;
        return Object.freeze({ status: 'PLAYING', audioStartEventId: activeStartEventId });
      } catch (error) {
        activeStartEventId = null;
        fail('AUDIO_DRIVER_PLAY_FAILED', { cause: error?.message || String(error) });
      }
    },
    async stop(audioStartEventId) {
      requiredString(audioStartEventId, 'audioStartEventId');
      if (activeStartEventId === null) return Object.freeze({ status: 'ALREADY_STOPPED', audioStartEventId });
      if (activeStartEventId !== audioStartEventId) fail('AUDIO_STOP_LEASE_MISMATCH', { activeStartEventId, requested: audioStartEventId });
      try {
        await driver.stop(audioStartEventId);
        activeStartEventId = null;
        return Object.freeze({ status: 'STOPPED', audioStartEventId });
      } catch (error) {
        fail('AUDIO_DRIVER_STOP_FAILED', { cause: error?.message || String(error) });
      }
    },
    snapshot() {
      return Object.freeze({
        audioMechanicsVersion: AUDIO_MECHANICS_VERSION,
        activeStartEventId,
        validatedTimeAuthority: false,
        xpAuthority: false,
        complianceAuthority: false,
        speakingAuthority: false,
        finalRomanianVoice: false
      });
    }
  });
}
