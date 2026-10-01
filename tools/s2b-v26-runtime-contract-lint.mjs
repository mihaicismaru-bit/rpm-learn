import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const EXPECTED_BUILD_ID = 'RPM-S2B-BROWSER-GATE-v2.6';
const EXPECTED_FINGERPRINT = '285a7fd70c1d92b4731d4663af95ec48b1fe02c322ad686ff7d4c3d66aeaffc0';

function readText(root, rel) {
  const p = path.join(root, rel);
  if (!fs.existsSync(p)) throw new Error(`MISSING_RUNTIME_CONTRACT_FILE:${rel}`);
  return fs.readFileSync(p, 'utf8');
}

export function evaluateRuntimeContract(rootDir) {
  const root = path.resolve(rootDir);
  const checks = [];
  const add = (id, pass, detail = null) => checks.push({ id, pass: !!pass, detail });

  let eventStore = '';
  let browser = '';
  let model = '';
  let fingerprint = null;
  try {
    eventStore = readText(root, 'event-store.mjs');
    browser = readText(root, 'browser-acceptance.html');
    model = readText(root, 'model.mjs');
    fingerprint = JSON.parse(readText(root, 'RPM_S2B_BUILD_FINGERPRINT.json'));
  } catch (err) {
    return {
      schema: 'rpm-s2b-v26-runtime-contract-lint/v1',
      status: 'FAIL_CLOSED',
      root,
      checks,
      error: String(err?.message || err)
    };
  }

  add('exact-build-id', fingerprint.buildId === EXPECTED_BUILD_ID, fingerprint.buildId || null);
  add('exact-combined-fingerprint', fingerprint.combinedSha256 === EXPECTED_FINGERPRINT, fingerprint.combinedSha256 || null);

  const timeIndexUnique = /createIndex\(\s*['"]scopeTimeSource['"]\s*,[\s\S]{0,240}?\{\s*unique\s*:\s*true\s*\}\s*\)/m.test(eventStore);
  add('scope-time-source-index-unique', timeIndexUnique);

  const guardToken = "if (event.type === 'TIME_SLICE' && existingTimeForSource && existingTimeForSource.eventId !== event.eventId)";
  const guardPos = eventStore.indexOf(guardToken);
  const semanticPos = eventStore.indexOf('const semantic = validateEventSemantics');
  add('duplicate-guard-present', guardPos >= 0, guardPos);
  add('semantic-validation-present', semanticPos >= 0, semanticPos);
  add('duplicate-guard-precedes-semantic-validation', guardPos >= 0 && semanticPos >= 0 && guardPos < semanticPos, { guardPos, semanticPos });

  const guardWindow = guardPos >= 0 ? eventStore.slice(guardPos, guardPos + 700) : '';
  add(
    'duplicate-guard-emits-conflict-error',
    guardWindow.includes("new EventConflictError('TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED'"),
    null
  );

  add(
    'replay-semantic-duplicate-source-fail-closed',
    model.includes("code: 'TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED'"),
    null
  );

  add(
    'browser-contract-expects-conflict-error',
    browser.includes("err instanceof EventConflictError && err.code === 'TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED'"),
    null
  );
  add(
    'browser-contract-retains-duplicate-attribution-assertion',
    browser.includes("assert(duplicateAttributionBlocked, 'duplicate-time-attribution-blocked')"),
    null
  );

  const failed = checks.filter(c => !c.pass);
  return {
    schema: 'rpm-s2b-v26-runtime-contract-lint/v1',
    status: failed.length ? 'FAIL_CLOSED' : 'PASS',
    root,
    buildId: fingerprint.buildId || null,
    combinedFingerprint: fingerprint.combinedSha256 || null,
    checks,
    failed: failed.map(c => c.id)
  };
}

function parseArgs(argv) {
  let root = 'canonical/s2b/v2.6';
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--root') root = argv[++i];
    else throw new Error(`UNKNOWN_ARG:${argv[i]}`);
  }
  return { root };
}

function runCli() {
  const { root } = parseArgs(process.argv.slice(2));
  const result = evaluateRuntimeContract(root);
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.status === 'PASS' ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runCli();
