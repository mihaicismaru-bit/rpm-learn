import { Rls07ContentRegistry, canonicalRls07Provenance } from './rls07-content-loader.mjs';

const ids = canonicalRls07Provenance().map(x => x.artifactId);
const lesson = {
  lessonId: 'RLS07-TEST-AUDIENCE',
  contentVersion: 'rls07-audience@1.0.0',
  title: 'Test',
  outcome: 'Test',
  source: { lane: 'RLS-07', audience: 'other', level: 'preA1', artifactIds: ids, sourceObserved: '2026-09-29' },
  items: [{ id:'T01', type:'read_choose', skill:'x', difficulty:1, prompt:'Choose.', choices:['A','B'], correctAnswer:'A', evidenceClass:'test' }]
};
let code = '';
try { new Rls07ContentRegistry().activate({ lesson, provenance:canonicalRls07Provenance() }); } catch (e) { code = e.code || ''; }
if (code !== 'RLS07_ADULT_ONLY_AUDIENCE_REQUIRED') throw new Error('audience gate failed');
console.log('RPM_S3_4_RLS07_AUDIENCE_PASS');
