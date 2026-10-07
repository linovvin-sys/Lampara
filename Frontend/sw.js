// Lampara service worker — makes the admin panel AND the student pages usable
// with no connection.
//
// Rule of thumb: when there IS a connection, everything behaves exactly as it
// did before this file existed (network first, always fresh). The saved copies
// only get used when the network fails or takes too long.
//
//   admin pages (View/Admin/*.php)          network first -> saved copy when offline
//   student pages (View/Public|Student)     network first -> saved copy when offline
//   API reads   (Backend/api GET)           network first -> saved copy when offline
//   same-origin files (js/css/img)          network first -> saved copy when offline
//   CDN libraries + fonts                   saved copy first (versions are pinned)
//   map tiles                               saved copy first, capped in size
//
// Never saved: logins, logouts, pings, the AI chat/scan endpoints, anything that
// isn't a GET, and any page that redirected (e.g. to the login screen because the
// session expired — saving that would replace a real page with a login form).
//
// Two kinds of saved data, cleared differently:
//   private (admin pages, the admin-only reports list): wiped on logout
//   public  (student pages, buildings/rooms/plans/graphs): never wiped by a logout,
//           because students on a shared device rely on it
//
// Changes made while offline are NOT handled here: admin pages queue them (see
// Js/Include/admin-offline.js) so the admin can approve the sync. Keeping the saved
// student data fresh is done by Js/Include/student-offline.js.

// Bump this whenever phones must drop their saved copies (old versions' caches are deleted on activate).
const VERSION = 'lampara-sw-v3';
const CACHE_PAGES = VERSION + '-pages';           // admin pages (private)
const CACHE_API = VERSION + '-api';               // admin-only API reads (private)
const CACHE_STUDENT_PAGES = VERSION + '-student-pages'; // public
const CACHE_PUBLIC_API = VERSION + '-public-api'; // public directory data
const CACHE_STATIC = VERSION + '-static';
const CACHE_LIBS = VERSION + '-libs';
const CACHE_TILES = VERSION + '-tiles';
const ALL_CACHES = [CACHE_PAGES, CACHE_API, CACHE_STUDENT_PAGES, CACHE_PUBLIC_API, CACHE_STATIC, CACHE_LIBS, CACHE_TILES];

const NETWORK_TIMEOUT_MS = 10000; // slow connection: give up on the network and use the saved copy (ngrok can take several seconds)
const MAX_TILES = 700;

const LIB_HOSTS = [
  'unpkg.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'aframe.io', 'cdn.tailwindcss.com',
  'fonts.googleapis.com', 'fonts.gstatic.com'
];
const TILE_HOSTS = ['tile.openstreetmap.org', 'server.arcgisonline.com'];

// Endpoints that must always hit the network.
const API_NEVER_CACHE = ['admin_login.php', 'ping.php', 'chat.php', 'scan.php', 'admin-sync.php'];
// Reads that are only meant for a signed-in admin: saved in the private cache.
const API_PRIVATE = ['flags.php'];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => !ALL_CACHES.includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// Pages tell the worker to forget private (admin) data — on logout, and whenever
// the login screen shows, so a shared device never keeps the last admin's data.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'clear-private') {
    event.waitUntil(Promise.all([caches.delete(CACHE_PAGES), caches.delete(CACHE_API)]));
  }
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms));
}

// Try the network (with a time limit); on any failure fall back to the saved copy.
async function networkFirst(request, cacheName, { cacheable, matchOptions } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const response = await Promise.race([fetch(request), timeout(NETWORK_TIMEOUT_MS)]);
    if (response && cacheable && cacheable(response)) {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch (err) {
    const saved = await cache.match(request, matchOptions);
    if (saved) return saved;
    throw err;
  }
}

async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const saved = await cache.match(request);
  if (saved) return saved;
  const response = await fetch(request);
  // Opaque (cross-origin, no-cors) responses have status 0 but are still fine to keep.
  if (response && (response.ok || response.type === 'opaque')) {
    cache.put(request, response.clone()).then(() => maxEntries && trim(cache, maxEntries)).catch(() => {});
  }
  return response;
}

async function trim(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
  }
}

const isGoodResponse = (r) => r.ok && !r.redirected && r.type === 'basic';

const offlinePage = () => new Response(
  '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
  '<title>Offline</title><body style="font-family:system-ui,sans-serif;max-width:28rem;margin:4rem auto;padding:0 1.25rem;color:#14251c">' +
  '<h1 style="font-size:1.4rem">You\'re offline</h1>' +
  '<p>This page wasn\'t saved on this device yet. Open it once while connected and it will be available offline next time. (Admin pages: open them once while signed in.)</p>' +
  '<p><a href="javascript:history.back()">Go back</a></p></body>',
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return; // changes are queued by the page, never by the worker
  const url = new URL(request.url);

  // Map tiles.
  if (TILE_HOSTS.some((h) => url.hostname === h || url.hostname.endsWith('.' + h))) {
    event.respondWith(cacheFirst(request, CACHE_TILES, MAX_TILES));
    return;
  }

  // Pinned CDN libraries and fonts.
  if (LIB_HOSTS.includes(url.hostname)) {
    event.respondWith(cacheFirst(request, CACHE_LIBS));
    return;
  }

  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.endsWith('/sw.js')) return;

  // API reads.
  if (path.includes('/Backend/api/')) {
    if (API_NEVER_CACHE.some((name) => path.endsWith('/' + name))) return;
    const cacheName = API_PRIVATE.some((name) => path.endsWith('/' + name)) ? CACHE_API : CACHE_PUBLIC_API;
    event.respondWith(networkFirst(request, cacheName, { cacheable: (r) => r.ok }));
    return;
  }

  // Student-facing pages (landing, guides, scan, manual search, indoor AR).
  if ((path.includes('/View/Public/') || path.includes('/View/Student/')) && path.endsWith('.php')) {
    event.respondWith((async () => {
      try {
        return await networkFirst(request, CACHE_STUDENT_PAGES, { cacheable: isGoodResponse, matchOptions: { ignoreSearch: true } });
      } catch (err) {
        return offlinePage();
      }
    })());
    return;
  }

  // Admin pages (fetched by navigation or by the page-side prewarm).
  if (path.includes('/View/Admin/') && path.endsWith('.php')) {
    if (path.endsWith('/login.php') || path.endsWith('/logout.php')) return;
    event.respondWith((async () => {
      try {
        // ignoreSearch: a page opened with a different ?edit=… still falls back to its saved copy.
        return await networkFirst(request, CACHE_PAGES, { cacheable: isGoodResponse, matchOptions: { ignoreSearch: true } });
      } catch (err) {
        return offlinePage();
      }
    })());
    return;
  }

  // Everything else on this site that's a plain file (scripts, styles, icons, floor plan images).
  if (path.includes('/Frontend/') && /\.(js|css|png|jpe?g|webp|svg|json|ico|woff2?)$/i.test(path)) {
    event.respondWith(networkFirst(request, CACHE_STATIC, { cacheable: isGoodResponse }));
  }
});
