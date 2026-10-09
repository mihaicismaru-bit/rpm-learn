export const EVENT_VERSION = 2;
export const IDLE_CAP_MS = 45_000;
export const EVENT_POLICY_VERSION = 4;
export const EVENT_SEQUENCE_POLICY_VERSION = 3;
export const EVENT_SCOPE_POLICY_VERSION = 1;
export const EVENT_SEMANTIC_POLICY_VERSION = 4;
export const LESSON_CONTENT_POLICY_VERSION = 1;
export const LEARNING_EVENT_ROLE = 'LEARNER';

export const EventType = Object.freeze({
  SESSION_STARTED: 'SESSION_STARTED',
  ITEM_PRESENTED: 'ITEM_PRESENTED',
  ITEM_ANSWERED: 'ITEM_ANSWERED',
  AUDIO_STARTED: 'AUDIO_STARTED',
  AUDIO_ENDED: 'AUDIO_ENDED',
  SPEAKING_SUBMITTED: 'SPEAKING_SUBMITTED',
  TIME_SLICE: 'TIME_SLICE',
  MASTERY_APPLIED: 'MASTERY_APPLIED',
  LESSON_COMPLETED: 'LESSON_COMPLETED'
});

const KNOWN_EVENT_TYPES = new Set(Object.values(EventType));

export function monotonicNow() {
  if (globalThis.performance?.now) return performance.now();
  return Date.now();
}

export function makeTimeSlicePayload({ previousMono, currentMono, previousWall, currentWall, foreground = true, basis = 'meaningful_interaction', sourceEventType = null, sourceEventId = null, sourceEventSeq = null } = {}) {
  const audioPlaying = basis === 'audio_playback';
  const meaningfulChange = basis === 'meaningful_interaction';
  const rawDurationMs = Number(currentMono) - Number(previousMono);
  const idleGapSuppressed = meaningfulChange && !audioPlaying && Number.isFinite(rawDurationMs) && rawDurationMs > IDLE_CAP_MS;
  const durationMs = eligibleSliceMs(previousMono, currentMono, { foreground, meaningfulChange, audioPlaying });
  return {
    policyVersion: EVENT_POLICY_VERSION,
    durationMs,
    rawDurationMs,
    idleGapSuppressed,
    eligible: durationMs > 0,
    basis,
    sourceEventType,
    sourceEventId,
    sourceEventSeq,
    clockBasis: 'performance.now',
    wallClockRollbackDetected: Number(currentWall) < Number(previousWall),
    fromWallTs: Number(previousWall),
    toWallTs: Number(currentWall)
  };
}

export function validateEventPolicy(event) {
  if (!event || event.schemaVersion !== EVENT_VERSION) return { valid: false, code: 'UNSUPPORTED_EVENT_SCHEMA' };
  if (!event.eventId || !event.sessionId || !event.subjectId || !event.organisationId || !event.lessonId || !event.contentVersion || !Number.isInteger(event.seq) || event.seq < 1) {
    return { valid: false, code: 'INVALID_EVENT_IDENTITY' };
  }
  if (event.role !== LEARNING_EVENT_ROLE) return { valid: false, code: 'LEARNING_EVENT_ROLE_FORBIDDEN', expectedRole: LEARNING_EVENT_ROLE, observedRole: event.role ?? null, scopePolicyVersion: EVENT_SCOPE_POLICY_VERSION };
  if (!Number.isInteger(event.ts) || event.ts < 0) return { valid: false, code: 'INVALID_EVENT_TIMESTAMP' };
  if (!KNOWN_EVENT_TYPES.has(event.type)) return { valid: false, code: 'UNKNOWN_EVENT_TYPE' };
  if (event.type === EventType.TIME_SLICE) {
    const p = event.payload || {};
    const d = Number(p.durationMs);
    if (p.policyVersion !== EVENT_POLICY_VERSION) return { valid: false, code: 'TIME_SLICE_POLICY_VERSION_MISMATCH', expected: EVENT_POLICY_VERSION };
    if (typeof p.eligible !== 'boolean') return { valid: false, code: 'TIME_SLICE_ELIGIBILITY_REQUIRED' };
    if (!Number.isFinite(d) || d < 0 || d > IDLE_CAP_MS) return { valid: false, code: 'TIME_SLICE_DURATION_OUT_OF_RANGE', maxMs: IDLE_CAP_MS };
    if ((p.eligible === true) !== (d > 0)) return { valid: false, code: 'TIME_SLICE_ELIGIBILITY_DURATION_MISMATCH' };
    if (!['meaningful_interaction','audio_playback'].includes(p.basis)) return { valid: false, code: 'TIME_SLICE_BASIS_INVALID' };
    const raw = Number(p.rawDurationMs);
    if (!Number.isFinite(raw) || raw < 0) return { valid: false, code: 'TIME_SLICE_RAW_DURATION_INVALID' };
    if (typeof p.idleGapSuppressed !== 'boolean') return { valid: false, code: 'TIME_SLICE_IDLE_GAP_MARKER_INVALID' };
    if (p.basis === 'meaningful_interaction') {
      if (raw > IDLE_CAP_MS) return { valid: false, code: 'TIME_SLICE_IDLE_RETROCREDIT_FORBIDDEN', rawDurationMs: raw, maxGapMs: IDLE_CAP_MS };
      if (p.idleGapSuppressed !== false || d !== raw) return { valid: false, code: 'TIME_SLICE_DURATION_DERIVATION_MISMATCH', expectedDurationMs: raw };
    } else {
      const expectedAudio = Math.min(raw, IDLE_CAP_MS);
      if (p.idleGapSuppressed !== false || d !== expectedAudio) return { valid: false, code: 'TIME_SLICE_DURATION_DERIVATION_MISMATCH', expectedDurationMs: expectedAudio };
    }
    if (p.clockBasis !== 'performance.now') return { valid: false, code: 'TIME_SLICE_CLOCK_BASIS_INVALID' };
    if (typeof p.wallClockRollbackDetected !== 'boolean' || !Number.isFinite(Number(p.fromWallTs)) || !Number.isFinite(Number(p.toWallTs))) {
      return { valid: false, code: 'TIME_SLICE_AUDIT_METADATA_INVALID' };
    }
    const allowedSources = p.basis === 'audio_playback'
      ? [EventType.AUDIO_ENDED]
      : [EventType.ITEM_ANSWERED, EventType.SPEAKING_SUBMITTED];
    if (!allowedSources.includes(p.sourceEventType)) {
      return { valid: false, code: 'TIME_SLICE_SOURCE_EVENT_INVALID', basis: p.basis, sourceEventType: p.sourceEventType || null };
    }
    if (typeof p.sourceEventId !== 'string' || !p.sourceEventId.trim()) {
      return { valid: false, code: 'TIME_SLICE_SOURCE_EVENT_ID_REQUIRED' };
    }
    if (!Number.isInteger(p.sourceEventSeq) || p.sourceEventSeq < 1 || p.sourceEventSeq >= event.seq) {
      return { valid: false, code: 'TIME_SLICE_SOURCE_EVENT_SEQ_INVALID', sourceEventSeq: p.sourceEventSeq ?? null, timeSliceSeq: event.seq };
    }
  }
  if (event.type === EventType.SPEAKING_SUBMITTED && event.payload?.teacherReviewRequired !== true) {
    return { valid: false, code: 'SPEAKING_REVIEW_GATE_REQUIRED' };
  }
  if (event.type === EventType.MASTERY_APPLIED) {
    return { valid: false, code: 'LEARNER_DIRECT_MASTERY_MUTATION_FORBIDDEN', semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
  }
  return { valid: true, code: 'EVENT_POLICY_PASS', policyVersion: EVENT_POLICY_VERSION };
}

export function validateTimeSliceProvenance(event, sourceEvent) {
  const eventPolicy = validateEventPolicy(event);
  if (!eventPolicy.valid) return eventPolicy;
  if (event.type !== EventType.TIME_SLICE) return { valid: false, code: 'TIME_SLICE_EVENT_REQUIRED' };
  const p = event.payload || {};
  if (!sourceEvent) return { valid: false, code: 'TIME_SLICE_SOURCE_EVENT_NOT_FOUND', sourceEventId: p.sourceEventId || null };
  const sourcePolicy = validateEventPolicy(sourceEvent);
  if (!sourcePolicy.valid) return { valid: false, code: 'TIME_SLICE_SOURCE_EVENT_POLICY_INVALID', sourceEventId: p.sourceEventId, sourcePolicyCode: sourcePolicy.code };
  const sourceMatches = sourceEvent.eventId === p.sourceEventId
    && sourceEvent.organisationId === event.organisationId
    && sourceEvent.subjectId === event.subjectId
    && sourceEvent.role === event.role
    && sourceEvent.sessionId === event.sessionId
    && sourceEvent.lessonId === event.lessonId
    && sourceEvent.contentVersion === event.contentVersion
    && sourceEvent.itemId === event.itemId
    && sourceEvent.type === p.sourceEventType
    && sourceEvent.seq === p.sourceEventSeq
    && sourceEvent.seq < event.seq;
  if (!sourceMatches) return {
    valid: false,
    code: 'TIME_SLICE_SOURCE_EVENT_MISMATCH',
    sourceEventId: p.sourceEventId,
    expectedType: p.sourceEventType,
    expectedSeq: p.sourceEventSeq,
    observedType: sourceEvent.type,
    observedSeq: sourceEvent.seq
  };
  return { valid: true, code: 'TIME_SLICE_PROVENANCE_PASS', sourceEventId: p.sourceEventId };
}

export function validateSequenceContinuity(event, predecessor = null) {
  const identityValid = event
    && event.schemaVersion === EVENT_VERSION
    && event.eventId
    && event.sessionId
    && event.subjectId
    && event.organisationId
    && event.role === LEARNING_EVENT_ROLE
    && event.lessonId
    && event.contentVersion
    && Number.isInteger(event.seq)
    && event.seq >= 1;
  if (!identityValid) return { valid: false, code: 'INVALID_EVENT_IDENTITY' };
  if (event.seq === 1) {
    if (predecessor) return { valid: false, code: 'EVENT_SEQUENCE_ROOT_PREDECESSOR_FORBIDDEN' };
    return { valid: true, code: 'EVENT_SEQUENCE_ROOT_PASS', policyVersion: EVENT_SEQUENCE_POLICY_VERSION };
  }
  if (!predecessor) {
    return { valid: false, code: 'EVENT_SEQUENCE_PREDECESSOR_MISSING', expectedSeq: event.seq - 1, observedSeq: null };
  }
  const sameChain = predecessor.organisationId === event.organisationId
    && predecessor.subjectId === event.subjectId
    && predecessor.role === event.role
    && predecessor.lessonId === event.lessonId
    && predecessor.contentVersion === event.contentVersion
    && predecessor.seq === event.seq - 1;
  if (!sameChain) {
    return {
      valid: false,
      code: 'EVENT_SEQUENCE_PREDECESSOR_MISMATCH',
      expectedSeq: event.seq - 1,
      observedSeq: predecessor?.seq ?? null,
      predecessorEventId: predecessor?.eventId || null
    };
  }
  return {
    valid: true,
    code: 'EVENT_SEQUENCE_CONTINUITY_PASS',
    policyVersion: EVENT_SEQUENCE_POLICY_VERSION,
    predecessorEventId: predecessor.eventId
  };
}

export function analyseReplaySequence(lesson, events) {
  const ordered = [...events]
    .filter(ev => ev?.lessonId === lesson.lessonId && ev?.contentVersion === lesson.contentVersion)
    .sort((a, b) => a.seq - b.seq || a.ts - b.ts || String(a.eventId).localeCompare(String(b.eventId)));
  const accepted = [];
  let expectedSeq = 1;
  let breakInfo = null;
  for (const ev of ordered) {
    const policy = validateEventPolicy(ev);
    if (!policy.valid) {
      breakInfo = { ...policy, eventId: ev?.eventId || null };
      break;
    }
    if (ev.seq !== expectedSeq) {
      breakInfo = { code: 'REPLAY_SEQUENCE_GAP_OR_DUPLICATE', expectedSeq, observedSeq: ev.seq, eventId: ev.eventId || null };
      break;
    }
    const predecessor = accepted.length ? accepted[accepted.length - 1] : null;
    const continuity = validateSequenceContinuity(ev, predecessor);
    if (!continuity.valid) {
      breakInfo = { ...continuity, eventId: ev.eventId || null };
      break;
    }
    accepted.push(ev);
    expectedSeq += 1;
  }
  const quarantined = ordered.slice(accepted.length);
  return {
    valid: breakInfo === null,
    code: breakInfo?.code || 'REPLAY_SEQUENCE_CONTIGUOUS',
    events: accepted,
    contiguousHead: accepted.length ? accepted[accepted.length - 1].seq : 0,
    maxObservedSeq: ordered.reduce((m, ev) => Math.max(m, Number.isInteger(ev?.seq) ? ev.seq : 0), 0),
    quarantinedCount: quarantined.length,
    quarantinedEventIds: quarantined.map(ev => ev?.eventId || null),
    breakInfo
  };
}


export function nextSequenceCandidate(lastCommittedSeq = 0) {
  if (!Number.isInteger(lastCommittedSeq) || lastCommittedSeq < 0) {
    throw Object.assign(new Error('Invalid committed sequence cursor.'), { code: 'SEQUENCE_CURSOR_INVALID' });
  }
  return lastCommittedSeq + 1;
}

export function commitPersistedSequence(lastCommittedSeq, persistedSeq) {
  const expected = nextSequenceCandidate(lastCommittedSeq);
  if (!Number.isInteger(persistedSeq) || persistedSeq !== expected) {
    throw Object.assign(new Error('Persisted sequence does not match the next committed sequence.'), {
      code: 'SEQUENCE_COMMIT_MISMATCH', expectedSeq: expected, persistedSeq
    });
  }
  return persistedSeq;
}

export function newId(prefix = 'ev') {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function makeEvent({ type, lessonId, contentVersion, seq, itemId = null, payload = {}, ts = Date.now(), sessionId, eventId = null, subjectId, organisationId, role = null }) {
  return {
    schemaVersion: EVENT_VERSION,
    eventId: eventId || newId(),
    sessionId,
    subjectId,
    organisationId,
    role,
    seq,
    type,
    lessonId,
    contentVersion,
    itemId,
    ts,
    payload
  };
}

function sortForCanonical(value) {
  if (Array.isArray(value)) return value.map(sortForCanonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(k => [k, sortForCanonical(value[k])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortForCanonical(value));
}

export function classifyAppend(event, { byEventId = null, byScopeLessonVersionSeq = null, byScopeSessionSeq = null } = {}) {
  if (!event?.eventId || !event?.lessonId || !event?.contentVersion || !event?.sessionId || !event?.subjectId || !event?.organisationId || event?.role !== LEARNING_EVENT_ROLE || !Number.isInteger(event?.seq)) {
    return { action: 'conflict', code: 'INVALID_EVENT_IDENTITY' };
  }
  if (byEventId) {
    if (canonicalJson(byEventId) === canonicalJson(event)) return { action: 'duplicate', code: 'IDEMPOTENT_REPLAY' };
    return { action: 'conflict', code: 'EVENT_ID_REUSE_MISMATCH' };
  }
  if (byScopeLessonVersionSeq && byScopeLessonVersionSeq.eventId !== event.eventId) {
    return { action: 'conflict', code: 'SCOPE_LESSON_VERSION_SEQ_COLLISION', existingEventId: byScopeLessonVersionSeq.eventId };
  }
  if (byScopeSessionSeq && byScopeSessionSeq.eventId !== event.eventId) {
    return { action: 'conflict', code: 'SCOPE_SESSION_SEQ_COLLISION', existingEventId: byScopeSessionSeq.eventId };
  }
  return { action: 'append', code: 'NEW_EVENT' };
}


export const ADULT_SOURCE_LANES = Object.freeze({
  'RLS-07': Object.freeze({ audience: '16+', level: 'preA1', lessonPrefix: 'RLS07-' }),
  'RLS-08': Object.freeze({ audience: '16+', level: 'A1', lessonPrefix: 'RLS08-' }),
  'RLS-09': Object.freeze({ audience: '16+', level: 'A2', lessonPrefix: 'RLS09-' })
});

const LESSON_ITEM_TYPES = new Set(['listen_choose','scenario_choose','order_words','listen_repeat','read_choose','checkpoint']);

function nonEmptyString(v) { return typeof v === 'string' && v.trim().length > 0; }
function uniqueStrings(xs) { return Array.isArray(xs) && xs.length > 0 && xs.every(nonEmptyString) && new Set(xs).size === xs.length; }

export function validateLessonContentContract(lesson) {
  const fail = (code, detail = {}) => ({ valid: false, code, policyVersion: LESSON_CONTENT_POLICY_VERSION, ...detail });
  if (!lesson || typeof lesson !== 'object') return fail('LESSON_OBJECT_REQUIRED');
  for (const key of ['lessonId','contentVersion','title','outcome']) {
    if (!nonEmptyString(lesson[key])) return fail('LESSON_FIELD_REQUIRED', { field: key });
  }
  const source = lesson.source;
  if (!source || typeof source !== 'object') return fail('LESSON_SOURCE_REQUIRED');
  const laneRule = ADULT_SOURCE_LANES[source.lane];
  if (!laneRule) return fail('LESSON_SOURCE_LANE_NOT_AUTHORIZED_ADULT', { observedLane: source.lane ?? null, allowedLanes: Object.keys(ADULT_SOURCE_LANES) });
  if (source.audience !== laneRule.audience) return fail('LESSON_SOURCE_AUDIENCE_MISMATCH', { lane: source.lane, expectedAudience: laneRule.audience, observedAudience: source.audience ?? null });
  if (source.level !== laneRule.level) return fail('LESSON_SOURCE_LEVEL_MISMATCH', { lane: source.lane, expectedLevel: laneRule.level, observedLevel: source.level ?? null });
  if (!lesson.lessonId.startsWith(laneRule.lessonPrefix)) return fail('LESSON_SOURCE_LANE_ID_MISMATCH', { lane: source.lane, expectedPrefix: laneRule.lessonPrefix, lessonId: lesson.lessonId });
  if (!uniqueStrings(source.artifactIds)) return fail('LESSON_SOURCE_ARTIFACT_IDS_INVALID');
  if (!nonEmptyString(source.sourceObserved) || !/^\d{4}-\d{2}-\d{2}$/.test(source.sourceObserved)) return fail('LESSON_SOURCE_OBSERVED_DATE_INVALID', { observed: source.sourceObserved ?? null });
  if (!Array.isArray(lesson.items) || lesson.items.length < 1) return fail('LESSON_ITEMS_REQUIRED');

  const ids = new Set();
  for (let i=0;i<lesson.items.length;i++) {
    const item=lesson.items[i] || {};
    if (!nonEmptyString(item.id)) return fail('LESSON_ITEM_ID_REQUIRED', { itemIndex:i });
    if (ids.has(item.id)) return fail('LESSON_ITEM_ID_DUPLICATE', { itemId:item.id, itemIndex:i });
    ids.add(item.id);
    if (!LESSON_ITEM_TYPES.has(item.type)) return fail('LESSON_ITEM_TYPE_INVALID', { itemId:item.id, observedType:item.type ?? null });
    if (!nonEmptyString(item.skill) || !nonEmptyString(item.prompt) || !nonEmptyString(item.evidenceClass)) return fail('LESSON_ITEM_CORE_FIELD_INVALID', { itemId:item.id });
    if (!Number.isInteger(item.difficulty) || item.difficulty < 1) return fail('LESSON_ITEM_DIFFICULTY_INVALID', { itemId:item.id, difficulty:item.difficulty ?? null });

    const isChoice = ['listen_choose','scenario_choose','read_choose'].includes(item.type);
    if (isChoice) {
      if (!uniqueStrings(item.choices)) return fail('LESSON_ITEM_CHOICES_INVALID', { itemId:item.id });
      if (!nonEmptyString(item.correctAnswer) || !item.choices.includes(item.correctAnswer)) return fail('LESSON_ITEM_CORRECT_ANSWER_INVALID', { itemId:item.id });
    }
    if (item.type === 'listen_choose' || item.type === 'listen_repeat') {
      if (!nonEmptyString(item.audioText)) return fail('LESSON_ITEM_AUDIO_TEXT_REQUIRED', { itemId:item.id });
    }
    if (item.type === 'order_words') {
      if (!uniqueStrings(item.tokens)) return fail('LESSON_ITEM_TOKENS_INVALID', { itemId:item.id });
      if (item.scoringRule?.kind !== 'all_of' || !Array.isArray(item.scoringRule.answers) || canonicalJson(item.scoringRule.answers) !== canonicalJson(item.tokens)) {
        return fail('LESSON_ITEM_ORDER_SCORING_INVALID', { itemId:item.id });
      }
    }
    if (item.type === 'checkpoint') {
      if (!Array.isArray(item.scenarios) || item.scenarios.length < 1) return fail('LESSON_CHECKPOINT_SCENARIOS_REQUIRED', { itemId:item.id });
      const answers=[];
      for (const scenario of item.scenarios) {
        if (!nonEmptyString(scenario?.text) || !uniqueStrings(scenario?.choices) || !nonEmptyString(scenario?.answer) || !scenario.choices.includes(scenario.answer)) {
          return fail('LESSON_CHECKPOINT_SCENARIO_INVALID', { itemId:item.id });
        }
        answers.push(scenario.answer);
      }
      if (item.scoringRule?.kind !== 'min_correct' || canonicalJson(item.scoringRule.answers || []) !== canonicalJson(answers) || !Number.isInteger(item.scoringRule.minCorrect) || item.scoringRule.minCorrect < 1 || item.scoringRule.minCorrect > answers.length) {
        return fail('LESSON_CHECKPOINT_SCORING_INVALID', { itemId:item.id });
      }
    }
    if (item.type === 'listen_repeat') {
      if (item.scoringRule?.kind !== 'human_review' || item.teacherReviewRequired !== true) return fail('LESSON_SPEAKING_HUMAN_GATE_REQUIRED', { itemId:item.id });
    } else {
      if (item.scoringRule?.kind === 'human_review' || item.teacherReviewRequired === true) return fail('LESSON_HUMAN_REVIEW_SCOPE_INVALID', { itemId:item.id });
    }
  }
  return { valid: true, code: 'LESSON_CONTENT_CONTRACT_PASS', policyVersion: LESSON_CONTENT_POLICY_VERSION, lane: source.lane, audience: source.audience, level: source.level, itemCount: lesson.items.length, sourceArtifactCount: source.artifactIds.length };
}

export function assertImmutableContentVersion(existing, incoming) {
  if (!existing) return true;
  if (existing.lessonId !== incoming.lessonId || existing.contentVersion !== incoming.contentVersion) {
    throw Object.assign(new Error('Content identity mismatch.'), { code: 'CONTENT_IDENTITY_MISMATCH' });
  }
  if (canonicalJson(existing) !== canonicalJson(incoming)) {
    throw Object.assign(new Error('A published contentVersion cannot be mutated in place.'), { code: 'CONTENT_VERSION_MUTATION' });
  }
  return true;
}

export function validateContentActivation(head, incoming, migration = null) {
  if (!head || head.contentVersion === incoming.contentVersion) return { action: head ? 'reuse' : 'initialize' };
  const valid = migration
    && migration.migrationId
    && migration.fromVersion === head.contentVersion
    && migration.toVersion === incoming.contentVersion
    && ['restart', 'explicit_map'].includes(migration.strategy)
    && migration.humanApproved === true;
  if (!valid) {
    return {
      action: 'blocked',
      code: 'CONTENT_MIGRATION_REQUIRED',
      fromVersion: head.contentVersion,
      toVersion: incoming.contentVersion
    };
  }
  return { action: 'migrate', migration };
}

export function initialState(lesson) {
  return {
    lessonId: lesson.lessonId,
    contentVersion: lesson.contentVersion,
    cursor: 0,
    xp: 0,
    activeMs: 0,
    attempts: {},
    speakingPending: [],
    mastery: {},
    completed: false
  };
}

function masteryState(score) {
  if (score >= 6) return 'STABLE';
  if (score >= 3) return 'PRACTISING';
  if (score >= 1) return 'LEARNING';
  return 'NEW';
}

export function validateEventSemantics(lesson, event, { state = null, eventById = null, creditedTimeSources = null, closedAudioStartIds = null } = {}) {
  if (!lesson || event?.lessonId !== lesson.lessonId || event?.contentVersion !== lesson.contentVersion) {
    return { valid: false, code: 'EVENT_CONTENT_BINDING_MISMATCH', semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
  }
  const items = Array.isArray(lesson.items) ? lesson.items : [];
  const item = event.itemId == null ? null : items.find(x => x.id === event.itemId) || null;
  const p = event.payload || {};

  if ([EventType.ITEM_PRESENTED, EventType.ITEM_ANSWERED, EventType.AUDIO_STARTED, EventType.AUDIO_ENDED, EventType.SPEAKING_SUBMITTED].includes(event.type) && !item) {
    return { valid: false, code: 'EVENT_ITEM_NOT_FOUND', itemId: event.itemId ?? null, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
  }

  // Canonical learner-path guard. State-changing/item-start events must target the
  // exact current lesson item. AUDIO_ENDED may arrive after a successful answer
  // advanced the cursor, so it is allowed only for an already-reached item and
  // never for a future item. TIME_SLICE is provenance-bound separately.
  if (state && item) {
    const itemIndex = items.findIndex(x => x.id === item.id);
    const currentIndex = Number.isInteger(state.cursor) ? state.cursor : 0;
    if (currentIndex >= items.length && [EventType.ITEM_PRESENTED, EventType.ITEM_ANSWERED, EventType.AUDIO_STARTED, EventType.SPEAKING_SUBMITTED].includes(event.type)) {
      return { valid: false, code: 'EVENT_ITEM_AFTER_PATH_END', itemId: item.id, cursor: currentIndex, itemCount: items.length, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    if ([EventType.ITEM_PRESENTED, EventType.ITEM_ANSWERED, EventType.AUDIO_STARTED, EventType.SPEAKING_SUBMITTED].includes(event.type) && itemIndex !== currentIndex) {
      return { valid: false, code: 'EVENT_ITEM_PATH_MISMATCH', itemId: item.id, expectedItemId: items[currentIndex]?.id ?? null, itemIndex, cursor: currentIndex, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    if (event.type === EventType.AUDIO_ENDED && itemIndex > currentIndex) {
      return { valid: false, code: 'AUDIO_END_FUTURE_ITEM_FORBIDDEN', itemId: item.id, itemIndex, cursor: currentIndex, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
  }

  if (event.type === EventType.ITEM_ANSWERED) {
    if (item.scoringRule?.kind === 'human_review') {
      return { valid: false, code: 'HUMAN_REVIEW_ITEM_ANSWER_EVENT_FORBIDDEN', itemId: item.id, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    if (!Object.prototype.hasOwnProperty.call(p, 'response')) {
      return { valid: false, code: 'ANSWER_RESPONSE_REQUIRED', itemId: item.id, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    const scored = scoreItem(item, p.response);
    if (p.correct !== scored.correct) {
      return { valid: false, code: 'ANSWER_SCORE_MISMATCH', itemId: item.id, expectedCorrect: scored.correct, observedCorrect: p.correct, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    if (p.humanReviewRequired !== scored.humanReviewRequired) {
      return { valid: false, code: 'ANSWER_REVIEW_FLAG_MISMATCH', itemId: item.id, expectedHumanReviewRequired: scored.humanReviewRequired, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    const expectedAdvance = scored.correct === true;
    if (p.advance !== expectedAdvance) {
      return { valid: false, code: 'ANSWER_ADVANCE_MISMATCH', itemId: item.id, expectedAdvance, observedAdvance: p.advance, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
  }

  if ([EventType.AUDIO_STARTED, EventType.AUDIO_ENDED].includes(event.type) && !item?.audioText) {
    return { valid: false, code: 'AUDIO_EVENT_ITEM_NOT_AUDIO_CAPABLE', itemId: event.itemId ?? null, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
  }
  if (event.type === EventType.AUDIO_STARTED && p.textRef !== item.id) {
    return { valid: false, code: 'AUDIO_START_CANONICAL_TEXT_REF_MISMATCH', itemId: item.id, observedTextRef: p.textRef ?? null, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
  }

  if (event.type === EventType.AUDIO_ENDED) {
    const startEventId = p.audioStartEventId;
    const startEventSeq = p.audioStartEventSeq;
    if (typeof startEventId !== 'string' || !startEventId.trim() || !Number.isInteger(startEventSeq) || startEventSeq < 1) {
      return { valid: false, code: 'AUDIO_END_START_REFERENCE_REQUIRED', itemId: item.id, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    const startEvent = eventById?.get?.(startEventId) || null;
    if (!startEvent) {
      return { valid: false, code: 'AUDIO_END_START_EVENT_NOT_FOUND', audioStartEventId: startEventId, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    const startMatches = startEvent.type === EventType.AUDIO_STARTED
      && startEvent.seq === startEventSeq
      && startEvent.seq < event.seq
      && startEvent.organisationId === event.organisationId
      && startEvent.subjectId === event.subjectId
      && startEvent.role === event.role
      && startEvent.sessionId === event.sessionId
      && startEvent.lessonId === event.lessonId
      && startEvent.contentVersion === event.contentVersion
      && startEvent.itemId === event.itemId;
    if (!startMatches) {
      return { valid: false, code: 'AUDIO_END_START_EVENT_MISMATCH', audioStartEventId: startEventId, expectedStartSeq: startEventSeq, observedStartSeq: startEvent.seq, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    if (closedAudioStartIds?.has?.(startEventId)) {
      return { valid: false, code: 'AUDIO_START_ALREADY_CLOSED', audioStartEventId: startEventId, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
  }

  if (event.type === EventType.SPEAKING_SUBMITTED) {
    if (item.scoringRule?.kind !== 'human_review' || item.teacherReviewRequired !== true) {
      return { valid: false, code: 'SPEAKING_ITEM_HUMAN_REVIEW_BINDING_REQUIRED', itemId: item.id, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    if (state?.speakingPending?.includes?.(item.id)) {
      return { valid: false, code: 'SPEAKING_REVIEW_PENDING_RESUBMIT_FORBIDDEN', itemId: item.id, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
  }

  if (event.type === EventType.TIME_SLICE) {
    const sourceEvent = eventById?.get?.(p.sourceEventId) || null;
    const provenance = validateTimeSliceProvenance(event, sourceEvent);
    if (!provenance.valid) return { ...provenance, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    if (creditedTimeSources?.has?.(p.sourceEventId)) {
      return { valid: false, code: 'TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED', sourceEventId: p.sourceEventId, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
  }

  if (event.type === EventType.LESSON_COMPLETED) {
    if (!state || state.cursor < items.length) {
      return { valid: false, code: 'LESSON_COMPLETION_PREMATURE', cursor: state?.cursor ?? null, itemCount: items.length, semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
    if (Array.isArray(state.speakingPending) && state.speakingPending.length > 0) {
      return { valid: false, code: 'LESSON_COMPLETION_SPEAKING_REVIEW_PENDING', pendingItemIds: [...state.speakingPending], semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
    }
  }

  return { valid: true, code: 'EVENT_SEMANTIC_PASS', semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION };
}

function applyAcceptedEventToState(lesson, state, ev, creditedTimeSources, closedAudioStartIds) {
  if (ev.type === EventType.ITEM_ANSWERED) {
    const attempts = state.attempts[ev.itemId] ?? 0;
    state.attempts[ev.itemId] = attempts + 1;
    if (ev.payload.correct) state.xp += attempts === 0 ? 10 : 6;
    const item = lesson.items.find(x => x.id === ev.itemId);
    const skill = item?.skill ?? 'unknown';
    const delta = ev.payload.correct ? (attempts === 0 ? 2 : 1) : 0;
    const score = (state.mastery[skill]?.score ?? 0) + delta;
    state.mastery[skill] = { score, state: masteryState(score) };
    if (ev.payload.correct && ev.payload.advance !== false) {
      const idx = lesson.items.findIndex(x => x.id === ev.itemId);
      if (idx >= 0) state.cursor = Math.max(state.cursor, idx + 1);
    }
  }
  if (ev.type === EventType.SPEAKING_SUBMITTED) {
    // Submission is evidence awaiting human review, not a pedagogical pass.
    // It cannot advance the canonical path, grant XP/mastery, or make the
    // lesson final-valid before a future trusted Teacher OS review gate.
    if (!state.speakingPending.includes(ev.itemId)) state.speakingPending.push(ev.itemId);
  }
  if (ev.type === EventType.AUDIO_ENDED) {
    closedAudioStartIds.add(ev.payload.audioStartEventId);
  }
  if (ev.type === EventType.TIME_SLICE && ev.payload.eligible === true) {
    creditedTimeSources.add(ev.payload.sourceEventId);
    state.activeMs += Math.max(0, Number(ev.payload.durationMs) || 0);
  }
  if (ev.type === EventType.LESSON_COMPLETED) state.completed = true;
  if (state.cursor >= lesson.items.length) state.cursor = lesson.items.length;
}

export function analyseLearningReplay(lesson, events) {
  const ordered = [...events]
    .filter(ev => ev?.lessonId === lesson.lessonId && ev?.contentVersion === lesson.contentVersion)
    .sort((a, b) => a.seq - b.seq || a.ts - b.ts || String(a.eventId).localeCompare(String(b.eventId)));
  const accepted = [];
  const state = initialState(lesson);
  const eventById = new Map();
  const creditedTimeSources = new Set();
  const closedAudioStartIds = new Set();
  let expectedSeq = 1;
  let breakInfo = null;

  for (const ev of ordered) {
    const policy = validateEventPolicy(ev);
    if (!policy.valid) { breakInfo = { ...policy, eventId: ev?.eventId || null }; break; }
    if (ev.seq !== expectedSeq) {
      breakInfo = { code: 'REPLAY_SEQUENCE_GAP_OR_DUPLICATE', expectedSeq, observedSeq: ev.seq, eventId: ev.eventId || null };
      break;
    }
    const predecessor = accepted.length ? accepted[accepted.length - 1] : null;
    const continuity = validateSequenceContinuity(ev, predecessor);
    if (!continuity.valid) { breakInfo = { ...continuity, eventId: ev.eventId || null }; break; }
    const semantic = validateEventSemantics(lesson, ev, { state, eventById, creditedTimeSources, closedAudioStartIds });
    if (!semantic.valid) { breakInfo = { ...semantic, eventId: ev.eventId || null }; break; }
    applyAcceptedEventToState(lesson, state, ev, creditedTimeSources, closedAudioStartIds);
    accepted.push(ev);
    eventById.set(ev.eventId, ev);
    expectedSeq += 1;
  }

  const quarantined = ordered.slice(accepted.length);
  return {
    valid: breakInfo === null,
    code: breakInfo?.code || 'LEARNING_REPLAY_CONTIGUOUS_AND_SEMANTIC',
    events: accepted,
    state,
    contiguousHead: accepted.length ? accepted[accepted.length - 1].seq : 0,
    maxObservedSeq: ordered.reduce((m, ev) => Math.max(m, Number.isInteger(ev?.seq) ? ev.seq : 0), 0),
    quarantinedCount: quarantined.length,
    quarantinedEventIds: quarantined.map(ev => ev?.eventId || null),
    creditedTimeSourceIds: [...creditedTimeSources],
    closedAudioStartEventIds: [...closedAudioStartIds],
    breakInfo,
    semanticPolicyVersion: EVENT_SEMANTIC_POLICY_VERSION
  };
}

export function reduceLessonState(lesson, events) {
  return analyseLearningReplay(lesson, events).state;
}

export function scoreItem(item, response) {
  if (item.scoringRule?.kind === 'human_review') return { correct: null, humanReviewRequired: true };
  if (item.scoringRule?.kind === 'all_of') {
    const got = Array.isArray(response) ? response : [];
    const want = item.scoringRule.answers || [];
    return { correct: got.length === want.length && got.every((x, i) => x === want[i]), humanReviewRequired: false };
  }
  if (item.scoringRule?.kind === 'min_correct') {
    const got = Array.isArray(response) ? response : [];
    const answers = item.scoringRule.answers || [];
    const correctCount = got.reduce((n, x, i) => n + (x === answers[i] ? 1 : 0), 0);
    return { correct: correctCount >= item.scoringRule.minCorrect, correctCount, humanReviewRequired: false };
  }
  return { correct: response === item.correctAnswer, humanReviewRequired: false };
}

export function eligibleSliceMs(previousTs, currentTs, { foreground = true, meaningfulChange = true, audioPlaying = false, idleCapMs = IDLE_CAP_MS } = {}) {
  if (!foreground || (!meaningfulChange && !audioPlaying)) return 0;
  const raw = Number(currentTs) - Number(previousTs);
  if (!Number.isFinite(raw) || raw <= 0) return 0;
  // Do not retroactively convert a long idle period into active learning time merely
  // because the learner later clicks an answer/speaking control. Continuous audio is
  // separately provenance-bound to AUDIO_ENDED and remains capped conservatively.
  if (meaningfulChange && !audioPlaying && raw > idleCapMs) return 0;
  return Math.min(raw, idleCapMs);
}
