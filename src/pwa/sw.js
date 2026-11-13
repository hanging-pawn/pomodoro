// Service worker (NFR-04): precaches the app shell at install (the file list is injected at build
// time by the `pwa` plugin in vite.config.ts) and serves it cache-first, so the app loads and the
// timer runs without a network. Other same-origin GETs are cached as they are used.
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
