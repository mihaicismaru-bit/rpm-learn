import assert from 'node:assert/strict';
import fs from 'node:fs';

const model = fs.readFileSync(new URL('./model.mjs',import.meta.url),'utf8');
const store = fs.readFileSync(new URL('./event-store.mjs',import.meta.url),'utf8');
const access = fs.readFileSync(new URL('./access.mjs',import.meta.url),'utf8');
const schema = JSON.parse(fs.readFileSync(new URL('./schemas/event.schema.json',import.meta.url),'utf8'));

assert.equal(schema.properties.schemaVersion.const, 2);
for (const key of ['subjectId','organisationId','role']) assert.ok(schema.required.includes(key), `event schema missing ${key}`);
for (const marker of ['scopeLessonVersionSeq','scopeSessionSeq','scopeLessonVersion','lesson_snapshots_v2','EVENT_SCOPE_MISMATCH','EVENT_ROLE_MISMATCH','STORE_SCOPE_REQUIRED','STORE_ROLE_REQUIRED','STORE_ROLE_FORBIDDEN']) {
  assert.ok(store.includes(marker), `scoped store missing ${marker}`);
}
for (const marker of ['rpm-session/v1','assertSessionEnvelope','accessScopeForSession','assertTenantBoundary','TENANT_BOUNDARY_DENIED']) {
  assert.ok(access.includes(marker), `access scope contract missing ${marker}`);
}
assert.ok(model.includes('EVENT_VERSION = 2'), 'event model must be v2');
assert.ok(model.includes('organisationId') && model.includes('subjectId') && model.includes("LEARNING_EVENT_ROLE = 'LEARNER'"), 'event model missing learner role-bound identity scope');
assert.equal(schema.properties.role.const,'LEARNER','LearningEvent schema must be learner-role only');
assert.ok(!store.includes("createIndex('lessonVersionSeq'"), 'legacy global lesson seq uniqueness must not be recreated');
assert.ok(!store.includes("createIndex('sessionSeq'"), 'legacy global session seq uniqueness must not be recreated');

console.log('RPM_S2_IDENTITY_SCOPE_STATIC_PASS event-v2 subject+tenant+learner-role scoped-indexes scoped-snapshots session-envelope tenant-boundary');
