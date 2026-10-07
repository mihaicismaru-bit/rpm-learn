import assert from 'node:assert/strict';
import { analyseLearningReplay } from '../../../s2b/v2.6/model.mjs';

export class S3MemoryEventStore {
  constructor() {
    this.lesson = null;
    this.events = [];
    this.failNext = false;
  }
  async open() { return true; }
  async activateContent(next) {
    if (this.lesson && this.lesson.lessonId === next.lessonId && this.lesson.contentVersion === next.contentVersion) {
      assert.deepEqual(this.lesson, next);
    }
    this.lesson = structuredClone(next);
    return { status: 'initialize' };
  }
  async listEvents(lessonId, contentVersion) {
    return this.events
      .filter(e => e.lessonId === lessonId && e.contentVersion === contentVersion)
      .map(e => structuredClone(e));
  }
  async inspectSequenceChain(lessonId, contentVersion) {
    return analyseLearningReplay(this.lesson, await this.listEvents(lessonId, contentVersion));
  }
  async append(event) {
    if (this.failNext) {
      this.failNext = false;
      throw Object.assign(new Error('store write unavailable'), { code: 'SIMULATED_STORE_FAILURE' });
    }
    const candidate = [...this.events, structuredClone(event)];
    const replay = analyseLearningReplay(this.lesson, candidate);
    if (!replay.valid) throw Object.assign(new Error(replay.code), { code: replay.code });
    this.events = candidate;
    return { status: 'appended', event: structuredClone(event), code: 'NEW_EVENT' };
  }
}

export function correctLessonResponse(item) {
  if (item.type === 'order_words') return [...item.tokens];
  if (item.type === 'checkpoint') return item.scenarios.map(s => s.answer);
  return item.correctAnswer;
}
