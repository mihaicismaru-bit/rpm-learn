import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {AUDIO_VOICE_POLICY} from '../../../s4/audio/v0.1/audio-mechanics.mjs';
import {PLAYER_UI_RENDER_COMMANDS_VERSION} from '../../../s3/lesson-player/v0.1/player-ui-render-commands.mjs';
import {CERTIFICATE_GATE_VERSION,requireCertificateIssuance,CertificateGateError} from '../../../s11/certificate/v0.1/certificate-gate.mjs';

const gitBlob=path=>{
  const data=fs.readFileSync(path);
  return crypto.createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
};

const locked=[
  ['canonical/s2b/v2.6/index.html','9826fa917604c9affd805cee12a56b440e6163f6'],
  ['canonical/s2b/v2.6/app.mjs','f55d4273f4acbcebceafb756174745ac5a4c628d'],
  ['canonical/s4/audio/v0.1/audio-mechanics.mjs','d4b923e78986e2a75b76af5a3130e00fc1be43ea'],
  ['canonical/s3/lesson-player/v0.1/player-ui-render-commands.mjs','7f76fe1e1a9c856ba7702a56b6d25696751e3728']
];
for(const [path,sha] of locked)assert.equal(gitBlob(path),sha,`RPM-UX-BASELINE-LOCK-01 drift: ${path}`);

const html=fs.readFileSync('canonical/s2b/v2.6/index.html','utf8');
for(const token of [
  'width=device-width,initial-scale=1,viewport-fit=cover',
  'max-width:560px',
  'id="progress"',
  'id="prompt"',
  'id="audioBtn"',
  'id="exerciseBody"',
  'id="feedback"',
  'id="xp"',
  'id="time"'
]) assert.ok(html.includes(token),`baseline token missing: ${token}`);

assert.equal(AUDIO_VOICE_POLICY,'DEFERRED');
assert.equal(PLAYER_UI_RENDER_COMMANDS_VERSION,1);
assert.equal(CERTIFICATE_GATE_VERSION,1);
assert.throws(()=>requireCertificateIssuance(),e=>e instanceof CertificateGateError&&e.code==='CERTIFICATE_FINAL_LEGAL_APPROVAL_REQUIRED');

const footprint=locked.reduce((sum,[path])=>sum+fs.statSync(path).size,0);
assert.ok(Number.isSafeInteger(footprint)&&footprint>0);

console.log(`RPM_S12_FINAL_READINESS_PASS ux-baseline-hash-locked mobile-first-anchors-preserved audio-voice-deferred core-footprint-bytes-${footprint} certificate-issuance-fail-closed no-runtime-core-regression`);
