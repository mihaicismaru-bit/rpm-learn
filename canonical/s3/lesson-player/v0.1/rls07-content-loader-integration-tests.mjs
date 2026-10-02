import assert from 'node:assert/strict';
import {
  Rls07ContentLoaderError,
  Rls07ContentRegistry,
  canonicalRls07Provenance
} from './rls07-content-loader.mjs';

function makeLesson(version = 'rls07-integration@1.0.0') {
  return {
    lessonId: 'RLS07-INTEGRATION-01',
    contentVersion: version,
    title: 'Integration lesson',
    outcome: 'Exercise the loader invariants.',
    source: {
      lane: 'RLS-07',
      audience: '16+',
      level: 'preA1',
      artifactIds: canonicalRls07Provenance().map(x => x.artifactId),
      sourceObserved: '2026-09-29'
    },
    items: [{
      id: 'T01',
      type: 'read_choose',
      skill: 'integration',
      difficulty: 1,
      prompt: 'Choose.',
      choices: ['A', 'B'],
      correctAnswer: 'A',
      evidenceClass: 'test'
    }]
  };
}

function expectCode(fn, code) {
  assert.throws(
    fn,
    error => error instanceof Rls07ContentLoaderError && error.code === code
  );
}

// Same lessonId+contentVersion cannot be silently mutated.
{
  const registry = new Rls07ContentRegistry();
  const lesson = makeLesson();
  registry.activate({ lesson, provenance: canonicalRls07Provenance() });
  const mutated = structuredClone(lesson);
  mutated.title = 'Mutated in place';
  expectCode(
    () => registry.register({ lesson: mutated, provenance: canonicalRls07Provenance() }),
    'CONTENT_VERSION_MUTATION'
  );
}

// Exact lesson bytes with changed provenance are also immutable.
{
  const registry = new Rls07ContentRegistry();
  const lesson = makeLesson();
  registry.activate({ lesson, provenance: canonicalRls07Provenance() });
  const changed = canonicalRls07Provenance();
  changed[0].observedDate = '2026-10-01';
  expectCode(
    () => registry.register({ lesson: structuredClone(lesson), provenance: changed }),
    'RLS07_PROVENANCE_MUTATION'
  );
}

// A new contentVersion is not activated without an explicit human-approved migration.
{
  const registry = new Rls07ContentRegistry();
  const v1 = makeLesson('rls07-integration@1.0.0');
  const v2 = makeLesson('rls07-integration@2.0.0');
  registry.activate({ lesson: v1, provenance: canonicalRls07Provenance() });
  expectCode(
    () => registry.activate({ lesson: v2, provenance: canonicalRls07Provenance() }),
    'CONTENT_MIGRATION_REQUIRED'
  );
  assert.equal(registry.loadActive(v1.lessonId).lesson.contentVersion, v1.contentVersion);
}

// Explicit approved migration changes only the active pointer; both immutable versions remain addressable.
{
  const registry = new Rls07ContentRegistry();
  const v1 = makeLesson('rls07-integration@1.0.0');
  const v2 = makeLesson('rls07-integration@2.0.0');
  registry.activate({ lesson: v1, provenance: canonicalRls07Provenance() });
  const migration = {
    migrationId: 'mig-rls07-integration-1-to-2',
    fromVersion: v1.contentVersion,
    toVersion: v2.contentVersion,
    strategy: 'restart',
    humanApproved: true
  };
  const result = registry.activate({
    lesson: v2,
    provenance: canonicalRls07Provenance(),
    migration
  });
  assert.equal(result.action, 'migrate');
  assert.equal(registry.loadActive(v1.lessonId).lesson.contentVersion, v2.contentVersion);
  assert.equal(registry.load(v1.lessonId, v1.contentVersion).lesson.contentVersion, v1.contentVersion);
  assert.equal(registry.load(v2.lessonId, v2.contentVersion).lesson.contentVersion, v2.contentVersion);
}

// Reads are clone-safe: caller mutation cannot rewrite registry state by reference.
{
  const registry = new Rls07ContentRegistry();
  const lesson = makeLesson();
  registry.activate({ lesson, provenance: canonicalRls07Provenance() });
  const first = registry.loadActive(lesson.lessonId);
  first.lesson.title = 'caller mutation';
  first.provenance[0].role = 'caller mutation';
  const reread = registry.loadActive(lesson.lessonId);
  assert.equal(reread.lesson.title, 'Integration lesson');
  assert.notEqual(reread.provenance[0].role, 'caller mutation');
}

console.log('RPM_S3_4_RLS07_INTEGRATION_PASS immutable-content provenance-mutation migration-gate approved-migration clone-safety');
