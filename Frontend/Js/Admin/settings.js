// School settings (Backend/api/institution.php): one record that says which school this install is for.
(() => {
  const API = '../../../Backend/api/institution.php';
  const $ = (id) => document.getElementById(id);
  const TEXT = ['name', 'short_name', 'tagline', 'persona', 'contact_email', 'contact_phone'];
  const FEATURES = ['enrollment', 'game', 'hazards', 'chat'];
  const PROX = ['arrived_m', 'turn_near_m', 'now_m', 'off_path_m', 'report_m', 'edge_m'];
  let saved = null, bounds = null, center = null, map = null, rect = null;

  const msg = (t, bad) => { const m = $('stMsg'); m.textContent = t || ''; m.classList.toggle('bad', !!bad); m.hidden = !t; if (t) m.scrollIntoView({ block: 'nearest' }); };
  const fmt = (n) => Number(n).toFixed(5);

  function read() {
    const o = { theme: $('f-theme').value, bounds, center_lat: center[0], center_lng: center[1], features: {}, proximity: {} };
    PROX.forEach((k) => { o.proximity[k] = Number($('px-' + k).value); });
    TEXT.forEach((k) => { o[k] = $('f-' + k).value; });
    FEATURES.forEach((k) => { o.features[k] = $('ft-' + k).checked; });
    return o;
  }
  const dirty = () => !!saved && JSON.stringify(read()) !== JSON.stringify(saved);
  const refresh = () => { $('stSave').disabled = !dirty(); };

  function showArea() {
    $('stAreaText').textContent = 'South-west ' + fmt(bounds[0][0]) + ', ' + fmt(bounds[0][1]) + '  ·  north-east ' + fmt(bounds[1][0]) + ', ' + fmt(bounds[1][1]);
    if (rect) rect.setBounds(bounds); else if (map) rect = L.rectangle(bounds, { color: '#2e3192', weight: 2, fillOpacity: 0.08, interactive: false }).addTo(map);
    placeHandles();
  }
  // Four draggable corners cover the campus: drag any one and the box follows. Each corner keeps the opposite one fixed.
  const handles = {};
  function placeHandles() {
    if (!map) return;
    const [[s, w], [n, e]] = bounds;
    const spots = { sw: [s, w], nw: [n, w], ne: [n, e], se: [s, e] };
    Object.keys(spots).forEach((k) => {
      if (handles[k]) { handles[k].setLatLng(spots[k]); return; }
      const m = L.marker(spots[k], { draggable: true, keyboard: true, title: 'Drag to resize the campus area',
        icon: L.divIcon({ className: '', html: '<span class="st-handle" aria-hidden="true"></span>', iconSize: [26, 26], iconAnchor: [13, 13] }) }).addTo(map);
      m.on('drag', () => {
        const p = m.getLatLng();
        let [[S, W], [N, E]] = bounds;
        if (k[0] === 's') S = p.lat; else N = p.lat;
        if (k[1] === 'w') W = p.lng; else E = p.lng;
        if (N - S < 0.0002 || E - W < 0.0002) return;            // keep a sensible minimum size
        bounds = [[S, W], [N, E]]; center = [(S + N) / 2, (W + E) / 2];
        rect.setBounds(bounds);
        Object.keys(spots).forEach((q) => { if (q !== k && handles[q]) handles[q].setLatLng({ sw: [S, W], nw: [N, W], ne: [N, E], se: [S, E] }[q]); });
        $('stAreaText').textContent = 'South-west ' + fmt(S) + ', ' + fmt(W) + '  ·  north-east ' + fmt(N) + ', ' + fmt(E);
        refresh();
      });
      handles[k] = m;
    });
  }
  // The distance sliders show their number next to them.
  function showPx() { PROX.forEach((k) => { const o = document.querySelector('output[for="px-' + k + '"]'); if (o) o.textContent = $('px-' + k).value + ' m'; }); }
  function showLogo(path) {
    const img = $('stLogoImg');
    img.src = path ? '../../' + path : '../../assets/logo.svg';
    $('stLogoClear').hidden = !path;
  }

  function fill(i) {
    TEXT.forEach((k) => { $('f-' + k).value = i[k] || ''; });
    $('f-theme').value = i.theme || 'default';
    FEATURES.forEach((k) => { $('ft-' + k).checked = !!(i.features && i.features[k]); });
    PROX.forEach((k) => { $('px-' + k).value = i.proximity && i.proximity[k] != null ? i.proximity[k] : ''; });
    bounds = i.bounds; center = [i.center_lat, i.center_lng];
    showLogo(i.logo_path);
    saved = read();
    initMap(); showArea(); showPx(); refresh();
  }

  function initMap() {
    if (map) return;
    map = L.map('stMap').setView(center, 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 19 }).addTo(map);
    map.fitBounds(bounds);
    setTimeout(() => map.invalidateSize(), 300);
  }

  async function load() {
    try {
      const d = await (await fetch(API + '?format=full', { credentials: 'same-origin', cache: 'no-store' })).json();
      if (!d.success) throw new Error(d.error || 'Could not load the settings.');
      fill(d.institution);
    } catch (e) { msg(e.message || 'Could not load the settings.', true); }
  }

  $('stUseView').addEventListener('click', () => {
    const b = map.getBounds(), c = map.getCenter();
    bounds = [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]]; center = [c.lat, c.lng];
    showArea(); refresh();
  });
  document.querySelectorAll('.st input, .st select, .st textarea').forEach((el) => { el.addEventListener('input', () => { showPx(); refresh(); }); el.addEventListener('change', refresh); });

  $('stSave').addEventListener('click', async () => {
    $('stSave').disabled = true;
    try {
      const r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(read()) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Could not save.');
      fill(d.institution); msg('Saved. Pages pick it up the next time they load.');
      if (window.Swal) Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 2200 }).fire({ icon: 'success', title: 'Settings saved' });
    } catch (e) { msg(e.message, true); refresh(); }
  });

  // ---- logo ----
  $('stLogoPick').addEventListener('click', () => $('stLogoFile').click());
  $('stLogoFile').addEventListener('change', () => {
    const f = $('stLogoFile').files[0]; if (!f) return;
    if (f.size > 4 * 1024 * 1024) return msg('That image is over 4 MB. Choose a smaller one.', true);
    const rd = new FileReader();
    rd.onload = () => postLogo(rd.result);
    rd.readAsDataURL(f);
  });
  $('stLogoClear').addEventListener('click', () => postLogo(null));
  async function postLogo(dataUrl) {
    try {
      const r = await fetch(API + '?action=logo', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo: dataUrl }) });
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'Could not save the logo.');
      showLogo(d.logo); msg(d.logo ? 'Logo saved.' : 'Logo removed.');
    } catch (e) { msg(e.message, true); }
    $('stLogoFile').value = '';
  }

  window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
