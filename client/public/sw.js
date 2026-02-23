/**
 * ArchibaldTitan Service Worker — Offline-First PWA
 * 
 * Strategy:
 * - App shell (HTML, CSS, JS) → Cache-first with network fallback
 * - API calls → Network-first with cache fallback
 * - Images/fonts → Cache-first with stale-while-revalidate
 */

const CACHE_VERSION = 'titan-v8.0';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const API_CACHE = `${CACHE_VERSION}-api`;
const IMAGE_CACHE = `${CACHE_VERSION}-images`;

// App shell files to pre-cache on install
const APP_SHELL = [
  '/',
  '/manifest.json',
  '/og-image.png',
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

// ── Activate: Clean old caches ──────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key.startsWith('titan-') && key !== STATIC_CACHE && key !== API_CACHE && key !== IMAGE_CACHE)
          .map((key) => caches.delete(key))
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

  // Skip WebSocket, SSE, and streaming endpoints
  if (url.pathname.startsWith('/api/chat/stream')) return;
  if (url.pathname.startsWith('/api/chat/abort')) return;
  if (request.headers.get('accept')?.includes('text/event-stream')) return;

  // API calls → Network-first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirstWithCache(request, API_CACHE, 5000));
    return;
  }

  // Images and fonts → Cache-first with stale-while-revalidate
  if (isAsset(url.pathname)) {
    event.respondWith(cacheFirstWithRevalidate(request, IMAGE_CACHE));
    return;
  }

  // App shell (HTML, JS, CSS) → Cache-first with network fallback
  event.respondWith(cacheFirstWithFallback(request, STATIC_CACHE));
});

// ── Caching Strategies ──────────────────────────────────────────

/**
 * Network-first: Try network, fall back to cache if offline.
 * Good for API calls where freshness matters.
 */
async function networkFirstWithCache(request, cacheName, timeout) {
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
    const cached = await caches.match(request);
    if (cached) return cached;
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

/**
 * Cache-first with network fallback: Serve from cache if available,
 * otherwise fetch from network and cache. Good for app shell.
 */
async function cacheFirstWithFallback(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch (err) {
    // For navigation requests, return the cached index.html (SPA fallback)
    if (request.mode === 'navigate') {
      const fallback = await caches.match('/');
      if (fallback) return fallback;
    }
    return new Response('Offline', { status: 503 });
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function isAsset(pathname) {
  return /\.(png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|ttf|eot|otf)$/i.test(pathname);
}
