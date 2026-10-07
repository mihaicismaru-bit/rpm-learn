import assert from 'node:assert/strict';
import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { LessonPlayerSessionController } from '../../../s3/lesson-player/v0.1/session-controller.mjs';
import { S3MemoryEventStore, correctLessonResponse } from '../../../s3/lesson-player/v0.1/s3-test-support.mjs';
import { deriveGamificationSnapshot, GamificationEngineError } from './gamification-engine.mjs';

const scope={subjectId:'learner-s53',organisationId:'org-s53',role:'LEARNER'};
const reject=(fn,code)=>assert.throws(fn,e=>e instanceof GamificationEngineError&&e.code===code,code);
async function setup(id){
  const store=new S3MemoryEventStore();let tick=1000;
  const controller=new LessonPlayerSessionController({lesson,eventStore:store,scope,sessionId:id,now:()=>tick+=1000});
  const view=await controller.start(); return {store,controller,view};
}
{
  const {store,controller,view}=await setup('first');
  await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  const g=deriveGamificationSnapshot({lesson,events:store.events});
  assert.equal(g.xp.value,10); assert.equal(g.xp.status,'ACTIVE'); assert.equal(g.motivationOnly,true);
  for(const key of ['STREAK','DAILY_GOAL','WEEKLY_PROGRESS','LEVEL_MAP','BADGES']){
    assert.equal(g.features[key].status,'CONFIG_REQUIRED'); assert.equal(g.features[key].value,null);
  }
  assert.equal(g.validatedTimeAuthority,false);assert.equal(g.screenTimeAuthority,false);assert.equal(g.complianceAuthority,false);
  assert.equal(g.masteryAuthority,false);assert.equal(g.spacedReviewAuthority,false);assert.equal(g.certificateAuthority,false);assert.equal(g.legalAuthority,false);
  assert.equal(Object.prototype.hasOwnProperty.call(g,'activeMs'),false);
}
{
  const {store,controller,view}=await setup('retry');
  await controller.answer(view.currentItem.id,'Am terminat.');
  const retry=(await controller.refresh()).currentItem;
  await controller.answer(retry.id,correctLessonResponse(retry));
  const g=deriveGamificationSnapshot({lesson,events:store.events});
  assert.equal(g.xp.value,6);
  assert.equal(g.xp.sourceEventIds.length,1);
}
{
  const {store,controller,view}=await setup('deterministic');
  await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  const a=deriveGamificationSnapshot({lesson,events:store.events});
  const b=deriveGamificationSnapshot({lesson,events:[...store.events].reverse()});
  assert.deepEqual(a,b);assert.equal(Object.isFrozen(a),true);assert.equal(Object.isFrozen(a.features),true);
}
{
  const bad=structuredClone(lesson);bad.source.lane='RLS-08';
  reject(()=>deriveGamificationSnapshot({lesson:bad,events:[]}), 'GAMIFICATION_SOURCE_LANE_BLOCKED');
}
{
  const {store,controller,view}=await setup('invalid-replay');
  await controller.answer(view.currentItem.id,correctLessonResponse(view.currentItem));
  store.events[0].seq=99;
  reject(()=>deriveGamificationSnapshot({lesson,events:store.events}), 'GAMIFICATION_REPLAY_INVALID');
}
console.log('RPM_S5_3_GAMIFICATION_PASS canonical-xp motivation-only config-required-uninvented-streak-daily-weekly-level-badges deterministic-provenance no-mastery-spacedreview-screen-validtime-compliance-certificate-legal-authority');
