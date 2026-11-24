// Service worker: lets the app open with no internet.
//
// On install it downloads every app file into a versioned cache. After that,
// every request is answered from the cache first. To ship an update, bump
// VERSION here and APP.version in src/config.js (a test checks they match):
// the browser sees sw.js changed, installs the new version in the background,
// and the app offers "Update ready · Reload".
//
// The only network requests this app ever makes are for its own files.

const VERSION = '0.1.0';
const CACHE = `saydo-${VERSION}`;

// Every file the app needs. A test fails if a file in src/ or icons/ is missing here.
const APP_SHELL = [
  "./",
  "index.html",
  "styles.css",
  "manifest.webmanifest",
  "src/config.js",
  "src/model.js",
  "src/dates.js",
  "src/db.js",
  "src/ui.js",
  "icons/icon-180.png",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/icon-512-maskable.png"
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' skips the HTTP cache, so a new version never precaches stale files.
      cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' }))),
    ),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('saydo-') && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Any page navigation inside the app gets the app shell.
    if (request.mode === 'navigate') {
      return (await cache.match('index.html')) ?? fetch(request);
    }
    return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
