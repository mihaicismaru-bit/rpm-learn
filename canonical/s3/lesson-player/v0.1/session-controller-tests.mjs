import assert from 'node:assert/strict';
import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { analyseLearningReplay } from '../../../s2b/v2.6/model.mjs';
import { LessonPlayerContractError } from './lesson-player-engine.mjs';
import { LessonPlayerSessionController, LessonPlayerSessionError } from './session-controller.mjs';

const scope = Object.freeze({ subjectId: 'learner-s31', organisationId: 'org-s31', role: 'LEARNER' });

class MemoryEventStore {
  constructor() { this.lesson = null; this.events = []; this.failNext = false; this.opened = false; }
  async open() { this.opened = true; return true; }
  async activateContent(next) {
    if (this.lesson && this.lesson.lessonId === next.lessonId && this.lesson.contentVersion === next.contentVersion) {
      assert.deepEqual(this.lesson, next);
    }
    this.lesson = structuredClone(next);
    return { status: 'initialize' };
  }
  async listEvents(lessonId, contentVersion) {
    return this.events.filter(e => e.lessonId === lessonId && e.contentVersion === contentVersion).map(e => structuredClone(e));
  }
  async inspectSequenceChain(lessonId, contentVersion) {
    return analyseLearningReplay(this.lesson, await this.listEvents(lessonId, contentVersion));
  }
  async append(event) {
    if (this.failNext) { this.failNext = false; throw Object.assign(new Error('simulated persistence failure'), { code: 'SIMULATED_STORE_FAILURE' }); }
    const candidate = [...this.events, structuredClone(event)];
    const replay = analyseLearningReplay(this.lesson, candidate);
    if (!replay.valid) throw Object.assign(new Error(replay.code), { code: replay.code });
    this.events = candidate;
    return { status: 'appended', event: structuredClone(event), code: 'NEW_EVENT' };
  }
}

function correctResponse(item) {
  if (item.type === 'order_words') return [...item.tokens];
  if (item.type === 'checkpoint') return item.scenarios.map(s => s.answer);
  return item.correctAnswer;
}

function controllerFor(store, activeLesson = lesson, sessionId = 's31-session') {
  let tick = 1000;
  return new LessonPlayerSessionController({
    lesson: activeLesson,
    eventStore: store,
    scope,
    sessionId,
    now: () => (tick += 1000)
  });
}

// 1) Start hydrates persisted replay and creates exactly one session-start event.
{
  const store = new MemoryEventStore();
  const controller = controllerFor(store);
  const view = await controller.start();
  assert.equal(store.opened, true);
  assert.equal(view.currentItem.id, 'E01');
  assert.equal(store.events.length, 1);
  assert.equal(store.events[0].type, 'SESSION_STARTED');
  assert.equal(store.events[0].seq, 1);
}

// 2) Wrong answer is persisted but does not advance; correct retry advances from persisted replay.
{
  const store = new MemoryEventStore();
  const controller = controllerFor(store);
  await controller.start();

  let view = await controller.answer('E01', 'Am terminat.');
  assert.equal(view.currentItem.id, 'E01');
  assert.equal(store.events.at(-1).payload.correct, false);
  assert.equal(store.events.at(-1).seq, 2);

  view = await controller.answer('E01', 'Nu înțeleg.');
  assert.equal(view.currentItem.id, 'E02');
  assert.equal(store.events.at(-1).payload.correct, true);
  assert.deepEqual(store.events.map(e => e.seq), [1,2,3]);
}

// 3) Persistence failure never advances observable controller state.
{
  const store = new MemoryEventStore();
  const controller = controllerFor(store);
  await controller.start();
  const before = controller.current();
  store.failNext = true;

  await assert.rejects(
    controller.answer('E01', 'Nu înțeleg.'),
    err => err instanceof LessonPlayerSessionError && err.code === 'SESSION_EVENT_PERSIST_FAILED'
  );
  assert.equal(controller.current(), before);
  assert.equal(controller.current().currentItem.id, 'E01');
  assert.equal(store.events.length, 1);
}

// 4) A new controller recovers exactly from persisted replay after reload.
{
  const store = new MemoryEventStore();
  const first = controllerFor(store);
  await first.start();
  await first.answer('E01', 'Nu înțeleg.');
  const persistedCount = store.events.length;

  const recovered = controllerFor(store);
  const view = await recovered.start();
  assert.equal(view.currentItem.id, 'E02');
  assert.equal(view.progress.completedItems, 1);
  assert.equal(store.events.length, persistedCount);
}

// 5) Checkpoint response and completion-ready state work on a valid non-speaking lesson.
{
  const noSpeaking = structuredClone(lesson);
  noSpeaking.lessonId = 'RLS07-P0-HELP-NOSPEAK';
  noSpeaking.contentVersion = 'rpm-rls07-p0-help-nospeak@0.1.0';
  noSpeaking.items = noSpeaking.items.filter(item => item.type !== 'listen_repeat');

  const store = new MemoryEventStore();
  const controller = controllerFor(store, noSpeaking, 's31-completion');
  let view = await controller.start();

  while (view.currentItem) {
    const item = view.currentItem;
    if (item.type === 'checkpoint') assert.equal(view.interaction.kind, 'CHECKPOINT');
    view = await controller.answer(item.id, correctResponse(item));
  }

  assert.equal(view.status, 'READY_TO_COMPLETE');
  assert.equal(view.canComplete, true);
  view = await controller.complete();
  assert.equal(view.status, 'COMPLETED');
  assert.equal(view.canComplete, false);
}

// 6) Speaking remains external to S3.1 and cannot be smuggled through answer().
{
  const store = new MemoryEventStore();
  const controller = controllerFor(store, lesson, 's31-speaking');
  let view = await controller.start();
  for (let i = 0; i < 5; i++) {
    const item = view.currentItem;
    view = await controller.answer(item.id, correctResponse(item));
  }
  assert.equal(view.currentItem.id, 'E06');
  assert.equal(view.interaction.kind, 'SPEAKING');
  const count = store.events.length;
  await assert.rejects(
    controller.answer('E06', 'placeholder'),
    err => err instanceof LessonPlayerContractError && err.code === 'LESSON_PLAYER_ANSWER_DEFERRED_TO_HUMAN_WORKFLOW'
  );
  assert.equal(store.events.length, count);
}

console.log('RPM_S3_1_SESSION_CONTROLLER_PASS hydrate retry persisted-sequence no-optimistic-advance recovery checkpoint completion-ready speaking-external');
