import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluatePackageGate } from './s2b-package-gate-v2.mjs';
const sha256=b=>createHash('sha256').update(b).digest('hex');

function fixture({runtimeEvidence=false,missing=false,drift=false,fingerprintDrift=false}={}){
  const d=fs.mkdtempSync(path.join(os.tmpdir(),'rpm-gate-v2-'));
  const a=Buffer.from('alpha\n'); const b=Buffer.from('beta\n');
  fs.writeFileSync(path.join(d,'a.txt'),a); fs.writeFileSync(path.join(d,'b.txt'),b);
  const files={'a.txt':sha256(a),'b.txt':sha256(b)};
  const canonical=Object.keys(files).map(rel=>`${rel}\t${files[rel]}\n`).join('');
  const fp={files,combinedSha256:sha256(Buffer.from(canonical))};
  if(fingerprintDrift) fp.files['b.txt']='0'.repeat(64);
  fs.writeFileSync(path.join(d,'RPM_S2B_BUILD_FINGERPRINT.json'),JSON.stringify(fp,null,2)+'\n');
  const lines=[
    `${sha256(a)}  ./a.txt`,
    `${sha256(b)}  ./b.txt`,
    `${sha256(fs.readFileSync(path.join(d,'RPM_S2B_BUILD_FINGERPRINT.json')))}  ./RPM_S2B_BUILD_FINGERPRINT.json`
  ];
  if(runtimeEvidence){
    fs.writeFileSync(path.join(d,'RPM_S2B_BROWSER_ACCEPTANCE_EVIDENCE_old.json'),'{}\n');
    lines.push(`${sha256(Buffer.from('{}\n'))}  ./RPM_S2B_BROWSER_ACCEPTANCE_EVIDENCE_old.json`);
  }
  fs.writeFileSync(path.join(d,'SHA256SUMS.txt'),lines.join('\n')+'\n');
  if(missing) fs.unlinkSync(path.join(d,'b.txt'));
  if(drift) fs.writeFileSync(path.join(d,'a.txt'),'tampered\n');
  return d;
}
function evalDir(d){return evaluatePackageGate({sourceRoot:d,sumsPath:path.join(d,'SHA256SUMS.txt'),fingerprintPath:path.join(d,'RPM_S2B_BUILD_FINGERPRINT.json')});}
let d=fixture(); assert.equal(evalDir(d).status,'PASS');
d=fixture({runtimeEvidence:true}); {const r=evalDir(d); assert.equal(r.status,'FAIL_CLOSED'); assert.equal(r.scope.successorRequired,true); assert.equal(r.scope.status,'FAIL_CLOSED');}
d=fixture({missing:true}); {const r=evalDir(d); assert.equal(r.status,'FAIL_CLOSED'); assert.ok(r.checksumClosure.missing.includes('b.txt')); assert.ok(r.fingerprint.missing.includes('b.txt'));}
d=fixture({drift:true}); {const r=evalDir(d); assert.equal(r.status,'FAIL_CLOSED'); assert.ok(r.checksumClosure.mismatches.some(x=>x.path==='a.txt'));}
d=fixture({fingerprintDrift:true}); {const r=evalDir(d); assert.equal(r.status,'FAIL_CLOSED'); assert.ok(r.fingerprint.mismatches.length>0);}
console.log('RPM_S2B_PACKAGE_GATE_V2_TESTS_PASS');
