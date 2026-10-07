import assert from 'node:assert/strict';
import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { EventType, makeEvent, scoreItem } from '../../../s2b/v2.6/model.mjs';
import {
  LessonPlayerContractError,
  deriveLessonPlayerView,
  interactionForItem,
  planAnswerIntent,
  planCompletionIntent
} from './lesson-player-engine.mjs';

const scope = Object.freeze({
  sessionId: 's3-test-session',
  subjectId: 'learner-1',
  organisationId: 'org-1',
  role: 'LEARNER'
});

function event(type, seq, itemId = null, payload = {}) {
  return makeEvent({
    type,
    lessonId: lesson.lessonId,
    contentVersion: lesson.contentVersion,
    seq,
    itemId,
    payload,
    ts: seq * 1000,
    eventId: `s3_ev_${seq}`,
    ...scope
  });
}

function correctResponse(item) {
  if (item.type === 'order_words') return [...item.tokens];
  if (item.type === 'checkpoint') return item.scenarios.map(x => x.answer);
  return item.correctAnswer;
}

function pushCorrect(events, item, seq) {
  events.push(event(EventType.ITEM_PRESENTED, seq++, item.id, { cursor: lesson.items.indexOf(item) }));
  const response = correctResponse(item);
  const scored = scoreItem(item, response);
  events.push(event(EventType.ITEM_ANSWERED, seq++, item.id, {
    response,
    correct: scored.correct,
    humanReviewRequired: scored.humanReviewRequired,
    advance: scored.correct === true
  }));
  return seq;
}

// 1) Initial production view is derived from the validated event model, not UI state.
{
  const view = deriveLessonPlayerView(lesson, []);
  assert.equal(view.status, 'ACTIVE');
  assert.equal(view.currentItem.id, 'E01');
  assert.equal(view.progress.completedItems, 0);
  assert.equal(view.progress.totalItems, 8);
  assert.equal(view.interaction.kind, 'CHOICE');
  assert.equal(view.canComplete, false);
}

// 2) Answer planning emits an intent only; sequencing/persistence remain EventStore responsibilities.
{
  const intent = planAnswerIntent(lesson, [], 'E01', 'Nu înțeleg.');
  assert.equal(intent.type, EventType.ITEM_ANSWERED);
  assert.equal(intent.itemId, 'E01');
  assert.equal(intent.payload.correct, true);
  assert.equal(intent.payload.advance, true);
  assert.equal(intent.payload.humanReviewRequired, false);
}

// 3) Canonical replay advances to speaking, where answer planning is intentionally disabled.
{
  const events = [event(EventType.SESSION_STARTED, 1, null, { recoveredFromSeq: 0 })];
  let seq = 2;
  for (const item of lesson.items.slice(0, 5)) seq = pushCorrect(events, item, seq);

  const view = deriveLessonPlayerView(lesson, events);
  assert.equal(view.status, 'ACTIVE');
  assert.equal(view.currentItem.id, 'E06');
  assert.equal(view.interaction.kind, 'SPEAKING');
  assert.equal(view.interaction.requiresHumanReview, true);
  assert.equal(view.interaction.actionPolicy, 'DEFER_TO_SPEAKING_WORKFLOW');

  assert.throws(
    () => planAnswerIntent(lesson, events, 'E06', 'anything'),
    err => err instanceof LessonPlayerContractError && err.code === 'LESSON_PLAYER_ANSWER_DEFERRED_TO_HUMAN_WORKFLOW'
  );

  events.push(event(EventType.ITEM_PRESENTED, seq++, 'E06', { cursor: 5 }));
  events.push(event(EventType.SPEAKING_SUBMITTED, seq++, 'E06', {
    mediaRef: 'test://speaking/submission',
    teacherReviewRequired: true
  }));

  const pending = deriveLessonPlayerView(lesson, events);
  assert.equal(pending.status, 'AWAITING_HUMAN_REVIEW');
  assert.equal(pending.currentItem.id, 'E06');
  assert.deepEqual([...pending.speakingPending], ['E06']);
  assert.equal(pending.canComplete, false);
  assert.throws(
    () => planCompletionIntent(lesson, events),
    err => err instanceof LessonPlayerContractError && err.code === 'LESSON_PLAYER_COMPLETION_GATE_CLOSED'
  );
}

// 4) Replay corruption blocks the player instead of auto-healing or presenting a future item.
{
  const events = [
    event(EventType.SESSION_STARTED, 1, null, { recoveredFromSeq: 0 }),
    event(EventType.ITEM_PRESENTED, 3, 'E01', { cursor: 0 })
  ];
  const view = deriveLessonPlayerView(lesson, events);
  assert.equal(view.status, 'INTEGRITY_BLOCKED');
  assert.equal(view.currentItem, null);
  assert.equal(view.canComplete, false);
  assert.ok(view.replay.quarantinedCount >= 1);
}

// 5) Adult-source contract remains a hard prerequisite for the production player.
{
  const invalid = structuredClone(lesson);
  invalid.source.audience = 'child';
  assert.throws(
    () => deriveLessonPlayerView(invalid, []),
    err => err instanceof LessonPlayerContractError && err.code === 'LESSON_SOURCE_AUDIENCE_MISMATCH'
  );
}

// 6) Interaction mapping is explicit and contains no hidden completion or legal semantics.
{
  assert.equal(interactionForItem(lesson.items[2]).kind, 'ORDER_WORDS');
  assert.equal(interactionForItem(lesson.items[7]).kind, 'CHECKPOINT');
}

console.log('RPM_S3_LESSON_PLAYER_ENGINE_V01_PASS initial-view answer-intent speaking-human-hold replay-quarantine adult-source-contract interaction-map');
