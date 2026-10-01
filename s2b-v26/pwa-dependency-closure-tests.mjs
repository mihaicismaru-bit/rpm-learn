import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const sw = read('sw.js');
const index = read('index.html');
const manifest = JSON.parse(read('manifest.webmanifest'));

const assetMatches = [...sw.matchAll(/['"](\.\/[^'"]+)['"]/g)].map(m => m[1]);
const cached = new Set(assetMatches);

const entryMatch = index.match(/<script[^>]+type=["']module["'][^>]+src=["'](\.\/[^"']+)["']/i)
  || index.match(/<script[^>]+src=["'](\.\/[^"']+)["'][^>]+type=["']module["']/i);
assert.ok(entryMatch, 'index.html must declare a module entrypoint');
const entry = entryMatch[1];

function localImports(rel) {
  const text = read(rel.replace(/^\.\//,''));
  return [...text.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?["'](\.\/[^"']+)["']/g)]
    .map(m => m[1]);
}

const visited = new Set();
const queue = [entry];
while (queue.length) {
  const rel = queue.shift();
  if (visited.has(rel)) continue;
  visited.add(rel);
  assert.ok(cached.has(rel), `service worker precache missing module dependency ${rel}`);
  for (const dep of localImports(rel)) {
    const base = path.posix.dirname(rel);
    const normalized = './' + path.posix.normalize(path.posix.join(base.replace(/^\.\//,''), dep));
    if (!visited.has(normalized)) queue.push(normalized);
  }
}

for (const required of ['./index.html','./offline.html','./manifest.webmanifest']) {
  assert.ok(cached.has(required), `service worker precache missing required shell asset ${required}`);
}
for (const icon of manifest.icons || []) {
  if (String(icon.src).startsWith('./')) assert.ok(cached.has(icon.src), `service worker precache missing manifest icon ${icon.src}`);
}
assert.ok(visited.has('./access.mjs'), 'role/access module must be inside offline dependency closure');
assert.ok(visited.has('./event-store.mjs'), 'event store must be inside offline dependency closure');
assert.ok(visited.has('./model.mjs'), 'learning model must be inside offline dependency closure');
assert.ok(visited.has('./fixture.mjs'), 'adult RLS-07 fixture must be inside offline dependency closure');

console.log('RPM_S2B_PWA_DEPENDENCY_CLOSURE_PASS entry='+entry+' modules='+[...visited].sort().join(','));
