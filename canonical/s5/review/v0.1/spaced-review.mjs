export const SPACED_REVIEW_VERSION = 1;
export const REVIEW_BANDS = Object.freeze([
  'NOT_YET_ELIGIBLE',
  'HOLD_HUMAN_REVIEW',
  'SUPPORT_FIRST',
  'NEAR_TERM',
  'STANDARD',
  'EXTENDED'
]);

export class SpacedReviewError extends Error {
  constructor(code, detail={}) { super(code); this.name='SpacedReviewError'; this.code=code; this.detail=detail; }
}
const fail=(code,detail={})=>{ throw new SpacedReviewError(code,detail); };
const freeze=value=>{
  if(!value||typeof value!=='object'||Object.isFrozen(value)) return value;
  for(const child of Object.values(value)) freeze(child);
  return Object.freeze(value);
};
const exactKeys=(value,expected,code)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)) fail(code);
  const actual=Object.keys(value).sort(), wanted=[...expected].sort();
  if(actual.length!==wanted.length||actual.some((key,index)=>key!==wanted[index])) fail(code,{actual,expected:wanted});
};
const SNAPSHOT_KEYS=Object.freeze(['masteryEngineVersion','masteryRuleVersion','lessonId','contentVersion','sourceLane','audience','states','hintPolicy','pedagogicalOnly','complianceAuthority','xpAuthority','gamificationAuthority','validatedTimeAuthority','certificateAuthority','legalAuthority','replayHeadSeq','skills']);
const SKILL_KEYS=Object.freeze(['skill','score','state','attempts','correctFirstAttempt','correctAfterRetry','wrongAnswers','checkpointPasses','speakingValidations','teacherValidationRequired','teacherValidated','reviewSignal','sourceEventIds','sourceReviewIds']);
const stateForScore=score=>score>=6?'STABLE':score>=3?'PRACTISING':score>=1?'LEARNING':'NEW';

function validateMasterySnapshot(snapshot){
  exactKeys(snapshot,SNAPSHOT_KEYS,'SPACED_REVIEW_MASTERY_SNAPSHOT_SHAPE_INVALID');
  if(snapshot.masteryEngineVersion!==1||snapshot.masteryRuleVersion!=='0.1') fail('SPACED_REVIEW_MASTERY_VERSION_INVALID');
  if(snapshot.sourceLane!=='RLS-07'||snapshot.audience!=='16+') fail('SPACED_REVIEW_SOURCE_LANE_BLOCKED');
  if(snapshot.pedagogicalOnly!==true||snapshot.complianceAuthority!==false||snapshot.xpAuthority!==false||snapshot.gamificationAuthority!==false||snapshot.validatedTimeAuthority!==false||snapshot.certificateAuthority!==false||snapshot.legalAuthority!==false) fail('SPACED_REVIEW_AUTHORITY_CONTAMINATION');
  if(!Array.isArray(snapshot.skills)) fail('SPACED_REVIEW_SKILLS_REQUIRED');
  for(const row of snapshot.skills){
    exactKeys(row,SKILL_KEYS,'SPACED_REVIEW_SKILL_SHAPE_INVALID');
    if(typeof row.skill!=='string'||!row.skill.trim()) fail('SPACED_REVIEW_SKILL_ID_INVALID');
    if(!Number.isInteger(row.score)||row.score<0||row.state!==stateForScore(row.score)) fail('SPACED_REVIEW_SKILL_STATE_SCORE_MISMATCH',{skill:row.skill,score:row.score,state:row.state});
    for(const field of ['attempts','correctFirstAttempt','correctAfterRetry','wrongAnswers','checkpointPasses','speakingValidations']){
      if(!Number.isInteger(row[field])||row[field]<0) fail('SPACED_REVIEW_SKILL_COUNT_INVALID',{skill:row.skill,field});
    }
    if(typeof row.teacherValidationRequired!=='boolean'||typeof row.teacherValidated!=='boolean') fail('SPACED_REVIEW_TEACHER_FLAG_INVALID',{skill:row.skill});
    if(row.teacherValidated&& !row.teacherValidationRequired) fail('SPACED_REVIEW_UNBOUND_TEACHER_VALIDATION',{skill:row.skill});
    if(!['NONE','NEAR_TERM_REQUIRED','SUPPORT_REQUIRED'].includes(row.reviewSignal)) fail('SPACED_REVIEW_SIGNAL_INVALID',{skill:row.skill});
    if(!Array.isArray(row.sourceEventIds)||!Array.isArray(row.sourceReviewIds)) fail('SPACED_REVIEW_PROVENANCE_INVALID',{skill:row.skill});
  }
  return snapshot;
}

function planSkill(row){
  let band, action, eligibleForRetrieval;
  if(row.reviewSignal==='SUPPORT_REQUIRED'){
    band='SUPPORT_FIRST'; action='SUPPORT_BEFORE_REVIEW'; eligibleForRetrieval=false;
  } else if(row.reviewSignal==='NEAR_TERM_REQUIRED'){
    band='NEAR_TERM'; action='RETRIEVE_NEAR_TERM'; eligibleForRetrieval=true;
  } else if(row.teacherValidationRequired && row.attempts>0 && !row.teacherValidated){
    band='HOLD_HUMAN_REVIEW'; action='WAIT_FOR_HUMAN_REVIEW'; eligibleForRetrieval=false;
  } else if(row.attempts===0){
    band='NOT_YET_ELIGIBLE'; action='NO_REVIEW_BEFORE_EVIDENCE'; eligibleForRetrieval=false;
  } else if(row.state==='STABLE'){
    band='EXTENDED'; action='RETRIEVE_EXTENDED'; eligibleForRetrieval=true;
  } else if(row.state==='PRACTISING'){
    band='STANDARD'; action='RETRIEVE_STANDARD'; eligibleForRetrieval=true;
  } else {
    band='NEAR_TERM'; action='RETRIEVE_NEAR_TERM'; eligibleForRetrieval=true;
  }
  return freeze({
    skill:row.skill,
    masteryState:row.state,
    masteryScore:row.score,
    reviewSignal:row.reviewSignal,
    band,
    action,
    eligibleForRetrieval,
    clockDelayMs:null,
    absoluteDueAt:null,
    sourceEventIds:[...row.sourceEventIds].sort(),
    sourceReviewIds:[...row.sourceReviewIds].sort()
  });
}

export function buildSpacedReviewPlan(masterySnapshot){
  validateMasterySnapshot(masterySnapshot);
  const entries=masterySnapshot.skills.map(planSkill).sort((a,b)=>a.skill.localeCompare(b.skill));
  return freeze({
    spacedReviewVersion:SPACED_REVIEW_VERSION,
    masteryEngineVersion:masterySnapshot.masteryEngineVersion,
    masteryRuleVersion:masterySnapshot.masteryRuleVersion,
    lessonId:masterySnapshot.lessonId,
    contentVersion:masterySnapshot.contentVersion,
    sourceLane:'RLS-07',
    audience:'16+',
    schedulingBasis:'SYMBOLIC_ONLY_NO_NUMERIC_INTERVALS_IN_SSOT',
    repeatedCorrectPolicy:'RARER_BAND_BY_MASTERY_STATE',
    wrongAnswerPolicy:'RETURN_TO_NEAR_TERM_REVIEW',
    teacherPendingPolicy:'HOLD_UNTIL_HUMAN_REVIEW',
    pedagogicalOnly:true,
    complianceAuthority:false,
    xpAuthority:false,
    gamificationAuthority:false,
    validatedTimeAuthority:false,
    certificateAuthority:false,
    legalAuthority:false,
    entries
  });
}
