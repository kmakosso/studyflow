/* StudyFlow V4 — Service Worker (offline-first, cache-first strategy) */
const CACHE = 'studyflow-v4';
const OFFLINE_PAGE = '/index.html';

/* Assets to pre-cache on install */
const PRE_CACHE = ['/', '/index.html', '/icon.svg', '/manifest.json'];

/* ── Install ── */
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(PRE_CACHE))
  );
  self.skipWaiting();
});

/* ── Activate — purge old caches ── */
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* ── Fetch — cache-first with network fallback ── */
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  /* Skip cross-origin requests */
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;

      return fetch(e.request)
        .then(response => {
          /* Only cache valid same-origin responses */
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE).then(cache => cache.put(e.request, clone));
          return response;
        })
        .catch(() => {
          /* Offline fallback: serve app shell for navigation requests */
          if (e.request.mode === 'navigate') {
            return caches.match(OFFLINE_PAGE);
          }
        });
    })
  );
});

/* ── Push notifications (local Web Notifications API) ── */
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      if (list.length) return list[0].focus();
      return clients.openWindow('/');
    })
  );
});
