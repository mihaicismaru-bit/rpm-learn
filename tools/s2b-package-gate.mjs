import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sha256 = b => createHash('sha256').update(b).digest('hex');

export function parseSha256Sums(text){
  const entries=[];
  for(const raw of text.split(/\r?\n/)){
    const line=raw.trim();
    if(!line) continue;
    const m=line.match(/^([0-9a-f]{64})\s+\*?(?:\.\/)?(.+)$/i);
    if(!m) throw new Error(`INVALID_SHA256SUMS_LINE:${raw}`);
    entries.push({sha256:m[1].toLowerCase(),path:m[2]});
  }
  return entries;
}

export function evaluatePackageGate(root){
  const fpPath=path.join(root,'RPM_S2B_BUILD_FINGERPRINT.json');
  const sumsPath=path.join(root,'SHA256SUMS.txt');
  const result={
    schema:'rpm-s2b-package-gate/v1',
    root:path.resolve(root),
    status:'FAIL_CLOSED',
    fingerprint:{status:'FAIL_CLOSED',missing:[],mismatches:[],combinedExpected:null,combinedActual:null},
    checksumClosure:{status:'FAIL_CLOSED',missing:[],mismatches:[],entries:0},
    notes:[]
  };

  if(!fs.existsSync(fpPath)){
    result.fingerprint.missing.push('RPM_S2B_BUILD_FINGERPRINT.json');
  }else{
    const fp=JSON.parse(fs.readFileSync(fpPath,'utf8'));
    const names=Object.keys(fp.files||{});
    result.fingerprint.combinedExpected=fp.combinedSha256||null;
    for(const rel of names){
      const p=path.join(root,rel);
      if(!fs.existsSync(p)){
        result.fingerprint.missing.push(rel);
        continue;
      }
      const actual=sha256(fs.readFileSync(p));
      if(actual!==String(fp.files[rel]).toLowerCase()){
        result.fingerprint.mismatches.push({path:rel,expected:String(fp.files[rel]).toLowerCase(),actual});
      }
    }
    const canonical=names.map(rel=>`${rel}\t${fp.files[rel]}\n`).join('');
    result.fingerprint.combinedActual=sha256(Buffer.from(canonical));
    const combinedOk=result.fingerprint.combinedExpected===result.fingerprint.combinedActual;
    if(!combinedOk) result.fingerprint.mismatches.push({path:'<combined>',expected:result.fingerprint.combinedExpected,actual:result.fingerprint.combinedActual});
    if(result.fingerprint.missing.length===0 && result.fingerprint.mismatches.length===0){
      result.fingerprint.status='PASS';
    }
  }

  if(!fs.existsSync(sumsPath)){
    result.checksumClosure.missing.push('SHA256SUMS.txt');
  }else{
    const entries=parseSha256Sums(fs.readFileSync(sumsPath,'utf8'));
    result.checksumClosure.entries=entries.length;
    for(const e of entries){
      const p=path.join(root,e.path);
      if(!fs.existsSync(p)){
        result.checksumClosure.missing.push(e.path);
        continue;
      }
      const actual=sha256(fs.readFileSync(p));
      if(actual!==e.sha256) result.checksumClosure.mismatches.push({path:e.path,expected:e.sha256,actual});
    }
    if(result.checksumClosure.missing.length===0 && result.checksumClosure.mismatches.length===0){
      result.checksumClosure.status='PASS';
    }
  }

  if(result.fingerprint.status==='PASS' && result.checksumClosure.status==='PASS') result.status='PASS';
  if(result.fingerprint.status==='PASS' && result.checksumClosure.status!=='PASS'){
    result.notes.push('Fingerprint integrity passes, but package checksum closure fails; promotion remains fail-closed.');
  }
  return result;
}

function runCli(){
  const root=process.argv[2] ? path.resolve(process.argv[2]) : path.dirname(fileURLToPath(import.meta.url));
  const result=evaluatePackageGate(root);
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.status==='PASS'?0:1;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) runCli();
