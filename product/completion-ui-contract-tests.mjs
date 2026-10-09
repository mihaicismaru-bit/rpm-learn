import assert from 'node:assert/strict';
import fs from 'node:fs';
const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
for(const marker of [
  "async function completeLesson()",
  "view?.status==='READY_TO_COMPLETE'",
  'id="completeLesson"',
  "$('#completeLesson').onclick=completeLesson",
  "Toate exercițiile sunt gata",
  "await controller.complete()"
]) assert.ok(app.includes(marker),`product completion UI missing ${marker}`);
assert.ok(!app.includes("view?.status==='COMPLETED'?'Lecție terminată':'Așteptare review'"),'generic empty-state must not mislabel READY_TO_COMPLETE');
console.log('RPM_PRODUCT_COMPLETION_UI_PASS ready-to-complete-action visible-finalize deterministic-controller-complete no-false-review-wait');
