import {
  assertImmutableContentVersion,
  canonicalJson,
  validateContentActivation,
  validateLessonContentContract
} from '../../../s2b/v2.6/model.mjs';

export const RLS07_CONTENT_LOADER_VERSION = 1;

export const RLS07_CANONICAL_SOURCE_AUTHORITY = Object.freeze([
  Object.freeze({
    artifactId: '1J6sxjzpdjR55iESlq8wtrJBldwUGGftJ4tASsYC8RD8',
    artifactCode: 'AR-245',
    role: 'teacher_guide',
    lane: 'RLS-07',
    audience: '16+',
    level: 'preA1',
    revisionId: 'ANLCKQnmEoNLof18dVKuUltD1qj5kM49y11e15nXwLMwYMsiSsNVBPLzfM6JQQCikYhWYXSKKuPhq0JaacfAzKNKAhE8Cesf-khjJhjOQLn6',
    observedDate: '2026-10-02'
  }),
  Object.freeze({
    artifactId: '1uKTISnCJqVN4mdICAN-TtXGYRpyAL_nAY7-CAk9PNsY',
    artifactCode: 'AR-191',
    role: 'workbook',
    lane: 'RLS-07',
    audience: '16+',
    level: 'preA1',
    revisionId: 'ANLCKQkPfqqzcNSG19Ce24UL9Vy2JsyBBAY-zqZfKM2GT9OcEC05xARr3UrmtwWh8ENWm-FCNHUB4460R7xp6l3jzkyqUHY85adZnfh-WXgn',
    observedDate: '2026-10-02'
  }),
  Object.freeze({
    artifactId: '1toH4pHdzoEFWePG1qiI22EetLkLIkntxv2-jB9HQH3A',
    artifactCode: 'AR-233',
    role: 'assessment_pack',
    lane: 'RLS-07',
    audience: '16+',
    level: 'preA1',
    revisionId: 'ANLCKQmqbb5slF0kTWsZBNSbqD1NmUVFTknthFN0Dc7ZqFxc-P3Sth7KeVE8jRdMcZXpwYhGkmExhVYey3Fmy_K48jwBYerRCdCw-lBWF-Pn',
    observedDate: '2026-10-02'
  })
]);

export class Rls07ContentLoaderError extends Error {
  constructor(code, detail = {}) {
    super(code);
    this.name = 'Rls07ContentLoaderError';
    this.code = code;
    this.detail = detail;
  }
}

function clone(value) {
  return structuredClone(value);
}

function identityOf(lesson) {
  return `${lesson.lessonId}@${lesson.contentVersion}`;
}

function orderedStrings(values) {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function validateAuthority(authority) {
  if (!Array.isArray(authority) || authority.length < 1) {
    throw new Rls07ContentLoaderError('RLS07_SOURCE_AUTHORITY_REQUIRED');
  }
  const ids = new Set();
  const roles = new Set();
  for (const source of authority) {
    if (!source || typeof source !== 'object'
      || typeof source.artifactId !== 'string' || !source.artifactId.trim()
      || typeof source.revisionId !== 'string' || !source.revisionId.trim()
      || typeof source.role !== 'string' || !source.role.trim()
      || source.lane !== 'RLS-07'
      || source.audience !== '16+'
      || source.level !== 'preA1'
      || typeof source.observedDate !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(source.observedDate)) {
      throw new Rls07ContentLoaderError('RLS07_SOURCE_AUTHORITY_ENTRY_INVALID', {
        artifactId: source?.artifactId ?? null
      });
    }
    if (ids.has(source.artifactId)) {
      throw new Rls07ContentLoaderError('RLS07_SOURCE_AUTHORITY_DUPLICATE_ARTIFACT', {
        artifactId: source.artifactId
      });
    }
    if (roles.has(source.role)) {
      throw new Rls07ContentLoaderError('RLS07_SOURCE_AUTHORITY_DUPLICATE_ROLE', {
        role: source.role
      });
    }
    ids.add(source.artifactId);
    roles.add(source.role);
  }
  return Object.freeze(authority.map(source => Object.freeze({ ...source })));
}

function validateRls07Lesson(lesson) {
  if (!lesson || typeof lesson !== 'object') {
    throw new Rls07ContentLoaderError('RLS07_LESSON_REQUIRED');
  }

  if (lesson.source?.audience !== '16+') {
    throw new Rls07ContentLoaderError('RLS07_ADULT_ONLY_AUDIENCE_REQUIRED', {
      observedAudience: lesson.source?.audience ?? null
    });
  }
  if (lesson.source?.lane !== 'RLS-07') {
    throw new Rls07ContentLoaderError('RLS07_LANE_REQUIRED', {
      observedLane: lesson.source?.lane ?? null
    });
  }
  if (lesson.source?.level !== 'preA1') {
    throw new Rls07ContentLoaderError('RLS07_PREA1_LEVEL_REQUIRED', {
      observedLevel: lesson.source?.level ?? null
    });
  }

  const contract = validateLessonContentContract(lesson);
  if (!contract.valid) {
    throw new Rls07ContentLoaderError(contract.code, contract);
  }
  return contract;
}

function validateProvenanceBinding(lesson, provenance, authority) {
  if (!Array.isArray(provenance) || provenance.length < 1) {
    throw new Rls07ContentLoaderError('RLS07_PROVENANCE_REQUIRED');
  }

  const authorityById = new Map(authority.map(source => [source.artifactId, source]));
  const seen = new Set();

  for (const source of provenance) {
    if (!source || typeof source !== 'object'
      || typeof source.artifactId !== 'string' || !source.artifactId.trim()
      || typeof source.revisionId !== 'string' || !source.revisionId.trim()
      || typeof source.role !== 'string' || !source.role.trim()
      || typeof source.observedDate !== 'string'
      || !/^\d{4}-\d{2}-\d{2}$/.test(source.observedDate)) {
      throw new Rls07ContentLoaderError('RLS07_PROVENANCE_ENTRY_INVALID', {
        artifactId: source?.artifactId ?? null
      });
    }
    if (seen.has(source.artifactId)) {
      throw new Rls07ContentLoaderError('RLS07_PROVENANCE_DUPLICATE_ARTIFACT', {
        artifactId: source.artifactId
      });
    }
    seen.add(source.artifactId);

    const expected = authorityById.get(source.artifactId);
    if (!expected) {
      throw new Rls07ContentLoaderError('RLS07_PROVENANCE_UNAUTHORIZED_ARTIFACT', {
        artifactId: source.artifactId
      });
    }
    if (source.revisionId !== expected.revisionId || source.role !== expected.role) {
      throw new Rls07ContentLoaderError('RLS07_PROVENANCE_AUTHORITY_MISMATCH', {
        artifactId: source.artifactId,
        expectedRevisionId: expected.revisionId,
        observedRevisionId: source.revisionId,
        expectedRole: expected.role,
        observedRole: source.role
      });
    }
  }

  const lessonIds = orderedStrings(lesson.source.artifactIds);
  const provenanceIds = orderedStrings([...seen]);
  if (canonicalJson(lessonIds) !== canonicalJson(provenanceIds)) {
    throw new Rls07ContentLoaderError('RLS07_PROVENANCE_LESSON_ARTIFACT_SET_MISMATCH', {
      lessonArtifactIds: lessonIds,
      provenanceArtifactIds: provenanceIds
    });
  }

  return Object.freeze(
    provenance
      .map(source => Object.freeze({ ...source }))
      .sort((a, b) => a.artifactId.localeCompare(b.artifactId))
  );
}

function snapshotEntry(lesson, provenance) {
  return Object.freeze({
    identity: identityOf(lesson),
    lesson: Object.freeze(clone(lesson)),
    provenance: Object.freeze(provenance.map(source => Object.freeze({ ...source })))
  });
}

export function canonicalRls07Provenance() {
  return RLS07_CANONICAL_SOURCE_AUTHORITY.map(source => ({
    artifactId: source.artifactId,
    revisionId: source.revisionId,
    role: source.role,
    observedDate: source.observedDate
  }));
}

export class Rls07ContentRegistry {
  constructor({ sourceAuthority = RLS07_CANONICAL_SOURCE_AUTHORITY } = {}) {
    this.sourceAuthority = validateAuthority(sourceAuthority);
    this.entries = new Map();
    this.activeByLessonId = new Map();
  }

  register({ lesson, provenance }) {
    validateRls07Lesson(lesson);
    const boundProvenance = validateProvenanceBinding(lesson, provenance, this.sourceAuthority);
    const identity = identityOf(lesson);
    const existing = this.entries.get(identity);

    if (existing) {
      try {
        assertImmutableContentVersion(existing.lesson, lesson);
      } catch (error) {
        throw new Rls07ContentLoaderError(error.code || 'CONTENT_VERSION_MUTATION', {
          identity
        });
      }
      if (canonicalJson(existing.provenance) !== canonicalJson(boundProvenance)) {
        throw new Rls07ContentLoaderError('RLS07_PROVENANCE_MUTATION', { identity });
      }
      return Object.freeze({
        action: 'reuse',
        code: 'RLS07_DUPLICATE_IDENTITY_EXACT',
        identity
      });
    }

    this.entries.set(identity, snapshotEntry(lesson, boundProvenance));
    return Object.freeze({
      action: 'registered',
      code: 'RLS07_CONTENT_REGISTERED',
      identity
    });
  }

  activate({ lesson, provenance, migration = null }) {
    const registration = this.register({ lesson, provenance });
    const current = this.activeByLessonId.get(lesson.lessonId) || null;

    if (!current) {
      const entry = this.entries.get(identityOf(lesson));
      this.activeByLessonId.set(lesson.lessonId, entry);
      return Object.freeze({
        action: 'initialize',
        code: 'RLS07_CONTENT_ACTIVATED',
        identity: entry.identity,
        registration
      });
    }

    if (current.lesson.contentVersion === lesson.contentVersion) {
      return Object.freeze({
        action: 'reuse',
        code: 'RLS07_CONTENT_ALREADY_ACTIVE',
        identity: current.identity,
        registration
      });
    }

    const decision = validateContentActivation(current.lesson, lesson, migration);
    if (decision.action === 'blocked') {
      throw new Rls07ContentLoaderError(decision.code || 'CONTENT_MIGRATION_REQUIRED', {
        lessonId: lesson.lessonId,
        fromVersion: current.lesson.contentVersion,
        toVersion: lesson.contentVersion
      });
    }

    const next = this.entries.get(identityOf(lesson));
    this.activeByLessonId.set(lesson.lessonId, next);
    return Object.freeze({
      action: 'migrate',
      code: 'RLS07_CONTENT_MIGRATED',
      identity: next.identity,
      migration: Object.freeze(clone(decision.migration)),
      registration
    });
  }

  load(lessonId, contentVersion) {
    const entry = this.entries.get(`${lessonId}@${contentVersion}`);
    if (!entry) {
      throw new Rls07ContentLoaderError('RLS07_CONTENT_NOT_FOUND', {
        lessonId,
        contentVersion
      });
    }
    return clone(entry);
  }

  loadActive(lessonId) {
    const entry = this.activeByLessonId.get(lessonId);
    if (!entry) {
      throw new Rls07ContentLoaderError('RLS07_ACTIVE_CONTENT_NOT_FOUND', { lessonId });
    }
    return clone(entry);
  }

  listIdentities() {
    return Object.freeze([...this.entries.keys()].sort((a, b) => a.localeCompare(b)));
  }
}
