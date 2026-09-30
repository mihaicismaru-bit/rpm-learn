import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const files=[
  'index.html','offline.html','app.mjs','access.mjs','model.mjs','event-store.mjs','fixture.mjs',
  'sw.js','manifest.webmanifest','icon-192.png','icon-512.png',
  'browser-acceptance.html','browser-acceptance-runner.mjs','browser-acceptance-static-tests.mjs','acceptance-contract.mjs','acceptance-contract-tests.mjs',
  'pwa-contract-tests.mjs','pwa-dependency-closure-tests.mjs','s2-tests.mjs','s2-identity-scope-tests.mjs','s2-time-integrity-tests.mjs','s2-time-attribution-tests.mjs','s2-time-idle-retrocredit-tests.mjs','s2-time-source-link-tests.mjs','s2-sequence-integrity-tests.mjs','s2-sequence-allocation-tests.mjs','s2-sequence-chain-quarantine-tests.mjs','s2-role-bound-event-tests.mjs','s2-event-semantic-integrity-tests.mjs','s2-event-path-integrity-tests.mjs','s2-speaking-review-gate-tests.mjs','s2-audio-lifecycle-integrity-tests.mjs','s2-content-contract-tests.mjs','build-fingerprint-self-check.mjs','tests.mjs',
  'schemas/event.schema.json','schemas/lesson.schema.json','schemas/content-migration.schema.json','schemas/browser-acceptance-evidence.schema.json'
];
const hashes={};
for(const f of files){
  const b=fs.readFileSync(path.join(root,f));
  hashes[f]=createHash('sha256').update(b).digest('hex');
}
const canonical=files.map(f=>`${f}\t${hashes[f]}\n`).join('');
const payload={
  schemaVersion:'rpm-s2b-build-fingerprint/v1',
  buildId:'RPM-S2B-BROWSER-GATE-v2.4',
  combinedSha256:createHash('sha256').update(canonical).digest('hex'),
  files:hashes
};
fs.writeFileSync(path.join(root,'RPM_S2B_BUILD_FINGERPRINT.json'),JSON.stringify(payload,null,2)+'\n');
console.log(`RPM_S2B_BUILD_FINGERPRINT_PASS ${payload.combinedSha256}`);
