#!/usr/bin/env node
/**
 * One-command external standards-browser gate for RPM LEARN S2B v2.6.1.
 * Development/test only. It does not publish, promote, enable production,
 * touch real learner/employer data, make legal claims, or issue certificates.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import process from 'node:process';

export const HOSTED_GATE = Object.freeze({
  origin: 'https://mihaicismaru-bit.github.io/rpm-learn/s2b-v26',
  buildId: 'RPM-S2B-BROWSER-GATE-v2.6.1',
  combinedSha256: 'b534ff27973a982282e5dda3f43680f6b79c0218eb0501bae1038594c2b82cae',
  fingerprintSchema: 'rpm-s2b-build-fingerprint/v1',
  evidenceFile: 'RPM_S2B_BROWSER_ACCEPTANCE_EVIDENCE.json'
});

const here = path.dirname(fileURLToPath(import.meta.url));
const runner = path.resolve(here, '../canonical/s2b/v2.6/browser-acceptance-runner.mjs');
const gate = path.resolve(here, './s2b-v261-browser-evidence-gate.mjs');

export function resolveChrome(explicit=process.env.RPM_CHROME || '') {
  const candidates = [
    explicit,
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {}
  }
  throw new Error('STANDARDS_CHROMIUM_NOT_FOUND');
}

export async function verifyHostedIdentity(fetchImpl=fetch) {
  const url = `${HOSTED_GATE.origin}/RPM_S2B_BUILD_FINGERPRINT.json`;
  const response = await fetchImpl(url, { cache: 'no-store', redirect: 'error' });
  if (!response.ok) throw new Error(`HOSTED_FINGERPRINT_HTTP_${response.status}`);
  const fp = await response.json();
  if (fp?.schemaVersion !== HOSTED_GATE.fingerprintSchema) throw new Error('HOSTED_FINGERPRINT_SCHEMA_MISMATCH');
  if (fp?.buildId !== HOSTED_GATE.buildId) throw new Error('HOSTED_BUILD_ID_MISMATCH');
  if (fp?.combinedSha256 !== HOSTED_GATE.combinedSha256) throw new Error('HOSTED_BUILD_HASH_MISMATCH');
  return fp;
}

function runNode(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`CHILD_EXIT_${code}`)));
  });
}

export async function runHostedGate() {
  const chrome = resolveChrome();
  await verifyHostedIdentity();
  const evidence = path.resolve(process.cwd(), HOSTED_GATE.evidenceFile);
  const env = {
    ...process.env,
    RPM_ORIGIN: HOSTED_GATE.origin,
    RPM_SERVE_LOCAL: '0',
    RPM_LAUNCH_BROWSER: '1',
    RPM_CHROME: chrome,
    RPM_EVIDENCE_FILE: evidence
  };
  await runNode([runner], env);
  await runNode([gate, evidence], env);
  console.log(`RPM_S2B_V261_HOSTED_OFFLINE_GATE_PASS build=${HOSTED_GATE.buildId} hash=${HOSTED_GATE.combinedSha256} origin=${HOSTED_GATE.origin} evidence=${evidence}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runHostedGate().catch(err => {
    console.error(`RPM_S2B_V261_HOSTED_OFFLINE_GATE_FAIL ${err?.message || err}`);
    process.exit(2);
  });
}
