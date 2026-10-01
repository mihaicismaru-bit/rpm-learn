import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));
const fp=JSON.parse(fs.readFileSync(path.join(root,'RPM_S2B_BUILD_FINGERPRINT.json'),'utf8'));
assert.equal(fp.schemaVersion,'rpm-s2b-build-fingerprint/v1');
assert.equal(fp.buildId,'RPM-S2B-BROWSER-GATE-v2.4');
const names=Object.keys(fp.files||{});
assert.ok(names.length>0,'fingerprint file set must not be empty');
for(const f of names){
  const actual=createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex');
  assert.equal(actual,fp.files[f],`fingerprint drift: ${f}`);
}
const canonical=names.map(f=>`${f}\t${fp.files[f]}\n`).join('');
const combined=createHash('sha256').update(canonical).digest('hex');
assert.equal(combined,fp.combinedSha256,'combined fingerprint drift');
console.log(`RPM_S2_BUILD_FINGERPRINT_SELF_CHECK_PASS ${combined}`);
