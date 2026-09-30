import assert from 'node:assert/strict';
import { lesson } from './fixture.mjs';
import { validateLessonContentContract, LESSON_CONTENT_POLICY_VERSION } from './model.mjs';

const ok=validateLessonContentContract(lesson);
assert.equal(ok.valid,true);
assert.equal(ok.code,'LESSON_CONTENT_CONTRACT_PASS');
assert.equal(ok.policyVersion,LESSON_CONTENT_POLICY_VERSION);
assert.equal(ok.lane,'RLS-07');
assert.equal(ok.audience,'16+');
assert.equal(ok.level,'preA1');

assert.equal(validateLessonContentContract({...structuredClone(lesson),source:{...lesson.source,lane:'RLS-04',audience:'11–15'}}).code,'LESSON_SOURCE_LANE_NOT_AUTHORIZED_ADULT');
assert.equal(validateLessonContentContract({...structuredClone(lesson),source:{...lesson.source,lane:'RLS-08',level:'A2'}}).code,'LESSON_SOURCE_LEVEL_MISMATCH');
assert.equal(validateLessonContentContract({...structuredClone(lesson),source:{...lesson.source,artifactIds:[lesson.source.artifactIds[0],lesson.source.artifactIds[0]]}}).code,'LESSON_SOURCE_ARTIFACT_IDS_INVALID');
const dup=structuredClone(lesson); dup.items[1].id=dup.items[0].id;
assert.equal(validateLessonContentContract(dup).code,'LESSON_ITEM_ID_DUPLICATE');
const badSpeaking=structuredClone(lesson); badSpeaking.items.find(x=>x.id==='E06').teacherReviewRequired=false;
assert.equal(validateLessonContentContract(badSpeaking).code,'LESSON_SPEAKING_HUMAN_GATE_REQUIRED');
const badChoice=structuredClone(lesson); badChoice.items.find(x=>x.id==='E01').correctAnswer='ALTCEVA';
assert.equal(validateLessonContentContract(badChoice).code,'LESSON_ITEM_CORRECT_ANSWER_INVALID');
const badCheckpoint=structuredClone(lesson); badCheckpoint.items.find(x=>x.id==='E08').scoringRule.minCorrect=99;
assert.equal(validateLessonContentContract(badCheckpoint).code,'LESSON_CHECKPOINT_SCORING_INVALID');

console.log('RPM_S2_CONTENT_CONTRACT_PASS adult-source-lanes unique-items deterministic-scoring speaking-human-gate source-provenance');
