import { Rls07ContentRegistry, canonicalRls07Provenance } from './rls07-content-loader.mjs';

const sourceIds = canonicalRls07Provenance().map(x => x.artifactId);
const lesson = {
  lessonId: 'RLS07-TEST-DUPLICATE',
  contentVersion: 'rls07-test-duplicate@1.0.0',
  title: 'Duplicate test',
  outcome: 'Check duplicate identity',
  source: { lane: 'RLS-07', audience: '16+', level: 'preA1', artifactIds: sourceIds, sourceObserved: '2026-09-29' },
  items: [{ id: 'T01', type: 'read_choose', skill: 'duplicate', difficulty: 1, prompt: 'Choose.', choices: ['A','B'], correctAnswer: 'A', evidenceClass: 'test' }]
};

const registry = new Rls07ContentRegistry();
registry.activate({ lesson, provenance: canonicalRls07Provenance() });
const duplicate = registry.register({ lesson: structuredClone(lesson), provenance: canonicalRls07Provenance() });
if (duplicate.code !== 'RLS07_DUPLICATE_IDENTITY_EXACT') throw new Error('duplicate code');
if (registry.listIdentities().length !== 1) throw new Error('duplicate count');
console.log('RPM_S3_4_RLS07_DUPLICATE_PASS');
