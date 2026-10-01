import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sha256 = b => createHash('sha256').update(b).digest('hex');
const RUNTIME_EVIDENCE_RE = /^RPM_S2B_BROWSER_ACCEPTANCE_EVIDENCE_/;

export function parseSha256Sums(text){
  const entries=[];
  const seen=new Set();
  for(const raw of text.split(/\r?\n/)){
    if(!raw.trim()) continue;
    const m=raw.match(/^([0-9a-f]{64})\s+\*?(?:\.\/)?(.+?)\s*$/i);
    if(!m) throw new Error(`INVALID_SHA256SUMS_LINE:${raw}`);
    const rel=m[2].replace(/\\/g,'/');
    if(path.isAbsolute(rel) || rel.split('/').includes('..')) throw new Error(`UNSAFE_SHA256SUMS_PATH:${rel}`);
    if(seen.has(rel)) throw new Error(`DUPLICATE_SHA256SUMS_PATH:${rel}`);
    seen.add(rel);
    entries.push({sha256:m[1].toLowerCase(),path:rel});
  }
  return entries;
}

function checkFile(root, rel, expected){
  const p=path.join(root,rel);
  if(!fs.existsSync(p)) return {kind:'missing',path:rel};
  const actual=sha256(fs.readFileSync(p));
  return actual===String(expected).toLowerCase()?null:{kind:'mismatch',path:rel,expected:String(expected).toLowerCase(),actual};
}

export function evaluatePackageGate({sourceRoot,sumsPath,fingerprintPath}){
  const root=path.resolve(sourceRoot);
  const sums=path.resolve(sumsPath);
  const fp=path.resolve(fingerprintPath);
  const result={
    schema:'rpm-s2b-package-gate/v2',
    status:'FAIL_CLOSED',
    sourceRoot:root,
    scope:{status:'FAIL_CLOSED',runtimeEvidenceEntries:[],successorRequired:false},
    fingerprint:{status:'FAIL_CLOSED',missing:[],mismatches:[],combinedExpected:null,combinedActual:null,files:0},
    checksumClosure:{status:'FAIL_CLOSED',missing:[],mismatches:[],entries:0},
    notes:[]
  };

  if(!fs.existsSync(sums)){
    result.checksumClosure.missing.push(path.basename(sums));
  }else{
    const entries=parseSha256Sums(fs.readFileSync(sums,'utf8'));
    result.checksumClosure.entries=entries.length;
    result.scope.runtimeEvidenceEntries=entries.filter(e=>RUNTIME_EVIDENCE_RE.test(path.basename(e.path))).map(e=>e.path);
    if(result.scope.runtimeEvidenceEntries.length){
      result.scope.successorRequired=true;
      result.notes.push('Historical/runtime browser evidence is checksum-bound in the source package; successor package required.');
    }else{
      result.scope.status='PASS';
    }
    for(const e of entries){
      const issue=checkFile(root,e.path,e.sha256);
      if(issue?.kind==='missing') result.checksumClosure.missing.push(issue.path);
      if(issue?.kind==='mismatch') result.checksumClosure.mismatches.push(issue);
    }
    if(result.checksumClosure.missing.length===0 && result.checksumClosure.mismatches.length===0){
      result.checksumClosure.status='PASS';
    }
  }

  if(!fs.existsSync(fp)){
    result.fingerprint.missing.push(path.basename(fp));
  }else{
    const doc=JSON.parse(fs.readFileSync(fp,'utf8'));
    const files=doc.files||{};
    const names=Object.keys(files);
    result.fingerprint.files=names.length;
    result.fingerprint.combinedExpected=doc.combinedSha256||null;
    for(const rel of names){
      const issue=checkFile(root,rel,files[rel]);
      if(issue?.kind==='missing') result.fingerprint.missing.push(issue.path);
      if(issue?.kind==='mismatch') result.fingerprint.mismatches.push(issue);
    }
    const canonical=names.map(rel=>`${rel}\t${String(files[rel]).toLowerCase()}\n`).join('');
    result.fingerprint.combinedActual=sha256(Buffer.from(canonical));
    if(result.fingerprint.combinedExpected!==result.fingerprint.combinedActual){
      result.fingerprint.mismatches.push({kind:'combined',path:'<combined>',expected:result.fingerprint.combinedExpected,actual:result.fingerprint.combinedActual});
    }
    if(result.fingerprint.missing.length===0 && result.fingerprint.mismatches.length===0){
      result.fingerprint.status='PASS';
    }
  }

  if(result.scope.status==='PASS' && result.fingerprint.status==='PASS' && result.checksumClosure.status==='PASS'){
    result.status='PASS';
  }
  return result;
}

function parseArgs(argv){
  const out={};
  for(let i=0;i<argv.length;i++){
    const a=argv[i];
    if(a==='--source-root') out.sourceRoot=argv[++i];
    else if(a==='--sums') out.sumsPath=argv[++i];
    else if(a==='--fingerprint') out.fingerprintPath=argv[++i];
    else throw new Error(`UNKNOWN_ARG:${a}`);
  }
  if(!out.sourceRoot || !out.sumsPath || !out.fingerprintPath) throw new Error('USAGE: --source-root <dir> --sums <file> --fingerprint <file>');
  return out;
}

function runCli(){
  const args=parseArgs(process.argv.slice(2));
  const result=evaluatePackageGate(args);
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.status==='PASS'?0:1;
}

if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) runCli();
