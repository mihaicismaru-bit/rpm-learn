#!/usr/bin/env node
/**
 * RPM LEARN S2B fail-closed browser acceptance runner v2.4.
 * Development QA only. It never publishes, authenticates real users, or changes legal/compliance state.
 *
 * Local mode (default): starts a localhost static server and Chromium.
 * Portable mode: set RPM_ORIGIN=https://host.example/rpm/ to test an already-hosted static capsule.
 * Existing-browser mode: set RPM_LAUNCH_BROWSER=0 and RPM_CDP_HOST/RPM_CDP_PORT to attach to an existing CDP browser.
 * Optional env: RPM_CHROME, RPM_PORT, RPM_CDP_HOST, RPM_CDP_PORT, RPM_EVIDENCE_FILE,
 *               RPM_ORIGIN, RPM_SERVE_LOCAL=0, RPM_LAUNCH_BROWSER=0.
 */
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { verifyPreOfflineEvidence, deriveEvidenceAssertions } from './acceptance-contract.mjs';

const HTTP_PORT = Number(process.env.RPM_PORT || 8765);
const CDP_HOST = process.env.RPM_CDP_HOST || '127.0.0.1';
const CDP_PORT = Number(process.env.RPM_CDP_PORT || 9229);
const CHROME = process.env.RPM_CHROME || 'chromium';
const ORIGIN = normalizeOrigin(process.env.RPM_ORIGIN || `http://127.0.0.1:${HTTP_PORT}`);
const SERVE_LOCAL = process.env.RPM_SERVE_LOCAL !== '0' && !process.env.RPM_ORIGIN;
const LAUNCH_BROWSER = process.env.RPM_LAUNCH_BROWSER !== '0';
const EVIDENCE_FILE = process.env.RPM_EVIDENCE_FILE || 'RPM_S2B_BROWSER_ACCEPTANCE_EVIDENCE.json';
const children = [];
let browserVersion = null;
const startedAt = new Date().toISOString();
const buildFingerprint = JSON.parse(readFileSync(new URL('./RPM_S2B_BUILD_FINGERPRINT.json', import.meta.url), 'utf8'));
if (buildFingerprint?.schemaVersion !== 'rpm-s2b-build-fingerprint/v1' || !buildFingerprint?.combinedSha256 || buildFingerprint?.buildId !== 'RPM-S2B-BROWSER-GATE-v2.4') throw new Error('BUILD_FINGERPRINT_INVALID');
const BUILD_ROOT=path.dirname(fileURLToPath(import.meta.url));
function verifyBuildFingerprint(){
  const names=Object.keys(buildFingerprint.files||{});
  if(!names.length) throw new Error('BUILD_FINGERPRINT_EMPTY_FILESET');
  for(const f of names){
    const actual=createHash('sha256').update(readFileSync(path.join(BUILD_ROOT,f))).digest('hex');
    if(actual!==buildFingerprint.files[f]) throw new Error(`BUILD_FINGERPRINT_FILE_MISMATCH:${f}:${actual}`);
  }
  const canonical=names.map(f=>`${f}\t${buildFingerprint.files[f]}\n`).join('');
  const combined=createHash('sha256').update(canonical).digest('hex');
  if(combined!==buildFingerprint.combinedSha256) throw new Error(`BUILD_FINGERPRINT_COMBINED_MISMATCH:${combined}`);
  return true;
}
verifyBuildFingerprint();

function normalizeOrigin(input){
  const u = new URL(input);
  if (!['http:','https:'].includes(u.protocol)) throw new Error(`UNSUPPORTED_ORIGIN_PROTOCOL:${u.protocol}`);
  u.hash=''; u.search='';
  return u.href.replace(/\/+$/,'');
}

const stop = () => { for (const c of children.reverse()) try { c.kill('SIGTERM'); } catch {} };
process.on('exit', stop);
process.on('SIGINT', () => { stop(); process.exit(130); });

function classifyBlock(message='') {
  const m=String(message);
  if (m.includes('BUILD_FINGERPRINT_')) return 'BUILD_FINGERPRINT_INTEGRITY_FAILURE';
  if (m.includes('ERR_BLOCKED_BY_ADMINISTRATOR')) return 'MANAGED_BROWSER_URL_POLICY';
  if (m.includes('ERR_CONNECTION_REFUSED')) return 'LOCAL_HTTP_UNAVAILABLE';
  if (m.includes('CDP_UNAVAILABLE')) return 'CDP_UNAVAILABLE';
  if (m.includes('SERVICE_WORKER_NOT_CONTROLLING')) return 'SERVICE_WORKER_CONTROL_FAILURE';
  if (m.includes('ACCEPTANCE_RUNTIME_') || m.includes('POST_OFFLINE_ASSERTIONS_') || m.includes('EVIDENCE_ASSERTION_')) return 'ACCEPTANCE_EVIDENCE_CONTRACT_FAILURE';
  if (m.includes('PRE_OFFLINE_RUNTIME_FAIL')) return 'PRE_OFFLINE_RUNTIME_FAILURE';
  if (m.includes('OFFLINE_SHELL_FAIL')) return 'OFFLINE_SHELL_FAILURE';
  if (m.includes('UNSUPPORTED_ORIGIN_PROTOCOL')) return 'INVALID_TEST_ORIGIN';
  return 'RUNTIME_FAILURE';
}

function writeEvidence({status, phase, message, assertions=[]}) {
  const payload = {
    schemaVersion: 'rpm-s2b-browser-evidence/v3',
    checkpoint: 'RPM-S2B',
    status,
    phase,
    classification: status === 'PASS' ? 'ACCEPTED' : classifyBlock(message),
    startedAt,
    finishedAt: new Date().toISOString(),
    browser: browserVersion,
    build: { id: buildFingerprint.buildId, combinedSha256: buildFingerprint.combinedSha256, fingerprintSchema: buildFingerprint.schemaVersion },
    chromeExecutable: LAUNCH_BROWSER ? CHROME : null,
    origin: ORIGIN,
    executionMode: {
      serveLocal: SERVE_LOCAL,
      launchBrowser: LAUNCH_BROWSER,
      cdpEndpoint: `http://${CDP_HOST}:${CDP_PORT}`,
      originMode: process.env.RPM_ORIGIN ? 'EXTERNAL_ORIGIN' : 'LOCAL_ORIGIN'
    },
    message: String(message || ''),
    assertions,
    boundaries: {
      productionRelease: false,
      realUserData: false,
      legalComplianceClaims: false,
      certificateIssuance: false,
      learningEngineSeparateFromComplianceEngine: true
    }
  };
  writeFileSync(EVIDENCE_FILE, JSON.stringify(payload, null, 2) + '\n');
  return payload;
}

async function waitJson(url, tries=100) {
  let last;
  for (let i=0;i<tries;i++) {
    try { const r=await fetch(url); if (r.ok) return await r.json(); } catch (e) { last=e; }
    await sleep(100);
  }
  throw new Error(`CDP_UNAVAILABLE:${url}:${last?.message || 'timeout'}`);
}

class CDP {
  constructor(ws) { this.ws=ws; this.seq=0; this.pending=new Map(); }
  static async connect(url) {
    const ws = new WebSocket(url, { headers: { Origin: `http://${CDP_HOST}:${CDP_PORT}` } });
    const c = new CDP(ws);
    ws.onmessage = e => { const m=JSON.parse(e.data); if (m.id && c.pending.has(m.id)) { const {resolve,reject}=c.pending.get(m.id); c.pending.delete(m.id); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result||{}); } };
    await new Promise((resolve,reject)=>{ ws.onopen=resolve; ws.onerror=reject; });
    return c;
  }
  call(method, params={}) {
    const id=++this.seq;
    return new Promise((resolve,reject)=>{ this.pending.set(id,{resolve,reject}); this.ws.send(JSON.stringify({id,method,params})); });
  }
  async eval(expression, awaitPromise=false) {
    const r=await this.call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise});
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    return r.result?.value;
  }
}

async function main() {
  if (SERVE_LOCAL) {
    const server=spawn('python3',['-m','http.server',String(HTTP_PORT),'--bind','127.0.0.1'],{cwd:new URL('.',import.meta.url).pathname,stdio:'ignore'});
    children.push(server);
  }
  if (LAUNCH_BROWSER) {
    const profile=`/tmp/rpm-learn-cdp-${process.pid}`;
    const chrome=spawn(CHROME,[
      '--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu',
      `--remote-debugging-port=${CDP_PORT}`,'--remote-allow-origins=*',`--user-data-dir=${profile}`,'about:blank'
    ],{stdio:'ignore'});
    children.push(chrome);
  }

  const cdpBase=`http://${CDP_HOST}:${CDP_PORT}`;
  const version=await waitJson(`${cdpBase}/json/version`);
  browserVersion=version.Browser || null;
  const pages=await waitJson(`${cdpBase}/json`);
  if (!Array.isArray(pages) || !pages[0]?.webSocketDebuggerUrl) throw new Error('CDP_UNAVAILABLE:NO_PAGE_TARGET');
  const cdp=await CDP.connect(pages[0].webSocketDebuggerUrl);
  await cdp.call('Page.enable'); await cdp.call('Runtime.enable'); await cdp.call('Network.enable');

  const acceptanceUrl=`${ORIGIN}/browser-acceptance.html`;
  const nav=await cdp.call('Page.navigate',{url:acceptanceUrl});
  if (nav.errorText) throw new Error(`BROWSER_NAVIGATION_BLOCKED:${nav.errorText}`);

  let state=null, text='';
  for (let i=0;i<120;i++) {
    await sleep(100);
    state=await cdp.eval('document.documentElement.dataset.runtimeStatus || null');
    text=await cdp.eval("document.querySelector('#result')?.textContent || ''");
    if (state==='PASS_PRE_OFFLINE' || state==='FAIL') break;
  }
  if (state!=='PASS_PRE_OFFLINE') throw new Error(`PRE_OFFLINE_RUNTIME_FAIL:${text}`);
  const runtimeSnapshot=await cdp.eval('globalThis.__rpmAcceptance ? {contractVersion:globalThis.__rpmAcceptance.contractVersion,checks:[...globalThis.__rpmAcceptance.checks]} : null');
  // Fail closed if the page did not actually execute every check required by each evidence claim.
  verifyPreOfflineEvidence(runtimeSnapshot);

  const appNav=await cdp.call('Page.navigate',{url:`${ORIGIN}/index.html`});
  if (appNav.errorText) throw new Error(`APP_NAVIGATION_BLOCKED:${appNav.errorText}`);
  await sleep(800);
  await cdp.eval('navigator.serviceWorker.ready.then(()=>true)', true);
  await cdp.call('Page.reload',{ignoreCache:true}); await sleep(700);
  if (!(await cdp.eval('!!navigator.serviceWorker.controller'))) throw new Error('SERVICE_WORKER_NOT_CONTROLLING');

  await cdp.call('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:0,uploadThroughput:0,connectionType:'none'});
  await cdp.call('Page.reload',{ignoreCache:true}); await sleep(900);
  const role=await cdp.eval("document.querySelector('#roleBadge')?.textContent || ''");
  const title=await cdp.eval('document.title');
  if (!String(role).includes('LEARNER')) throw new Error(`OFFLINE_SHELL_FAIL:${title}|${role}`);
  await cdp.call('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1,connectionType:'wifi'});

  const assertions = [...deriveEvidenceAssertions(runtimeSnapshot,{serviceWorkerControl:true,offlineLearnerShellReload:true})];
  writeEvidence({status:'PASS', phase:'OFFLINE_RELOAD_COMPLETE', message:'RPM_S2B_BROWSER_ACCEPTANCE_PASS', assertions});
  console.log(`RPM_S2B_BROWSER_ACCEPTANCE_PASS browser=${browserVersion} origin=${ORIGIN} indexeddb replay conflict-guard source-linked-time replay-quarantine chain-quarantine role-guard semantic-integrity canonical-path sw-cache offline-shell evidence=${EVIDENCE_FILE}`);
  stop();
}

main().catch(err => {
  const message = err?.message || String(err);
  const blocked = message.includes('ERR_BLOCKED_BY_ADMINISTRATOR') || message.includes('CDP_UNAVAILABLE');
  const status = blocked ? 'BLOCKED' : 'FAIL';
  const phase = message.includes('BUILD_FINGERPRINT_') ? 'BUILD_INTEGRITY' :
    message.startsWith('BROWSER_NAVIGATION_BLOCKED') ? 'INITIAL_NAVIGATION' :
    message.startsWith('APP_NAVIGATION_BLOCKED') ? 'APP_NAVIGATION' :
    message.includes('ACCEPTANCE_RUNTIME_') || message.includes('POST_OFFLINE_ASSERTIONS_') || message.includes('EVIDENCE_ASSERTION_') ? 'EVIDENCE_CONTRACT' :
    message.includes('PRE_OFFLINE_RUNTIME_FAIL') ? 'PRE_OFFLINE_ASSERTIONS' :
    message.includes('SERVICE_WORKER_NOT_CONTROLLING') ? 'SERVICE_WORKER_CONTROL' :
    message.includes('OFFLINE_SHELL_FAIL') ? 'OFFLINE_RELOAD' :
    message.includes('CDP_UNAVAILABLE') ? 'CDP_BOOTSTRAP' : 'BOOTSTRAP';
  const evidence = writeEvidence({status, phase, message, assertions:[]});
  console.error(`RPM_S2B_BROWSER_ACCEPTANCE_${status} class=${evidence.classification} ${message} evidence=${EVIDENCE_FILE}`);
  stop();
  process.exit(2);
});
