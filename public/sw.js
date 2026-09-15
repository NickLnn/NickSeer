// NickSeer High-Performance Mobile PWA Service Worker (v2.4)
// Implements instant offline launch, Stale-While-Revalidate caching,
// and resilient shell fallback for home screen standalone apps.

const CACHE_NAME = 'nickseer-pwa-v2.9';

const PRECACHE_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/icon-maskable-512.png',
  '/splash/splash-1290x2796.png',
  '/splash/splash-1179x2556.png',
  '/splash/splash-1284x2778.png',
  '/splash/splash-1170x2532.png',
  '/splash/splash-1125x2436.png',
  '/splash/splash-828x1792.png',
  '/splash/splash-750x1334.png',
  '/css/styles.css',
  '/css/enhance.css',
  '/css/theme.css',
  '/js/nav.js',
  '/js/settings.js',
  '/js/app.js',
  '/js/collections.js',
  '/js/logo.js',
  '/js/brands.js',
  '/js/menu.js',
  '/js/plexcard.js',
  '/js/stats.js',
  '/js/live.js',
  '/js/info.js',
  '/js/settings-ai.js',
  '/js/settings-tuning.js',
  '/js/aisuggest.js',
  '/js/buttons.js',
  '/js/approvals.js',
  '/js/roles.js',
  '/js/imdb-badge.js',
  '/js/fixes.js',
  '/js/login-enhance.js',
  '/js/a2hs.js',
  '/js/overlay.js',
  '/js/util.js'
];

// Install: precache the core application shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Precache defensively so single asset failure does not abort installation
      await Promise.allSettled(
        PRECACHE_SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn(`[SW] Precache fallback for ${url}:`, err.message);
          })
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// Activate: purge stale caches and claim clients immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch: smart Stale-While-Revalidate & Network-First strategies
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Skip browser extensions and non-HTTP(S) schemes
  if (!url.protocol.startsWith('http')) return;

  // 1. Navigation requests -> Stale-While-Revalidate against the app shell.
  //    Previously this was network-first, so every launch waited a full
  //    origin round trip for HTML that was already precached — pure white
  //    screen on mobile data and in the standalone PWA. Now we paint from
  //    cache immediately and refresh the shell in the background.
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match('/index.html');

      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200) cache.put('/index.html', res.clone());
          return res;
        })
        .catch(() => null);

      if (cached) {
        // Refresh for the NEXT launch without blocking this one.
        event.waitUntil(network);
        return cached;
      }
      // Cold cache: we have no choice but to wait.
      return (await network) || (await cache.match('/')) || Response.error();
    })());
    return;
  }

  // 2. Sensitive auth routes -> Network-only (never cache credentials/tokens)
  if (url.pathname.startsWith('/api/auth/login') || url.pathname.startsWith('/api/auth/plex')) {
    return;
  }

  // 3. Static assets (CSS, JS, SVG, PNG, fonts, TMDB posters) -> Stale-While-Revalidate
  const isStaticAsset =
    url.pathname.match(/\.(css|js|mjs|svg|png|jpg|jpeg|webp|ico|woff2|woff)$/i) ||
    url.origin.includes('image.tmdb.org') ||
    url.origin.includes('fonts.googleapis.com') ||
    url.origin.includes('fonts.gstatic.com');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(req, { ignoreSearch: true }).then((cachedResponse) => {
        const fetchPromise = fetch(req)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        // Instant return from cache if available, else await network
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 4. API reads are deliberately NOT cached here.
  //
  //    /api/discover/home is keyed server-side on req.user.username, and the
  //    Cache API ignores the Authorization header when matching — so on a
  //    shared device profile A's rows were being served to profile B. The
  //    client already keeps a 5-minute in-memory cache in util.js that IS
  //    keyed on the auth token, which is the correct layer for this.
});
