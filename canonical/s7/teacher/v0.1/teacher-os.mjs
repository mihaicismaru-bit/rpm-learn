import { EventType, analyseLearningReplay, validateLessonContentContract } from '../../../s2b/v2.6/model.mjs';

export const TEACHER_OS_VERSION=1;
export const TEACHER_VALIDATION_KINDS=Object.freeze(['PERIODIC','FINAL']);
export const TEACHER_VALIDATION_DECISIONS=Object.freeze(['VALID','RETRY','NEEDS_SUPPORT']);

export class TeacherOsError extends Error{
  constructor(code,detail={}){super(code);this.name='TeacherOsError';this.code=code;this.detail=detail;}
}
const fail=(code,detail={})=>{throw new TeacherOsError(code,detail);};
const freeze=value=>{if(!value||typeof value!=='object'||Object.isFrozen(value))return value;for(const child of Object.values(value))freeze(child);return Object.freeze(value);};
const req=(value,field,max=512)=>{if(typeof value!=='string'||!value.trim()||value.length>max)fail('TEACHER_OS_STRING_REQUIRED',{field,max});return value;};
const exactKeys=(value,expected,code)=>{if(!value||typeof value!=='object'||Array.isArray(value))fail(code);const a=Object.keys(value).sort(),w=[...expected].sort();if(a.length!==w.length||a.some((k,i)=>k!==w[i]))fail(code,{actual:a,expected:w});};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

function assertTeacher(teacher){
  exactKeys(teacher,['teacherId','organisationId','role'],'TEACHER_OS_TEACHER_SHAPE_INVALID');
  req(teacher.teacherId,'teacher.teacherId',256);req(teacher.organisationId,'teacher.organisationId',256);
  if(teacher.role!=='TEACHER') fail('TEACHER_OS_ROLE_FORBIDDEN',{role:teacher.role??null});
  return freeze({...teacher});
}
function assertLesson(lesson){
  if(lesson?.source?.lane!=='RLS-07'||lesson?.source?.audience!=='16+')fail('TEACHER_OS_SOURCE_LANE_BLOCKED');
  const contract=validateLessonContentContract(lesson);if(!contract.valid)fail('TEACHER_OS_LESSON_CONTRACT_INVALID',{code:contract.code});
}
function assertBoundSnapshot(snapshot,lesson,code){
  if(!snapshot||snapshot.lessonId!==lesson.lessonId||snapshot.contentVersion!==lesson.contentVersion||snapshot.sourceLane!=='RLS-07')fail(code);
}
function reviewMap(humanReviews,events,organisationId){
  if(!Array.isArray(humanReviews))fail('TEACHER_OS_REVIEWS_REQUIRED');
  const speaking=new Map(events.filter(e=>e.type===EventType.SPEAKING_SUBMITTED).map(e=>[e.eventId,e]));
  const map=new Map();
  for(const record of humanReviews){
    const event=speaking.get(record?.speakingEventId)||null;
    if(!event)fail('TEACHER_OS_REVIEW_SOURCE_MISSING',{reviewId:record?.reviewId??null});
    if(record.organisationId!==organisationId||event.organisationId!==organisationId)fail('TEACHER_OS_CROSS_TENANT_REVIEW_FORBIDDEN');
    if(record.lessonId!==event.lessonId||record.contentVersion!==event.contentVersion||record.itemId!==event.itemId||record.learnerSubjectId!==event.subjectId)fail('TEACHER_OS_REVIEW_PROVENANCE_MISMATCH');
    if(!TEACHER_VALIDATION_DECISIONS.includes(record.decision))fail('TEACHER_OS_REVIEW_DECISION_INVALID');
    if(map.has(record.speakingEventId))fail('TEACHER_OS_DUPLICATE_REVIEW_DECISION');
    map.set(record.speakingEventId,record);
  }
  return map;
}
function assessmentSummary(lesson,events){
  const attempts=new Map();
  for(const event of events){
    if(event.type!==EventType.ITEM_ANSWERED)continue;
    const item=lesson.items.find(x=>x.id===event.itemId);if(!item)continue;
    const key=item.evidenceClass;
    const row=attempts.get(key)||{evidenceClass:key,attempts:0,correct:0,incorrect:0,skills:new Set()};
    row.attempts+=1;
    if(event.payload?.correct===true)row.correct+=1;else row.incorrect+=1;
    row.skills.add(item.skill);attempts.set(key,row);
  }
  return [...attempts.values()].sort((a,b)=>a.evidenceClass.localeCompare(b.evidenceClass)).map(row=>freeze({
    evidenceClass:row.evidenceClass,attempts:row.attempts,correct:row.correct,incorrect:row.incorrect,skills:[...row.skills].sort()
  }));
}

export function buildTeacherLearnerView({lesson,events,masterySnapshot,learningTimeLedger,humanReviews=[],teacher}){
  assertLesson(lesson);const safeTeacher=assertTeacher(teacher);
  if(!Array.isArray(events))fail('TEACHER_OS_EVENTS_REQUIRED');
  const replay=analyseLearningReplay(lesson,events,{trustedHumanReviews:humanReviews});if(!replay.valid)fail('TEACHER_OS_REPLAY_INVALID',{code:replay.code});
  const learnerOrganisationId=replay.events[0]?.organisationId??safeTeacher.organisationId;
  const learnerSubjectId=replay.events[0]?.subjectId??null;
  if(learnerOrganisationId!==safeTeacher.organisationId)fail('TEACHER_OS_CROSS_TENANT_FORBIDDEN');
  assertBoundSnapshot(masterySnapshot,lesson,'TEACHER_OS_MASTERY_BINDING_INVALID');
  assertBoundSnapshot(learningTimeLedger,lesson,'TEACHER_OS_TIME_LEDGER_BINDING_INVALID');
  if(masterySnapshot.complianceAuthority!==false||learningTimeLedger.legalComplianceAuthority!==false)fail('TEACHER_OS_AUTHORITY_CONTAMINATION');
  if(learningTimeLedger.organisationId!==null&&learningTimeLedger.organisationId!==safeTeacher.organisationId)fail('TEACHER_OS_TIME_LEDGER_TENANT_MISMATCH');
  if(learnerSubjectId&&learningTimeLedger.subjectId!==null&&learningTimeLedger.subjectId!==learnerSubjectId)fail('TEACHER_OS_TIME_LEDGER_SUBJECT_MISMATCH');
  const reviews=reviewMap(humanReviews,replay.events,safeTeacher.organisationId);

  const speakingReviewQueue=replay.events.filter(e=>e.type===EventType.SPEAKING_SUBMITTED).map(event=>{
    const review=reviews.get(event.eventId)||null;
    return freeze({
      speakingEventId:event.eventId,itemId:event.itemId,mediaRef:event.payload.mediaRef,evidenceClass:event.payload.evidenceClass,
      sourceObserved:event.payload.sourceObserved,sourceArtifactIds:[...event.payload.sourceArtifactIds].sort(),
      status:review?review.decision:'PENDING',approvalState:review?.approvalState??'PENDING',
      reviewId:review?.reviewId??null
    });
  });

  const skillProgress=masterySnapshot.skills.map(row=>freeze({
    skill:row.skill,state:row.state,reviewSignal:row.reviewSignal,teacherValidationRequired:row.teacherValidationRequired,teacherValidated:row.teacherValidated
  })).sort((a,b)=>a.skill.localeCompare(b.skill));

  const flags=[];
  for(const row of skillProgress){
    if(row.reviewSignal==='SUPPORT_REQUIRED')flags.push(freeze({type:'SUPPORT_REQUIRED',skill:row.skill}));
    if(row.reviewSignal==='NEAR_TERM_REQUIRED')flags.push(freeze({type:'NEAR_TERM_REVIEW',skill:row.skill}));
  }
  for(const queue of speakingReviewQueue)if(queue.status==='PENDING')flags.push(freeze({type:'SPEAKING_REVIEW_PENDING',itemId:queue.itemId,speakingEventId:queue.speakingEventId}));

  const lastActivityTs=replay.events.reduce((max,event)=>Math.max(max,Number(event.ts)||0),0)||null;
  const completedItems=replay.state.cursor;
  const pendingSpeaking=speakingReviewQueue.some(row=>row.status==='PENDING');
  const learnerStatus=replay.state.completed
    ? 'COMPLETED'
    : pendingSpeaking
      ? 'AWAITING_HUMAN_REVIEW'
      : replay.state.speakingPending.length
        ? 'REVIEW_RESOLVED_PATH_PENDING'
        : 'IN_PROGRESS';
  return freeze({
    teacherOsVersion:TEACHER_OS_VERSION,
    teacherId:safeTeacher.teacherId,
    organisationId:safeTeacher.organisationId,
    learnerSubjectId,
    lessonId:lesson.lessonId,
    contentVersion:lesson.contentVersion,
    learnerStatus,
    progress:freeze({completedItems,totalItems:lesson.items.length,ratio:lesson.items.length?completedItems/lesson.items.length:0}),
    validatedLearningTimeMs:learningTimeLedger.validatedLearningTimeMs,
    lastActivityTs,
    skillProgress,
    speakingReviewQueue,
    flags,
    missedLearning:freeze({status:'DEFERRED_TO_COMPLIANCE_ENGINE',deficitMs:null,rule:'S10_LEGAL_CONFIGURATION_REQUIRED'}),
    assessmentEvidence:assessmentSummary(lesson,replay.events),
    evidenceBinding:freeze({
      masteryRuleVersion:masterySnapshot.masteryRuleVersion,
      masteryReplayHeadSeq:masterySnapshot.replayHeadSeq,
      learningTimeLedgerVersion:learningTimeLedger.ledgerVersion,
      learningTimeEntryCount:learningTimeLedger.entryCount
    }),
    rawLearnerResponsesExposed:false,
    xpExposed:false,
    gamificationExposed:false,
    certificateAuthority:false,
    legalAuthority:false,
    complianceRuleAuthority:false
  });
}

const VALIDATION_RECORD_KEYS=Object.freeze(['teacherValidationVersion','validationId','clientValidationId','validationKind','decision','teacherId','organisationId','learnerSubjectId','lessonId','contentVersion','validatedAt','masteryRuleVersion','masteryReplayHeadSeq','learningTimeLedgerVersion','learningTimeEntryCount','validatedLearningTimeMs','speakingPendingCount','certificateAuthority','legalAuthority','complianceAuthority']);

function assertValidationRecord(record){
  exactKeys(record,VALIDATION_RECORD_KEYS,'TEACHER_VALIDATION_RECORD_SHAPE_INVALID');
  if(record.teacherValidationVersion!==1||!TEACHER_VALIDATION_KINDS.includes(record.validationKind)||!TEACHER_VALIDATION_DECISIONS.includes(record.decision))fail('TEACHER_VALIDATION_RECORD_INVALID');
  if(record.certificateAuthority!==false||record.legalAuthority!==false||record.complianceAuthority!==false)fail('TEACHER_VALIDATION_AUTHORITY_ESCALATION');
  return record;
}

export function createTeacherValidationService({validationStore,teacher,now=()=>Date.now()}){
  const safeTeacher=assertTeacher(teacher);
  for(const method of ['open','listValidations','appendValidation'])if(typeof validationStore?.[method]!=='function')fail('TEACHER_VALIDATION_STORE_PORT_INVALID',{missingMethod:method});
  return Object.freeze({
    async validate({teacherView,clientValidationId,validationKind,decision}){
      req(clientValidationId,'clientValidationId',128);
      if(!TEACHER_VALIDATION_KINDS.includes(validationKind))fail('TEACHER_VALIDATION_KIND_INVALID');
      if(!TEACHER_VALIDATION_DECISIONS.includes(decision))fail('TEACHER_VALIDATION_DECISION_INVALID');
      if(!teacherView||teacherView.teacherOsVersion!==1||teacherView.teacherId!==safeTeacher.teacherId||teacherView.organisationId!==safeTeacher.organisationId)fail('TEACHER_VALIDATION_VIEW_BINDING_INVALID');
      if(validationKind==='FINAL'&&teacherView.speakingReviewQueue.some(row=>row.status==='PENDING'))fail('TEACHER_FINAL_VALIDATION_SPEAKING_PENDING');
      if(validationKind==='FINAL'&&teacherView.learnerStatus!=='COMPLETED')fail('TEACHER_FINAL_VALIDATION_PATH_INCOMPLETE',{learnerStatus:teacherView.learnerStatus});
      await validationStore.open();
      const history=await validationStore.listValidations();if(!Array.isArray(history))fail('TEACHER_VALIDATION_HISTORY_INVALID');
      for(const record of history)assertValidationRecord(record);
      const existing=history.find(record=>record.clientValidationId===clientValidationId)||null;
      if(existing){
        if(existing.validationKind!==validationKind||existing.decision!==decision||existing.learnerSubjectId!==teacherView.learnerSubjectId||existing.lessonId!==teacherView.lessonId||existing.contentVersion!==teacherView.contentVersion)fail('TEACHER_VALIDATION_CLIENT_ID_REUSE_MISMATCH');
        return freeze({...existing,persistence:'IDEMPOTENT_REPLAY'});
      }
      const record=freeze({
        teacherValidationVersion:1,validationId:`${teacherView.learnerSubjectId}:${teacherView.lessonId}:${validationKind}:${clientValidationId}`,
        clientValidationId,validationKind,decision,teacherId:safeTeacher.teacherId,organisationId:safeTeacher.organisationId,
        learnerSubjectId:teacherView.learnerSubjectId,lessonId:teacherView.lessonId,contentVersion:teacherView.contentVersion,validatedAt:Number(now()),
        masteryRuleVersion:teacherView.evidenceBinding.masteryRuleVersion,
        masteryReplayHeadSeq:teacherView.evidenceBinding.masteryReplayHeadSeq,
        learningTimeLedgerVersion:teacherView.evidenceBinding.learningTimeLedgerVersion,
        learningTimeEntryCount:teacherView.evidenceBinding.learningTimeEntryCount,
        validatedLearningTimeMs:teacherView.validatedLearningTimeMs,speakingPendingCount:teacherView.speakingReviewQueue.filter(row=>row.status==='PENDING').length,
        certificateAuthority:false,legalAuthority:false,complianceAuthority:false
      });
      let outcome;try{outcome=await validationStore.appendValidation(record);}catch(error){fail('TEACHER_VALIDATION_PERSIST_FAILED',{cause:error?.code??error?.message??String(error)});}
      if(!outcome||!['appended','duplicate'].includes(outcome.status))fail('TEACHER_VALIDATION_PERSIST_OUTCOME_INVALID');
      const readback=await validationStore.listValidations();const saved=readback.find(x=>x.validationId===record.validationId)||null;
      if(!saved)fail('TEACHER_VALIDATION_READBACK_MISSING');assertValidationRecord(saved);
      if(!same(saved,record))fail('TEACHER_VALIDATION_READBACK_MISMATCH');
      return freeze({...saved,persistence:outcome.status==='duplicate'?'IDEMPOTENT_STORE':'PERSISTED'});
    }
  });
}
