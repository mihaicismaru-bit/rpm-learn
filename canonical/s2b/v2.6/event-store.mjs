import { assertImmutableContentVersion, classifyAppend, validateContentActivation, validateLessonContentContract, validateEventPolicy, validateEventSemantics, validateTimeSliceProvenance, validateSequenceContinuity, analyseLearningReplay, LEARNING_EVENT_ROLE } from './model.mjs';

const DB_NAME = 'rpm-learn-s1c';
const DB_VERSION = 4;
const STORE_EVENTS = 'events';
const STORE_CONTENT = 'content_versions';
const STORE_SNAPSHOTS_V2 = 'lesson_snapshots_v2';
const STORE_HEADS = 'content_heads';

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted.'));
  });
}

function requestValue(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export class EventConflictError extends Error {
  constructor(code, detail = {}) {
    super(`Learning event append blocked: ${code}`);
    this.name = 'EventConflictError';
    this.code = code;
    this.detail = detail;
  }
}


export class EventPolicyError extends Error {
  constructor(code, detail = {}) {
    super(`Learning event policy blocked: ${code}`);
    this.name = 'EventPolicyError';
    this.code = code;
    this.detail = detail;
  }
}

export class EventScopeError extends Error {
  constructor(code, detail = {}) {
    super(`Learning event scope blocked: ${code}`);
    this.name = 'EventScopeError';
    this.code = code;
    this.detail = detail;
  }
}

export class ContentVersionError extends Error {
  constructor(code, detail = {}) {
    super(`Content activation blocked: ${code}`);
    this.name = 'ContentVersionError';
    this.code = code;
    this.detail = detail;
  }
}

function validateScope(scope) {
  if (!scope?.subjectId || !scope?.organisationId) {
    throw new EventScopeError('STORE_SCOPE_REQUIRED');
  }
  if (!scope?.role) {
    throw new EventScopeError('STORE_ROLE_REQUIRED', { expectedRole: LEARNING_EVENT_ROLE });
  }
  if (scope.role !== LEARNING_EVENT_ROLE) {
    throw new EventScopeError('STORE_ROLE_FORBIDDEN', { expectedRole: LEARNING_EVENT_ROLE, observedRole: scope.role });
  }
  return Object.freeze({
    subjectId: String(scope.subjectId),
    organisationId: String(scope.organisationId),
    role: LEARNING_EVENT_ROLE
  });
}

export class EventStore {
  constructor(scope, { trustedHumanReviewProvider = null } = {}) {
    this.db = null;
    this.scope = validateScope(scope);
    if (trustedHumanReviewProvider !== null && typeof trustedHumanReviewProvider !== 'function') {
      throw new EventScopeError('TRUSTED_HUMAN_REVIEW_PROVIDER_INVALID');
    }
    this.trustedHumanReviewProvider = trustedHumanReviewProvider;
  }

  async listTrustedHumanReviews(lessonId, contentVersion) {
    if (!this.trustedHumanReviewProvider) return [];
    const rows = await this.trustedHumanReviewProvider({
      organisationId: this.scope.organisationId,
      subjectId: this.scope.subjectId,
      lessonId,
      contentVersion
    });
    if (!Array.isArray(rows)) throw new EventScopeError('TRUSTED_HUMAN_REVIEW_PROVIDER_RESULT_INVALID');
    return rows.map(row => structuredClone(row));
  }

  async open() {
    if (this.db) return this.db;
    this.db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = () => reject(req.error);
      req.onupgradeneeded = () => {
        const db = req.result;
        let events;
        if (!db.objectStoreNames.contains(STORE_EVENTS)) {
          events = db.createObjectStore(STORE_EVENTS, { keyPath: 'eventId' });
        } else {
          events = req.transaction.objectStore(STORE_EVENTS);
        }
        for (const oldIndex of ['lessonVersionSeq','sessionSeq']) {
          if (events.indexNames.contains(oldIndex)) events.deleteIndex(oldIndex);
        }
        if (!events.indexNames.contains('scopeLessonVersionSeq')) {
          events.createIndex('scopeLessonVersionSeq', ['organisationId','subjectId','lessonId','contentVersion','seq'], { unique: true });
        }
        if (!events.indexNames.contains('scopeSessionSeq')) {
          events.createIndex('scopeSessionSeq', ['organisationId','subjectId','sessionId','seq'], { unique: true });
        }
        if (!events.indexNames.contains('scopeLessonVersion')) {
          events.createIndex('scopeLessonVersion', ['organisationId','subjectId','lessonId','contentVersion'], { unique: false });
        }
        if (!events.indexNames.contains('scopeTimeSource')) {
          events.createIndex('scopeTimeSource', ['organisationId','subjectId','type','payload.sourceEventId'], { unique: true });
        }
        if (!db.objectStoreNames.contains(STORE_CONTENT)) {
          db.createObjectStore(STORE_CONTENT, { keyPath: ['lessonId', 'contentVersion'] });
        }
        if (!db.objectStoreNames.contains(STORE_SNAPSHOTS_V2)) {
          db.createObjectStore(STORE_SNAPSHOTS_V2, { keyPath: ['organisationId','subjectId','lessonId','contentVersion'] });
        }
        if (!db.objectStoreNames.contains(STORE_HEADS)) {
          db.createObjectStore(STORE_HEADS, { keyPath: 'lessonId' });
        }
      };
      req.onsuccess = () => resolve(req.result);
    });
    return this.db;
  }

  assertEventScope(event) {
    if (event?.role !== this.scope.role) {
      throw new EventScopeError('EVENT_ROLE_MISMATCH', {
        storeScope: this.scope,
        eventScope: { subjectId: event?.subjectId || null, organisationId: event?.organisationId || null, role: event?.role || null }
      });
    }
    if (event?.subjectId !== this.scope.subjectId || event?.organisationId !== this.scope.organisationId) {
      throw new EventScopeError('EVENT_SCOPE_MISMATCH', {
        storeScope: this.scope,
        eventScope: { subjectId: event?.subjectId || null, organisationId: event?.organisationId || null, role: event?.role || null }
      });
    }
    return true;
  }

  async getContent(lessonId, contentVersion) {
    const db = await this.open();
    const tx = db.transaction(STORE_CONTENT, 'readonly');
    const done = txDone(tx);
    const value = await requestValue(tx.objectStore(STORE_CONTENT).get([lessonId, contentVersion]));
    await done;
    return value;
  }

  async getContentHead(lessonId) {
    const db = await this.open();
    const tx = db.transaction(STORE_HEADS, 'readonly');
    const done = txDone(tx);
    const value = await requestValue(tx.objectStore(STORE_HEADS).get(lessonId));
    await done;
    return value;
  }

  async activateContent(lesson, { migration = null } = {}) {
    const contract = validateLessonContentContract(lesson);
    if (!contract.valid) throw new ContentVersionError('LESSON_CONTENT_CONTRACT_INVALID', contract);
    const existing = await this.getContent(lesson.lessonId, lesson.contentVersion);
    try {
      assertImmutableContentVersion(existing, lesson);
    } catch (err) {
      throw new ContentVersionError(err.code || 'CONTENT_VERSION_MUTATION', { cause: String(err.message || err) });
    }

    const head = await this.getContentHead(lesson.lessonId);
    const decision = validateContentActivation(head, lesson, migration);
    if (decision.action === 'blocked') throw new ContentVersionError(decision.code, decision);

    const db = await this.open();
    const tx = db.transaction([STORE_CONTENT, STORE_HEADS], 'readwrite');
    tx.objectStore(STORE_CONTENT).put(lesson);
    tx.objectStore(STORE_HEADS).put({
      lessonId: lesson.lessonId,
      contentVersion: lesson.contentVersion,
      activatedAt: Date.now(),
      migration: decision.action === 'migrate' ? migration : null
    });
    await txDone(tx);
    return { status: decision.action, lessonId: lesson.lessonId, contentVersion: lesson.contentVersion };
  }

  async append(event) {
    const policy = validateEventPolicy(event);
    if (!policy.valid) throw new EventPolicyError(policy.code, policy);
    this.assertEventScope(event);
    const lesson = await this.getContent(event.lessonId, event.contentVersion);
    if (!lesson) throw new ContentVersionError('CONTENT_NOT_ACTIVATED', { lessonId: event.lessonId, contentVersion: event.contentVersion });
    const trustedHumanReviews = await this.listTrustedHumanReviews(event.lessonId, event.contentVersion);
    const db = await this.open();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_EVENTS, 'readwrite');
      const store = tx.objectStore(STORE_EVENTS);
      const idxLesson = store.index('scopeLessonVersionSeq');
      const idxSession = store.index('scopeSessionSeq');
      const idxTimeSource = store.index('scopeTimeSource');
      const idxChain = store.index('scopeLessonVersion');
      let outcome = null;
      let terminalError = null;

      tx.oncomplete = () => resolve(outcome);
      tx.onerror = () => reject(terminalError || tx.error);
      tx.onabort = () => reject(terminalError || tx.error || new Error('IndexedDB transaction aborted.'));

      const fail = (err) => { terminalError = err; try { tx.abort(); } catch {} };
      const byIdReq = store.get(event.eventId);
      byIdReq.onerror = () => fail(byIdReq.error);
      byIdReq.onsuccess = () => {
        const byLessonReq = idxLesson.get([
          event.organisationId,event.subjectId,event.lessonId,event.contentVersion,event.seq
        ]);
        byLessonReq.onerror = () => fail(byLessonReq.error);
        byLessonReq.onsuccess = () => {
          const bySessionReq = idxSession.get([
            event.organisationId,event.subjectId,event.sessionId,event.seq
          ]);
          bySessionReq.onerror = () => fail(bySessionReq.error);
          bySessionReq.onsuccess = () => {
            const chainReq = idxChain.getAll([
              event.organisationId,event.subjectId,event.lessonId,event.contentVersion
            ]);
            chainReq.onerror = () => fail(chainReq.error);
            chainReq.onsuccess = () => {
            const chainState = analyseLearningReplay(lesson, chainReq.result || [], { trustedHumanReviews });
            const afterPredecessor = (predecessor = null) => {
              const continueAppend = (sourceEvent = null, existingTimeForSource = null) => {
                const decision = classifyAppend(event, {
                  byEventId: byIdReq.result || null,
                  byScopeLessonVersionSeq: byLessonReq.result || null,
                  byScopeSessionSeq: bySessionReq.result || null
                });
                if (decision.action === 'conflict') {
                  fail(new EventConflictError(decision.code, decision));
                  return;
                }
                if (decision.action === 'duplicate') {
                  outcome = { status: 'duplicate', event: byIdReq.result, code: decision.code };
                  return;
                }
                if (!chainState.valid) {
                  fail(new EventConflictError('EVENT_SEQUENCE_CHAIN_QUARANTINED', {
                    contiguousHead: chainState.contiguousHead,
                    maxObservedSeq: chainState.maxObservedSeq,
                    quarantinedCount: chainState.quarantinedCount,
                    breakInfo: chainState.breakInfo
                  }));
                  return;
                }

                const continuity = validateSequenceContinuity(event, predecessor);
                if (!continuity.valid) {
                  fail(new EventConflictError(continuity.code, continuity));
                  return;
                }

                // Runtime hardening: duplicate active-time attribution is a store-state conflict.
                // Check it before semantic replay validation so append() exposes the canonical
                // EventConflictError contract while replay still fail-closes semantically.
                if (event.type === 'TIME_SLICE' && existingTimeForSource && existingTimeForSource.eventId !== event.eventId) {
                  fail(new EventConflictError('TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED', {
                    sourceEventId: event.payload?.sourceEventId || null,
                    existingTimeSliceEventId: existingTimeForSource.eventId
                  }));
                  return;
                }

                const semantic = validateEventSemantics(lesson, event, {
                  state: chainState.state,
                  eventById: new Map(chainState.events.filter(ev => ev?.eventId).map(ev => [ev.eventId, ev])),
                  creditedTimeSources: new Set(chainState.creditedTimeSourceIds || []),
                  closedAudioStartIds: new Set(chainState.closedAudioStartEventIds || [])
                });
                if (!semantic.valid) {
                  fail(new EventPolicyError(semantic.code, semantic));
                  return;
                }

                if (event.type === 'TIME_SLICE') {
                  const p = event.payload || {};
                  const provenance = validateTimeSliceProvenance(event, sourceEvent);
                  if (!provenance.valid) {
                    fail(new EventPolicyError(provenance.code, provenance));
                    return;
                  }
                  if (existingTimeForSource && existingTimeForSource.eventId !== event.eventId) {
                    fail(new EventConflictError('TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED', {
                      sourceEventId: p.sourceEventId,
                      existingTimeSliceEventId: existingTimeForSource.eventId
                    }));
                    return;
                  }
                }

                const addReq = store.add(event);
                addReq.onerror = () => {
                  terminalError = new EventConflictError('INDEX_CONSTRAINT_RACE', { cause: String(addReq.error) });
                  try { tx.abort(); } catch {}
                };
                addReq.onsuccess = () => { outcome = { status: 'appended', event, code: decision.code }; };
              };

              if (event.type !== 'TIME_SLICE') {
                continueAppend();
                return;
              }

              const sourceId = event.payload?.sourceEventId;
              const sourceReq = store.get(sourceId);
              sourceReq.onerror = () => fail(sourceReq.error);
              sourceReq.onsuccess = () => {
                const timeSourceReq = idxTimeSource.get([event.organisationId,event.subjectId,event.type,sourceId]);
                timeSourceReq.onerror = () => fail(timeSourceReq.error);
                timeSourceReq.onsuccess = () => continueAppend(sourceReq.result || null, timeSourceReq.result || null);
              };
            };

            if (event.seq === 1) {
              afterPredecessor(null);
              return;
            }
            const predecessorReq = idxLesson.get([
              event.organisationId,event.subjectId,event.lessonId,event.contentVersion,event.seq - 1
            ]);
            predecessorReq.onerror = () => fail(predecessorReq.error);
            predecessorReq.onsuccess = () => afterPredecessor(predecessorReq.result || null);
          };
          };
        };
      };
    });
  }

  async listEvents(lessonId, contentVersion) {
    const db = await this.open();
    const tx = db.transaction(STORE_EVENTS, 'readonly');
    const done = txDone(tx);
    const idx = tx.objectStore(STORE_EVENTS).index('scopeLessonVersion');
    const req = idx.getAll([this.scope.organisationId,this.scope.subjectId,lessonId,contentVersion]);
    const rows = await requestValue(req) || [];
    await done;
    return rows.sort((a, b) => a.seq - b.seq);
  }

  async inspectSequenceChain(lessonId, contentVersion) {
    const [rows, lesson] = await Promise.all([
      this.listEvents(lessonId, contentVersion),
      this.getContent(lessonId, contentVersion)
    ]);
    if (!lesson) throw new ContentVersionError('CONTENT_NOT_ACTIVATED', { lessonId, contentVersion });
    const trustedHumanReviews = await this.listTrustedHumanReviews(lessonId, contentVersion);
    return analyseLearningReplay(lesson, rows, { trustedHumanReviews });
  }

  async putSnapshot(snapshot) {
    const db = await this.open();
    const tx = db.transaction(STORE_SNAPSHOTS_V2, 'readwrite');
    tx.objectStore(STORE_SNAPSHOTS_V2).put({
      ...snapshot,
      organisationId: this.scope.organisationId,
      subjectId: this.scope.subjectId
    });
    await txDone(tx);
  }

  async getSnapshot(lessonId, contentVersion) {
    const db = await this.open();
    const tx = db.transaction(STORE_SNAPSHOTS_V2, 'readonly');
    const done = txDone(tx);
    const value = await requestValue(tx.objectStore(STORE_SNAPSHOTS_V2).get([
      this.scope.organisationId,this.scope.subjectId,lessonId,contentVersion
    ]));
    await done;
    return value;
  }

  close() {
    if (this.db) this.db.close();
    this.db = null;
  }

  static async deleteDatabaseForTest() {
    return await new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Database deletion blocked.'));
    });
  }
}
