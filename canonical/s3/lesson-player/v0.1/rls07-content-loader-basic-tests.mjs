import { Rls07ContentRegistry, canonicalRls07Provenance } from './rls07-content-loader.mjs';

const lesson = {
  lessonId: 'RLS07-TEST-01',
  contentVersion: 'rls07-test@1.0.0',
  title: 'Test',
  outcome: 'Test',
  source: {
    lane: 'RLS-07',
    audience: '16+',
    level: 'preA1',
    artifactIds: [
      '1J6sxjzpdjR55iESlq8wtrJBldwUGGftJ4tASsYC8RD8',
      '1uKTISnCJqVN4mdICAN-TtXGYRpyAL_nAY7-CAk9PNsY',
      '1toH4pHdzoEFWePG1qiI22EetLkLIkntxv2-jB9HQH3A'
    ],
    sourceObserved: '2026-09-29'
  },
  items: [{
    id: 'T01',
    type: 'read_choose',
    skill: 'test',
    difficulty: 1,
    prompt: 'Choose.',
    choices: ['A', 'B'],
    correctAnswer: 'A',
    evidenceClass: 'test'
  }]
};

const registry = new Rls07ContentRegistry();
const result = registry.activate({ lesson, provenance: canonicalRls07Provenance() });
if (result.action !== 'initialize') throw new Error('unexpected activation');
const active = registry.loadActive(lesson.lessonId);
if (active.lesson.source.lane !== 'RLS-07') throw new Error('lane mismatch');
if (active.provenance.length !== 3) throw new Error('provenance mismatch');
console.log('RPM_S3_4_RLS07_BASIC_PASS');
