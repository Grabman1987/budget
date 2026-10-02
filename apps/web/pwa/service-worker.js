/* global self, caches, fetch, URL */
const VERSION = '__VERSION__';
const FILES = '__PRECACHE__';
const CACHE = `budget-shell-${VERSION}`;
const ALLOWED = new Set(FILES);

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Keep one previous shell for already-open tabs and their lazy chunks.
      const previous = (await caches.keys()).filter(
        (key) => key.startsWith('budget-shell-') && key !== CACHE,
      );
      await Promise.all(previous.slice(0, -1).map((key) => caches.delete(key)));
      await self.clients.claim();
    })(),
  );
});
self.addEventListener('message', (event) => {
  if (event.data?.type === 'APPLY_UPDATE') event.waitUntil(self.skipWaiting());
});
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname === '/api' ||
    url.pathname.startsWith('/api/') ||
    url.pathname === '/health' ||
    url.pathname.startsWith('/health/')
  )
    return;
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match('/index.html')) ?? (await cache.match('/offline.html'));
      }),
    );
    return;
  }
  // Never cache arbitrary URLs, redirects, query strings or runtime responses.
  if (!url.search && ALLOWED.has(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => (await cache.match(request)) ?? fetch(request)),
    );
  }
});
