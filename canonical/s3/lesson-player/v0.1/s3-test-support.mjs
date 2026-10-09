import assert from 'node:assert/strict';
import { analyseLearningReplay } from '../../../s2b/v2.6/model.mjs';

export class S3MemoryEventStore {
  constructor({ trustedHumanReviewProvider = null } = {}) {
    this.lesson = null;
    this.events = [];
    this.failNext = false;
    this.trustedHumanReviewProvider = trustedHumanReviewProvider;
  }
  async listTrustedHumanReviews(lessonId, contentVersion) {
    if (!this.trustedHumanReviewProvider) return [];
    const rows = await this.trustedHumanReviewProvider({lessonId,contentVersion});
    if (!Array.isArray(rows)) throw Object.assign(new Error('trusted review provider invalid'), {code:'TRUSTED_HUMAN_REVIEW_PROVIDER_RESULT_INVALID'});
    return rows.map(row=>structuredClone(row));
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
    const [events,trustedHumanReviews]=await Promise.all([
      this.listEvents(lessonId, contentVersion),
      this.listTrustedHumanReviews(lessonId, contentVersion)
    ]);
    return analyseLearningReplay(this.lesson, events, {trustedHumanReviews});
  }
  async append(event) {
    if (this.failNext) {
      this.failNext = false;
      throw Object.assign(new Error('store write unavailable'), { code: 'SIMULATED_STORE_FAILURE' });
    }
    const candidate = [...this.events, structuredClone(event)];
    const trustedHumanReviews=await this.listTrustedHumanReviews(event.lessonId,event.contentVersion);
    const replay = analyseLearningReplay(this.lesson, candidate, {trustedHumanReviews});
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
