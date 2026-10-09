import assert from 'node:assert/strict';
import { buildSpacedReviewPlan, SpacedReviewError } from './spaced-review.mjs';

const baseSkill=(overrides={})=>({
  skill:'skill-a',score:0,state:'NEW',attempts:0,correctFirstAttempt:0,correctAfterRetry:0,wrongAnswers:0,checkpointPasses:0,speakingValidations:0,
  teacherValidationRequired:false,teacherValidated:false,reviewSignal:'NONE',sourceEventIds:[],sourceReviewIds:[],...overrides
});
const snapshot=(skills)=>({
  masteryEngineVersion:1,masteryRuleVersion:'0.1',lessonId:'RLS07-X',contentVersion:'v1',sourceLane:'RLS-07',audience:'16+',
  states:['NEW','LEARNING','PRACTISING','STABLE'],hintPolicy:'NOT_MODELED_V0_1_RETRY_WEIGHTING_ONLY',pedagogicalOnly:true,
  complianceAuthority:false,xpAuthority:false,gamificationAuthority:false,validatedTimeAuthority:false,certificateAuthority:false,legalAuthority:false,
  replayHeadSeq:10,skills
});
const reject=(value,code)=>assert.throws(()=>buildSpacedReviewPlan(value),e=>e instanceof SpacedReviewError&&e.code===code,code);

{
  const plan=buildSpacedReviewPlan(snapshot([
    baseSkill({skill:'new'}),
    baseSkill({skill:'learning',score:2,state:'LEARNING',attempts:1,correctFirstAttempt:1,sourceEventIds:['e1']}),
    baseSkill({skill:'practising',score:3,state:'PRACTISING',attempts:2,correctFirstAttempt:1,correctAfterRetry:1,sourceEventIds:['e2']}),
    baseSkill({skill:'stable',score:6,state:'STABLE',attempts:3,correctFirstAttempt:3,sourceEventIds:['e3']})
  ]));
  const by=Object.fromEntries(plan.entries.map(x=>[x.skill,x]));
  assert.equal(by.new.band,'NOT_YET_ELIGIBLE');
  assert.equal(by.learning.band,'NEAR_TERM');
  assert.equal(by.practising.band,'STANDARD');
  assert.equal(by.stable.band,'EXTENDED');
  assert.equal(by.learning.clockDelayMs,null); assert.equal(by.stable.absoluteDueAt,null);
  assert.equal(plan.schedulingBasis,'SYMBOLIC_ONLY_NO_NUMERIC_INTERVALS_IN_SSOT');
}
{
  const plan=buildSpacedReviewPlan(snapshot([
    baseSkill({skill:'wrong-stable',score:6,state:'STABLE',attempts:4,correctFirstAttempt:3,wrongAnswers:1,reviewSignal:'NEAR_TERM_REQUIRED',sourceEventIds:['w1']}),
    baseSkill({skill:'support',attempts:1,teacherValidationRequired:true,reviewSignal:'SUPPORT_REQUIRED',sourceEventIds:['s1'],sourceReviewIds:['r1']}),
    baseSkill({skill:'pending-speaking',attempts:1,teacherValidationRequired:true,sourceEventIds:['sp1']})
  ]));
  const by=Object.fromEntries(plan.entries.map(x=>[x.skill,x]));
  assert.equal(by['wrong-stable'].band,'NEAR_TERM');
  assert.equal(by.support.band,'SUPPORT_FIRST'); assert.equal(by.support.eligibleForRetrieval,false);
  assert.equal(by['pending-speaking'].band,'HOLD_HUMAN_REVIEW'); assert.equal(by['pending-speaking'].eligibleForRetrieval,false);
}
{
  const plan=buildSpacedReviewPlan(snapshot([
    baseSkill({skill:'speaking-valid',score:2,state:'LEARNING',attempts:1,speakingValidations:1,teacherValidationRequired:true,teacherValidated:true,sourceEventIds:['sp2'],sourceReviewIds:['rv']})
  ]));
  assert.equal(plan.entries[0].band,'NEAR_TERM');
  assert.deepEqual(plan.entries[0].sourceReviewIds,['rv']);
  assert.equal(plan.validatedTimeAuthority,false); assert.equal(plan.xpAuthority,false); assert.equal(plan.gamificationAuthority,false);
  assert.equal(Object.isFrozen(plan),true); assert.equal(Object.isFrozen(plan.entries[0]),true);
}
{
  const a=snapshot([baseSkill({skill:'b',score:3,state:'PRACTISING',attempts:2}),baseSkill({skill:'a',score:2,state:'LEARNING',attempts:1})]);
  const b=structuredClone(a); b.skills.reverse();
  assert.deepEqual(buildSpacedReviewPlan(a),buildSpacedReviewPlan(b));
}
{
  const bad=snapshot([baseSkill({score:2,state:'STABLE',attempts:1})]);
  reject(bad,'SPACED_REVIEW_SKILL_STATE_SCORE_MISMATCH');
}
{
  const bad=snapshot([baseSkill({attempts:1})]); bad.xpAuthority=true;
  reject(bad,'SPACED_REVIEW_AUTHORITY_CONTAMINATION');
}
{
  const bad=snapshot([baseSkill({attempts:1})]); bad.sourceLane='RLS-08';
  reject(bad,'SPACED_REVIEW_SOURCE_LANE_BLOCKED');
}

console.log('RPM_S5_2_SPACED_REVIEW_PASS symbolic-bands no-fabricated-clock-intervals repeated-correct-rarer wrong-near-term support-first human-review-hold deterministic-provenance pedagogical-only no-xp-gamification-validtime-compliance-certificate-legal-authority');
