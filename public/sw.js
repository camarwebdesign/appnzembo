// Nzembo PWA Service Worker (Network-First pour code applicatif & API)
const CACHE_NAME = 'nzembo-cache-v5';
const STATIC_ASSETS = [
  '/manifest.json',
  '/favicon.svg',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => (key !== CACHE_NAME ? caches.delete(key) : Promise.resolve()))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.pathname.startsWith('/api/') || url.pathname === '/env.local.js') {
    return;
  }

  // Network-First pour HTML & scripts afin de ne jamais bloquer sur une version périmée
  event.respondWith(
    fetch(event.request)
      .then((networkRes) => {
        if (networkRes && networkRes.ok && url.origin === self.location.origin) {
          const copy = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return networkRes;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('/app')))
  );
});
