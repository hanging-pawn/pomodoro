// Service worker (NFR-04): precaches the app shell at install (the file list is injected at build
// time by the `pwa` plugin in vite.config.ts). Pages go network-first (newest version online, cached
// copy offline); assets are served cache-first, so the app loads and the timer runs without a
// network. Other same-origin GETs are cached as they are used.
const PREFIX = 'pomo-pomo-';
const CACHE = `${PREFIX}__VERSION__`;
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          // The Pages origin is shared with other apps: delete only our own older caches.
          keys
            .filter((k) => k.startsWith(PREFIX) && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || !request.url.startsWith(self.location.origin))
    return;
  // Pages: network first, so an online visit always gets the newest app shell (and with it the
  // newest bundles); the cached copy is only the offline fallback. Hashed assets stay cache-first.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            void caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .open(CACHE)
            .then((cache) => cache.match(request, { ignoreSearch: true }))
            .then((hit) => hit ?? Response.error()),
        ),
    );
    return;
  }
  event.respondWith(
    caches
      .open(CACHE)
      .then((cache) => cache.match(request, { ignoreSearch: true }))
      .then(
        (hit) =>
          hit ??
          fetch(request).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              void caches.open(CACHE).then((c) => c.put(request, copy));
            }
            return res;
          }),
      ),
  );
});
