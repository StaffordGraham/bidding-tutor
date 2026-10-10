/**
 * service-worker.js
 * Makes Bidding Tutor work offline.
 *
 * - On install: caches the app files, then reads lessons/index.json and caches every lesson listed there,
 *   so new lessons work offline without editing this file.
 * - On fetch: serves from the cache first and refreshes the cache in the background
 *   (stale-while-revalidate). Page loads fall back to index.html when offline.
 * - To release an update: change CACHE_VERSION. The app then shows "A new version is ready".
 */

const CACHE_VERSION = 'bidding-tutor-v1';

/** Files that make up the app shell. */
const APP_FILES = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'dom.js',
  'handDisplay.js',
  'auctionDisplay.js',
  'biddingBox.js',
  'lessonEngine.js',
  'scenarioLoader.js',
  'explanationScreen.js',
  'storageManager.js',
  'manifest.json',
  'concepts.json',
  'lessons/index.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

/** Cache the app shell and all lessons listed in the index. */
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      await cache.addAll(APP_FILES);

      // Lessons are discovered from the index rather than hard-coded here
      try {
        const index = await (await fetch('lessons/index.json', { cache: 'no-cache' })).json();
        const lessonPaths = index.levels.flatMap((level) => level.lessons.map((lesson) => lesson.path));
        await cache.addAll(lessonPaths);
      } catch (error) {
        // Lessons will be cached on first use instead
      }
    })()
  );
});

/** Remove caches from older versions. */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE_VERSION).map((name) => caches.delete(name)));
    })()
  );
});

/** The app asks the waiting worker to take over when the user taps "Reload". */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

/** Serve from cache, refresh in the background, fall back to index.html for page loads. */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_VERSION);
      const cached = await cache.match(request, { ignoreSearch: true });

      const refresh = fetch(request)
        .then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => null);

      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }

      const fresh = await refresh;
      if (fresh) return fresh;

      if (request.mode === 'navigate') {
        const shell = await cache.match('index.html');
        if (shell) return shell;
      }
      return new Response('Offline', { status: 503, statusText: 'Offline' });
    })()
  );
});
