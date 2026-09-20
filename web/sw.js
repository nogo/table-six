// Shell-only service worker: the app opens from the home screen without a
// network. The cache holds the shell, never the plan — data comes from the
// server or not at all.
//
// One deployment, one cache. The version arrives in the script URL that
// registered this worker (`/sw.js?v=…`, the commit the image was built from),
// so within a version the files cannot change and the cache can be trusted
// blindly; a new version is a new cache, and the old one is deleted whole.
const VERSION = new URL(location.href).searchParams.get('v') || 'dev';
const CACHE = `table-six-${VERSION}`;

const SHELL = [
  '/',
  '/app.css',
  '/app.js',
  '/api.js',
  '/board.js',
  '/day.js',
  '/inventory.js',
  '/dates.js',
  '/i18n.js',
  '/items.js',
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
  // `reload` puts the browser's own HTTP cache out of the way. The files have
  // no hash in their names, so without it a new version would happily install
  // the previous version's `app.js` and nothing would have changed.
  const fresh = SHELL.map((path) => new Request(path, { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(fresh)).then(() => self.skipWaiting()));
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
  const navigation = event.request.mode === 'navigate';
  const key = navigation ? '/' : event.request;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      // The shell says which version is deployed, so it is the one thing that
      // may never come from the cache first: a stale shell would keep naming
      // the old version and nothing would ever update. The cache answers for
      // it only when the network does not.
      if (navigation) {
        try {
          // By URL and with `reload`, not by passing the navigation request on:
          // that one carries the browser's `If-None-Match`, and a 304 handed
          // back here is the stale shell arriving by another door.
          const fresh = await fetch(event.request.url, { cache: 'reload' });
          if (fresh.ok) cache.put(key, fresh.clone());
          return fresh;
        } catch {
          return (await cache.match(key)) ?? Response.error();
        }
      }

      // Everything else belongs to this version and cannot change under it.
      const cached = await cache.match(key);
      if (cached) return cached;

      // `reload` again, for the same reason as on install: the files carry no
      // hash in their names, so the browser's own cache is happy to answer a
      // miss with the previous deployment's copy of exactly this URL.
      const fresh = await fetch(new Request(event.request.url, { cache: 'reload' }));
      if (fresh.ok) cache.put(key, fresh.clone());
      return fresh;
    }),
  );
});
