import assert from 'node:assert/strict';
import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { EventType, makeEvent, scoreItem } from '../../../s2b/v2.6/model.mjs';
import { LessonPlayerContractError } from './lesson-player-engine.mjs';
import { RuntimeKind, describeRuntimeItem, deriveLessonRuntimeFrame, planRuntimeResponse, validateRuntimeResponse } from './lesson-runtime.mjs';

const scope = { sessionId:'s32', subjectId:'learner-s32', organisationId:'org-s32', role:'LEARNER' };
const ev = (type,seq,itemId=null,payload={}) => makeEvent({type,seq,itemId,payload,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,ts:seq*1000,eventId:`s32_${seq}`,...scope});
const correct = item => item.type==='order_words' ? [...item.tokens] : item.type==='checkpoint' ? item.scenarios.map(s=>s.answer) : item.correctAnswer;

{
  const kinds=lesson.items.map(item=>describeRuntimeItem(item).kind);
  assert.deepEqual(kinds,[RuntimeKind.LISTEN_CHOOSE,RuntimeKind.SCENARIO_CHOOSE,RuntimeKind.ORDER_WORDS,RuntimeKind.LISTEN_CHOOSE,RuntimeKind.SCENARIO_CHOOSE,RuntimeKind.LISTEN_REPEAT,RuntimeKind.READ_CHOOSE,RuntimeKind.CHECKPOINT]);
  assert.equal(new Set(lesson.items.map(item=>item.type)).size,6);
}

{
  for (const item of lesson.items) {
    const s=JSON.stringify(describeRuntimeItem(item));
    for (const forbidden of ['correctAnswer','scoringRule','feedbackCorrect','feedbackRetry']) assert.equal(s.includes(forbidden),false);
  }
}

{
  const frame=deriveLessonRuntimeFrame(lesson,[]);
  assert.equal(frame.current.itemId,'E01');
  assert.equal(frame.current.kind,RuntimeKind.LISTEN_CHOOSE);
  assert.equal(frame.current.responseShape,'single_choice');
}

{
  validateRuntimeResponse(lesson.items[0],lesson.items[0].correctAnswer);
  validateRuntimeResponse(lesson.items[2],[...lesson.items[2].tokens]);
  validateRuntimeResponse(lesson.items[7],lesson.items[7].scenarios.map(s=>s.answer));
  assert.throws(()=>validateRuntimeResponse(lesson.items[0],'invalid'),err=>err instanceof LessonPlayerContractError && err.code==='LESSON_RUNTIME_SINGLE_CHOICE_RESPONSE_INVALID');
  assert.throws(()=>validateRuntimeResponse(lesson.items[2],['MAI']),err=>err instanceof LessonPlayerContractError && err.code==='LESSON_RUNTIME_ORDER_RESPONSE_INVALID');
}

{
  const wrong=lesson.items[0].choices.find(x=>x!==lesson.items[0].correctAnswer);
  const intent=planRuntimeResponse(lesson,[],'E01',wrong);
  assert.equal(intent.payload.correct,false);
  assert.equal(intent.payload.advance,false);
}

{
  const l=structuredClone(lesson);
  l.items=l.items.filter(item=>item.id!=='E06' && item.id!=='E07');
  const events=[ev(EventType.SESSION_STARTED,1,null,{recoveredFromSeq:0})];
  let seq=2;
  for (const item of l.items.slice(0,-1)) {
    const response=correct(item), scored=scoreItem(item,response);
    events.push(ev(EventType.ITEM_ANSWERED,seq++,item.id,{response,correct:scored.correct,humanReviewRequired:scored.humanReviewRequired,advance:scored.correct===true}));
  }
  const item=l.items.at(-1), response=correct(item);
  assert.deepEqual(planRuntimeResponse(l,events,item.id,response),planRuntimeResponse(l,events,item.id,response));
}

{
  const item=lesson.items.find(x=>x.type==='listen_repeat');
  const d=describeRuntimeItem(item);
  assert.equal(d.answerable,false);
  assert.equal(d.requiresHumanReview,true);
  assert.throws(()=>validateRuntimeResponse(item,'x'),err=>err instanceof LessonPlayerContractError && err.code==='LESSON_RUNTIME_RESPONSE_DEFERRED_TO_HUMAN_WORKFLOW');
}

console.log('RPM_S3_2_LESSON_RUNTIME_PASS six-types safe-descriptors response-shapes wrong-no-advance checkpoint-deterministic speaking-external');
