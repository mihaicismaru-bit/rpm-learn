import assert from 'node:assert/strict';
import fs from 'node:fs';

const manifest=JSON.parse(fs.readFileSync(new URL('./manifest.webmanifest',import.meta.url),'utf8'));
const sw=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');

assert.equal(manifest.display,'standalone');
assert.equal(manifest.start_url,'./index.html');
assert.equal(manifest.scope,'./');
assert.equal(manifest.id,'./');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.some(i=>i.sizes==='192x192'));
assert.ok(manifest.icons.some(i=>i.sizes==='512x512'));
assert.ok(sw.includes("const CACHE='rpm-learn-s2b-v19'"),'service worker cache version must match v2.4 acceptance harness');
assert.ok(sw.includes("'./access.mjs'"),'service worker must cache access.mjs imported by app.mjs');
assert.ok(sw.includes("'./offline.html'"),'offline fallback must be precached');
assert.ok(sw.includes('event.request.mode === \'navigate\''),'navigation fallback missing');
assert.ok(sw.includes("k.startsWith(PREFIX) && k !== CACHE"),'old-cache cleanup missing');
assert.ok(app.includes("from './access.mjs'"),'learner app must enforce S2 access boundary');
for (const f of ['icon-192.png','icon-512.png','offline.html','access.mjs']) assert.ok(fs.existsSync(new URL('./'+f,import.meta.url)),`missing ${f}`);
console.log('RPM_S2B_STATIC_PWA_TESTS_PASS manifest icons cache-dependency offline-fallback cache-cleanup learner-guard');
