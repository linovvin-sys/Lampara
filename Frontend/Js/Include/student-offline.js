// Student offline layer — the visitor-facing pages keep working with no signal.
//
//   * Registers the service worker (sw.js), which saves the pages and the libraries
//     they use, so a page opens even in airplane mode.
//   * Saves the campus directory ahead of time (buildings, rooms, floor plans and their
//     images, walkable graphs, the outdoor walkway graph) into Js/Include/offline-cache.js
//     storage, so routes and guides have their data with no server.
//   * Notices when the connection comes back and downloads the newest data, then tells
//     the visitor it was updated.
//   * Shows a thin "Offline" strip with how old the saved data is.
//
// What can't work offline: the AI chat and AI sign reading (they need the AI service).
// Those already say so; typing a room number still works.
//
// Plain <script>; needs offline-cache.js loaded first. Exposes `StudentOffline`.

const StudentOffline = (() => {
  const API = new URL('../../../Backend/api/', location.href).href;
  const PAGES = ['../Public/index.php', '../Public/guide.php', '../Public/guide-ar.php',
                 '../Student/scan.php', '../Student/manual-search.php', '../Student/indoor-ar.php'];
  const DATA_FRESH_MS = 60 * 60 * 1000;        // don't re-download the directory more than hourly on page loads
  const PAGES_EVERY_MS = 6 * 60 * 60 * 1000;
  const HEARTBEAT_MS = 30000;
  const PING_TIMEOUT_MS = 4000;
  const SIG_KEY = 'lampara_student_signature';
  const PAGES_KEY = 'lampara_student_pages_at';

  const state = { online: navigator.onLine !== false, refreshing: false, prewarming: false };
  const statusListeners = [];

  // ---------- small helpers ----------
  const getLS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
  function hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return String(h);
  }
  function ago(ms) {
    const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
    if (m < 1) return 'just now';
    if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' hr ago';
    const d = Math.round(h / 24);
    return d + (d === 1 ? ' day ago' : ' days ago');
  }
  async function getJson(path) {
    const res = await fetch(API + path, { cache: 'no-store', credentials: 'same-origin' });
    const data = await res.json();
    if (!data.success) throw new Error('bad response');
    return data;
  }

  // ---------- connection ----------
  // navigator.onLine can say "online" on a dead link, so ask the server itself.
  async function ping() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      const res = await fetch(API + 'ping.php', { cache: 'no-store', signal: ctrl.signal });
      clearTimeout(timer);
      await res.json();
      return true;
    } catch (e) { return false; }
  }
  function setOnline(value) {
    if (state.online === value) return;
    state.online = value;
    renderBadge();
    statusListeners.forEach((fn) => { try { fn(value); } catch (e) { /* listener error */ } });
    if (value) refreshData({ notify: true }); // connection is back: fetch what changed
  }
  async function checkNow() { setOnline(await ping()); }

  // ---------- keeping the saved directory fresh ----------
  async function refreshData({ notify = true } = {}) {
    if (state.refreshing || typeof LamparaCache === 'undefined') return false;
    state.refreshing = true;
    try {
      const b = await getJson('buildings.php');       // first request doubles as the "are we really online" test
      const r = await getJson('rooms.php');
      const c = await getJson('campus-graph.php');
      LamparaCache.setBuildings(b.buildings);
      LamparaCache.setRooms(r.rooms);
      LamparaCache.setCampusGraph({ nodes: c.nodes, edges: c.edges });

      const parts = [
        b.buildings.map((x) => [x.id, x.updated_at, x.entrance_node_id, x.lat, x.lng].join(':')).join(','),
        r.rooms.map((x) => [x.id, x.updated_at].join(':')).join(','),
        c.nodes.map((x) => [x.id, x.lat, x.lng].join(':')).join(','), c.edges.length
      ];
      const workerKeepsImages = LamparaCache.workerHandlesImages();

      for (const building of b.buildings) {
        const pj = await getJson('floor-plans.php?building_id=' + building.id);
        for (const plan of pj.plans) {
          const old = LamparaCache.getFloorPlan(building.id, plan.floor) || {};
          // Without the worker the page keeps its own base64 copy; with it, the file is saved there instead.
          const keepImage = !workerKeepsImages && old.imageDataUrl && old.image_path === plan.image_path ? old.imageDataUrl : null;
          LamparaCache.setFloorPlan(building.id, plan.floor, { ...old, ...plan, imageDataUrl: keepImage });
          parts.push([plan.id, plan.updated_at, plan.image_path].join(':'));
          if (workerKeepsImages) {
            const imgUrl = new URL('../../' + plan.image_path, location.href).href;
            if (!(await caches.match(imgUrl))) await fetch(imgUrl).catch(() => {});
          }
        }
        if (pj.plans.length) {
          const g = await getJson('floor-plan-graph.php?building_id=' + building.id);
          LamparaCache.setBuildingGraph(building.id, { nodes: g.nodes, edges: g.edges });
          // Per-floor graphs (used by the scan page's same-floor route) come from the same data.
          pj.plans.forEach((plan) => {
            const nodes = g.nodes.filter((n) => n.floor_plan_id === plan.id);
            const ids = new Set(nodes.map((n) => n.id));
            LamparaCache.setGraph(plan.id, { nodes, edges: g.edges.filter((e) => ids.has(e.node_a_id) && ids.has(e.node_b_id)) });
          });
          parts.push(g.nodes.map((n) => [n.id, n.x, n.y].join(':')).join(','), g.edges.length);
        }
      }

      const signature = hash(parts.join('|'));
      const previous = getLS(SIG_KEY);
      setLS(SIG_KEY, signature);
      LamparaCache.setSyncedAt(Date.now());
      state.online = true;
      renderBadge();
      if (notify && previous && previous !== signature) toast('Updated: the latest campus info is saved for offline use.');
      return true;
    } catch (e) {
      return false; // offline or the server is down: keep using what's saved
    } finally {
      state.refreshing = false;
    }
  }

  // Pulls each student page and the files it needs through the worker so they're saved.
  async function prewarmPages() {
    if (state.prewarming || !state.online || !navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    if (Date.now() - Number(getLS(PAGES_KEY) || 0) < PAGES_EVERY_MS) return;
    state.prewarming = true;
    try {
      const seen = new Set();
      for (const page of PAGES) {
        const pageUrl = new URL(page, location.href);
        const res = await fetch(pageUrl.href, { credentials: 'same-origin' }).catch(() => null);
        if (!res || !res.ok || res.redirected) continue;
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const assets = [...doc.querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel~="icon"][href], link[rel="manifest"][href], link[rel="apple-touch-icon"][href]')]
          .map((el) => el.getAttribute('src') || el.getAttribute('href'));
        for (const a of assets) {
          const abs = new URL(a, pageUrl).href;
          if (seen.has(abs)) continue;
          seen.add(abs);
          // Ordinary (CORS) fetch even for CDN files: a CORS response can serve any later request,
          // an opaque one can't serve a script tag that uses integrity/crossorigin.
          await fetch(abs).catch(() => {});
        }
      }
      setLS(PAGES_KEY, String(Date.now()));
    } catch (e) { /* best effort */ }
    finally { state.prewarming = false; }
  }

  // ---------- on-screen bits ----------
  let badge = null, toastEl = null, styled = false;
  function ensureStyle() {
    if (styled || !document.head) return;
    styled = true;
    const style = document.createElement('style');
    style.textContent = `
      .so-badge{position:fixed;top:0;left:0;right:0;z-index:2147483000;text-align:center;pointer-events:none;
        padding:calc(2px + env(safe-area-inset-top,0px)) 0.5rem 2px;background:rgba(20,37,28,.92);color:#fff;
        font:600 10.5px/1.5 'Outfit',system-ui,sans-serif;letter-spacing:.01em}
      .so-badge[hidden]{display:none}
      .so-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(1rem + env(safe-area-inset-bottom,0px));z-index:2147483000;
        max-width:calc(100vw - 2rem);padding:.55rem .95rem;border-radius:999px;background:#14251c;color:#fff;
        font:600 12.5px/1.3 'Outfit',system-ui,sans-serif;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);pointer-events:none}`;
    document.head.appendChild(style);
  }
  function renderBadge() {
    if (!document.body) return;
    ensureStyle();
    if (!badge) {
      badge = document.createElement('div');
      badge.className = 'so-badge';
      badge.setAttribute('role', 'status');
      badge.hidden = true;
      document.body.appendChild(badge);
    }
    badge.hidden = state.online;
    if (!state.online) {
      const t = typeof LamparaCache !== 'undefined' ? LamparaCache.getSyncedAt() : null;
      badge.textContent = t ? 'Offline · using saved campus info from ' + ago(t) : 'Offline · no saved campus info on this device yet';
    }
  }
  function toast(message) {
    if (!document.body) return;
    ensureStyle();
    if (toastEl) toastEl.remove();
    toastEl = document.createElement('div');
    toastEl.className = 'so-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.textContent = message;
    document.body.appendChild(toastEl);
    const mine = toastEl;
    setTimeout(() => { if (mine.parentNode) mine.remove(); }, 4200);
  }

  // ---------- start-up ----------
  async function start() {
    renderBadge();
    if ('serviceWorker' in navigator) {
      try { await navigator.serviceWorker.register('../../sw.js'); } catch (e) { /* no worker: data caching still works */ }
    }

    window.addEventListener('offline', () => setOnline(false));
    window.addEventListener('online', () => checkNow());
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkNow(); });
    setInterval(() => { if (document.visibilityState === 'visible') checkNow(); }, HEARTBEAT_MS);

    const boot = async () => {
      if (!(await ping())) { setOnline(false); return; }
      state.online = true;
      renderBadge();
      const lastData = LamparaCache.getSyncedAt();
      if (!lastData || Date.now() - lastData > DATA_FRESH_MS || !getLS(SIG_KEY)) await refreshData({ notify: false });
      prewarmPages();
    };
    // The worker only controls a page after it has claimed it (the very first visit): wait for that,
    // so the files fetched below are saved by it.
    if ('serviceWorker' in navigator) {
      await navigator.serviceWorker.ready.catch(() => {});
      if (navigator.serviceWorker.controller) boot();
      else navigator.serviceWorker.addEventListener('controllerchange', () => boot(), { once: true });
    } else {
      boot();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return {
    isOnline: () => state.online,
    onStatus: (fn) => statusListeners.push(fn),
    refresh: (opts) => refreshData(opts),
    checkNow,
    // for tests
    _state: state
  };
})();
