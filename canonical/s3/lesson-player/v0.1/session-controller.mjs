import { EventType, makeEvent, nextSequenceCandidate } from '../../../s2b/v2.6/model.mjs';
import { deriveLessonPlayerView, planAnswerIntent, planCompletionIntent } from './lesson-player-engine.mjs';

export class LessonPlayerSessionError extends Error {
  constructor(code, detail = {}) { super(code); this.code = code; this.detail = detail; }
}

function assertStore(store) {
  for (const method of ['open','activateContent','listEvents','inspectSequenceChain','append']) {
    if (typeof store?.[method] !== 'function') throw new LessonPlayerSessionError('SESSION_STORE_PORT_INVALID', { missingMethod: method });
  }
}

export class EventStoreSessionWriter {
  constructor({ eventStore, lesson, scope, sessionId, now = () => Date.now() }) {
    assertStore(eventStore);
    if (!lesson || !scope?.subjectId || !scope?.organisationId || scope?.role !== 'LEARNER' || !sessionId) {
      throw new LessonPlayerSessionError('SESSION_WRITER_CONFIG_INVALID');
    }
    this.eventStore = eventStore; this.lesson = lesson; this.scope = Object.freeze({ ...scope }); this.sessionId = sessionId; this.now = now;
  }
  async appendIntent(intent) {
    const chain = await this.eventStore.inspectSequenceChain(this.lesson.lessonId, this.lesson.contentVersion);
    if (!chain?.valid) throw new LessonPlayerSessionError('SESSION_PERSISTED_CHAIN_BLOCKED', { code: chain?.code ?? null });
    const event = makeEvent({
      type: intent.type, lessonId: this.lesson.lessonId, contentVersion: this.lesson.contentVersion,
      seq: nextSequenceCandidate(chain.contiguousHead), itemId: intent.itemId ?? null, payload: intent.payload ?? {},
      ts: Number(this.now()), sessionId: this.sessionId, ...this.scope
    });
    let outcome;
    try { outcome = await this.eventStore.append(event); }
    catch (error) { throw new LessonPlayerSessionError('SESSION_EVENT_PERSIST_FAILED', { storeCode: error?.code ?? null }); }
    if (!outcome || !['appended','duplicate'].includes(outcome.status)) throw new LessonPlayerSessionError('SESSION_EVENT_PERSIST_OUTCOME_INVALID');
    return outcome.event ?? event;
  }
}

export class LessonPlayerSessionController {
  constructor({ lesson, eventStore, scope, sessionId, now = () => Date.now() }) {
    assertStore(eventStore);
    if (!lesson || !sessionId) throw new LessonPlayerSessionError('SESSION_CONTROLLER_CONFIG_INVALID');
    this.lesson = lesson; this.eventStore = eventStore; this.sessionId = sessionId;
    this.writer = new EventStoreSessionWriter({ eventStore, lesson, scope, sessionId, now });
    this.events = Object.freeze([]); this.view = null; this.started = false;
  }
  async refresh() {
    this.events = Object.freeze([...(await this.eventStore.listEvents(this.lesson.lessonId, this.lesson.contentVersion))]);
    this.view = deriveLessonPlayerView(this.lesson, this.events);
    return this.view;
  }
  async start() {
    await this.eventStore.open(); await this.eventStore.activateContent(this.lesson); await this.refresh();
    if (!this.events.some(e => e.type === EventType.SESSION_STARTED && e.sessionId === this.sessionId)) {
      await this.writer.appendIntent({ type: EventType.SESSION_STARTED, itemId: null, payload: { recoveredFromSeq: this.view.replay.contiguousHead } });
      await this.refresh();
    }
    this.started = true; return this.view;
  }
  current() {
    if (!this.view) throw new LessonPlayerSessionError('SESSION_NOT_STARTED');
    return this.view;
  }
  async answer(itemId, response) {
    if (!this.started) throw new LessonPlayerSessionError('SESSION_NOT_STARTED');
    const intent = planAnswerIntent(this.lesson, this.events, itemId, response);
    await this.writer.appendIntent(intent);
    return this.refresh();
  }
  async complete() {
    if (!this.started) throw new LessonPlayerSessionError('SESSION_NOT_STARTED');
    const intent = planCompletionIntent(this.lesson, this.events);
    await this.writer.appendIntent(intent);
    return this.refresh();
  }
}
