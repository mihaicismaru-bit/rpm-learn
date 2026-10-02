#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import {
  EVIDENCE_ASSERTION_REQUIREMENTS,
  POST_OFFLINE_EVIDENCE_ASSERTIONS
} from '../canonical/s2b/v2.6/acceptance-contract.mjs';

export const EXPECTED = Object.freeze({
  schemaVersion: 'rpm-s2b-browser-evidence/v3',
  checkpoint: 'RPM-S2B',
  status: 'PASS',
  phase: 'OFFLINE_RELOAD_COMPLETE',
  classification: 'ACCEPTED',
  message: 'RPM_S2B_BROWSER_ACCEPTANCE_PASS',
  buildId: 'RPM-S2B-BROWSER-GATE-v2.6.1',
  combinedSha256: 'ea0cc17f8ef4935897eedaab632621327c2e5b7d78680e7241d59ab002efb8eb',
  fingerprintSchema: 'rpm-s2b-build-fingerprint/v1',
  origin: 'https://mihaicismaru-bit.github.io/rpm-learn/s2b-v26'
});

export const EXPECTED_ASSERTIONS = Object.freeze([
  ...Object.keys(EVIDENCE_ASSERTION_REQUIREMENTS),
  ...POST_OFFLINE_EVIDENCE_ASSERTIONS
]);

const schema = JSON.parse(fs.readFileSync(
  new URL('../canonical/s2b/v2.6/schemas/browser-acceptance-evidence.schema.json', import.meta.url),
  'utf8'
));

function fail(code, detail='') {
  const err = new Error(detail ? `${code}:${detail}` : code);
  err.code = code;
  throw err;
}

function exactKeys(value, schemaNode, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('EVIDENCE_OBJECT_REQUIRED', label);
  const allowed = new Set(Object.keys(schemaNode.properties || {}));
  const required = schemaNode.required || [];
  for (const key of required) if (!(key in value)) fail('EVIDENCE_REQUIRED_FIELD_MISSING', `${label}.${key}`);
  if (schemaNode.additionalProperties === false) {
    for (const key of Object.keys(value)) if (!allowed.has(key)) fail('EVIDENCE_EXTRA_FIELD', `${label}.${key}`);
  }
}

function validDateTime(value, label) {
  if (typeof value !== 'string' || !value || Number.isNaN(Date.parse(value))) fail('EVIDENCE_DATETIME_INVALID', label);
  return Date.parse(value);
}

export function validateBrowserEvidence(payload) {
  exactKeys(payload, schema, 'root');
  exactKeys(payload.build, schema.properties.build, 'build');
  exactKeys(payload.executionMode, schema.properties.executionMode, 'executionMode');
  exactKeys(payload.boundaries, schema.properties.boundaries, 'boundaries');

  const scalarChecks = [
    [payload.schemaVersion, EXPECTED.schemaVersion, 'schemaVersion'],
    [payload.checkpoint, EXPECTED.checkpoint, 'checkpoint'],
    [payload.status, EXPECTED.status, 'status'],
    [payload.phase, EXPECTED.phase, 'phase'],
    [payload.classification, EXPECTED.classification, 'classification'],
    [payload.message, EXPECTED.message, 'message'],
    [payload.build.id, EXPECTED.buildId, 'build.id'],
    [payload.build.combinedSha256, EXPECTED.combinedSha256, 'build.combinedSha256'],
    [payload.build.fingerprintSchema, EXPECTED.fingerprintSchema, 'build.fingerprintSchema'],
    [payload.origin, EXPECTED.origin, 'origin'],
    [payload.executionMode.originMode, 'EXTERNAL_ORIGIN', 'executionMode.originMode']
  ];
  for (const [actual, expected, label] of scalarChecks) {
    if (actual !== expected) fail('EVIDENCE_VALUE_MISMATCH', `${label} expected=${expected} actual=${actual}`);
  }

  if (payload.executionMode.serveLocal !== false) fail('EVIDENCE_EXECUTION_MODE_INVALID', 'serveLocal');
  if (typeof payload.executionMode.launchBrowser !== 'boolean') fail('EVIDENCE_EXECUTION_MODE_INVALID', 'launchBrowser');
  if (typeof payload.executionMode.cdpEndpoint !== 'string' || !/^https?:\/\//.test(payload.executionMode.cdpEndpoint)) {
    fail('EVIDENCE_EXECUTION_MODE_INVALID', 'cdpEndpoint');
  }
  if (payload.executionMode.launchBrowser && (typeof payload.chromeExecutable !== 'string' || !payload.chromeExecutable.trim())) {
    fail('EVIDENCE_BROWSER_PROVENANCE_INVALID', 'chromeExecutable');
  }
  if (typeof payload.browser !== 'string' || !payload.browser.trim()) fail('EVIDENCE_BROWSER_PROVENANCE_INVALID', 'browser');

  const started = validDateTime(payload.startedAt, 'startedAt');
  const finished = validDateTime(payload.finishedAt, 'finishedAt');
  if (finished < started) fail('EVIDENCE_TIME_ORDER_INVALID');

  const b = payload.boundaries;
  if (b.productionRelease !== false) fail('EVIDENCE_BOUNDARY_VIOLATION', 'productionRelease');
  if (b.realUserData !== false) fail('EVIDENCE_BOUNDARY_VIOLATION', 'realUserData');
  if (b.legalComplianceClaims !== false) fail('EVIDENCE_BOUNDARY_VIOLATION', 'legalComplianceClaims');
  if (b.certificateIssuance !== false) fail('EVIDENCE_BOUNDARY_VIOLATION', 'certificateIssuance');
  if (b.learningEngineSeparateFromComplianceEngine !== true) fail('EVIDENCE_BOUNDARY_VIOLATION', 'learningEngineSeparateFromComplianceEngine');

  if (!Array.isArray(payload.assertions)) fail('EVIDENCE_ASSERTIONS_INVALID', 'not-array');
  const seen = new Set();
  for (const a of payload.assertions) {
    if (typeof a !== 'string' || !a) fail('EVIDENCE_ASSERTIONS_INVALID', 'non-string');
    if (seen.has(a)) fail('EVIDENCE_ASSERTION_DUPLICATE', a);
    seen.add(a);
  }
  const expected = new Set(EXPECTED_ASSERTIONS);
  const missing = EXPECTED_ASSERTIONS.filter(a => !seen.has(a));
  const extra = payload.assertions.filter(a => !expected.has(a));
  if (missing.length) fail('EVIDENCE_ASSERTION_MISSING', missing.join(','));
  if (extra.length) fail('EVIDENCE_ASSERTION_UNEXPECTED', extra.join(','));
  if (payload.assertions.length !== EXPECTED_ASSERTIONS.length) fail('EVIDENCE_ASSERTION_COUNT_MISMATCH');

  return Object.freeze({
    accepted: true,
    buildId: payload.build.id,
    combinedSha256: payload.build.combinedSha256,
    origin: payload.origin,
    browser: payload.browser,
    assertionCount: payload.assertions.length,
    startedAt: payload.startedAt,
    finishedAt: payload.finishedAt
  });
}

function cli() {
  const input = process.argv[2] || path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../canonical/s2b/v2.6/RPM_S2B_BROWSER_ACCEPTANCE_EVIDENCE.json'
  );
  const payload = JSON.parse(fs.readFileSync(input, 'utf8'));
  const result = validateBrowserEvidence(payload);
  console.log(`RPM_S2B_V261_BROWSER_EVIDENCE_GATE_PASS build=${result.buildId} hash=${result.combinedSha256} assertions=${result.assertionCount} origin=${result.origin} browser=${result.browser}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) cli();
