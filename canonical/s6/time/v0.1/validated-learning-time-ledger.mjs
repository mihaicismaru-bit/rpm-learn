import { EventType, analyseLearningReplay, validateLessonContentContract } from '../../../s2b/v2.6/model.mjs';

export const VALIDATED_LEARNING_TIME_LEDGER_VERSION=1;

export class LearningTimeLedgerError extends Error{
  constructor(code,detail={}){super(code);this.name='LearningTimeLedgerError';this.code=code;this.detail=detail;}
}
const fail=(code,detail={})=>{throw new LearningTimeLedgerError(code,detail);};
const freeze=value=>{if(!value||typeof value!=='object'||Object.isFrozen(value))return value;for(const child of Object.values(value))freeze(child);return Object.freeze(value);};
const req=(value,field,max=512)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail('LEARNING_TIME_STRING_REQUIRED',{field,max});return value;};

function validateLesson(lesson){
  if(lesson?.source?.lane!=='RLS-07'||lesson?.source?.audience!=='16+') fail('LEARNING_TIME_SOURCE_LANE_BLOCKED',{lane:lesson?.source?.lane??null,audience:lesson?.source?.audience??null});
  const contract=validateLessonContentContract(lesson);
  if(!contract.valid) fail('LEARNING_TIME_LESSON_CONTRACT_INVALID',{code:contract.code});
}

function sourceResult(source){
  if(source.type===EventType.ITEM_ANSWERED) return source.payload?.correct===true?'CORRECT':'INCORRECT';
  if(source.type===EventType.SPEAKING_SUBMITTED) return 'PENDING_HUMAN_REVIEW';
  if(source.type===EventType.AUDIO_ENDED) return 'AUDIO_COMPLETED';
  fail('LEARNING_TIME_SOURCE_TYPE_UNSUPPORTED',{type:source.type});
}

function sourceAttemptOrdinal(accepted,source){
  return accepted
    .filter(event=>event.seq<=source.seq&&event.itemId===source.itemId&&event.type===source.type)
    .length;
}

export function buildValidatedLearningTimeLedger({lesson,events,trustedHumanReviews=[]}){
  validateLesson(lesson);
  if(!Array.isArray(events)) fail('LEARNING_TIME_EVENTS_REQUIRED');
  const replay=analyseLearningReplay(lesson,events,{trustedHumanReviews});
  if(!replay.valid) fail('LEARNING_TIME_REPLAY_INVALID',{code:replay.code,breakInfo:replay.breakInfo});
  const byId=new Map(replay.events.map(event=>[event.eventId,event]));
  const entries=[];
  let excludedTimeSliceCount=0;

  for(const event of replay.events){
    if(event.type!==EventType.TIME_SLICE) continue;
    if(event.payload?.eligible!==true||Number(event.payload?.durationMs)<=0){
      excludedTimeSliceCount+=1;
      continue;
    }
    const source=byId.get(event.payload.sourceEventId)||null;
    if(!source) fail('LEARNING_TIME_SOURCE_EVENT_NOT_FOUND',{sourceEventId:event.payload.sourceEventId});
    const item=lesson.items.find(candidate=>candidate.id===source.itemId)||null;
    if(!item) fail('LEARNING_TIME_ITEM_NOT_FOUND',{itemId:source.itemId});
    if(source.subjectId!==event.subjectId||source.organisationId!==event.organisationId||source.role!=='LEARNER'||event.role!=='LEARNER'||source.sessionId!==event.sessionId){
      fail('LEARNING_TIME_SCOPE_MISMATCH',{timeSliceEventId:event.eventId,sourceEventId:source.eventId});
    }
    const durationMs=Number(event.payload.durationMs);
    const rawDurationMs=Number(event.payload.rawDurationMs);
    if(!Number.isFinite(durationMs)||durationMs<=0||!Number.isFinite(rawDurationMs)||rawDurationMs<durationMs) fail('LEARNING_TIME_DURATION_INVALID',{eventId:event.eventId});

    entries.push(freeze({
      ledgerVersion:VALIDATED_LEARNING_TIME_LEDGER_VERSION,
      subjectId:req(event.subjectId,'event.subjectId',256),
      organisationId:req(event.organisationId,'event.organisationId',256),
      role:'LEARNER',
      sessionId:req(event.sessionId,'event.sessionId',256),
      lessonId:event.lessonId,
      contentVersion:event.contentVersion,
      itemId:event.itemId,
      skill:req(item.skill,'item.skill',128),
      evidenceClass:req(item.evidenceClass,'item.evidenceClass',256),
      timeSliceEventId:event.eventId,
      timeSliceSeq:event.seq,
      sourceEventId:source.eventId,
      sourceEventSeq:source.seq,
      sourceEventType:source.type,
      basis:event.payload.basis,
      startWallTs:Number(event.payload.fromWallTs),
      endWallTs:Number(event.payload.toWallTs),
      activeDurationMs:durationMs,
      rawDurationMs,
      idleGapSuppressed:event.payload.idleGapSuppressed===true,
      result:sourceResult(source),
      attemptOrdinal:sourceAttemptOrdinal(replay.events,source),
      provenanceStatus:'REPLAY_VALIDATED_SOURCE_BOUND',
      administrativeCorrection:false
    }));
  }

  entries.sort((a,b)=>a.timeSliceSeq-b.timeSliceSeq);
  const validatedLearningTimeMs=entries.reduce((sum,entry)=>sum+entry.activeDurationMs,0);
  if(validatedLearningTimeMs!==replay.state.activeMs) fail('LEARNING_TIME_TOTAL_REPLAY_MISMATCH',{ledger:validatedLearningTimeMs,replay:replay.state.activeMs});

  return freeze({
    ledgerVersion:VALIDATED_LEARNING_TIME_LEDGER_VERSION,
    lessonId:lesson.lessonId,
    contentVersion:lesson.contentVersion,
    sourceLane:'RLS-07',
    audience:'16+',
    subjectId:replay.events[0]?.subjectId??null,
    organisationId:replay.events[0]?.organisationId??null,
    validatedLearningTimeMs,
    entryCount:entries.length,
    excludedTimeSliceCount,
    idlePolicy:'IDLE_NOT_COUNTED_REPLAY_POLICY',
    screenTimeAuthority:false,
    xpAuthority:false,
    gamificationAuthority:false,
    masteryAuthority:false,
    legalComplianceAuthority:false,
    weeklyComplianceRule:'DEFERRED_TO_S10_LEGAL_CONFIGURATION',
    deficitRecoveryRule:'DEFERRED_TO_S10_LEGAL_CONFIGURATION',
    administrativeCorrectionPolicy:'NO_SILENT_RETROACTIVE_CORRECTION_SEPARATE_AUDITABLE_EVENT_REQUIRED',
    entries
  });
}
