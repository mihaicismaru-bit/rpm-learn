import {analyseLearningReplay,canonicalJson} from '../canonical/s2b/v2.6/model.mjs';

// TEST-only local recovery: not a server database, authentication system or legal evidence ledger.
export const BROWSER_RECOVERY_VERSION = 1;
export class BrowserRecoveryError extends Error {
  constructor(code, detail = {}) { super(code); this.name = 'BrowserRecoveryError'; this.code = code; this.detail = detail; }
}
const fail = (code, detail = {}) => { throw new BrowserRecoveryError(code, detail); };
const copy = value => structuredClone(value);
const shape = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|');
const ROOT_KEYS = ['version','revision','scope','lessonIdentity','lessonSnapshot','events','reviews','validations'];
const AUTHORITY_DENIED = ['pathAdvance','xp','mastery','validatedTime','certificate','legal'];

export function createBrowserPersistence({storage, lesson, scope, teacher}) {
  if (!lesson?.lessonId || !lesson?.contentVersion || !scope?.subjectId ||
      !scope?.organisationId || scope.role !== 'LEARNER' ||
      teacher?.organisationId !== scope.organisationId || teacher?.role !== 'TEACHER') {
    fail('BROWSER_RECOVERY_CONFIG_INVALID');
  }
  const identity = {lessonId:lesson.lessonId,contentVersion:lesson.contentVersion};
  const snapshot = canonicalJson(lesson); // exact content lock, no silent same-version mutation
  const key = ['rpm-learn','product-test','recovery-v1',
    scope.organisationId,scope.subjectId,lesson.lessonId,lesson.contentVersion].map(encodeURIComponent).join(':');
  let loaded = false, state, lastRaw;

  function readRaw() {
    if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
      fail('BROWSER_RECOVERY_STORAGE_UNAVAILABLE');
    }
    try { return storage.getItem(key); }
    catch (error) { fail('BROWSER_RECOVERY_READ_FAILED', {cause:error?.name ?? 'UNKNOWN'}); }
  }
  function validate(value) {
    if (!shape(value,ROOT_KEYS) || value.version !== BROWSER_RECOVERY_VERSION ||
        !Number.isSafeInteger(value.revision) || value.revision < 0 ||
        canonicalJson(value.scope) !== canonicalJson(scope) ||
        canonicalJson(value.lessonIdentity) !== canonicalJson(identity) ||
        value.lessonSnapshot !== snapshot ||
        !Array.isArray(value.events) || !Array.isArray(value.reviews) ||
        !Array.isArray(value.validations)) {
      fail('BROWSER_RECOVERY_ENVELOPE_MISMATCH');
    }
    if ([value.events,value.reviews,value.validations].some(rows=>rows.length>5000)) {
      fail('BROWSER_RECOVERY_LIMIT_EXCEEDED');
    }
    for (const event of value.events) {
      if (event?.lessonId !== identity.lessonId || event?.contentVersion !== identity.contentVersion ||
          event?.subjectId !== scope.subjectId || event?.organisationId !== scope.organisationId ||
          event?.role !== 'LEARNER') fail('BROWSER_RECOVERY_EVENT_SCOPE_MISMATCH');
    }
    for (const review of value.reviews) {
      if (review?.learnerSubjectId !== scope.subjectId || review?.organisationId !== scope.organisationId ||
          review?.lessonId !== identity.lessonId || review?.contentVersion !== identity.contentVersion ||
          review?.reviewerId !== teacher.teacherId || review?.reviewerRole !== 'TEACHER' ||
          !shape(review.authority,AUTHORITY_DENIED) ||
          AUTHORITY_DENIED.some(field=>review.authority[field] !== false)) {
        fail('BROWSER_RECOVERY_REVIEW_SCOPE_OR_AUTHORITY_MISMATCH');
      }
    }
    for (const validation of value.validations) {
      if (validation?.learnerSubjectId !== scope.subjectId || validation?.organisationId !== scope.organisationId ||
          validation?.lessonId !== identity.lessonId || validation?.contentVersion !== identity.contentVersion ||
          validation?.teacherId !== teacher.teacherId ||
          validation?.certificateAuthority !== false || validation?.legalAuthority !== false ||
          validation?.complianceAuthority !== false) {
        fail('BROWSER_RECOVERY_VALIDATION_SCOPE_OR_AUTHORITY_MISMATCH');
      }
    }
    const replay = analyseLearningReplay(lesson,value.events,{trustedHumanReviews:value.reviews});
    if (!replay.valid) fail('BROWSER_RECOVERY_REPLAY_INTEGRITY_BLOCKED',{replayCode:replay.code});
  }
  function load() {
    if (!loaded) {
      const observed = readRaw();
      if (observed === null) {
        state = {version:BROWSER_RECOVERY_VERSION,revision:0,scope:copy(scope),
          lessonIdentity:copy(identity),lessonSnapshot:snapshot,events:[],reviews:[],validations:[]};
      } else {
        try { state = JSON.parse(observed); }
        catch { fail('BROWSER_RECOVERY_JSON_CORRUPT'); }
      }
      validate(state);
      lastRaw=observed;loaded=true;
    } else if (readRaw() !== lastRaw) {
      // A different tab changed storage: fail closed rather than overwrite a newer replay.
      fail('BROWSER_RECOVERY_CONCURRENT_CHANGE_RELOAD_REQUIRED');
    }
    return state;
  }
  function mutate(change) {
    const next = copy(load());
    const result = change(next);
    next.revision++;
    validate(next); // includes provenance/replay and every denied authority
    const serialized=JSON.stringify(next);
    try { storage.setItem(key,serialized); }
    catch(error) { fail('BROWSER_RECOVERY_WRITE_FAILED',{cause:error?.name ?? 'UNKNOWN'}); }
    if (readRaw()!==serialized) fail('BROWSER_RECOVERY_READBACK_MISMATCH');
    state=next;lastRaw=serialized;
    return result;
  }
  function appendUnique(collection, record, idField) {
    const current=load()[collection].find(x=>x[idField]===record[idField]);
    if (current) {
      if (canonicalJson(current)!==canonicalJson(record)) fail('BROWSER_RECOVERY_ID_REUSE_MISMATCH');
      return {status:'duplicate',record:copy(current),event:copy(current)};
    }
    mutate(next=>{next[collection].push(copy(record));});
    return {status:'appended',record:copy(record),event:copy(record)};
  }

  const reviewStore=Object.freeze({
    async open(){load();return true;},
    async listReviews(){return copy(load().reviews);},
    async appendReview(record){return appendUnique('reviews',record,'reviewId');}
  });
  const validationStore=Object.freeze({
    async open(){load();return true;},
    async listValidations(){return copy(load().validations);},
    async appendValidation(record){return appendUnique('validations',record,'validationId');}
  });
  const eventStore=Object.freeze({
    async open(){load();return true;},
    async activateContent(next){
      if (canonicalJson(next)!==snapshot) fail('BROWSER_RECOVERY_CONTENT_MUTATION_BLOCKED');
      load();return {status:'initialize'};
    },
    async listEvents(lessonId,contentVersion) {
      if (lessonId!==identity.lessonId || contentVersion!==identity.contentVersion) return [];
      return copy(load().events);
    },
    async listTrustedHumanReviews(lessonId,contentVersion) {
      if (lessonId!==identity.lessonId || contentVersion!==identity.contentVersion) return [];
      return copy(load().reviews);
    },
    async inspectSequenceChain(lessonId,contentVersion) {
      if (lessonId!==identity.lessonId || contentVersion!==identity.contentVersion)
        fail('BROWSER_RECOVERY_CHAIN_IDENTITY_MISMATCH');
      const s=load();return analyseLearningReplay(lesson,s.events,{trustedHumanReviews:s.reviews});
    },
    async append(event) { return appendUnique('events',event,'eventId'); }
  });
  return Object.freeze({eventStore,reviewStore,validationStore,key});
}
