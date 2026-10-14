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
  const FP_API = '../../../Backend/api/campus-footprints.php';
  const LS_FOOTPRINTS = 'lampara_campus_footprints';
  const BUILDINGS_API = '../../../Backend/api/buildings.php';
  const ROOMS_API = '../../../Backend/api/rooms.php';
  const GRAPH_API = '../../../Backend/api/campus-graph.php';
  // Opened from the room search: map.php?room=<id> (or ?building=<id>) opens the 3D map on that building, panel open,
  // with the room picked out in its list.
  const TARGET = (() => {
    const p = new URLSearchParams(location.search), room = +p.get('room'), building = +p.get('building');
    return room > 0 ? { room } : (building > 0 ? { building } : null);
  })();
  let targetDone = false;
  // map.php versions this file; the 3D viewer is imported with the same version so a stale cached copy can't pair up
  const VER = (() => { try { return new URL(document.currentScript.src).searchParams.get('v') || ''; } catch (e) { return ''; } })();
  const PDFJS_SOURCES = ['../../assets/vendor/pdfjs/', 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/'];
  const PDF_SIZES = [3200, 2200, 1400];   // picture sizes tried in turn; a phone that can't build the big one gets a smaller one

  const $ = (id) => document.getElementById(id);
  const app = $('mapApp'), viewport = $('viewport'), canvasEl = $('mapCanvas'), img = $('mapImg'), stage3d = $('viewport3d');
  const keyPlaces = $('keyPlaces'), mkLayer = $('mkLayer'), mkCard = $('mkCard'), pinsSheet = $('pinsSheet'), pinsList = $('pinsList'), pinsBtn = $('pinsBtn');
  const loading = $('loading'), loadingText = $('loadingText'), empty = $('empty'), controls = $('controls'), hint = $('hint'), caption = $('caption');
  const pager = $('pager'), pageNum = $('pageNum');
  const bldSheet = $('bldSheet'), bldName = $('bldName'), bldMeta = $('bldMeta'), bldDir = $('bldDir'), bldRooms = $('bldRooms');
  const bldPhoto = $('bldPhoto');
  const roomDialog = $('roomDialog');
  // a photo whose file is gone (or offline and never cached) disappears instead of showing a broken-image icon
  bldPhoto.addEventListener('error', () => { bldPhoto.hidden = true; });
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
    bldSheet.hidden = true;
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
      const [mod, footprints, pins2d, buildings, graph] = await Promise.all([
        import('../../Js/Public/map-3d.js' + (VER ? '?v=' + VER : '')), fetchFootprints(), fetchMarkers('2d'),
        LamparaCache.loadBuildings(BUILDINGS_API), LamparaCache.loadCampusGraph(GRAPH_API)]);
      if (buildings && buildings.length) buildingList = buildings;
      const pins3d = build3dPins(mod.georefPicture, pins2d || [], buildings || [], graph || {}, maps['2d'] && maps['2d'].page);
      viewport.hidden = true;
      stage3d.hidden = false;
      const v = await mod.createViewer(stage3d, urlOf(map), {
        onProgress: (p) => { if (mine === token) loadingText.textContent = 'Loading 3D model… ' + Math.round(p * 100) + '%'; },
        footprints,
        markers: pins3d,
        onSelect: (id) => showBuilding(id),
        onMarker: (id) => selectMarker(id == null ? null : markers.find((m) => m.id === id) || null)
      });
      if (mine !== token) { v.dispose(); return; }
      viewer3d = v;
      // only the pins the viewer could place go into the list and the key-place chips
      markers = v.anchor ? pins3d : [];
      pinsBtn.hidden = !markers.length;
      renderKeyPlaces();
      renderPinsList();
      hideLoading();
      controls.hidden = false;
      if (TARGET && !targetDone) { targetDone = true; goToTarget(); return; }
      showHint(v.anchor && v.anchor.buildings
        ? 'Tap a building or a pin for details · drag to rotate · pinch to zoom'
        : 'Drag to rotate · pinch or scroll to zoom · two fingers to move');
    } catch (e) {
      if (mine === token) showEmpty('Couldn\'t open the 3D model', 'Your device may not support 3D graphics, or the model couldn\'t be downloaded. Check your connection and try again.');
    }
  }

  // ---------- 3D: tappable buildings ----------
  // Building outlines (real GPS) let the viewer work out which shape in the model is which registered building.
  // Kept in localStorage like the pins, so the buildings stay tappable with no signal.
  async function fetchFootprints() {
    try {
      const res = await fetch(FP_API, { cache: 'no-store' });
      const data = await res.json();
      if (!data.success) throw new Error('bad response');
      const list = data.footprints.filter((f) => f.kind === 'building');
      setLS(LS_FOOTPRINTS, JSON.stringify(list));
      return list;
    } catch (e) {
      try { return JSON.parse(getLS(LS_FOOTPRINTS) || '[]'); } catch (err) { return []; }
    }
  }

  // The 3D map's pins, from data that already exists — nothing extra to set up in the admin:
  //   entrances: each building's entrance point from Campus Paths, at its exact GPS position;
  //   gates and key places: the 2D map's pins, placed through the entrance pins that are on both maps (approximate —
  //   only as good as where the pins were dropped on the 2D picture, so the card says so).
  function build3dPins(georefPicture, pins2d, buildings, graph, page) {
    const nodes = new Map((graph.nodes || []).map((n) => [+n.id, n]));
    const entrancePin = new Map(pins2d.filter((m) => m.marker_type === 'entrance' && m.building_id != null).map((m) => [+m.building_id, m]));
    const out = [], pairs = [];
    buildings.forEach((b) => {
      const n = nodes.get(+b.entrance_node_id);
      if (!n) return;
      const p2 = entrancePin.get(+b.id);
      out.push({ id: 'entrance-' + b.id, marker_type: 'entrance', building_id: +b.id, name: p2 ? p2.name : b.name + ' – Entrance', lat: +n.lat, lng: +n.lng });
      if (p2) pairs.push({ x: +p2.x, y: +p2.y, lat: +n.lat, lng: +n.lng });
    });
    const fit = georefPicture(pairs, page);
    if (fit) {
      pins2d.filter((m) => m.marker_type !== 'entrance').forEach((m) => {
        out.push(Object.assign({}, m, { id: 'pin-' + m.id, approx: true }, fit.toLatLng(+m.x, +m.y)));
      });
    }
    return out;
  }

  const CATEGORY = { office: 'Office', classroom: 'Classroom', cr: 'Comfort room', canteen: 'Canteen' };
  let buildingList = null;
  const roomsByBuilding = new Map();
  let bldToken = 0;                    // a slow answer for an earlier tap must not overwrite the current building

  async function showBuilding(id, focusRoomId) {
    const mine = ++bldToken;
    if (id == null) { bldSheet.hidden = true; if (viewer3d) viewer3d.setBottomInset(0); return; }
    pinsSheet.hidden = true;
    if (!buildingList) {
      const list = await LamparaCache.loadBuildings(BUILDINGS_API);
      if (list && list.length) buildingList = list;    // a failed load is retried on the next tap, not remembered
    }
    if (mine !== bldToken || mode !== '3d-model') return;   // tapped again, or left the 3D map meanwhile
    const b = (buildingList || []).find((x) => +x.id === +id);
    shownBuilding = b || null;
    bldName.textContent = b ? b.name : 'Building';
    const floors = b ? +b.floor_count : 0;
    bldMeta.textContent = floors ? floors + (floors === 1 ? ' floor' : ' floors') : '';
    const dir = b && b.directory ? String(b.directory).trim() : '';
    bldDir.textContent = dir;
    bldDir.hidden = !dir;
    const walk = $('bldWalk');
    if (walk) { walk.hidden = !b || !!(b && b.closed_note); if (b) walk.href = 'guide-ar.php?to=' + encodeURIComponent(b.id); }
    if (b && b.closed_note) bldMeta.textContent = 'Closed: ' + b.closed_note;
    if (b && b.photo_path) { bldPhoto.src = '../../' + b.photo_path; bldPhoto.alt = 'Photo of ' + b.name; bldPhoto.hidden = false; }
    else { bldPhoto.hidden = true; bldPhoto.removeAttribute('src'); }
    setRoomsMessage('Loading rooms…');
    bldSheet.hidden = false;
    hint.hidden = true;
    if (viewer3d) viewer3d.setBottomInset(bldSheet.offsetHeight);
    const rooms = await roomsOf(+id);
    if (mine === bldToken && mode === '3d-model') {
      renderRooms(rooms, focusRoomId);
      if (viewer3d) viewer3d.setBottomInset(bldSheet.offsetHeight);   // the sheet grew to fit the rooms
      const target = bldRooms.querySelector('li.is-target');
      if (target) target.scrollIntoView({ block: 'center' });
    }
  }

  // The search result this page was opened for: fly to its building, open the panel, pick out the room.
  async function goToTarget() {
    let bid = TARGET.building;
    if (TARGET.room) {
      let room = (LamparaCache.getRooms() || []).find((r) => +r.id === TARGET.room);
      if (!room) {
        try { const data = await (await fetch(ROOMS_API)).json(); if (data.success) room = data.rooms.find((r) => +r.id === TARGET.room); } catch (e) { /* offline */ }
      }
      if (!room) { showHint('That room couldn\'t be found. Showing the whole campus.'); return; }
      bid = +room.building_id;
    }
    if (!viewer3d) return;
    viewer3d.selectBuilding(bid);       // false when the building has no shape on this model: the panel still opens
    showBuilding(bid, TARGET.room);
  }

  async function roomsOf(id) {
    if (roomsByBuilding.has(id)) return roomsByBuilding.get(id);
    let rooms = null;
    try {
      const res = await fetch(ROOMS_API + '?building_id=' + id);
      const data = await res.json();
      if (data.success) rooms = data.rooms;
    } catch (e) { /* no signal: try the synced directory below */ }
    if (!rooms) {
      const cached = LamparaCache.getRooms();
      if (cached && cached.length) rooms = cached.filter((r) => +r.building_id === id);
    }
    if (rooms) roomsByBuilding.set(id, rooms);
    return rooms;
  }

  function setRoomsMessage(text) {
    bldRooms.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'pins-empty';
    li.textContent = text;
    bldRooms.appendChild(li);
  }

  // ---------- room details (dialog) ----------
  // Tapping a room opens a preview of it here on the map: photo (or a placeholder) and its details.
  let shownBuilding = null;
  function photoPlaceholder() {
    const d = document.createElement('div');
    d.className = 'ph';
    d.innerHTML = ROOM_ICON.replace('width="18" height="18"', 'width="34" height="34"');
    const t = document.createElement('span');
    t.textContent = 'No photo yet';
    d.appendChild(t);
    return d;
  }
  function openRoom(r) {
    const ph = $('roomDlgPhoto');
    ph.replaceChildren();
    if (r.photo_path) {
      const img = new Image();
      img.alt = 'Photo of ' + (r.room_name || 'this room');
      img.src = '../../' + r.photo_path;
      img.addEventListener('error', () => ph.replaceChildren(photoPlaceholder()));
      img.addEventListener('load', () => ph.classList.toggle('is-portrait', img.naturalHeight > img.naturalWidth));
      ph.classList.remove('is-portrait');
      ph.appendChild(img);
    } else {
      ph.appendChild(photoPlaceholder());
    }
    $('roomDlgTitle').textContent = (r.room_number ? r.room_number + ' — ' : '') + (r.room_name || CATEGORY[r.category] || 'Room');
    $('roomDlgMeta').textContent = [r.floor, CATEGORY[r.category], shownBuilding && shownBuilding.name].filter(Boolean).join(' · ');
    const hours = $('roomDlgHours'), notes = $('roomDlgNotes');
    hours.textContent = r.hours ? 'Open ' + r.hours : '';
    hours.hidden = !r.hours;
    notes.textContent = r.notes || '';
    notes.hidden = !r.notes;
    // The two things to do with a room: find it inside the building, or walk to the building first.
    const find = $('roomDlgFind'), walk = $('roomDlgWalk');
    if (find) find.href = '../Student/scan.php?room=' + encodeURIComponent(r.id);
    if (walk) { walk.hidden = !r.building_id; walk.href = 'guide-ar.php?to=' + encodeURIComponent(r.building_id) + '&room=' + encodeURIComponent(r.id); }
    roomDialog.showModal();
  }
  $('roomDlgClose').addEventListener('click', () => roomDialog.close());
  roomDialog.addEventListener('click', (e) => { if (e.target === roomDialog) roomDialog.close(); });   // tap on the dimmed backdrop

  const ROOM_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/></svg>';
  function roomThumb(r) {
    const ph = () => { const s = document.createElement('span'); s.className = 'thumb ph'; s.innerHTML = ROOM_ICON; return s; };
    if (!r.photo_path) return ph();
    const img = document.createElement('img');
    img.className = 'thumb';
    img.alt = '';                          // decorative: the row already names the room
    img.loading = 'lazy';
    img.src = '../../' + r.photo_path;
    img.addEventListener('error', () => img.replaceWith(ph()));
    return img;
  }

  function renderRooms(rooms, focusRoomId) {
    if (rooms === null) { setRoomsMessage('Rooms couldn\'t be loaded. Check your connection and tap the building again.'); return; }
    if (!rooms.length) { setRoomsMessage('No rooms registered yet.'); return; }
    bldRooms.innerHTML = '';
    // Thumbnails only once this building has at least one room photo; then rooms without one get a placeholder so
    // the column lines up. With no photos at all (most buildings for now) the list stays as it was.
    const withThumbs = rooms.some((r) => r.photo_path);
    rooms.slice()
      .sort((a, b) => String(a.floor).localeCompare(String(b.floor), undefined, { numeric: true })
        || String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true }))
      .forEach((r) => {
        const li = document.createElement('li');
        const a = document.createElement('button');    // opens the preview; the map page has no directions
        a.type = 'button';
        a.className = 'room-btn';
        a.addEventListener('click', () => openRoom(r));
        const num = document.createElement('span');
        num.className = 'num';
        num.textContent = r.room_number || '—';
        const text = document.createElement('span');
        text.textContent = r.room_name || CATEGORY[r.category] || 'Room';
        const sub = document.createElement('small');
        sub.textContent = [r.floor, CATEGORY[r.category]].filter(Boolean).join(' · ');
        text.appendChild(sub);
        const go = document.createElement('span');
        go.className = 'go';
        go.setAttribute('aria-hidden', 'true');
        go.textContent = '›';
        if (withThumbs) a.append(roomThumb(r));
        a.append(num, text, go);
        if (focusRoomId != null && +r.id === +focusRoomId) { li.className = 'is-target'; a.setAttribute('aria-current', 'true'); }
        li.appendChild(a);
        bldRooms.appendChild(li);
      });
  }

  $('bldClose').addEventListener('click', () => { if (viewer3d) viewer3d.selectBuilding(null); showBuilding(null); });

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

  // A key place that is a restroom, and who it is for, read from its name ("Men's restroom", "Women's CR").
  const isRestroomPin = (m) => m.marker_type === 'landmark' && /\b(restroom|comfort|toilet|bathroom|washroom|cr)\b/i.test(m.label || '');
  const pinGender = (m) => { const t = String(m.label || '').toLowerCase().replace(/['\u2019]/g, ''); return /\b(women|womens|woman|female|ladies|girls?)\b/.test(t) ? 'women' : (/\b(men|mens|man|male|gents?|boys?)\b/.test(t) ? 'men' : ''); };
  let rrFilter = '';        // '' = every restroom, 'men' or 'women' = only those
  function applyRr() {
    keyPlaces.querySelectorAll('[data-rr]').forEach((b) => b.classList.toggle('on', b.dataset.rr === rrFilter));
    markers.forEach((m) => {
      if (!isRestroomPin(m)) return;
      const g = pinGender(m), hide = rrFilter && g && g !== rrFilter;
      const el = mkLayer.querySelector('.mk[data-id="' + m.id + '"]'); if (el) el.classList.toggle('rr-off', !!hide);
      const chip = keyPlaces.querySelector('button[data-id="' + m.id + '"]'); if (chip) chip.hidden = !!hide;
    });
  }

  async function loadMarkers(mine) {
    const list = await fetchMarkers(kind);
    if (mine !== token) return;
    markers = list;
    mkLayer.innerHTML = '';
    markers.forEach((m) => {
      const el = document.createElement('div');
      el.className = 'mk ' + m.marker_type + (isRestroomPin(m) ? ' restroom ' + (pinGender(m) || 'any') : '');
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
    applyRr();
    renderPinsList();
    apply();
  }

  // chips along the top for the highlighted places; tapping one zooms to it
  function renderKeyPlaces() {
    keyPlaces.innerHTML = '';
    const key = markers.filter((m) => m.marker_type === 'landmark');
    keyPlaces.hidden = !key.length;
    if (key.some(isRestroomPin)) {          // choose whose restroom to look for
      const wrap = document.createElement('span'); wrap.className = 'rr-pick'; wrap.setAttribute('role', 'group'); wrap.setAttribute('aria-label', 'Restrooms');
      [['', 'All restrooms'], ['men', 'Men'], ['women', 'Women']].forEach(([v, t]) => {
        const b = document.createElement('button'); b.type = 'button'; b.dataset.rr = v; b.className = 'rr-btn'; b.textContent = t;
        b.addEventListener('click', () => { rrFilter = v; applyRr(); });
        wrap.appendChild(b);
      });
      keyPlaces.appendChild(wrap);
    }
    key.forEach((m) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = String(m.id);
      b.innerHTML = '<span class="star">' + (isRestroomPin(m) ? (pinGender(m) === 'men' ? 'M' : pinGender(m) === 'women' ? 'W' : 'WC') : '\u2605') + '</span>';
      if (isRestroomPin(m)) b.classList.add('rr-chip', pinGender(m) || 'any');
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

  const typeLabel = (m) => (m.marker_type === 'gate' ? 'Campus gate' : (m.marker_type === 'landmark' ? (isRestroomPin(m) ? (pinGender(m) === 'men' ? "Men's restroom" : pinGender(m) === 'women' ? "Women's restroom" : 'Restroom') : 'Key place') : 'Building entrance'))
    + (m.approx ? ' · approximate location' : '');

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
    if (mode === '3d-model') {
      if (viewer3d) viewer3d.selectMarker(m.id);
      showBuilding(null);
      selectMarker(m);
      return;
    }
    const px = view.iw * m.x / 100, py = view.ih * m.y / 100;
    const target = Math.min(view.max, Math.max(view.scale, view.fit * 3));
    view.scale = target;
    view.x = viewport.clientWidth / 2 - px * target;
    view.y = viewport.clientHeight / 2 - py * target;
    clamp(); apply();
    selectMarker(m);
  }

  $('mkCardClose').addEventListener('click', () => {
    if (mode === '3d-model' && viewer3d) viewer3d.selectMarker(null, { fly: false });
    selectMarker(null);
  });
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
    // a search result to show needs the 3D model (that is where buildings can be highlighted)
    const want = (TARGET && maps['3d'] && formatOf(maps['3d']) === 'obj') ? '3d'
      : new URLSearchParams(location.search).get('type') || getLS(LS_TAB);
    const first = (want === '2d' || want === '3d') && maps[want] ? want : (maps['2d'] ? '2d' : (maps['3d'] ? '3d' : null));
    if (!first) { kind = '2d'; updateTabs(); showEmpty('No map yet', 'The campus map hasn\'t been uploaded yet. Please check back soon.'); return; }
    select(first);
  })();
})();
