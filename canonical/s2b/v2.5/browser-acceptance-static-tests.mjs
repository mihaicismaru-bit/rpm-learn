import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('./browser-acceptance.html',import.meta.url),'utf8');
const runner=fs.readFileSync(new URL('./browser-acceptance-runner.mjs',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');
const contract=fs.readFileSync(new URL('./acceptance-contract.mjs',import.meta.url),'utf8');
for (const marker of [
  'adult-lesson-content-contract','child-adolescent-source-lane-blocked','indexeddb-active-time-replay','time-policy-v4','idle-gap-retrocredit-suppressed','audio-playback-cap-retained','audio-start-time-credit-blocked','audio-end-start-linkage-pass','audio-orphan-end-blocked','audio-duplicate-end-tail-quarantine','forged-answer-score-blocked','future-item-answer-path-blocked','future-speaking-path-blocked','semantic-path-policy-v4','path-replay-tail-quarantine','semantic-replay-tail-quarantine','event-sequence-continuity-gap-blocked','replay-sequence-gap-quarantine','sequence-commit-after-persist','sequence-commit-mismatch-blocked','sequence-policy-v3','contiguous-chain-head-detected','quarantined-chain-extension-blocked','orphan-time-source-blocked','duplicate-time-attribution-blocked','legacy-time-replay-quarantine','oversized-time-slice-blocked','speaking-without-human-gate-blocked','monotonic-clock-policy-contract','speaking-human-review-replay','speaking-review-path-hold','speaking-pending-no-xp','speaking-pending-resubmit-blocked','speaking-pending-completion-blocked','multi-learner-same-seq-isolated','cross-subject-event-append-blocked','cross-role-event-append-blocked','snapshot-subject-isolation','content-version-immutability',
  'content-migration-human-gate','teacher-blocked-from-learner-route','employer-speaking-firewall','tenant-boundary-allow',
  'service-worker-registration','pwa-cache-present','automatic-event-time-attribution-blocked','manifest-runtime-contract','RPM_S2B_BROWSER_PREOFFLINE_PASS'
]) assert.ok(html.includes(marker),`acceptance harness missing ${marker}`);
for (const marker of [
  'Network.emulateNetworkConditions','offline:true','navigator.serviceWorker.controller','OFFLINE_SHELL_FAIL',
  'BROWSER_NAVIGATION_BLOCKED','RPM_S2B_BROWSER_ACCEPTANCE_PASS','RPM_S2B_BROWSER_ACCEPTANCE_EVIDENCE.json',
  'MANAGED_BROWSER_URL_POLICY','learningEngineSeparateFromComplianceEngine','schemaVersion',
  'RPM_ORIGIN','RPM_LAUNCH_BROWSER','RPM_SERVE_LOCAL','EXTERNAL_ORIGIN','executionMode','rpm-s2b-browser-evidence/v3',
  'RPM_S2B_BUILD_FINGERPRINT.json','BUILD_FINGERPRINT_FILE_MISMATCH','BUILD_FINGERPRINT_COMBINED_MISMATCH','BUILD_FINGERPRINT_INTEGRITY_FAILURE','deriveEvidenceAssertions','globalThis.__rpmAcceptance','ACCEPTANCE_EVIDENCE_CONTRACT_FAILURE','combinedSha256','rpm-s2b-build-fingerprint/v1'
]) assert.ok(runner.includes(marker),`runner missing ${marker}`);

const swCache = sw.match(/const CACHE='([^']+)'/)?.[1];
assert.ok(swCache,'service worker cache constant missing');
const htmlCacheRefs=[...html.matchAll(/rpm-learn-s2b-v\d+/g)].map(m=>m[0]);
assert.ok(htmlCacheRefs.length>=2,'acceptance harness cache references missing');
assert.ok(htmlCacheRefs.every(x=>x===swCache),`acceptance harness/service-worker cache drift: sw=${swCache} html=${[...new Set(htmlCacheRefs)].join(',')}`);

for (const marker of ['EVIDENCE_ASSERTION_REQUIREMENTS','POST_OFFLINE_EVIDENCE_ASSERTIONS','audio-start-no-time-credit','audio-start-time-credit-blocked','verifyPreOfflineEvidence','deriveEvidenceAssertions','ACCEPTANCE_RUNTIME_ASSERTION_COVERAGE_MISSING']) assert.ok(contract.includes(marker),`acceptance contract missing ${marker}`);
assert.ok(html.includes('globalThis.__rpmAcceptance'),'browser acceptance must expose executed runtime checks');
assert.ok(html.includes('const pass = (name) => checks.push(name);'),'browser acceptance machine checks must store raw check names');
assert.ok(html.includes('checks.map(name => `PASS ${name}`)'),'human PASS prefix must be presentation-only');
assert.ok(!html.includes('checks.push(`PASS ${name}`)'),'machine acceptance snapshot must not store display-prefixed PASS labels');
assert.ok(runner.includes('verifyPreOfflineEvidence(runtimeSnapshot)'),'runner must validate page-executed pre-offline checks');
assert.ok(runner.includes('deriveEvidenceAssertions(runtimeSnapshot'),'runner must bind final evidence claims to executed checks');
assert.ok(!runner.includes('audio-lifecycle-start-end-linkage adult-content-contract'),'merged evidence assertion typo must not survive');
assert.ok(runner.includes("['http:','https:']"),'portable runner must restrict test origin to http/https');
assert.ok(!html.includes('certificate') && !runner.includes('legal compliance claim'),'acceptance harness must remain outside certificate/legal release behavior');
console.log('RPM_S2B_ACCEPTANCE_HARNESS_STATIC_PASS indexeddb access sw-cache offline-runner machine-evidence portable-origin external-cdp source-linked-time single-attribution sequence-continuity replay-quarantine chain-quarantine cross-role-guard semantic-integrity canonical-item-path path-replay-quarantine semantic-replay-quarantine adult-content-contract cache-coherence evidence-claim-integrity build-fingerprint-self-integrity fail-closed-policy-classification');
