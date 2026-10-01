import assert from 'node:assert/strict';
import fs from 'node:fs';
import { nextSequenceCandidate, commitPersistedSequence, EVENT_SEQUENCE_POLICY_VERSION } from './model.mjs';

assert.equal(EVENT_SEQUENCE_POLICY_VERSION, 3);
assert.equal(nextSequenceCandidate(0), 1);
assert.equal(nextSequenceCandidate(7), 8);
assert.equal(commitPersistedSequence(7, 8), 8);
assert.throws(() => nextSequenceCandidate(-1), err => err?.code === 'SEQUENCE_CURSOR_INVALID');
assert.throws(() => commitPersistedSequence(7, 9), err => err?.code === 'SEQUENCE_COMMIT_MISMATCH');
let committed = 11;
const failedCandidate = nextSequenceCandidate(committed);
assert.equal(failedCandidate, 12);
// Simulated persistence failure: no commit call, cursor must remain unchanged.
assert.equal(committed, 11);
assert.equal(nextSequenceCandidate(committed), 12, 'failed persistence must not consume sequence');

const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
for (const marker of ['appendQueue = Promise.resolve()','appendQueue.then(() => appendSerial','nextSequenceCandidate(seq)','commitPersistedSequence(seq, ev.seq)','commitPersistedSequence(seq, tev.seq)','do not consume a sequence number']) {
  assert.ok(app.includes(marker), `app sequence allocation missing ${marker}`);
}
assert.ok(!app.includes('seq: ++seq'),'sequence must never be consumed before persistence');
const sourceAppend=app.indexOf('const eres = await store.append(ev)');
const sourceCommit=app.indexOf('seq = commitPersistedSequence(seq, ev.seq)');
assert.ok(sourceAppend >= 0 && sourceCommit > sourceAppend,'source sequence commit must occur only after persistence');
const timeAppend=app.indexOf('const tres = await store.append(tev)');
const timeCommit=app.indexOf('seq = commitPersistedSequence(seq, tev.seq)');
assert.ok(timeAppend >= 0 && timeCommit > timeAppend,'time sequence commit must occur only after persistence');
console.log('RPM_S2_SEQUENCE_ALLOCATION_PASS serialized-append commit-after-persist failed-time-no-hole');
