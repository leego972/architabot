/**
 * ArchibaldTitan Service Worker — Network-First PWA
 * 
 * Strategy (v10.0 — fixed cache-first stale content bug):
 * - App shell (HTML, CSS, JS) → Network-first with cache fallback
 * - API calls → Network-first with cache fallback
 * - Images/fonts → Cache-first with stale-while-revalidate
 * 
 * Key change: App shell is now NETWORK-FIRST to prevent stale cached
 * pages from being served after deployments. Cache is only used when
 * the user is genuinely offline.
 */

const CACHE_VERSION = 'titan-v10.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// App shell files to pre-cache on install
const APP_SHELL = [
  '/',
  '/manifest.json',
];

// ── Install: Pre-cache app shell ────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        // Non-fatal: some files may not exist yet during first deploy
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    })
  );
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting();
});

// ── Activate: Clean ALL old caches aggressively ─────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => {
            // Delete ANY cache that doesn't match current version
            return key !== STATIC_CACHE && key !== API_CACHE && key !== IMAGE_CACHE;
          })
          .map((key) => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  // Take control of all open tabs immediately
  self.clients.claim();
});

// ── Fetch: Route-based caching strategy ─────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, PUT, DELETE, etc.)
  if (request.method !== 'GET') return;

  // Skip cross-origin requests
  if (url.origin !== self.location.origin) return;

  // Skip WebSocket, SSE, and streaming endpoints
  if (url.pathname.startsWith('/api/chat/stream')) return;
  if (url.pathname.startsWith('/api/chat/abort')) return;
  if (request.headers.get('accept')?.includes('text/event-stream')) return;

  // API calls → Network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, API_CACHE, 8000));
    return;
  }

  // Images and fonts → Cache-first with stale-while-revalidate
  if (isAsset(url.pathname)) {
    event.respondWith(cacheFirstWithRevalidate(request, IMAGE_CACHE));
    return;
  }

  // App shell (HTML, JS, CSS) → NETWORK-FIRST (prevents stale content after deploys)
  event.respondWith(networkFirst(request, STATIC_CACHE, 5000));
});

// ── Message handler: Force refresh ──────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_ALL_CACHES') {
    caches.keys().then((keys) => {
      Promise.all(keys.map((key) => caches.delete(key)));
    });
  }
});

// ── Caching Strategies ──────────────────────────────────────────

/**
 * Network-first: Always try the network, fall back to cache only when offline.
 * This ensures users always get the latest content after deployments.
 */
async function networkFirst(request, cacheName, timeout) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(request, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // Network failed — try cache as fallback (offline mode)
    const cached = await caches.match(request);
    if (cached) return cached;

    // For navigation requests, try returning cached index.html (SPA fallback)
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/');
      if (fallback) return fallback;
    }

    // Nothing cached — return a proper error
    if (request.mode === 'navigate') {
      return new Response(
        '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title></head>' +
        '<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#0a0a1a;color:#fff;text-align:center">' +
        '<div><h1>You\'re Offline</h1><p>Please check your internet connection and try again.</p>' +
        '<button onclick="location.reload()" style="margin-top:16px;padding:12px 24px;background:#3b82f6;color:#fff;border:none;border-radius:8px;font-size:16px;cursor:pointer">Retry</button></div></body></html>',
        { status: 503, headers: { 'Content-Type': 'text/html' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Offline — no cached data available' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Cache-first with stale-while-revalidate: Serve from cache immediately,
 * then update cache in background. Good for images and fonts.
 */
async function cacheFirstWithRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);

  // Revalidate in background regardless
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  return cached || fetchPromise || new Response('', { status: 404 });
}

// ── Helpers ─────────────────────────────────────────────────────

function isAsset(pathname) {
  return /\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|otf)$/i.test(pathname);
}
