import { lesson } from '../../../s2b/v2.6/fixture.mjs';
import { Rls07ContentRegistry, canonicalRls07Provenance } from './rls07-content-loader.mjs';

const registry = new Rls07ContentRegistry();
const result = registry.activate({ lesson, provenance: canonicalRls07Provenance() });
if (result.action !== 'initialize') throw new Error('unexpected activation');
const active = registry.loadActive(lesson.lessonId);
if (active.lesson.source.lane !== 'RLS-07') throw new Error('lane mismatch');
if (active.lesson.source.audience !== '16+') throw new Error('audience mismatch');
if (active.lesson.source.level !== 'preA1') throw new Error('level mismatch');
if (active.provenance.length !== 3) throw new Error('provenance mismatch');
console.log('RPM_S3_4_RLS07_BASIC_PASS');
