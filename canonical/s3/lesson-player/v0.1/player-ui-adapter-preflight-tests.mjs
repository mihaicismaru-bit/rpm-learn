import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { S3_5_PLAYER_UI_ADAPTER_PREFLIGHT } from './player-ui-adapter-preflight.mjs';
import { projectSafeRuntimeFrame, createSafePlayerUiSessionPort } from './player-ui-render-sanitizer.mjs';
import {
  RuntimeKind,
  deriveLessonRuntimeFrame,
  planRuntimeResponse,
  validateRuntimeResponse
} from './lesson-runtime.mjs';
import {
  EventStoreSessionWriter,
  LessonPlayerSessionController
} from './session-controller.mjs';

const htmlUrl = new URL('../../../s2b/v2.6/index.html', import.meta.url);
const appUrl = new URL('../../../s2b/v2.6/app.mjs', import.meta.url);
const [html, app] = await Promise.all([
  readFile(htmlUrl, 'utf8'),
  readFile(appUrl, 'utf8')
]);

assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.status, 'PREFLIGHT_ONLY_S3_4_GATE_REQUIRED');
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.productionIntegrationAllowed, false);
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.mutatesDom, false);
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.rawRuntimeFrameAccepted, false);
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.baselineLock, 'RPM-UX-BASELINE-LOCK-01');

const anchors = Object.values(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.requiredAnchors);
assert.equal(new Set(anchors).size, anchors.length);
for (const selector of anchors) {
  assert.match(selector, /^#[A-Za-z][A-Za-z0-9_-]*$/);
  const id = selector.slice(1);
  assert.ok(html.includes(`id="${id}"`), `baseline missing ${selector}`);
}

const gap = S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.legacySelectorGaps.find(x => x.selector === '#checkBtn');
assert.ok(gap);
assert.equal(gap.policy, 'DO_NOT_REQUIRE_IN_S3_ADAPTER');
assert.ok(app.includes("$('#checkBtn')"), 'legacy app selector observation changed');
assert.equal(html.includes('id="checkBtn"'), false, 'preflight gap unexpectedly disappeared; re-audit adapter contract');

assert.equal(typeof deriveLessonRuntimeFrame, 'function');
assert.equal(typeof planRuntimeResponse, 'function');
assert.equal(typeof validateRuntimeResponse, 'function');
assert.equal(typeof LessonPlayerSessionController, 'function');
assert.equal(typeof EventStoreSessionWriter, 'function');
assert.ok(Object.keys(RuntimeKind).length >= 6);

assert.deepEqual(
  [...S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.inputContract.sessionPort],
  ['start', 'refresh', 'answer', 'complete']
);
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.sanitizerBoundary.projector, 'projectSafeRuntimeFrame');
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.sanitizerBoundary.sessionPortFactory, 'createSafePlayerUiSessionPort');
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.sanitizerBoundary.sourceLane, 'RLS-07');
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.sanitizerBoundary.audioEnabled, false);
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.sanitizerBoundary.speakingEnabled, false);
assert.ok(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.forbiddenResponsibilities.includes('raw-runtime-frame-rendering'));
assert.equal(typeof projectSafeRuntimeFrame, 'function');
assert.equal(typeof createSafePlayerUiSessionPort, 'function');
assert.equal(
  S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.statusPolicy.INTEGRITY_BLOCKED,
  'render-integrity-block-readonly'
);
assert.ok(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.forbiddenResponsibilities.includes('direct-eventstore-write'));
assert.ok(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.forbiddenResponsibilities.includes('speaking-auto-approval'));
assert.equal(S3_5_PLAYER_UI_ADAPTER_PREFLIGHT.deferredLanes.audioMechanics, 'S4.1');

console.log('RPM_S3_5_UI_ADAPTER_PREFLIGHT_PASS baseline-anchors selector-gap safe-render-boundary safe-session-port readonly-integrity boundaries');
