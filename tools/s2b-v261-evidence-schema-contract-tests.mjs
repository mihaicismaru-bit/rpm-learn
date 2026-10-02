import assert from 'node:assert/strict';
import fs from 'node:fs';

const runnerPath=new URL('../canonical/s2b/v2.6/browser-acceptance-runner.mjs',import.meta.url);
const schemaPath=new URL('../canonical/s2b/v2.6/schemas/browser-acceptance-evidence.schema.json',import.meta.url);
const runner=fs.readFileSync(runnerPath,'utf8');
const schema=JSON.parse(fs.readFileSync(schemaPath,'utf8'));

assert.equal(schema.$id,'rpm-s2b-browser-evidence/v3','schema id must match runtime evidence version');
assert.equal(schema.properties?.schemaVersion?.const,'rpm-s2b-browser-evidence/v3','schemaVersion const must match runtime evidence version');
assert.equal(schema.properties?.build?.properties?.id?.const,'RPM-S2B-BROWSER-GATE-v2.6.1','schema build id must bind successor identity');
assert.equal(schema.properties?.build?.properties?.fingerprintSchema?.const,'rpm-s2b-build-fingerprint/v1','schema must bind fingerprint schema');
assert.equal(schema.additionalProperties,false,'top-level evidence must reject undeclared claims');
assert.ok(schema.required?.includes('build'),'build evidence is required');
assert.ok(schema.required?.includes('executionMode'),'execution mode evidence is required');
assert.ok(runner.includes("buildFingerprint?.buildId !== 'RPM-S2B-BROWSER-GATE-v2.6.1'"),'runner must reject non-v2.6.1 fingerprint identity');
assert.ok(runner.includes("schemaVersion: 'rpm-s2b-browser-evidence/v3'"),'runner must emit evidence schema v3');
assert.ok(runner.includes('build: { id: buildFingerprint.buildId'),'runner evidence build id must derive from verified fingerprint');
assert.ok(runner.includes('executionMode: {'),'runner must emit execution mode provenance');
assert.ok(runner.includes('chromeExecutable: LAUNCH_BROWSER ? CHROME : null'),'existing-browser evidence must allow null chromeExecutable');
assert.ok(runner.includes('learningEngineSeparateFromComplianceEngine: true'),'engine separation boundary must be explicit');

console.log('RPM_S2B_V261_EVIDENCE_SCHEMA_CONTRACT_PASS 13/13');
