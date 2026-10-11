// Student · Campus Map — shows the 2D / 3D static map the admin uploaded.
//   2D: PNG / JPG / WebP / SVG pictures, or a PDF (pages are drawn with PDF.js) — pinch / scroll to zoom, drag to move.
//   3D: an .obj model (three.js, see map-3d.js) you can rotate and zoom, or a plain picture.
// Data: Backend/api/static-maps.php (public). The last answer is kept in localStorage and the service worker keeps
// the files themselves, so the map still opens with no signal once it has been viewed (or the campus data was synced) once.
(() => {
  const API = '../../../Backend/api/static-maps.php';
  const LS_MAPS = 'lampara_static_maps';
  const LS_TAB = 'lampara_static_map_tab';
  const MK_API = '../../../Backend/api/static-map-markers.php';
  const LS_MARKERS = 'lampara_static_map_markers';
  const PDFJS_SOURCES = ['../../assets/vendor/pdfjs/', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/'];
  const PDF_SIZES = [3200, 2200, 1400];   // picture sizes tried in turn; a phone that can't build the big one gets a smaller one

  const $ = (id) => document.getElementById(id);
  const app = $('mapApp'), viewport = $('viewport'), canvasEl = $('mapCanvas'), img = $('mapImg'), stage3d = $('viewport3d');
  const keyPlaces = $('keyPlaces'), mkLayer = $('mkLayer'), mkCard = $('mkCard'), pinsSheet = $('pinsSheet'), pinsList = $('pinsList'), pinsBtn = $('pinsBtn');
  const loading = $('loading'), loadingText = $('loadingText'), empty = $('empty'), controls = $('controls'), hint = $('hint'), caption = $('caption');
  const pager = $('pager'), pageNum = $('pageNum');
  const tabs = { '2d': $('tab-2d'), '3d': $('tab-3d') };

  const getLS = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } };
  const urlOf = (map) => '../../' + map.image_path + '?v=' + encodeURIComponent(map.updated_at || '');
  const formatOf = (map) => (map.format || (map.image_path.split('.').pop() || '')).toLowerCase();

  let maps = { '2d': null, '3d': null };
  let kind = null;
  let token = 0;                       // bumps on every switch so a slow download can't overwrite a newer view
  let mode = '2d-image';               // '2d-image' | '3d-model'
  let viewer3d = null;                 // the three.js viewer while a .obj is open
  let pdfDoc = null, pdfPage = 1, pdfBlobUrl = null;
  let markers = [];                   // entrance / gate pins for the open map
  let selectedMarker = null;
  const view = { scale: 1, x: 0, y: 0, fit: 1, min: 1, max: 8, iw: 0, ih: 0 };

  // ---------- data ----------
  async function loadMaps() {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error('bad response');
      maps = data.maps;
      setLS(LS_MAPS, JSON.stringify(maps));
      return true;
    } catch (e) {
      const saved = getLS(LS_MAPS);
      if (saved) { try { maps = JSON.parse(saved); return true; } catch (err) { /* fall through */ } }
      return false;
    }
  }

  // ---------- tabs ----------
  function updateTabs() {
    ['2d', '3d'].forEach((k) => {
      tabs[k].disabled = !maps[k];
      tabs[k].setAttribute('aria-selected', String(k === kind));
    });
  }

  function select(k) {
    kind = k;
    setLS(LS_TAB, k);
    updateTabs();
    show();
  }

  // ---------- states ----------
  function clearView() {
    if (viewer3d) { viewer3d.dispose(); viewer3d = null; }
    stage3d.hidden = true;
    viewport.hidden = false;
    canvasEl.hidden = true;
    mkLayer.innerHTML = '';
    mkCard.hidden = true;
    keyPlaces.hidden = true;
    pinsSheet.hidden = true;
    pinsBtn.hidden = true;
    selectedMarker = null;
    controls.hidden = true;
    hint.hidden = true;
    pager.hidden = true;
    empty.hidden = true;
    if (pdfBlobUrl) { URL.revokeObjectURL(pdfBlobUrl); pdfBlobUrl = null; }
    pdfDoc = null; pdfPage = 1;
  }

  function hideLoading() {
    loading.hidden = true;
    if (window.LamparaSkeleton) LamparaSkeleton.done();
  }

  function showLoading(text) {
    loadingText.textContent = text || 'Loading map…';
    loading.hidden = false;
  }

  function showEmpty(title, text, fileUrl) {
    clearView();
    hideLoading();
    $('emptyTitle').textContent = title;
    $('emptyText').textContent = text;
    const old = $('emptyActions');
    if (old) old.remove();
    if (fileUrl) {
      const box = document.createElement('div');
      box.id = 'emptyActions';
      box.style.cssText = 'display:flex;gap:0.6rem;flex-wrap:wrap;justify-content:center;margin-top:0.9rem';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = 'Try again'; retry.className = 'btn-retry';
      retry.addEventListener('click', () => location.reload());
      const open = document.createElement('a');
      open.href = fileUrl; open.target = '_blank'; open.rel = 'noopener'; open.textContent = 'Open the map file'; open.className = 'btn-retry';
      box.append(retry, open);
      empty.appendChild(box);
    }
    empty.hidden = false;
  }

  function showHint(text) {
    hint.textContent = text;
    hint.classList.remove('fade');
    hint.hidden = false;
    setTimeout(() => hint.classList.add('fade'), 3800);
    setTimeout(() => { hint.hidden = true; }, 4500);
  }

  const failMessage = ['Couldn\'t load the map', 'Check your connection and try again. Once it has opened, it is saved on your phone for offline use.'];

  // ---------- opening a map ----------
  function show() {
    const map = maps[kind];
    token++;
    const mine = token;
    clearView();
    if (!map) { hideLoading(); showEmpty('No map yet', 'The campus map hasn\'t been uploaded yet. Please check back soon.'); return; }
    const label = map.title || (kind === '2d' ? '2D campus map' : '3D campus map');
    caption.textContent = label;
    img.alt = label;
    showLoading('Loading map…');
    const fmt = formatOf(map);
    if (fmt === 'obj') open3d(map, mine);
    else if (fmt === 'pdf') openPdf(map, mine);
    else openImage(map, mine);
  }

  function openImage(map, mine) {
    mode = '2d-image';
    img.onload = () => {
      if (mine !== token) return;
      // an SVG with no size of its own reports 0 x 0 in some browsers: fall back to a sensible canvas
      view.iw = img.naturalWidth || 2000; view.ih = img.naturalHeight || 1500;
      canvasEl.style.width = view.iw + 'px'; canvasEl.style.height = view.ih + 'px';
      canvasEl.hidden = false;
      hideLoading();
      controls.hidden = false;
      reset();
      loadMarkers(mine);
      showHint('Drag to move · pinch or scroll to zoom · double-tap to zoom in');
    };
    img.onerror = () => { if (mine === token) showEmpty(...failMessage); };
    img.src = urlOf(map);
  }

  // ---- PDF ----
  let pdfLibPromise = null;
  function loadPdfLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfLibPromise) {
      const tryLoad = (i) => new Promise((resolve, reject) => {
        const base = PDFJS_SOURCES[i];
        const el = document.createElement('script');
        el.src = base + 'pdf.min.js';
        if (/^https?:/.test(base)) el.crossOrigin = 'anonymous';
        el.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js'; resolve(window.pdfjsLib); };
        el.onerror = () => { el.remove(); reject(new Error('pdf.js')); };
        document.head.appendChild(el);
      }).catch((err) => (i + 1 < PDFJS_SOURCES.length ? tryLoad(i + 1) : Promise.reject(err)));
      pdfLibPromise = tryLoad(0);
      pdfLibPromise.catch(() => { pdfLibPromise = null; });
    }
    return pdfLibPromise;
  }

  async function openPdf(map, mine) {
    mode = '2d-image';
    try {
      showLoading('Opening PDF…');
      const lib = await loadPdfLib();
      // Fetch the file ourselves (plain GET) so the service worker can keep it for offline use.
      const buf = await (await fetch(urlOf(map))).arrayBuffer();
      const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
      if (mine !== token) return;
      pdfDoc = doc; pdfPage = 1;
      await renderPdfPage(mine, true);
    } catch (e) {
      if (mine === token) showEmpty(failMessage[0], 'The PDF map could not be opened on this device (' + ((e && e.message) || 'unknown error') + '). Try again, or open the map file directly.', urlOf(map));
    }
  }

  // Draws the page to a picture, falling back to smaller sizes if the device can't build the big one.
  async function pdfPageBlob(page) {
    const base = page.getViewport({ scale: 1 });
    let lastErr = null;
    for (const side of PDF_SIZES) {
      try {
        const vp = page.getViewport({ scale: side / Math.max(base.width, base.height) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('no canvas');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('picture too large');
        return blob;
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('could not draw the page');
  }

  async function renderPdfPage(mine, first) {
    showLoading(pdfDoc.numPages > 1 ? 'Drawing page ' + pdfPage + '…' : 'Drawing the map…');
    const page = await pdfDoc.getPage(pdfPage);
    const blob = await pdfPageBlob(page);
    if (mine !== token) return;
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    pdfBlobUrl = URL.createObjectURL(blob);
    img.onload = () => {
      if (mine !== token) return;
      view.iw = img.naturalWidth; view.ih = img.naturalHeight;
      canvasEl.style.width = view.iw + 'px'; canvasEl.style.height = view.ih + 'px';
      canvasEl.hidden = false;
      hideLoading();
      controls.hidden = false;
      reset();
      mkLayer.style.display = pdfPage === 1 ? '' : 'none';       // pins belong to page 1 only
      pinsBtn.hidden = pdfPage !== 1 || !markers.length;
      if (first) loadMarkers(mine);
      if (first) showHint('Drag to move · pinch or scroll to zoom' + (pdfDoc.numPages > 1 ? ' · use ‹ › to change page' : ''));
    };
    img.src = pdfBlobUrl;
    pager.hidden = pdfDoc.numPages < 2;
    pageNum.textContent = pdfPage + ' / ' + pdfDoc.numPages;
    $('pagePrev').disabled = pdfPage <= 1;
    $('pageNext').disabled = pdfPage >= pdfDoc.numPages;
  }

  $('pagePrev').addEventListener('click', () => { if (pdfDoc && pdfPage > 1) { pdfPage--; renderPdfPage(token); } });
  $('pageNext').addEventListener('click', () => { if (pdfDoc && pdfPage < pdfDoc.numPages) { pdfPage++; renderPdfPage(token); } });

  // ---- 3D (.obj) ----
  async function open3d(map, mine) {
    mode = '3d-model';
    try {
      showLoading('Loading 3D model…');
      const { createViewer } = await import('../../Js/Public/map-3d.js');
      viewport.hidden = true;
      stage3d.hidden = false;
      const v = await createViewer(stage3d, urlOf(map), {
        onProgress: (p) => { if (mine === token) loadingText.textContent = 'Loading 3D model… ' + Math.round(p * 100) + '%'; }
      });
      if (mine !== token) { v.dispose(); return; }
      viewer3d = v;
      hideLoading();
      controls.hidden = false;
      showHint('Drag to rotate · pinch or scroll to zoom · two fingers to move');
    } catch (e) {
      if (mine === token) showEmpty('Couldn\'t open the 3D model', 'Your device may not support 3D graphics, or the model couldn\'t be downloaded. Check your connection and try again.');
    }
  }

  // ---------- entrance / gate pins ----------
  async function fetchMarkers(k) {
    try {
      const res = await fetch(MK_API + '?kind=' + k, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error('bad response');
      try { const all = JSON.parse(getLS(LS_MARKERS) || '{}'); all[k] = data.markers; setLS(LS_MARKERS, JSON.stringify(all)); } catch (e) { /* ignore */ }
      return data.markers;
    } catch (e) {
      try { return (JSON.parse(getLS(LS_MARKERS) || '{}'))[k] || []; } catch (err) { return []; }
    }
  }

  const PIN_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>';

  async function loadMarkers(mine) {
    const list = await fetchMarkers(kind);
    if (mine !== token) return;
    markers = list;
    mkLayer.innerHTML = '';
    markers.forEach((m) => {
      const el = document.createElement('div');
      el.className = 'mk ' + m.marker_type;
      el.dataset.id = String(m.id);
      el.style.left = m.x + '%'; el.style.top = m.y + '%';
      const pin = document.createElement('div'); pin.className = 'mk-pin';
      const label = document.createElement('span'); label.className = 'mk-label'; label.textContent = m.name;
      const dot = document.createElement('span'); dot.className = 'mk-dot';
      pin.appendChild(label); pin.appendChild(dot); el.appendChild(pin);
      mkLayer.appendChild(el);
    });
    pinsBtn.hidden = !markers.length;
    renderKeyPlaces();
    renderPinsList();
    apply();
  }

  // chips along the top for the highlighted places; tapping one zooms to it
  function renderKeyPlaces() {
    keyPlaces.innerHTML = '';
    const key = markers.filter((m) => m.marker_type === 'landmark');
    keyPlaces.hidden = !key.length;
    key.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = String(m.id);
      b.innerHTML = '<span class="star">\u2605</span>';
      b.appendChild(document.createTextNode(m.label || m.name));
      b.addEventListener('click', () => focusMarker(m));
      keyPlaces.appendChild(b);
    });
  }

  function renderPinsList() {
    pinsList.innerHTML = '';
    if (!markers.length) { pinsList.innerHTML = '<li class="pins-empty">No entrances or gates have been pinned yet.</li>'; return; }
    const order = { landmark: 0, entrance: 1, gate: 2 };
    [...markers].sort((a, b) => (order[a.marker_type] - order[b.marker_type])).forEach((m) => {
      const li = document.createElement('li');
      li.className = m.marker_type;
      li.innerHTML = '<span class="chip"></span><span></span>';
      const text = li.lastChild;
      text.textContent = m.name;
      const sub = document.createElement('small');
      sub.textContent = typeLabel(m);
      text.appendChild(sub);
      li.addEventListener('click', () => { pinsSheet.hidden = true; focusMarker(m); });
      pinsList.appendChild(li);
    });
  }

  const typeLabel = (m) => (m.marker_type === 'gate' ? 'Campus gate' : (m.marker_type === 'landmark' ? 'Key place' : 'Building entrance'));

  function selectMarker(m) {
    selectedMarker = m;
    mkLayer.querySelectorAll('.mk').forEach((el) => el.classList.toggle('sel', m && el.dataset.id === String(m.id)));
    if (!m) { mkCard.hidden = true; keyPlaces.querySelectorAll('button').forEach((b) => b.classList.remove('on')); scheduleDeclutter(); return; }
    $('mkCardName').textContent = m.name;
    $('mkCardType').textContent = typeLabel(m);
    const icon = $('mkCardIcon');
    icon.className = 'mk-card-icon ' + m.marker_type;
    icon.innerHTML = PIN_ICON;
    mkCard.hidden = false;
    keyPlaces.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.id === String(m.id)));
    declutter();
  }

  // zoom in on a pin and select it
  function focusMarker(m) {
    const px = view.iw * m.x / 100, py = view.ih * m.y / 100;
    const target = Math.min(view.max, Math.max(view.scale, view.fit * 3));
    view.scale = target;
    view.x = viewport.clientWidth / 2 - px * target;
    view.y = viewport.clientHeight / 2 - py * target;
    clamp(); apply();
    selectMarker(m);
  }

  $('mkCardClose').addEventListener('click', () => selectMarker(null));
  pinsBtn.addEventListener('click', () => { pinsSheet.hidden = !pinsSheet.hidden; });
  $('pinsClose').addEventListener('click', () => { pinsSheet.hidden = true; });

  // ---------- zoom / pan (2D pictures) ----------
  function apply() {
    canvasEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    canvasEl.style.setProperty('--inv', (1 / view.scale).toFixed(4));
    scheduleDeclutter();
  }

  // Pin labels keep a fixed size on screen, so crowded pins would pile their names on top of each other.
  // Show the most important labels first (selected, key places, gates, entrances) and hide any label that would
  // cover another label or another pin. Zooming in makes room, so more names appear. A hidden name still shows
  // in the info card when its pin is tapped.
  let declutterTimer = null;
  function scheduleDeclutter() {
    if (declutterTimer || !markers.length) return;
    declutterTimer = setTimeout(() => { declutterTimer = null; requestAnimationFrame(declutter); }, 60);
  }
  function declutter() {
    const rank = { landmark: 1, gate: 2, entrance: 3 };
    const items = [...mkLayer.querySelectorAll('.mk')].map((el) => {
      const m = markers.find((x) => String(x.id) === el.dataset.id);
      const label = el.querySelector('.mk-label');
      label.classList.remove('hide');
      return { el, label, dot: el.querySelector('.mk-dot'), pri: (selectedMarker && m && m.id === selectedMarker.id) ? 0 : (m ? rank[m.marker_type] || 4 : 5) };
    });
    items.forEach((it) => { it.lr = it.label.getBoundingClientRect(); it.dr = it.dot.getBoundingClientRect(); });
    const hit = (a, b, pad) => !(a.right + pad < b.left || b.right + pad < a.left || a.bottom + pad < b.top || b.bottom + pad < a.top);
    const shown = [];
    items.sort((a, b) => a.pri - b.pri).forEach((it) => {
      const clash = shown.some((o) => hit(it.lr, o.lr, 3)) || items.some((o) => o !== it && hit(it.lr, o.dr, 2));
      if (clash && it.pri !== 0) it.label.classList.add('hide'); else shown.push(it);
    });
  }

  function clamp() {
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    const w = view.iw * view.scale, h = view.ih * view.scale;
    // smaller than the screen: keep centred; bigger: don't let an edge drift past the screen edge
    view.x = w <= vw ? (vw - w) / 2 : Math.min(0, Math.max(vw - w, view.x));
    view.y = h <= vh ? (vh - h) / 2 : Math.min(0, Math.max(vh - h, view.y));
  }

  function reset() {
    if (mode === '3d-model') { if (viewer3d) viewer3d.reset(); return; }
    const vw = viewport.clientWidth, vh = viewport.clientHeight;
    if (!view.iw || !vw || !vh) return;
    view.fit = Math.min(vw / view.iw, vh / view.ih) * 0.98;
    view.min = view.fit * 0.85;
    view.max = Math.max(view.fit * 10, 2.5);
    view.scale = view.fit;
    view.x = (vw - view.iw * view.scale) / 2;
    view.y = (vh - view.ih * view.scale) / 2;
    clamp(); apply();
  }

  function zoomAt(cx, cy, factor) {
    const next = Math.min(view.max, Math.max(view.min, view.scale * factor));
    const k = next / view.scale;
    view.x = cx - (cx - view.x) * k;
    view.y = cy - (cy - view.y) * k;
    view.scale = next;
    clamp(); apply();
  }

  const centre = () => ({ x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 });
  const local = (e) => { const r = viewport.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

  // pointers (mouse / touch / pen share one code path)
  const pointers = new Map();
  let pinch = null, lastTap = 0, downInfo = null;

  viewport.addEventListener('pointerdown', (e) => {
    const hit = e.target.closest ? e.target.closest('.mk') : null;
    downInfo = { x: e.clientX, y: e.clientY, id: hit ? hit.dataset.id : null };
    try { viewport.setPointerCapture(e.pointerId); } catch (err) { /* synthetic / expired pointer: panning still works without capture */ }
    pointers.set(e.pointerId, local(e));
    viewport.classList.add('dragging');
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale: view.scale };
    }
    // double-tap (touch) to zoom
    if (e.pointerType === 'touch' && pointers.size === 1) {
      const now = Date.now();
      if (now - lastTap < 300) { toggleZoom(local(e)); lastTap = 0; } else lastTap = now;
    }
  });

  viewport.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    const prev = pointers.get(e.pointerId);
    const cur = local(e);
    pointers.set(e.pointerId, cur);
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      zoomAt(mid.x, mid.y, (pinch.scale * d / pinch.d) / view.scale);
    } else if (pointers.size === 1) {
      view.x += cur.x - prev.x;
      view.y += cur.y - prev.y;
      clamp(); apply();
    }
  });

  const endPointer = (e) => {
    if (e.type === 'pointerup' && downInfo && pointers.size === 1 && Math.hypot(e.clientX - downInfo.x, e.clientY - downInfo.y) < 8) {
      if (downInfo.id) { const m = markers.find((x) => String(x.id) === downInfo.id); if (m) selectMarker(m); }
      else if (selectedMarker) selectMarker(null);
    }
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (!pointers.size) viewport.classList.remove('dragging');
  };
  viewport.addEventListener('pointerup', endPointer);
  viewport.addEventListener('pointercancel', endPointer);

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = local(e);
    zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
  }, { passive: false });

  function toggleZoom(p) {
    if (view.scale > view.fit * 1.6) { reset(); } else { zoomAt(p.x, p.y, Math.min(view.max / view.scale, 2.5)); }
  }
  viewport.addEventListener('dblclick', (e) => toggleZoom(local(e)));

  viewport.addEventListener('keydown', (e) => {
    const c = centre();
    if (e.key === '+' || e.key === '=') zoomAt(c.x, c.y, 1.3);
    else if (e.key === '-') zoomAt(c.x, c.y, 1 / 1.3);
    else if (e.key === '0') reset();
    else if (e.key.startsWith('Arrow')) {
      const s = 60;
      if (e.key === 'ArrowLeft') view.x += s;
      if (e.key === 'ArrowRight') view.x -= s;
      if (e.key === 'ArrowUp') view.y += s;
      if (e.key === 'ArrowDown') view.y -= s;
      clamp(); apply(); e.preventDefault();
    }
  });

  // ---------- buttons (work for both the picture viewer and the 3D viewer) ----------
  function zoomBy(f) {
    if (mode === '3d-model') { if (viewer3d) viewer3d.zoom(f); return; }
    const c = centre(); zoomAt(c.x, c.y, f);
  }
  $('zoomIn').addEventListener('click', () => zoomBy(1.4));
  $('zoomOut').addEventListener('click', () => zoomBy(1 / 1.4));
  $('zoomReset').addEventListener('click', reset);

  const fsBtn = $('fullscreen');
  const canFs = !!(app.requestFullscreen || app.webkitRequestFullscreen);
  if (!canFs) fsBtn.hidden = true;
  fsBtn.addEventListener('click', () => {
    const on = document.fullscreenElement || document.webkitFullscreenElement;
    if (on) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (app.requestFullscreen || app.webkitRequestFullscreen).call(app);
  });
  ['fullscreenchange', 'webkitfullscreenchange'].forEach((ev) => document.addEventListener(ev, () => setTimeout(() => {
    if (mode === '3d-model') { if (viewer3d) viewer3d.resize(); } else reset();
  }, 120)));

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (mode === '3d-model') return;               // the 3D viewer watches its own size
      // keep the current zoom if the visitor zoomed in; otherwise just refit to the new screen size
      if (view.scale <= view.fit * 1.02) reset(); else { clamp(); apply(); }
    }, 120);
  });

  tabs['2d'].addEventListener('click', () => { if (maps['2d'] && kind !== '2d') select('2d'); });
  tabs['3d'].addEventListener('click', () => { if (maps['3d'] && kind !== '3d') select('3d'); });

  // ---------- start ----------
  (async () => {
    const ok = await loadMaps();
    if (!ok) { updateTabs(); showEmpty('Couldn\'t load the map', 'You appear to be offline and the map isn\'t saved on this device yet. Open this page once with a connection.'); return; }
    const want = new URLSearchParams(location.search).get('type') || getLS(LS_TAB);
    const first = (want === '2d' || want === '3d') && maps[want] ? want : (maps['2d'] ? '2d' : (maps['3d'] ? '3d' : null));
    if (!first) { kind = '2d'; updateTabs(); showEmpty('No map yet', 'The campus map hasn\'t been uploaded yet. Please check back soon.'); return; }
    select(first);
  })();
})();
