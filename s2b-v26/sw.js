const CACHE='rpm-learn-s2b-v19';
const PREFIX='rpm-learn-';
const ASSETS=[
  './',
  './index.html',
  './offline.html',
  './app.mjs',
  './access.mjs',
  './model.mjs',
  './event-store.mjs',
  './fixture.mjs',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    try {
      return await fetch(event.request);
    } catch (err) {
      if (event.request.mode === 'navigate') {
        return (await caches.match('./index.html')) || (await caches.match('./offline.html'));
      }
      throw err;
    }
  })());
});
