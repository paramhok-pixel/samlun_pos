/* =========================================================
   service-worker.js — 100% offline app shell caching
   Bump CACHE_VERSION whenever any app file changes so
   returning users get the update.
   ========================================================= */
const CACHE_VERSION = 'pos-park-v2';
const CACHE_NAME = CACHE_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',

  './js/db.js',
  './js/utils.js',
  './js/scanner.js',
  './js/products.js',
  './js/pos.js',
  './js/checkout.js',
  './js/history.js',
  './js/reports.js',
  './js/settings.js',
  './js/app.js',

  './js/lib/html5-qrcode.min.js',
  './js/lib/jspdf.umd.min.js',
  './js/lib/jspdf.plugin.autotable.min.js',
  './js/lib/xlsx.full.min.js',
  './js/lib/thai-font.js',

  './fonts/Kanit-Regular.ttf',
  './fonts/Kanit-Medium.ttf',
  './fonts/Kanit-SemiBold.ttf',
  './fonts/Kanit-Bold.ttf',
  './fonts/Sarabun-Regular.ttf',
  './fonts/Sarabun-Medium.ttf',
  './fonts/Sarabun-SemiBold.ttf',

  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))
    )).then(() => self.clients.claim())
  );
});

// Cache-first strategy for everything same-origin; falls back to network,
// and caches whatever comes back so the app keeps working fully offline.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never proxy external/CDN calls — app has none anyway

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return res;
      }).catch(() => {
        // Offline and not cached: for navigation requests, serve the app shell
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});
