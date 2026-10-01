import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BUILD_ID='RPM-S2B-BROWSER-GATE-v2.6';
const FP='285a7fd70c1d92b4731d4663af95ec48b1fe02c322ad686ff7d4c3d66aeaffc0';

export function evaluate(rootDir='canonical/s2b/v2.6'){
  const root=path.resolve(rootDir);
  const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
  const eventStore=read('event-store.mjs');
  const browser=read('browser-acceptance.html');
  const model=read('model.mjs');
  const fingerprint=JSON.parse(read('RPM_S2B_BUILD_FINGERPRINT.json'));
  const guardToken="if (event.type === 'TIME_SLICE' && existingTimeForSource && existingTimeForSource.eventId !== event.eventId)";
  const guardPos=eventStore.indexOf(guardToken);
  const semanticPos=eventStore.indexOf('const semantic = validateEventSemantics');
  const guardWindow=guardPos>=0?eventStore.slice(guardPos,guardPos+700):'';
  const checks={
    exactBuildId:fingerprint.buildId===BUILD_ID,
    exactFingerprint:fingerprint.combinedSha256===FP,
    uniqueTimeSourceIndex:/scopeTimeSource['"][\s\S]{0,180}?unique\s*:\s*true/m.test(eventStore),
    duplicateGuardPresent:guardPos>=0,
    semanticValidationPresent:semanticPos>=0,
    duplicateGuardBeforeSemantic:guardPos>=0&&semanticPos>=0&&guardPos<semanticPos,
    duplicateGuardConflictClass:guardWindow.includes("new EventConflictError('TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED'"),
    replayDuplicateSourceFailClosed:model.includes("code: 'TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED'"),
    browserExpectsConflictClass:browser.includes("err instanceof EventConflictError && err.code === 'TIME_SLICE_SOURCE_ALREADY_ATTRIBUTED'"),
    browserRetainsAssertion:browser.includes("assert(duplicateAttributionBlocked, 'duplicate-time-attribution-blocked')")
  };
  const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
  return {schema:'rpm-s2b-v26-runtime-contract-lint/v2',status:failed.length?'FAIL_CLOSED':'PASS',buildId:fingerprint.buildId,combinedFingerprint:fingerprint.combinedSha256,guardPos,semanticPos,checks,failed};
}

function main(){
  const i=process.argv.indexOf('--root');
  const root=i>=0?process.argv[i+1]:'canonical/s2b/v2.6';
  const result=evaluate(root);
  console.log(JSON.stringify(result,null,2));
  process.exitCode=result.status==='PASS'?0:1;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) main();
