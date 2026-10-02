import { Rls07ContentRegistry, canonicalRls07Provenance } from './rls07-content-loader.mjs';

const provenance = canonicalRls07Provenance();
const ids = provenance.map(x => x.artifactId);
const lesson = {
  lessonId: 'RLS07-TEST-PROVENANCE',
  contentVersion: 'rls07-provenance@1.0.0',
  title: 'Test',
  outcome: 'Test',
  source: { lane: 'RLS-07', audience: '16+', level: 'preA1', artifactIds: ids, sourceObserved: '2026-09-29' },
  items: [{ id:'T01', type:'read_choose', skill:'x', difficulty:1, prompt:'Choose.', choices:['A','B'], correctAnswer:'A', evidenceClass:'test' }]
};

let code = '';
try { new Rls07ContentRegistry().activate({ lesson, provenance:provenance.slice(0,2) }); } catch (e) { code = e.code || ''; }
if (code !== 'RLS07_PROVENANCE_LESSON_ARTIFACT_SET_MISMATCH') throw new Error('artifact set gate failed');

const revised = canonicalRls07Provenance();
revised[0].revisionId = 'not-current';
code = '';
try { new Rls07ContentRegistry().activate({ lesson, provenance:revised }); } catch (e) { code = e.code || ''; }
if (code !== 'RLS07_PROVENANCE_AUTHORITY_MISMATCH') throw new Error('revision gate failed');

console.log('RPM_S3_4_RLS07_PROVENANCE_PASS');
