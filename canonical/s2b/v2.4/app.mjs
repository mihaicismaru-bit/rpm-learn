import { lesson } from './fixture.mjs';
import { EventStore } from './event-store.mjs';
import { EventType, makeEvent, reduceLessonState, scoreItem, monotonicNow, makeTimeSlicePayload, newId, nextSequenceCandidate, commitPersistedSequence } from './model.mjs';
import { Role, createDevSession, assertLearnerSession, accessScopeForSession } from './access.mjs';

const DEV_SESSION = createDevSession(Role.LEARNER);
assertLearnerSession(DEV_SESSION);
const ACCESS_SCOPE = accessScopeForSession(DEV_SESSION);
const store = new EventStore(ACCESS_SCOPE);
const sessionId = sessionStorage.getItem('rpmSession') || newId('session');
sessionStorage.setItem('rpmSession', sessionId);
let seq = 0;
let appendQueue = Promise.resolve();
let events = [];
let state;
let lastMeaningfulMono = monotonicNow();
let lastMeaningfulWall = Date.now();
let foreground = document.visibilityState === 'visible' && document.hasFocus();

const $ = s => document.querySelector(s);
const el = {
  role: $('#roleBadge'),
  title: $('#lessonTitle'), progress: $('#progress'), xp: $('#xp'), time: $('#time'),
  prompt: $('#prompt'), body: $('#exerciseBody'), feedback: $('#feedback'),
  check: $('#checkBtn'), audio: $('#audioBtn')
};

function fmt(ms) { const s = Math.floor(ms / 1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }

function append(type, itemId = null, payload = {}, options = {}) {
  // Serialize append attempts so two UI/audio callbacks cannot reserve the same
  // candidate sequence concurrently. A failed append never advances the durable cursor.
  const job = appendQueue.then(() => appendSerial(type, itemId, payload, options));
  appendQueue = job.catch(() => undefined);
  return job;
}

async function appendSerial(type, itemId = null, payload = {}, { timeBasis = null, timeFromMono = null, timeFromWall = null } = {}) {
  const nowWall = Date.now();
  const nowMono = monotonicNow();

  // Persist the meaningful source event first. The sequence cursor is committed
  // only after IndexedDB confirms persistence, preventing holes after failures.
  const sourceSeq = nextSequenceCandidate(seq);
  const ev = makeEvent({ type, lessonId: lesson.lessonId, contentVersion: lesson.contentVersion, seq: sourceSeq, itemId, payload, ts: nowWall, sessionId, ...ACCESS_SCOPE });
  const eres = await store.append(ev);
  if (eres.status === 'appended') {
    seq = commitPersistedSequence(seq, ev.seq);
    events.push(eres.event);
  }

  if (timeBasis) {
    const timePayload = makeTimeSlicePayload({
      previousMono: timeFromMono ?? lastMeaningfulMono,
      currentMono: nowMono,
      previousWall: timeFromWall ?? lastMeaningfulWall,
      currentWall: nowWall,
      foreground,
      basis: timeBasis,
      sourceEventType: type,
      sourceEventId: ev.eventId,
      sourceEventSeq: ev.seq
    });
    if (timePayload.durationMs > 0) {
      const timeSeq = nextSequenceCandidate(seq);
      const tev = makeEvent({ type: EventType.TIME_SLICE, lessonId: lesson.lessonId, contentVersion: lesson.contentVersion, seq: timeSeq, itemId, payload: timePayload, ts: nowWall, sessionId, ...ACCESS_SCOPE });
      try {
        const tres = await store.append(tev);
        if (tres.status === 'appended') {
          seq = commitPersistedSequence(seq, tev.seq);
          events.push(tres.event);
        }
      } catch (err) {
        // Conservative degradation: keep the learner action, grant no time, and
        // do not consume a sequence number that was never persisted.
        console.warn('RPM_TIME_CREDIT_FAIL_CLOSED', err?.code || err);
      }
    }
    lastMeaningfulMono = nowMono;
    lastMeaningfulWall = nowWall;
  }

  state = reduceLessonState(lesson, events);
  await store.putSnapshot({ lessonId: lesson.lessonId, contentVersion: lesson.contentVersion, lastSeq: seq, state, updatedAt: nowWall });
  renderChrome();
  return eres.event || ev;
}

function renderChrome() {
  if (el.role) el.role.textContent = `DEV ROLE · ${DEV_SESSION.role}`;
  el.title.textContent = lesson.title;
  el.progress.value = Math.min(state.cursor, lesson.items.length);
  el.progress.max = lesson.items.length;
  el.xp.textContent = `XP ${state.xp}`;
  el.time.textContent = `Timp activ ${fmt(state.activeMs)}`;
}

function btn(text, onClick) {
  const b = document.createElement('button'); b.className = 'choice'; b.textContent = text; b.onclick = onClick; return b;
}


function showFeedback(text, ok = false) {
  el.feedback.textContent = text; el.feedback.dataset.ok = ok ? '1' : '0';
}

async function answer(item, response) {
  const scored = scoreItem(item, response);
  await append(EventType.ITEM_ANSWERED, item.id, { response, correct: scored.correct, humanReviewRequired: scored.humanReviewRequired, advance: scored.correct === true }, { timeBasis: 'meaningful_interaction' });
  showFeedback(scored.correct ? item.feedbackCorrect : item.feedbackRetry, scored.correct === true);
  if (scored.correct) setTimeout(renderExercise, 350);
}

function renderChoice(item) {
  item.choices.forEach(c => el.body.append(btn(c, () => answer(item, c))));
}

function renderOrder(item) {
  const picked = [];
  const out = document.createElement('div'); out.className = 'picked'; el.body.append(out);
  item.tokens.forEach(t => el.body.append(btn(t, () => { picked.push(t); out.textContent = picked.join(' '); })));
  el.body.append(btn('Verifică ordinea', () => answer(item, picked)));
}

function renderCheckpoint(item) {
  const responses = new Array(item.scenarios.length).fill(null);
  item.scenarios.forEach((s, i) => {
    const box = document.createElement('section'); box.className = 'scenario';
    const p = document.createElement('p'); p.textContent = s.text; box.append(p);
    s.choices.forEach(c => box.append(btn(c, (evt) => { responses[i] = c; [...box.querySelectorAll('button')].forEach(x=>x.dataset.sel='0'); evt.currentTarget.dataset.sel='1'; })));
    el.body.append(box);
  });
  el.body.append(btn('Verifică checkpoint', () => answer(item, responses)));
}

async function renderSpeaking(item) {
  const p = document.createElement('p'); p.textContent = 'În prototip, înregistrarea reală rămâne oprită. Se creează doar o trimitere locală pentru review.'; el.body.append(p);
  if (state.speakingPending.includes(item.id)) {
    const pending = document.createElement('p');
    pending.textContent = 'În așteptarea validării umane. Traseul rămâne blocat aici; trimiterea nu acordă XP și nu validează itemul.';
    el.body.append(pending);
    return;
  }
  el.body.append(btn('Simulează trimiterea pentru profesor', async () => {
    await append(EventType.SPEAKING_SUBMITTED, item.id, { mediaRef: null, placeholder: true, teacherReviewRequired: true }, { timeBasis: 'meaningful_interaction' });
    showFeedback('Trimitere locală salvată. Pronunția necesită validare umană înainte ca traseul să poată continua.', true);
    setTimeout(renderExercise, 350);
  }));
}

async function renderExercise() {
  state = reduceLessonState(lesson, events);
  renderChrome(); el.body.innerHTML=''; el.feedback.textContent='';
  if (state.cursor >= lesson.items.length) {
    el.prompt.textContent = 'Lecție terminată';
    el.body.innerHTML = '<p>Vertical slice complet. Speaking rămâne în așteptarea review-ului profesorului.</p>';
    if (!state.completed) await append(EventType.LESSON_COMPLETED, null, { speakingPending: state.speakingPending });
    return;
  }
  const item = lesson.items[state.cursor];
  el.prompt.textContent = item.prompt;
  el.audio.hidden = !item.audioText;
  el.audio.onclick = async () => {
    if (!item.audioText || !('speechSynthesis' in window)) return;
    // AUDIO_STARTED is audit-only. Listening time is credited only from the
    // AUDIO_ENDED source with explicit audio-start monotonic anchors.
    const audioStartEvent = await append(EventType.AUDIO_STARTED, item.id, { textRef: item.id });
    const audioStartMono = monotonicNow();
    const audioStartWall = Date.now();
    const u = new SpeechSynthesisUtterance(item.audioText); u.lang = 'ro-RO'; u.rate = 0.88;
    u.onend = () => append(EventType.AUDIO_ENDED, item.id, {
      audioStartEventId: audioStartEvent.eventId,
      audioStartEventSeq: audioStartEvent.seq
    }, { timeBasis: 'audio_playback', timeFromMono: audioStartMono, timeFromWall: audioStartWall });
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  };
  await append(EventType.ITEM_PRESENTED, item.id, { cursor: state.cursor });
  if (['listen_choose','scenario_choose','read_choose'].includes(item.type)) renderChoice(item);
  else if (item.type === 'order_words') renderOrder(item);
  else if (item.type === 'checkpoint') renderCheckpoint(item);
  else if (item.type === 'listen_repeat') renderSpeaking(item);
}

function renderSequenceIntegrityBlock(chain) {
  state = reduceLessonState(lesson, events);
  renderChrome();
  el.prompt.textContent = 'Istoric local blocat pentru protecția integrității';
  el.body.textContent = `SEQUENCE_CHAIN_QUARANTINED · prefix valid ${chain.contiguousHead}, maxim observat ${chain.maxObservedSeq}. Este necesară recuperare explicită; evenimentele din coada carantinată nu sunt creditate.`;
  el.feedback.textContent = 'Nu se scriu evenimente noi și nu se reînvie automat coada carantinată.';
  el.check.disabled = true;
  el.audio.hidden = true;
}

async function init() {
  await store.open(); await store.activateContent(lesson);
  events = await store.listEvents(lesson.lessonId, lesson.contentVersion);
  const chain = await store.inspectSequenceChain(lesson.lessonId, lesson.contentVersion);
  seq = chain.contiguousHead;
  state = reduceLessonState(lesson, events);
  if (!chain.valid) {
    renderSequenceIntegrityBlock(chain);
    return;
  }
  if (!events.some(e=>e.type===EventType.SESSION_STARTED && e.sessionId===sessionId)) await append(EventType.SESSION_STARTED, null, { recoveredFromSeq: seq });
  await renderExercise();
}

function resetForegroundAnchor() {
  foreground = document.visibilityState === 'visible' && document.hasFocus();
  lastMeaningfulMono = monotonicNow();
  lastMeaningfulWall = Date.now();
}
document.addEventListener('visibilitychange', resetForegroundAnchor);
window.addEventListener('focus', resetForegroundAnchor);
window.addEventListener('blur', resetForegroundAnchor);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
init().catch(err => { console.error(err); el.prompt.textContent='Eroare locală'; el.body.textContent=String(err); });
