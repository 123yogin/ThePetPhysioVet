/*
 * Service worker for the public landing site.
 *
 * Goal: repeat visits paint instantly and the heavy things (fonts, photos,
 * the fingerprinted JS/CSS) come from the device instead of the network.
 *
 * Strategy per request type:
 *   /assets/*            cache-first. Vite fingerprints these (index-XXXX.js),
 *                        so a URL's content never changes -- safe forever.
 *   Google Fonts         cache-first (font files are versioned by URL too).
 *   images (/photos,     stale-while-revalidate: serve the cached copy at once,
 *   logos, posters)      refresh it in the background for next time.
 *   pages (navigations)  network-first, falling back to the cached page when
 *                        offline -- content and booking must never be stale.
 *
 * Deliberately NOT handled (passed straight to the network):
 *   /api/*, /admin/*, /app/*  the clinic's API and staff/owner app
 *   .mp4 (hero + reels)       served with Range requests; caching partial 206
 *                             responses corrupts playback
 *   anything non-GET
 *
 * Bump VERSION to drop every cache on the next visit.
 */
const VERSION = 'pp-landing-v3';
const STATIC = `${VERSION}-static`;
const RUNTIME = `${VERSION}-runtime`;
const PAGES = `${VERSION}-pages`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => c.addAll(['/'])).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (/^\/(api|admin|app)(\/|$)/.test(url.pathname)) return;
    if (url.pathname.endsWith('.mp4') || req.headers.has('range')) return;
    if (url.pathname === '/sw.js') return;

    if (req.mode === 'navigate') {
      event.respondWith(networkFirst(req));
      return;
    }
    if (url.pathname.startsWith('/assets/')) {
      event.respondWith(cacheFirst(req, STATIC));
      return;
    }
    if (/\.(webp|jpe?g|png|svg|avif|gif|ico)$/i.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(req, RUNTIME));
      return;
    }
    return;
  }

  // Cross-origin requests are left to the network: fonts are self-hosted under
  // /assets/ now and covered by the cache-first branch above.
});

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === 'opaque') {
    await cache.put(req, res.clone());
    trim(cache, 80);
  }
  return res;
}

/* Fingerprinted files from earlier deploys are never requested again; keep
   the cache bounded by dropping the oldest entries past a limit. */
async function trim(cache, max) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function staleWhileRevalidate(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  const refresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => hit);
  return hit || refresh;
}

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  // Key pages by path only: ?book=..., tracking parameters etc. would
  // otherwise store a separate copy of the same page for every variant.
  const url = new URL(req.url);
  const key = url.origin + url.pathname;
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = (await cache.match(key)) || (await cache.match('/'));
    if (hit) return hit;
    throw err;
  }
}
