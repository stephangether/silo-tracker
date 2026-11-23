// Service Worker: Offline-Cache + Klick auf Mitteilung.
// VERSION bei Releases erhöhen, damit alte Caches aufgeräumt werden.
const VERSION = 'v1.3.2';
const CACHE = `silo-tracker-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'css/app.css',
  'js/app.js',
  'js/logic.js',
  'js/store.js',
  'js/notify.js',
  'js/install.js',
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/LUCIDE-LICENSE.txt',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first für alles: online immer die aktuelle Version (HTML, CSS und JS
// passen so stets zusammen), offline aus dem Cache.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  const isPage = req.mode === 'navigate';
  const key = isPage ? 'index.html' : req;
  event.respondWith(
    fetch(isPage ? req : new Request(req, { cache: 'no-cache' }))
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(key).then((hit) => hit || Response.error())),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return c.focus();
      return self.clients.openWindow('./');
    }),
  );
});
