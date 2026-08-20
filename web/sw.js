// Shell-only service worker: the app opens from the home screen without a
// network. The cache holds the shell, never the plan — data comes from the
// server or not at all.
const CACHE = 'table-six';

const SHELL = [
  '/',
  '/app.css',
  '/app.js',
  '/api.js',
  '/board.js',
  '/day.js',
  '/inventory.js',
  '/dates.js',
  '/sync.js',
  '/auril/index.js',
  '/auril/element.js',
  '/auril/html.js',
  '/auril/morph.js',
  '/auril/store.js',
  '/auril/router.js',
  '/auril/delegate.js',
  '/auril/dev.js',
  '/auril/vendor/idiomorph.js',
  '/manifest.webmanifest',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const shellOnly = event.request.method === 'GET' && url.origin === location.origin && !url.pathname.startsWith('/api/');
  if (!shellOnly) return; // the API and the socket never go through the cache

  // A navigation to /day/… or /inventory is the shell; the router takes it from there.
  const key = event.request.mode === 'navigate' ? '/' : event.request;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(key);
      // Serve what is there and refresh it in the background: the next open
      // has the new version without anyone bumping a number.
      const fresh = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(key, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? fresh;
    }),
  );
});
