// Live hazard feed: tells admins when a visitor reports a closed building or a blocked path, and everyone using the app once an admin approves it.
// Plain <script>; exposes `LamparaHazards`. It starts by itself on every page that includes it.
//   - visitors: a slim banner at the top with the newest report; tap it for the photo and the full list
//   - admins (<script data-admin>): a toast for each new report waiting for approval and a count on the Reports menu entry
// It polls every 30 seconds while the page is open, and raises a phone notification when the visitor allowed them.
// (There is no push server, so nothing arrives while the app is closed.)
const LamparaHazards = (() => {
  const me = document.currentScript;
  const adminMode = !!(me && me.hasAttribute('data-admin'));
  // visitors see approved (active) reports; admins watch the ones still waiting for their approval
  const API = new URL('../../../Backend/api/hazards.php', location.href).href + (adminMode ? '?status=pending' : '');
  const FE = new URL('../../', location.href).href;                         // Frontend/, where report photos live
  const POLL_MS = 30000;
  const KIND = { restricted: 'Closed / off-limits', blocked: 'Path blocked' };
  const DISMISS_KEY = 'lampara_hazards_dismissed';

  let reports = [], known = null, timer = null, bar = null, dlg = null;
  const listeners = [];

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ago = (m) => (m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.floor(m / 60) + ' h ago');
  const where = (r) => r.building_name || 'on the campus grounds';
  const title = (r) => (r.kind === 'restricted' ? 'Closed: ' : 'Blocked: ') + (r.kind === 'restricted' && r.building_name ? r.building_name : where(r));

  function dismissed() { try { return JSON.parse(sessionStorage.getItem(DISMISS_KEY)) || []; } catch (e) { return []; } }
  function dismiss(id) { try { sessionStorage.setItem(DISMISS_KEY, JSON.stringify(dismissed().concat(id))); } catch (e) { /* only for this visit anyway */ } }

  // ---------------- styles (self-contained: the script works on any page)
  function addStyles() {
    if (document.getElementById('lh-style')) return;
    const st = document.createElement('style'); st.id = 'lh-style';
    st.textContent = `
.lh-bar{position:fixed;top:calc(env(safe-area-inset-top,0px) + 8px);left:50%;transform:translateX(-50%) translateY(-140%);z-index:2147483000;width:min(94vw,34rem);display:flex;align-items:center;gap:.6rem;background:#b3261e;color:#fff;border-radius:1rem;padding:.65rem .8rem;box-shadow:0 10px 30px rgba(0,0,0,.45);font:600 1rem/1.25 'Outfit',system-ui,sans-serif;transition:transform .45s cubic-bezier(.2,1.2,.4,1)}
.lh-bar.on{transform:translateX(-50%) translateY(0)}
.lh-bar.flash{animation:lhflash .9s ease 2}
@keyframes lhflash{50%{background:#e0382e}}
.lh-bar svg{flex:none}
.lh-main{flex:1;min-width:0;background:none;border:0;color:inherit;font:inherit;text-align:left;cursor:pointer;padding:0}
.lh-main small{display:block;font-weight:500;opacity:.9}
.lh-x{flex:none;background:rgba(255,255,255,.2);border:0;color:#fff;width:2.2rem;height:2.2rem;border-radius:50%;font-size:1.2rem;cursor:pointer}
.lh-ov{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}
.lh-sheet{background:#fff;color:#161850;width:min(100%,34rem);max-height:88vh;overflow:auto;border-radius:1.3rem 1.3rem 0 0;padding:1.1rem 1.1rem 1.4rem;font-family:'Outfit',system-ui,sans-serif}
.lh-sheet h2{margin:0 0 .6rem;font-size:1.35rem}
.lh-item{border:1px solid #e0e2ee;border-radius:1rem;padding:.7rem;margin-bottom:.7rem}
.lh-item b{display:block;font-size:1.12rem}
.lh-item span{color:#4b4f6a;font-size:1rem}
.lh-item img{display:block;width:100%;max-height:16rem;object-fit:cover;border-radius:.8rem;margin-top:.5rem}
.lh-flag{display:block;margin-top:.4rem;background:none;border:0;color:#5d6272;font:600 .9rem 'Outfit',system-ui,sans-serif;text-decoration:underline;cursor:pointer;padding:.2rem 0}
.lh-btn{display:block;width:100%;box-sizing:border-box;text-align:center;text-decoration:none;font:800 1.1rem 'Outfit',system-ui,sans-serif;border:0;border-radius:.9rem;padding:.85rem;margin-top:.6rem;cursor:pointer;background:#ffd100;color:#161850}
.lh-btn.alt{background:#eceefa}
.lh-toast{position:fixed;right:14px;bottom:14px;z-index:2147483000;max-width:22rem;background:#161850;color:#fff;border-left:6px solid #ffd100;border-radius:.8rem;padding:.8rem 1rem;box-shadow:0 10px 30px rgba(0,0,0,.35);font:600 .95rem/1.35 'Outfit',system-ui,sans-serif;cursor:pointer}
.lh-toast small{display:block;font-weight:500;opacity:.85}
.lh-badge{margin-left:auto;background:#b3261e;color:#fff;border-radius:999px;padding:0 .5rem;font-size:.75rem;font-weight:800;line-height:1.5}
`;
    document.head.appendChild(st);
  }

  // ---------------- visitor banner + sheet
  function ensureBar() {
    if (bar) return bar;
    bar = document.createElement('div'); bar.className = 'lh-bar'; bar.setAttribute('role', 'alert');
    bar.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17v.01"/></svg>'
      + '<button type="button" class="lh-main"></button><button type="button" class="lh-x" aria-label="Hide this warning">&times;</button>';
    document.body.appendChild(bar);
    bar.querySelector('.lh-main').onclick = openSheet;
    bar.querySelector('.lh-x').onclick = () => { const top = visible()[0]; if (top) dismiss(top.id); renderBar(); };
    return bar;
  }
  const visible = () => reports.filter((r) => dismissed().indexOf(r.id) === -1);
  function renderBar(flash) {
    if (adminMode) return;
    const list = visible();
    if (!list.length) { if (bar) bar.classList.remove('on'); return; }
    ensureBar();
    const r = list[0];
    bar.querySelector('.lh-main').innerHTML = esc(title(r)) + '<small>' + esc(KIND[r.kind] || '') + (r.urgent && !r.verified ? ' &middot; not yet checked by staff' : '') + ' &middot; ' + ago(r.age_min) + (list.length > 1 ? ' &middot; ' + (list.length - 1) + ' more' : '') + ' &middot; tap to see</small>';
    bar.classList.add('on');
    if (flash) { bar.classList.remove('flash'); void bar.offsetWidth; bar.classList.add('flash'); }
  }
  function openSheet() {
    if (dlg) dlg.remove();
    dlg = document.createElement('div'); dlg.className = 'lh-ov';
    const items = reports.map((r) => '<div class="lh-item"><b>' + esc(title(r)) + '</b><span>' + esc(KIND[r.kind] || '') + (r.urgent && !r.verified ? ' &middot; <b style="display:inline">not yet checked by staff</b>' : '') + ' &middot; ' + ago(r.age_min) + '</span>'
      + (r.note ? '<p style="margin:.4rem 0 0">' + esc(r.note) + '</p>' : '')
      + (r.photo_path ? '<img src="' + esc(FE + r.photo_path) + '" alt="Photo of the problem"><button type="button" class="lh-flag" data-flag="' + r.id + '">Report this photo</button>' : '') + '</div>').join('');
    const canAlert = 'Notification' in window && Notification.permission === 'default';
    dlg.innerHTML = '<div class="lh-sheet" role="dialog" aria-label="Warnings from other visitors"><h2>Warnings on the campus</h2>' + items
      + (canAlert ? '<button type="button" class="lh-btn alt" data-alert>Tell me when something new is reported</button>' : '')
      + '<a class="lh-btn alt" href="' + esc(FE + 'View/Student/report.php') + '">Report a problem</a><button type="button" class="lh-btn" data-close>Close</button></div>';
    document.body.appendChild(dlg);
    dlg.onclick = (e) => {
      if (e.target === dlg || e.target.hasAttribute('data-close')) { dlg.remove(); dlg = null; return; }
      const f = e.target.closest('[data-flag]');
      if (f) {
        f.disabled = true; f.textContent = 'Thank you. Staff will look at it.';
        fetch(API.split('?')[0] + '?id=' + f.dataset.flag + '&action=flag', { method: 'POST', credentials: 'same-origin' }).catch(() => {});
      }
    };
    const a = dlg.querySelector('[data-alert]');
    if (a) a.onclick = () => Notification.requestPermission().then(() => { a.remove(); });
  }

  // ---------------- admin: toast + menu count
  function adminToast(r) {
    const t = document.createElement('div'); t.className = 'lh-toast';
    t.innerHTML = 'New report to approve: ' + esc(title(r)) + '<small>' + esc(KIND[r.kind] || '') + ' &middot; tap to review and approve</small>';
    t.onclick = () => { location.href = new URL('hazards.php', location.href).href; };
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 12000);
  }
  function adminBadge() {
    document.querySelectorAll('a[href$="hazards.php"] .nav-label').forEach((el) => {
      let b = el.parentNode.querySelector('.lh-badge');
      if (!reports.length) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); b.className = 'lh-badge'; el.parentNode.appendChild(b); }
      b.textContent = reports.length;
    });
  }

  // ---------------- polling
  function notify(r) {
    try {
      if (!adminMode && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
        new Notification(title(r), { body: (KIND[r.kind] || '') + (r.note ? ': ' + r.note : ''), icon: FE + 'assets/icon-192.png', tag: 'lampara-hazard-' + r.id });
      }
    } catch (e) { /* notifications are a bonus */ }
  }
  async function poll() {
    try {
      const d = await (await fetch(API, { cache: 'no-store', credentials: 'same-origin' })).json();
      if (!d.success) return;
      reports = d.reports;
      const fresh = known === null ? [] : reports.filter((r) => !known.has(r.id));
      known = new Set(reports.map((r) => r.id));
      fresh.forEach((r) => { notify(r); if (adminMode) adminToast(r); });
      renderBar(fresh.length > 0);
      if (adminMode) adminBadge();
      listeners.forEach((fn) => { try { fn(reports); } catch (e) { /* a listener must not stop the feed */ } });
    } catch (e) { /* offline: try again next time */ }
  }
  function start() {
    addStyles();
    poll();
    timer = setInterval(poll, POLL_MS);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  return {
    all: () => reports.slice(),
    forBuilding: (id) => reports.filter((r) => String(r.building_id) === String(id)),
    refresh: poll,
    onChange: (fn) => listeners.push(fn)
  };
})();
