import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  EXPECTED,
  EXPECTED_ASSERTIONS,
  validateBrowserEvidence
} from './s2b-v261-browser-evidence-gate.mjs';

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

function sampleEvidence() {
  return {
    schemaVersion: EXPECTED.schemaVersion,
    checkpoint: EXPECTED.checkpoint,
    status: EXPECTED.status,
    phase: EXPECTED.phase,
    classification: EXPECTED.classification,
    startedAt: '2026-10-02T07:00:00.000Z',
    finishedAt: '2026-10-02T07:00:10.000Z',
    browser: 'HeadlessChrome/140.0.0.0',
    build: {
      id: EXPECTED.buildId,
      combinedSha256: EXPECTED.combinedSha256,
      fingerprintSchema: EXPECTED.fingerprintSchema
    },
    chromeExecutable: '/usr/bin/google-chrome',
    origin: EXPECTED.origin,
    executionMode: {
      serveLocal: false,
      launchBrowser: true,
      cdpEndpoint: 'http://127.0.0.1:9229',
      originMode: 'EXTERNAL_ORIGIN'
    },
    message: EXPECTED.message,
    assertions: [...EXPECTED_ASSERTIONS],
    boundaries: {
      productionRelease: false,
      realUserData: false,
      legalComplianceClaims: false,
      certificateIssuance: false,
      learningEngineSeparateFromComplianceEngine: true
    }
  };
}

const pass = validateBrowserEvidence(sampleEvidence());
assert.equal(pass.accepted,true);
assert.equal(pass.assertionCount,EXPECTED_ASSERTIONS.length);

for (const [label,mutate,code] of [
  ['wrong build hash', p => { p.build.combinedSha256='0'.repeat(64); }, 'EVIDENCE_VALUE_MISMATCH'],
  ['missing offline assertion', p => { p.assertions=p.assertions.filter(x=>x!=='offline-learner-shell-reload'); }, 'EVIDENCE_ASSERTION_MISSING'],
  ['duplicate assertion', p => { p.assertions.push(p.assertions[0]); }, 'EVIDENCE_ASSERTION_DUPLICATE'],
  ['local origin mode', p => { p.executionMode.originMode='LOCAL_ORIGIN'; }, 'EVIDENCE_VALUE_MISMATCH'],
  ['boundary violation', p => { p.boundaries.legalComplianceClaims=true; }, 'EVIDENCE_BOUNDARY_VIOLATION'],
  ['extra top-level claim', p => { p.unvalidatedClaim='no'; }, 'EVIDENCE_EXTRA_FIELD']
]) {
  const p=sampleEvidence();
  mutate(p);
  assert.throws(()=>validateBrowserEvidence(p), e => e?.code===code, label);
}

console.log('RPM_S2B_V261_EVIDENCE_SCHEMA_CONTRACT_PASS 13/13');
console.log('RPM_S2B_V261_BROWSER_EVIDENCE_GATE_TEST_PASS 8/8 assertions='+EXPECTED_ASSERTIONS.length);
