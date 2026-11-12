// NickSeer High-Performance Mobile PWA Service Worker (v2.4)
// Implements instant offline launch, Stale-While-Revalidate caching,
// and resilient shell fallback for home screen standalone apps.

const CACHE_NAME = 'nickseer-pwa-v5.1';

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
  '/js/native.js',
  '/js/push-client.js',
  '/js/passkey-client.js',
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

// ---------------------------------------------------------------------------
// Telling the open app that newer code exists
// ---------------------------------------------------------------------------
// Everything here is served stale-while-revalidate, so a launch always paints
// the PREVIOUS version and only fetches the new one in the background. Nothing
// ever told the page, and the installed iOS app is resumed from memory rather
// than reloaded — so a phone could sit on old code indefinitely (Nick's phone
// was still on the morning's build at 16:22 on 2026-11-12).
//
// Now: whenever a background refresh brings back DIFFERENT code than the copy
// just served (ETag changed), the page is told, and native.js reloads it at a
// safe moment. After that reload the cache already holds the new copy, the
// ETags match, and nothing further is sent — so it cannot loop.
let notifyTimer = null;
function notifyUpdate() {
  clearTimeout(notifyTimer);
  notifyTimer = setTimeout(async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    all.forEach((c) => c.postMessage({ type: 'ns-update' }));
  }, 400);
}
function codeChanged(oldRes, newRes) {
  if (!oldRes || !newRes) return false;
  const a = oldRes.headers.get('etag'), b = newRes.headers.get('etag');
  return !!a && !!b && a !== b;
}

// The app asks on resume ("am I current?") because a resume is not a
// navigation and would otherwise never trigger a refresh of the shell.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'ns-check') return;
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match('/index.html');
      const res = await fetch('/index.html', { cache: 'no-cache' });
      if (res && res.status === 200) {
        const changed = codeChanged(cached, res);
        await cache.put('/index.html', res.clone());
        if (changed) notifyUpdate();
      }
    } catch { /* offline — nothing to do */ }
  })());
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
        .then(async (res) => {
          if (res && res.status === 200) {
            const changed = codeChanged(cached, res);
            await cache.put('/index.html', res.clone());
            if (changed) notifyUpdate();
          }
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
              const isCode = url.origin === self.location.origin && /\.(css|js|mjs)$/i.test(url.pathname);
              const changed = isCode && codeChanged(cachedResponse, networkResponse);
              caches.open(CACHE_NAME).then(async (cache) => {
                // Lookups ignore the ?v= stamp, and return the OLDEST entry for
                // a path. Without this delete, /css/enhance.css?v=old stayed
                // first in line and a new stamp never took effect.
                if (isCode) await cache.delete(req, { ignoreSearch: true });
                await cache.put(req, clone);
                if (changed) notifyUpdate();
              });
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

// ---------------------------------------------------------------------------
// Web Push (server/services/push.js). The payload is JSON:
//   { title, body, tag, url }
// ---------------------------------------------------------------------------
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'NickSeer', {
    body: d.body || '',
    tag: d.tag || undefined,          // same tag replaces the earlier notification
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/' }
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      // Reuse the open app instead of stacking a second copy.
      try { await c.focus(); if ('navigate' in c) await c.navigate(url); return; } catch { /* try the next one */ }
    }
    await self.clients.openWindow(url);
  })());
});
