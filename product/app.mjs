import {lesson} from '../canonical/s2b/v2.6/fixture.mjs';
import {EventType,analyseLearningReplay,makeEvent,makeTimeSlicePayload,nextSequenceCandidate} from '../canonical/s2b/v2.6/model.mjs';
import {LessonPlayerSessionController} from '../canonical/s3/lesson-player/v0.1/session-controller.mjs';
import {createSpeakingSubmissionService} from '../canonical/s4/speaking/v0.1/speaking-submission.mjs';
import {createHumanReviewBridgeService} from '../canonical/s4/review/v0.1/human-review-bridge.mjs';
import {deriveMasterySnapshot} from '../canonical/s5/mastery/v0.1/mastery-engine.mjs';
import {buildValidatedLearningTimeLedger} from '../canonical/s6/time/v0.1/validated-learning-time-ledger.mjs';
import {buildTeacherLearnerView,createTeacherValidationService} from '../canonical/s7/teacher/v0.1/teacher-os.mjs';
import {buildEmployerLearnerView} from '../canonical/s8/employer/v0.1/employer-os.mjs';
import {buildReportsEvidencePack} from '../canonical/s9/reports/v0.1/reports-evidence-pack.mjs';
import {requireCertificateIssuance} from '../canonical/s11/certificate/v0.1/certificate-gate.mjs';

class BrowserEventStore{
  constructor(trustedHumanReviewProvider=null){this.lesson=null;this.events=[];this.trustedHumanReviewProvider=trustedHumanReviewProvider}
  async listTrustedHumanReviews(lessonId,contentVersion){
    if(!this.trustedHumanReviewProvider)return [];
    const rows=await this.trustedHumanReviewProvider({lessonId,contentVersion});
    return Array.isArray(rows)?rows.map(x=>structuredClone(x)):[];
  }
  async open(){return true}
  async activateContent(next){this.lesson=structuredClone(next);return {status:'initialize'}}
  async listEvents(lessonId,contentVersion){return this.events.filter(e=>e.lessonId===lessonId&&e.contentVersion===contentVersion).map(e=>structuredClone(e))}
  async inspectSequenceChain(lessonId,contentVersion){
    const [rows,trustedHumanReviews]=await Promise.all([this.listEvents(lessonId,contentVersion),this.listTrustedHumanReviews(lessonId,contentVersion)]);
    return analyseLearningReplay(this.lesson,rows,{trustedHumanReviews})
  }
  async append(event){
    const candidate=[...this.events,structuredClone(event)];
    const trustedHumanReviews=await this.listTrustedHumanReviews(event.lessonId,event.contentVersion);
    const replay=analyseLearningReplay(this.lesson,candidate,{trustedHumanReviews});
    if(!replay.valid)throw Object.assign(new Error(replay.code),{code:replay.code});
    this.events=candidate;return {status:'appended',event:structuredClone(event)}
  }
}
class ReviewStore{
  constructor(){this.rows=[]}
  async open(){}
  async listReviews(){return this.rows.map(x=>structuredClone(x))}
  async appendReview(record){const old=this.rows.find(x=>x.reviewId===record.reviewId);if(old)return {status:'duplicate',record:structuredClone(old)};this.rows.push(structuredClone(record));return {status:'appended',record:structuredClone(record)}}
}
class ValidationStore{
  constructor(){this.rows=[]}
  async open(){}
  async listValidations(){return this.rows.map(x=>structuredClone(x))}
  async appendValidation(record){const old=this.rows.find(x=>x.validationId===record.validationId);if(old)return {status:'duplicate',record:structuredClone(old)};this.rows.push(structuredClone(record));return {status:'appended',record:structuredClone(record)}}
}
const scope={subjectId:'learner-demo',organisationId:'org-demo',role:'LEARNER'};
const teacher={teacherId:'teacher-demo',organisationId:'org-demo',role:'TEACHER'};
const employer={employerId:'employer-demo',organisationId:'org-demo',role:'EMPLOYER'};
const reviewStore=new ReviewStore();
const validationStore=new ValidationStore();
const eventStore=new BrowserEventStore(async()=>reviewStore.listReviews());
let tick=Date.now(), view=null, currentRenderedAt=performance.now(), currentRenderedWall=Date.now();
const controller=new LessonPlayerSessionController({lesson,eventStore,scope,sessionId:'rpm-functional-demo',now:()=>++tick});
const speaking=createSpeakingSubmissionService({lesson,eventStore,scope,sessionId:'rpm-functional-speaking',now:()=>++tick});
const reviewer=createHumanReviewBridgeService({reviewStore,reviewer:{reviewerId:teacher.teacherId,organisationId:teacher.organisationId,role:'TEACHER'},now:()=>++tick});
const validationService=createTeacherValidationService({validationStore,teacher,now:()=>++tick});

const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const fmt=ms=>{const sec=Math.floor(ms/1000);return sec<60?`${sec}s`:`${Math.floor(sec/60)}m ${sec%60}s`};

async function events(){return eventStore.listEvents(lesson.lessonId,lesson.contentVersion)}
async function creditLatest(sourceType){
  const all=await events();const source=[...all].reverse().find(e=>e.type===sourceType);if(!source)return;
  const nowMono=performance.now(),nowWall=Date.now();
  const payload=makeTimeSlicePayload({previousMono:currentRenderedAt,currentMono:nowMono,previousWall:currentRenderedWall,currentWall:nowWall,foreground:document.visibilityState==='visible',basis:'meaningful_interaction',sourceEventType:source.type,sourceEventId:source.eventId,sourceEventSeq:source.seq});
  if(payload.durationMs<=0){currentRenderedAt=nowMono;currentRenderedWall=nowWall;return}
  const chain=await eventStore.inspectSequenceChain(lesson.lessonId,lesson.contentVersion);
  await eventStore.append(makeEvent({type:EventType.TIME_SLICE,lessonId:lesson.lessonId,contentVersion:lesson.contentVersion,seq:nextSequenceCandidate(chain.contiguousHead),itemId:source.itemId,payload,ts:nowWall,sessionId:source.sessionId,subjectId:source.subjectId,organisationId:source.organisationId,role:source.role}));
  currentRenderedAt=nowMono;currentRenderedWall=nowWall;
}
function correctResponse(item){
  if(item.type==='order_words')return [...item.tokens];
  if(item.type==='checkpoint')return item.scenarios.map(s=>s.answer);
  return item.correctAnswer;
}
async function answer(response){view=await controller.answer(view.currentItem.id,response);await creditLatest(EventType.ITEM_ANSWERED);view=await controller.refresh();renderAll()}
async function submitSpeaking(){
  await speaking.submit({itemId:'E06',mediaRef:'demo://browser-speaking-evidence',clientSubmissionId:'functional-demo-e06'});
  await creditLatest(EventType.SPEAKING_SUBMITTED);view=await controller.refresh();renderAll()
}
async function reviewSpeaking(decision){
  const all=await events();const ev=all.find(e=>e.type===EventType.SPEAKING_SUBMITTED);if(!ev)return;
  await reviewer.review({speakingEvent:ev,clientReviewId:'functional-demo-review-e06',decision});view=await controller.refresh();renderAll()
}
async function finalValidate(){
  const s=await snapshots();
  await validationService.validate({teacherView:s.teacherView,clientValidationId:'functional-demo-final',validationKind:'FINAL',decision:'VALID'});
  renderAll()
}
function interactionHtml(item){
  if(!item)return '';
  if(['listen_choose','scenario_choose','read_choose'].includes(item.type))return item.choices.map(c=>`<button class="action answer" data-value="${esc(c)}">${esc(c)}</button>`).join('');
  if(item.type==='order_words')return `<div class="picked" id="picked"></div>${item.tokens.map(t=>`<button class="action token" data-value="${esc(t)}">${esc(t)}</button>`).join('')}<button class="action primary" id="submitOrder">Verifică ordinea</button>`;
  if(item.type==='checkpoint')return item.scenarios.map((s,i)=>`<div class="row"><b>${esc(s.text)}</b>${s.choices.map(c=>`<label><input type="radio" name="cp${i}" value="${esc(c)}"> ${esc(c)}</label><br>`).join('')}</div>`).join('')+`<button class="action primary" id="submitCheckpoint">Verifică checkpoint</button>`;
  if(item.type==='listen_repeat')return `<div class="notice">Speaking este evidence-only și necesită profesor. Nu acordă XP, timp valid sau avans automat.</div><button class="action primary" id="submitSpeaking">Trimite dovada pentru review</button>`;
  return '';
}
async function snapshots(){
  const all=await events(), reviews=await reviewStore.listReviews(), teacherValidations=await validationStore.listValidations();
  const mastery=deriveMasterySnapshot({lesson,events:all,humanReviews:reviews});
  const time=buildValidatedLearningTimeLedger({lesson,events:all});
  const teacherView=buildTeacherLearnerView({lesson,events:all,masterySnapshot:mastery,learningTimeLedger:time,humanReviews:reviews,teacher});
  const employerView=buildEmployerLearnerView({teacherView,teacherValidations,reportIndex:[],employer});
  const reports=buildReportsEvidencePack({teacherView,employerView,teacherValidations,period:{generatedAt:Date.now(),weekLabel:'DEMO-WEEK',monthLabel:'DEMO-MONTH'}});
  return {all,reviews,teacherValidations,mastery,time,teacherView,employerView,reports};
}
async function renderLearner(s){
  const p=s.time;const cur=view?.currentItem;
  let gap='';
  if(s.reviews.some(r=>r.decision==='VALID')&&view?.currentItem?.id==='E07')gap=`<div class="notice ok">Review profesor VALID consumat prin replay provenance-bound. Traseul a fost reluat fără XP, timp valid sau autoritate legală acordată de review.</div>`;
  $('#learnerPanel').innerHTML=`<div class="card"><h1>${esc(lesson.title)}</h1><div class="meta"><span class="status">${esc(view?.status)}</span><span>RLS-07 · 16+</span></div><progress value="${view?.progress.completedItems??0}" max="${view?.progress.totalItems??8}"></progress><div class="grid"><div class="metric"><span>Progres</span><b>${view?.progress.completedItems??0}/${view?.progress.totalItems??8}</b></div><div class="metric"><span>Timp validat S6</span><b>${fmt(p.validatedLearningTimeMs)}</b></div></div></div>
  ${gap}<div class="card"><h2>${esc(cur?.prompt??(view?.status==='COMPLETED'?'Lecție terminată':'Așteptare review'))}</h2>${cur?.audioText?`<button class="action" id="audioBtn">🔊 Ascultă</button>`:''}<div id="interaction">${interactionHtml(cur)}</div></div>`;
  document.querySelectorAll('.answer').forEach(b=>b.onclick=()=>answer(b.dataset.value));
  let picked=[];document.querySelectorAll('.token').forEach(b=>b.onclick=()=>{picked.push(b.dataset.value);$('#picked').textContent=picked.join(' ')});
  if($('#submitOrder'))$('#submitOrder').onclick=()=>answer(picked);
  if($('#submitCheckpoint'))$('#submitCheckpoint').onclick=()=>answer([...document.querySelectorAll('.row')].map((_,i)=>document.querySelector(`input[name="cp${i}"]:checked`)?.value??null));
  if($('#submitSpeaking'))$('#submitSpeaking').onclick=submitSpeaking;
  if($('#audioBtn'))$('#audioBtn').onclick=()=>{if(!cur?.audioText||!('speechSynthesis'in window))return;const u=new SpeechSynthesisUtterance(cur.audioText);u.lang='ro-RO';u.rate=.88;speechSynthesis.cancel();speechSynthesis.speak(u)};
  currentRenderedAt=performance.now();currentRenderedWall=Date.now();
}
async function renderTeacher(s){
  const t=s.teacherView,q=t.speakingReviewQueue;
  const finalDone=s.teacherValidations.some(x=>x.validationKind==='FINAL'&&x.decision==='VALID');
  $('#teacherPanel').innerHTML=`<div class="card"><h1>Teacher OS</h1><div class="grid"><div class="metric"><span>Learner status</span><b>${esc(t.learnerStatus)}</b></div><div class="metric"><span>Timp validat</span><b>${fmt(t.validatedLearningTimeMs)}</b></div></div><h3>Speaking review queue</h3><div class="list">${q.length?q.map(x=>`<div class="row"><b>${esc(x.itemId)}</b> · ${esc(x.status)}${x.status==='PENDING'?'<button class="action primary" id="approveSpeaking">VALID</button><button class="action" id="retrySpeaking">RETRY</button>':''}</div>`).join(''):'<div class="row">Nicio trimitere.</div>'}</div>${t.learnerStatus==='COMPLETED'&&!finalDone?'<h3>Final path validation</h3><button class="action primary" id="finalValidate">FINAL VALID</button>':''}${finalDone?'<div class="notice ok">Final path VALID — human validated. Certificate issuance remains legal-gated.</div>':''}<h3>Mastery</h3><div class="list">${t.skillProgress.map(x=>`<div class="row">${esc(x.skill)} · <b>${esc(x.state)}</b>${x.teacherValidated?' · teacher validated':''}</div>`).join('')}</div></div>`;
  if($('#approveSpeaking'))$('#approveSpeaking').onclick=()=>reviewSpeaking('VALID');
  if($('#retrySpeaking'))$('#retrySpeaking').onclick=()=>reviewSpeaking('RETRY');
  if($('#finalValidate'))$('#finalValidate').onclick=finalValidate;
}
async function renderEmployer(s){
  const e=s.employerView,r=s.reports;let certCode='';
  try{requireCertificateIssuance()}catch(err){certCode=err.code||err.message}
  $('#employerPanel').innerHTML=`<div class="card"><h1>Employer OS</h1><div class="grid"><div class="metric"><span>Status</span><b>${esc(e.learnerStatus)}</b></div><div class="metric"><span>Progres</span><b>${Math.round(e.progress.ratio*100)}%</b></div><div class="metric"><span>Timp validat</span><b>${fmt(e.validatedLearningTimeMs)}</b></div><div class="metric"><span>Conformitate</span><b>LEGAL CONFIG REQUIRED</b></div></div><div class="notice ok">Privacy-minimized: fără răspunsuri brute, skill pedagogy, speaking media, XP sau gamification.</div></div>
  <div class="card"><h2>Reports & Evidence</h2><div class="row">Weekly: ${esc(r.weeklyProgressRecord.reportType)}</div><div class="row">Monthly: ${esc(r.monthlyProgressReport.reportType)}</div><div class="row">Final path: <b>${esc(r.finalLearningPathReport.status)}</b></div></div>
  <div class="card"><h2>Certificate Gate</h2><div class="notice danger">Emiterea rămâne blocată: <b>${esc(certCode)}</b>. Auto-issued = 0. Legal binding deferred.</div></div>`;
}
async function renderAll(){const s=await snapshots();await renderLearner(s);await renderTeacher(s);await renderEmployer(s)}
document.querySelectorAll('.tab').forEach(tab=>tab.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected',String(x===tab)));for(const role of ['learner','teacher','employer'])$('#'+role+'Panel').classList.toggle('hidden',role!==tab.dataset.role)});
view=await controller.start();await renderAll();
