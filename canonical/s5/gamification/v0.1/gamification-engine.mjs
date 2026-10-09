import { EventType, analyseLearningReplay, validateLessonContentContract } from '../../../s2b/v2.6/model.mjs';

export const GAMIFICATION_ENGINE_VERSION=1;
export const CONFIG_REQUIRED_FEATURES=Object.freeze(['STREAK','DAILY_GOAL','WEEKLY_PROGRESS','LEVEL_MAP','BADGES']);

export class GamificationEngineError extends Error{
  constructor(code,detail={}){super(code);this.name='GamificationEngineError';this.code=code;this.detail=detail;}
}
const fail=(code,detail={})=>{throw new GamificationEngineError(code,detail);};
const freeze=value=>{if(!value||typeof value!=='object'||Object.isFrozen(value))return value;for(const child of Object.values(value))freeze(child);return Object.freeze(value);};

function validateLesson(lesson){
  if(lesson?.source?.lane!=='RLS-07'||lesson?.source?.audience!=='16+') fail('GAMIFICATION_SOURCE_LANE_BLOCKED',{lane:lesson?.source?.lane??null,audience:lesson?.source?.audience??null});
  const contract=validateLessonContentContract(lesson);
  if(!contract.valid) fail('GAMIFICATION_LESSON_CONTRACT_INVALID',{code:contract.code});
}

function deriveXpProvenance(events){
  const attempts=new Map(); let total=0; const sourceEventIds=[];
  for(const event of events){
    if(event.type!==EventType.ITEM_ANSWERED) continue;
    const attempt=(attempts.get(event.itemId)||0)+1;
    attempts.set(event.itemId,attempt);
    if(event.payload?.correct===true){
      total+=attempt===1?10:6;
      sourceEventIds.push(event.eventId);
    }
  }
  return {total,sourceEventIds:sourceEventIds.sort()};
}

export function deriveGamificationSnapshot({lesson,events}){
  validateLesson(lesson);
  if(!Array.isArray(events)) fail('GAMIFICATION_EVENTS_REQUIRED');
  const replay=analyseLearningReplay(lesson,events);
  if(!replay.valid) fail('GAMIFICATION_REPLAY_INVALID',{code:replay.code,breakInfo:replay.breakInfo});
  const xp=deriveXpProvenance(replay.events);
  if(xp.total!==replay.state.xp) fail('GAMIFICATION_XP_DERIVATION_MISMATCH',{derived:xp.total,replay:replay.state.xp});
  const disabled=Object.fromEntries(CONFIG_REQUIRED_FEATURES.map(feature=>[feature,freeze({
    status:'CONFIG_REQUIRED',
    value:null,
    ruleSource:'NO_CANONICAL_THRESHOLD_OR_CADENCE_IN_SSOT'
  })]));
  return freeze({
    gamificationEngineVersion:GAMIFICATION_ENGINE_VERSION,
    lessonId:lesson.lessonId,
    contentVersion:lesson.contentVersion,
    sourceLane:'RLS-07',
    audience:'16+',
    motivationOnly:true,
    xp:freeze({status:'ACTIVE',value:xp.total,source:'CANONICAL_REPLAY_XP',sourceEventIds:xp.sourceEventIds}),
    features:freeze(disabled),
    masteryAuthority:false,
    spacedReviewAuthority:false,
    screenTimeAuthority:false,
    validatedTimeAuthority:false,
    complianceAuthority:false,
    certificateAuthority:false,
    legalAuthority:false
  });
}
