// Shop Ledger PH - mobile offline shell (PWA service worker)
// Registered only in a secure context (https or localhost). Plain http:// LAN
// access skips registration, so the app still works without it.
const CACHE = 'shopledger-v1';
const SHELL = ['/', '/manifest.webmanifest', '/assets/vendor/tailwind.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
  const isGet = e.request.method === 'GET';
  const isShell = SHELL.includes(url.pathname);
  const isAsset = url.pathname.startsWith('/assets/');
  if (!isGet || (!isShell && !isAsset)) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    if (hit) return hit;
    try {
      const r = await fetch(e.request);
      if (r && r.ok) cache.put(e.request, r.clone());
      return r;
    } catch (err) {
      return hit || Response.error();
    }
  })());
});