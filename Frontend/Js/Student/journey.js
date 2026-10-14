// "Your route": the floor-plan guide that links inside walking and outside walking into one trip.
//   ?to=<room id>&from=<room id>   from a room to another room (same building: one floor-plan route;
//                                  different buildings: leave -> walk outside -> find the room)
//   ?to=<room id>&arrived=1        the visitor is at the door of the room's building: floor plan from that door
// Inside steps are drawn on the floor plan as an animated broken line; the outside step hands over to the walking guide
// (Public/guide-ar.php), whose "arrived" button comes back here with ?arrived=1.
// Plain <script>; needs offline-cache.js, floor-route.js and building-doors.js loaded first.
(() => {
  const API = '../../../Backend/api/', IMG = '../../';
  const cssVar = (n, d) => getComputedStyle(document.documentElement).getPropertyValue(n).trim() || d;   // follows the chosen theme
  const NAVY = cssVar('--t-ink2', '#161850'), GOLD = cssVar('--t-accent', '#ffd100');
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);

  let rooms = [], buildings = [], tripTo = null, lastStepPh = -1;
  let legs = [], legIdx = 0, route = null;      // route = the inside leg on screen
  let segIdx = 0, anim = null, raf = 0, switching = false, cardAction = null;
  const cv = $('cv'), ctx = cv.getContext('2d');
  const still = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------------- data (network first, offline cache as fallback; same as the other student pages)
  async function getRooms() {
    if (navigator.onLine) {
      try { const d = await (await fetch(API + 'rooms.php')).json(); if (d.success) { LamparaCache.setRooms(d.rooms); return d.rooms; } } catch (e) { /* use the cache */ }
    }
    return LamparaCache.getRooms();
  }
  async function getBuildings() {
    try { const d = await (await fetch(API + 'buildings.php')).json(); if (d.success) return d.buildings; } catch (e) { /* distance just won't show */ }
    return [];
  }
  const dataCache = {};
  async function buildingData(id) {
    if (dataCache[id]) return dataCache[id];
    let graph = null, plans = null;
    if (navigator.onLine) {
      try {
        const g = await (await fetch(API + 'floor-plan-graph.php?building_id=' + id)).json();
        if (g.success) { graph = { nodes: g.nodes, edges: g.edges }; LamparaCache.setBuildingGraph(id, graph); }
      } catch (e) { /* cache below */ }
      try {
        const p = await (await fetch(API + 'floor-plans.php?building_id=' + id)).json();
        if (p.success) {
          plans = p.plans.map((pl) => {
            const existing = LamparaCache.getFloorPlan(id, pl.floor) || {};
            const keep = existing.imageDataUrl && existing.image_path === pl.image_path;
            const merged = { ...existing, ...pl, imageDataUrl: keep ? existing.imageDataUrl : null };
            LamparaCache.setFloorPlan(id, pl.floor, merged);
            return merged;
          });
        }
      } catch (e) { /* cache below */ }
    }
    graph = graph || LamparaCache.getBuildingGraph(id) || { nodes: [], edges: [] };
    if (!plans) {
      const floors = new Set(graph.nodes.map((n) => n.floor));
      plans = [...floors].map((f) => LamparaCache.getFloorPlan(id, f)).filter(Boolean);
    }
    return (dataCache[id] = { graph, plans });
  }
  const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const roomName = (r) => (r.room_number ? r.room_number + ' ' : '') + r.room_name;
  const pt = (r) => ({ floor: r.floor, x: r.map_x, y: r.map_y });
  const bOf = (id) => buildings.find((b) => String(b.id) === String(id)) || { id };

  // One inside leg in one building between two points { floor, x, y }.
  async function insideLeg(bid, A, B, startLabel, endLabel, kind) {
    const { graph, plans } = await buildingData(bid);
    const fp = plans.find((p) => p.floor === A.floor), tp = plans.find((p) => p.floor === B.floor);
    if (!fp || !tp) throw new Error('A floor plan is missing for this route.');
    if (!graph.edges.length) throw new Error("Walking paths haven't been drawn for this building yet.");
    const segs = routeAcrossFloors(graph.nodes, graph.edges, { x: A.x, y: A.y }, fp.id, { x: B.x, y: B.y }, tp.id);
    if (!segs) throw new Error('No connected walking route inside this building yet.');
    const out = [];
    for (const s of segs) {
      const plan = plans.find((p) => p.id === s.floorPlanId);
      out.push({ plan, pts: s.points, img: await loadImg(plan.imageDataUrl || IMG + plan.image_path) });
    }
    return { kind: 'inside', segs: out, startLabel, endLabel, label: kind };
  }

  // ---------------- start
  function fail(m) {
    $('title').textContent = 'Sorry';
    $('error').innerHTML = ''; $('error').appendChild(document.createTextNode(m));
    $('error').hidden = false;
    $('viewPlan').hidden = true; $('viewOut').hidden = true; $('bottom').hidden = true; $('steps').hidden = true;
    $('errorLinks').hidden = false;
  }

  async function init() {
    rooms = await getRooms() || [];
    buildings = await getBuildings();
    await BuildingDoors.load(API + 'building-doors.php');
    // A reload or a return from the walking guide may arrive without a step: pick up the saved trip when it is the same trip.
    const saved = LamparaTrip.get();
    const same = saved && String(saved.to) === String(q.get('to') || '') && String(saved.from || '') === String(q.get('from') || '');
    const startStep = parseInt(q.get('step') || (same ? saved.step : 0) || 0, 10);
    const to = rooms.find((r) => String(r.id) === q.get('to'));
    const from = rooms.find((r) => String(r.id) === q.get('from'));
    tripTo = to;
    if (!to) return fail("We couldn't find that room.");
    if (to.map_x === null || to.map_y === null) {
      // no plan or no marker for this room: say where it is in words instead of leaving a dead end
      const where = [roomName(to), to.floor, to.building_name].filter(Boolean).join(', ');
      return fail("We can't draw the way inside yet because this room isn't on a floor plan. " + where + '.' + (to.notes ? ' ' + to.notes + '.' : '') + ' Ask at the front desk or a guard if you need help.');
    }
    const toB = bOf(to.building_id);
    try {
      if (from && String(from.building_id) === String(to.building_id)) {
        if (from.map_x === null || from.map_y === null) throw new Error("Your starting room isn't marked on its floor plan yet.");
        legs = [await insideLeg(to.building_id, pt(from), pt(to), 'You', roomName(to), 'room')];
      } else if (from) {
        if (from.map_x === null || from.map_y === null) throw new Error("Your starting room isn't marked on its floor plan yet.");
        const fB = bOf(from.building_id), A = await buildingData(from.building_id), B = await buildingData(to.building_id);
        const exit = BuildingDoors.find(fB, A.graph, A.plans, 'exit'), entry = BuildingDoors.find(toB, B.graph, B.plans, 'entry');
        if (!exit) throw new Error('The floor plan of ' + from.building_name + " doesn't have walking paths yet.");
        if (!entry) throw new Error('The floor plan of ' + to.building_name + " doesn't have walking paths yet.");
        legs = [
          await insideLeg(from.building_id, pt(from), exit, 'You', 'Exit', 'leave'),
          { kind: 'outside', from: fB, to: toB, room: to, buildingName: to.building_name },
          await insideLeg(to.building_id, entry, pt(to), 'Entrance', roomName(to), 'find')
        ];
        legs[0].doorGuess = exit.how === 'guess'; legs[2].doorGuess = entry.how === 'guess';
      } else if (q.get('arrived')) {
        const B = await buildingData(to.building_id);
        const entry = BuildingDoors.find(toB, B.graph, B.plans, 'entry');
        if (!entry) throw new Error('The floor plan of ' + to.building_name + " doesn't have walking paths yet.");
        legs = [await insideLeg(to.building_id, entry, pt(to), 'Entrance', roomName(to), 'find')];
        legs[0].doorGuess = entry.how === 'guess';
      } else {
        return fail('Tell us where you are first.');
      }
    } catch (e) { return fail(e && e.message || "We couldn't prepare this route."); }
    buildSteps();
    $('bottom').hidden = false;
    LamparaTrip.set({ to: String(to.id), from: from ? String(from.id) : '', arrived: q.get('arrived') ? 1 : 0, label: roomName(to) + ' (' + to.building_name + ')' });
    // the camera version of the inside steps: room -> exit, or door -> room (it needs the floors calibrated; the page says so if not)
    const go = () => runLeg(Math.max(0, Math.min(legs.length - 1, startStep)));
    $('infoBtn').hidden = false;
    // a new trip opens with the room's details; a reload part-way along goes straight back to the route
    // once per trip and visit: a reload part-way along, or coming back to the same page, goes straight to the route
    let seen = false; const seenKey = 'lampara_info:' + q.get('to') + ':' + (q.get('from') || '') + ':' + (q.get('enroll') || '');
    try { seen = sessionStorage.getItem(seenKey) === '1'; if (!seen) sessionStorage.setItem(seenKey, '1'); } catch (e) { /* shown every time */ }
    if (startStep === 0 && !seen) openInfo(go); else go();
  }

  // ---------------- details of the destination room
  function roomKind(r) {
    const n = String(r.room_name || '').toLowerCase(), c = String(r.category || r.room_type || '').toLowerCase();
    if (c === 'cr' || /comfort|restroom|toilet/.test(n)) { const g = String(r.subtitle || '').toLowerCase(); return g === 'men' ? "Men's restroom" : g === 'women' ? "Women's restroom" : 'Restroom'; }
    if (c === 'canteen') return 'Canteen';
    if (/cubicle|counter|window/.test(n)) return 'Cubicle';
    if (/\blab/.test(n)) return 'Laboratory';
    if (c === 'office') return 'Office';
    return 'Lecture room';
  }
  let infoDone = null;
  function openInfo(after) {
    const r = tripTo; if (!r) { if (after) after(); return; }
    infoDone = after || null;
    $('infoType').textContent = roomKind(r);
    $('infoName').textContent = roomName(r);
    $('infoWhere').textContent = [r.building_name, r.floor].filter(Boolean).join(' \u00b7 ');
    const ph = $('infoPhoto');
    if (r.photo_path) { ph.src = IMG + r.photo_path; ph.alt = 'Photo of ' + roomName(r); ph.hidden = false; ph.onerror = () => { ph.hidden = true; }; } else ph.hidden = true;
    const facts = [];
    if (r.hours) facts.push(['Hours', r.hours]);
    const stop = typeof LamparaEnroll !== 'undefined' && q.get('enroll') ? LamparaEnroll.get(q.get('enroll')) : null;     // coming from the Enrollment guide
    if (stop) { facts.push(['Step ' + stop.step + ' of enrollment', stop.what]); if (stop.houses) facts.push(['Houses of Hero', stop.houses.join(', ')]); }
    if (r.notes) facts.push(['How to spot it', r.notes]);
    $('infoFacts').innerHTML = facts.map((f) => '<li><b></b><span></span></li>').join('');
    $('infoFacts').querySelectorAll('li').forEach((li, k) => { li.firstChild.textContent = facts[k][0]; li.lastChild.textContent = facts[k][1]; });
    $('infoGo').textContent = after ? 'Show me the way' : 'Close';
    $('info').hidden = false; $('infoGo').focus();
    if (window.LamparaAudio) LamparaAudio.chime();
  }
  function closeInfo() { $('info').hidden = true; const f = infoDone; infoDone = null; if (f) f(); }
  $('infoGo').onclick = closeInfo;
  $('infoBtn').onclick = () => openInfo(null);
  $('info').addEventListener('click', (e) => { if (e.target === $('info')) closeInfo(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('info').hidden) closeInfo(); });

  function buildSteps() {
    if (legs.length < 2) { $('steps').hidden = true; return; }
    const names = ['Leave this building', 'Walk outside', 'Find your room'];
    $('steps').innerHTML = names.map((n, i) => '<li data-i="' + i + '"><b>' + (i + 1) + '</b><span>' + n + '</span></li>').join('');
    $('steps').hidden = false;
  }

  function runLeg(i) {
    legIdx = i; const leg = legs[i];
    LamparaTrip.set({ step: i });
    $('steps').querySelectorAll('li').forEach((li, k) => { li.classList.toggle('on', k === i); li.classList.toggle('done', k < i); });
    $('card').classList.remove('on'); cardAction = null; $('error').hidden = true;
    if (leg.kind === 'inside') {
      route = leg;
      $('viewOut').hidden = true; $('viewPlan').hidden = false; $('replay').hidden = false;
      $('title').textContent = leg.label === 'leave' ? 'Walk to the exit' : leg.label === 'find' ? 'Walk to ' + leg.endLabel : 'Walk to ' + leg.endLabel;
      buildTabs(); start(0);
    } else {
      cancelAnimationFrame(raf); raf = 0;
      $('viewPlan').hidden = true; $('viewOut').hidden = false; $('replay').hidden = true;
      $('title').textContent = 'Walk outside';
      $('outTitle').textContent = 'Walk to ' + leg.buildingName;
      $('outText').textContent = 'Go out through the exit and follow the yellow path on your camera to the entrance of ' + leg.buildingName + '.';
      const a = leg.from, b = leg.to;
      $('outMeta').textContent = a && b && a.lat != null && b.lat != null ? 'About ' + Math.round(distance(a, b)) + ' meters' : '';
      $('outOpen').href = '../Public/guide-ar.php?to=' + leg.to.id + '&room=' + leg.room.id;
      $('outDone').textContent = 'I am at the entrance of ' + leg.buildingName;
      const warn = window.LamparaHazards ? LamparaHazards.forBuilding(leg.to.id).filter((h) => h.kind === 'restricted')[0] : null;
      $('outWarn').hidden = !warn;
      if (warn) $('outWarn').textContent = 'Warning: a visitor reported that ' + leg.buildingName + ' is closed or off-limits (' + (warn.age_min < 60 ? warn.age_min + ' min ago' : Math.floor(warn.age_min / 60) + ' h ago') + '). Check the photo in the red banner before you go.';
    }
  }
  function distance(a, b) {
    const R = 6371008.8, rad = (d) => d * Math.PI / 180, dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // The card's words appear a letter at a time with a game-style chirp (title first, then the line under it). The whole text is
  // already in the box, hidden, so the card never changes size, and a screen reader gets the full sentence at once.
  // A tap on the words finishes them. With reduced motion they simply appear.
  let typer = 0, typeFinish = null;
  function typeCard(title, sub) {
    clearInterval(typer); typer = 0; typeFinish = null;
    const nodes = [[$('cardTitle'), title], [$('cardSub'), sub]];
    const parts = nodes.map(([n, t]) => {
      n.textContent = '';
      const sr = document.createElement('span'), shown = document.createElement('span'), rest = document.createElement('span');
      sr.className = 'jr-sr'; sr.textContent = t; shown.setAttribute('aria-hidden', 'true'); rest.setAttribute('aria-hidden', 'true'); rest.className = 'jr-rest'; rest.textContent = t;
      n.append(sr, shown, rest);
      return { shown, rest, t };
    });
    if (still()) { parts.forEach((p) => { p.shown.textContent = p.t; p.rest.textContent = ''; }); return; }
    let k = 0, i = 0;
    const done = () => { clearInterval(typer); typer = 0; typeFinish = null; parts.forEach((p) => { p.shown.textContent = p.t; p.rest.textContent = ''; }); };
    typeFinish = done;
    typer = setInterval(() => {
      const p = parts[k];
      i++; p.shown.textContent = p.t.slice(0, i); p.rest.textContent = p.t.slice(i);
      const ch = p.t.charAt(i - 1);
      if (ch.trim() && i % 2 === 0 && window.LamparaAudio) LamparaAudio.blip(ch);
      if (i >= p.t.length) { k++; i = 0; if (k >= parts.length) done(); }
    }, 28);
  }
  $('card').addEventListener('click', (e) => { if (typeFinish && e.target.closest('h2, p')) typeFinish(); });

  // Finishing an indoor route earns points (once per room per day, a little more for stairs or another building), counts toward
  // the weekly quests, and stamps the orientation trail when the room is one of the offices on it. All kept on this phone.
  function rewardRoute() {
    const M = window.LamparaMascots;
    if (!M || !tripTo) return;
    const pts = 10 + (legs.length > 1 ? 5 : 0) + (route.segs.length > 1 ? 5 : 0);
    if (M.award('route:' + tripTo.id + ':' + M.today(), pts)) M.toast('Route complete', pts);
    M.event('route', String(tripTo.id));
    M.stampRoom(tripTo, rooms);
  }

  function showCard(title, sub, btn, action) {
    if (window.LamparaAudio) { if (/^take the stairs/i.test(title)) LamparaAudio.stairs(); else LamparaAudio.chime(); }
    $('cardGo').textContent = btn; cardAction = action;
    typeCard(title, sub);
    setMin(false); $('card').classList.add('on');
  }

  // ---------------- path geometry (plan pixels)
  // Rounds the corners with quadratic curves so the line turns smoothly, and measures it so it can be drawn part-way.
  function smoothDense(pts, W, H, radius) {
    const P = pts.map((p) => ({ x: p.x / 100 * W, y: p.y / 100 * H }));
    const out = [P[0]];
    for (let i = 1; i < P.length - 1; i++) {
      const a = P[i - 1], b = P[i], c = P[i + 1];
      const l1 = Math.hypot(a.x - b.x, a.y - b.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
      if (!l1 || !l2) continue;
      const d1 = Math.min(radius, l1 / 2), d2 = Math.min(radius, l2 / 2);
      const s = { x: b.x + (a.x - b.x) / l1 * d1, y: b.y + (a.y - b.y) / l1 * d1 };
      const e = { x: b.x + (c.x - b.x) / l2 * d2, y: b.y + (c.y - b.y) / l2 * d2 };
      for (let k = 0; k <= 10; k++) { const t = k / 10, u = 1 - t; out.push({ x: u * u * s.x + 2 * u * t * b.x + t * t * e.x, y: u * u * s.y + 2 * u * t * b.y + t * t * e.y }); }
    }
    out.push(P[P.length - 1]);
    const cum = [0];
    for (let i = 1; i < out.length; i++) cum.push(cum[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].y - out[i - 1].y));
    return { pts: out, cum, total: cum[cum.length - 1] };
  }
  function upTo(g, d) {     // the path up to length d, plus the head and its heading
    d = Math.max(0, Math.min(g.total, d));
    const out = [g.pts[0]]; let i = 1;
    while (i < g.pts.length && g.cum[i] <= d) out.push(g.pts[i++]);
    let head = out[out.length - 1], ang = 0;
    if (i < g.pts.length) {
      const t = (d - g.cum[i - 1]) / ((g.cum[i] - g.cum[i - 1]) || 1);
      head = { x: g.pts[i - 1].x + t * (g.pts[i].x - g.pts[i - 1].x), y: g.pts[i - 1].y + t * (g.pts[i].y - g.pts[i - 1].y) };
      out.push(head); ang = Math.atan2(g.pts[i].y - g.pts[i - 1].y, g.pts[i].x - g.pts[i - 1].x);
    } else if (g.pts.length > 1) {
      const a = g.pts[g.pts.length - 2], b = g.pts[g.pts.length - 1]; ang = Math.atan2(b.y - a.y, b.x - a.x);
    }
    return { pts: out, head, ang };
  }
  function metres(seg) {
    const p = seg.plan, mx = p.meters_per_unit_x > 0 ? p.meters_per_unit_x : null, my = p.meters_per_unit_y > 0 ? p.meters_per_unit_y : null;
    if (!mx || !my) return null;
    let t = 0; for (let i = 1; i < seg.pts.length; i++) t += Math.hypot((seg.pts[i].x - seg.pts[i - 1].x) * mx, (seg.pts[i].y - seg.pts[i - 1].y) * my);
    return t;
  }

  // ---------------- animation
  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const lerp = (a, b, t) => a + (b - a) * t;
  const bounce = (t) => { if (t <= 0) return 0; if (t >= 1) return 1; const c = 2.2; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

  // ---------------- zoom and pan: + / - buttons, pinch, mouse wheel, double tap, and drag when zoomed in
  const view = { z: 1, ox: 0, oy: 0, s0: 1, cx: 0, cy: 0, tx: 0, ty: 0 };
  const ZMIN = 1, ZMAX = 5;
  function syncZoomUi() { $('zIn').disabled = view.z >= ZMAX - 0.01; $('zOut').disabled = view.z <= ZMIN + 0.01; $('zFit').hidden = view.z <= ZMIN + 0.01; }
  // Zooms to `nz`, keeping the point under (fx, fy) (canvas pixels) where it is.
  function zoomTo(nz, fx, fy) {
    nz = Math.min(ZMAX, Math.max(ZMIN, nz));
    if (fx === undefined) { fx = cv.width / 2; fy = cv.height / 2; }
    const f = nz / view.z, cw = cv.width, ch = cv.height;
    const ntx = fx - (fx - view.tx) * f, nty = fy - (fy - view.ty) * f;
    view.z = nz;
    const s = view.s0 * nz;
    view.ox = nz === 1 ? 0 : ntx - (cw / 2 - view.cx * s); view.oy = nz === 1 ? 0 : nty - (ch / 2 - view.cy * s);
    syncZoomUi();
  }
  const toCanvas = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height }; };
  $('zIn').onclick = () => zoomTo(view.z * 1.5);
  $('zOut').onclick = () => zoomTo(view.z / 1.5);
  $('zFit').onclick = () => zoomTo(1);
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const c = toCanvas(e); zoomTo(view.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2), c.x, c.y); }, { passive: false });
  const ptrs = new Map(); let pinch = null, lastTap = 0;
  cv.addEventListener('pointerdown', (e) => {
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, toCanvas(e));
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.z }; }
    else if (e.pointerType !== 'mouse') {
      const now = Date.now(), c = toCanvas(e);
      if (now - lastTap < 300) { zoomTo(view.z > 1.2 ? 1 : 2.4, c.x, c.y); lastTap = 0; } else lastTap = now;
    }
  });
  cv.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const prev = ptrs.get(e.pointerId), c = toCanvas(e); ptrs.set(e.pointerId, c);
    if (ptrs.size === 2 && pinch) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.d > 0) zoomTo(pinch.z * d / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
    } else if (ptrs.size === 1 && view.z > 1) { view.ox += c.x - prev.x; view.oy += c.y - prev.y; }
  });
  const lift = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; };
  cv.addEventListener('pointerup', lift); cv.addEventListener('pointercancel', lift);

  function start(i) {
    segIdx = i; switching = false; view.z = 1; view.ox = 0; view.oy = 0; syncZoomUi();
    const seg = route.segs[i], W = seg.img.naturalWidth, H = seg.img.naturalHeight;
    const g = smoothDense(seg.pts, W, H, Math.max(W, H) * 0.035);
    anim = { g, W, H, t0: performance.now(), dur: 1500 + 2600 * Math.min(1, g.total / (W * 1.1)), doneAt: 0, shown: false };
    if (still()) anim.t0 -= anim.dur;                       // reduced motion: start from the finished drawing
    const w = cv.parentNode.clientWidth, dpr = Math.min(2, window.devicePixelRatio || 1);
    const cssH = Math.min(Math.max(window.innerHeight * 0.66, 320), w * H / W);
    cv.style.height = cssH + 'px'; cv.width = Math.round(w * dpr); cv.height = Math.round(cssH * dpr);
    anim.dpr = dpr;
    $('tabs').querySelectorAll('button').forEach((b, k) => b.classList.toggle('on', k === i));
    const multi = route.segs.length > 1;
    $('hudL').textContent = seg.plan.floor + (multi ? ' (' + (i + 1) + ' of ' + route.segs.length + ')' : '');
    const doorHere = route.doorGuess && ((route.label === 'leave' && i === route.segs.length - 1) || (route.label === 'find' && i === 0));
    $('hudR').textContent = doorHere ? 'The exact door position is estimated' : '';   // no distance or time shown any more
    $('card').classList.remove('on');
    renderText(i);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const a = anim, seg = route.segs[segIdx], last = segIdx === route.segs.length - 1;
    const raw = Math.min(1, (now - a.t0) / a.dur), p = ease(raw);
    const { W, H, g, dpr } = a;
    const cw = cv.width, ch = cv.height, k = Math.min(cw / W, ch / H);
    const part = upTo(g, g.total * p);

    // the camera follows the head while the line grows, then settles on the whole plan
    const z = lerp(1.9, 1, ease(Math.min(1, raw * 1.15))), cx = lerp(part.head.x, W / 2, ease(raw)), cy = lerp(part.head.y, H / 2, ease(raw));
    const s0 = k * z, s = s0 * view.z;       // view.z is the student's own zoom (buttons, pinch, double tap)
    let tx = cw / 2 - cx * s + view.ox, ty = ch / 2 - cy * s + view.oy;
    if (view.z > 1) {                         // keep some of the plan in view when panning
      const mx = cw * 0.15, my = ch * 0.15;
      tx = W * s <= cw ? (cw - W * s) / 2 : Math.min(mx, Math.max(cw - W * s - mx, tx));
      ty = H * s <= ch ? (ch - H * s) / 2 : Math.min(my, Math.max(ch - H * s - my, ty));
      view.ox = tx - (cw / 2 - cx * s); view.oy = ty - (ch / 2 - cy * s);
    }
    view.s0 = s0; view.cx = cx; view.cy = cy; view.tx = tx; view.ty = ty;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(s, 0, 0, s, tx, ty);
    ctx.drawImage(seg.img, 0, 0, W, H);
    const px = dpr / s;       // one CSS pixel in plan space

    // the broken line: dark outline dashes under yellow dashes, flowing toward the destination
    if (part.pts.length > 1) {
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const path = () => { ctx.beginPath(); part.pts.forEach((c, i) => i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y)); };
      ctx.setLineDash([13 * px, 15 * px]); ctx.lineDashOffset = still() ? 0 : -(now / 1000) * 26 * px;
      ctx.strokeStyle = NAVY; ctx.lineWidth = 11 * px; path(); ctx.stroke();
      ctx.strokeStyle = GOLD; ctx.lineWidth = 6.5 * px; path(); ctx.stroke();
      ctx.setLineDash([]);
    }

    if (segIdx === 0) pin(g.pts[0], route.startLabel, px, 1, '#1f8a4c', now);
    else stairIcon(g.pts[0], px, 1);
    const arrive = Math.max(0, (raw - 0.88) / 0.12), en = g.pts[g.pts.length - 1];
    if (last) pin(en, route.endLabel, px, bounce(arrive), GOLD, now, true);
    else stairIcon(en, px, bounce(arrive));

    if (raw < 1 && !still()) {            // walker: the student's mascot walks the route, with a pulsing ring under its feet
      const h = part.head, pulse = (now % 1100) / 1100, M = window.LamparaMascots;
      ctx.fillStyle = 'rgba(255,209,0,' + (0.35 * (1 - pulse)) + ')'; ctx.beginPath(); ctx.arc(h.x, h.y, (12 + pulse * 22) * px, 0, 7); ctx.fill();
      if (M) {
        const ph = Math.floor(now / (Math.PI * 130));          // one footstep each time the mascot lands from a hop
        if (ph !== lastStepPh) { lastStepPh = ph; if (window.LamparaAudio) LamparaAudio.step(); }
        const size = 36, step = Math.abs(Math.sin(now / 130)), face = Math.cos(part.ang) < -0.2 ? -1 : 1;   // hops with each step, turns to face left or right
        ctx.save(); ctx.translate(h.x, h.y); ctx.scale(px, px);
        ctx.fillStyle = 'rgba(11,18,32,0.28)'; ctx.beginPath(); ctx.ellipse(0, 0, 11 - step * 3, 4, 0, 0, 7); ctx.fill();   // shadow
        ctx.translate(0, -step * 6); ctx.scale(face, 1); ctx.imageSmoothingEnabled = false;
        ctx.drawImage(M.canvas(M.equipped()), -size / 2, -size + 2, size, size);
        ctx.restore();
      } else {                            // no mascot script: the old arrow
        ctx.save(); ctx.translate(h.x, h.y); ctx.rotate(part.ang + Math.PI / 2); ctx.scale(px, px);
        ctx.fillStyle = '#fff'; ctx.strokeStyle = NAVY; ctx.lineWidth = 3; ctx.beginPath();
        ctx.moveTo(0, -13); ctx.lineTo(10, 10); ctx.lineTo(0, 5); ctx.lineTo(-10, 10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }

    if (raw >= 1 && !a.doneAt) a.doneAt = now;
    if (a.doneAt && !a.shown && now - a.doneAt > 600) {
      a.shown = true;
      if (!last) {
        const nf = route.segs[segIdx + 1].plan.floor;
        showCard('Take the stairs to ' + nf, 'Then your route continues on the ' + nf + '.', 'I am on the ' + nf, () => goFloor(segIdx + 1));
      } else if (legIdx < legs.length - 1) {
        const nxt = legs[legIdx + 1];
        showCard('You are at the exit', 'Next stop: ' + nxt.buildingName + '. We will set it as your destination.', 'Go to ' + nxt.buildingName, () => { location.href = '../Public/guide-ar.php?exit=1&to=' + nxt.to.id + '&room=' + nxt.room.id; });
      } else {
        rewardRoute();
        showCard('You have arrived', route.endLabel, q.get('enroll') ? 'Done, back to the steps' : 'Done', () => { LamparaTrip.clear(); if (q.get('enroll')) location.href = 'enrollment.php?done=' + encodeURIComponent(q.get('enroll')); });   // stays here: the plan, Show again, Share and Start over are still below
      }
    }
  }

  function pin(p, label, px, sc, color, now, big) {
    if (sc <= 0) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(px * sc, px * sc);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 2, 9, 3.5, 0, 0, 7); ctx.fill();
    ctx.translate(0, big ? Math.sin(now / 350) * 2 : 0);
    ctx.fillStyle = color; ctx.strokeStyle = NAVY; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.bezierCurveTo(-18, -18, -15, -40, 0, -40); ctx.bezierCurveTo(15, -40, 18, -18, 0, 0); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -26, 5.5, 0, 7); ctx.fill();
    ctx.font = '700 17px Outfit, system-ui, sans-serif'; ctx.textAlign = 'center';
    const w = ctx.measureText(label).width + 22;
    ctx.fillStyle = NAVY; ctx.beginPath(); ctx.roundRect(-w / 2, -76, w, 28, 14); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(label, 0, -56);
    ctx.restore();
  }
  function stairIcon(p, px, sc) {
    if (sc <= 0) return;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(px * sc, px * sc);
    ctx.fillStyle = NAVY; ctx.beginPath(); ctx.arc(0, 0, 17, 0, 7); ctx.fill();
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(-9, 8); ctx.lineTo(-3, 8); ctx.lineTo(-3, 2); ctx.lineTo(3, 2); ctx.lineTo(3, -4); ctx.lineTo(9, -4); ctx.stroke();
    ctx.restore();
  }

  // ---------------- directions in words (the same route, for anyone who cannot or would rather not follow the drawing)
  const bearing = (a, b) => (Math.atan2(b.x - a.x, -(b.y - a.y)) * 180 / Math.PI + 360) % 360;
  const turnOf = (h1, h2) => ((h2 - h1 + 540) % 360) - 180;       // + = right, - = left (the plan has north at the top)
  function stepsFor(seg, first, last, leg, nextFloor) {
    const mx = seg.plan.meters_per_unit_x > 0 ? seg.plan.meters_per_unit_x : null, my = seg.plan.meters_per_unit_y > 0 ? seg.plan.meters_per_unit_y : null;
    const P = seg.pts.map((p) => ({ x: p.x * (mx || 1), y: p.y * (my || 1) }));
    const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
    const lines = [];
    if (first && leg.startLabel) lines.push('Start at ' + (leg.startLabel === 'You' ? 'where you are' : 'the ' + leg.startLabel.toLowerCase()) + '.');
    // runs of nearly straight walking, split where the direction changes by more than 25 degrees
    const runs = []; let cur = null;
    for (let i = 1; i < P.length; i++) {
      const h = bearing(P[i - 1], P[i]), d = dist(P[i - 1], P[i]);
      if (d < 1e-6) continue;
      if (cur && Math.abs(turnOf(cur.h, h)) < 25) { cur.d += d; cur.h = h; } else { runs.push(cur = { h, d, from: cur ? turnOf(cur.h, h) : 0 }); }
    }
    runs.forEach((r, i) => {
      const how = i === 0 ? '' : (Math.abs(r.from) > 135 ? 'Turn around. ' : (Math.abs(r.from) > 70 ? 'Turn ' : 'Bear ') + (r.from > 0 ? 'right' : 'left') + '. ');
      const length = mx ? 'about ' + (r.d < 8 ? Math.max(2, Math.round(r.d)) : Math.round(r.d / 5) * 5) + ' meters' : (r.d < 8 ? 'a short way' : 'a good way');
      lines.push(how + 'Walk straight for ' + length + '.');
    });
    lines.push(last ? 'You arrive at ' + leg.endLabel + '.' : 'Take the stairs to the ' + nextFloor + '.');
    return lines;
  }
  function renderText(i) {
    const seg = route.segs[i], last = i === route.segs.length - 1;
    const lines = stepsFor(seg, i === 0, last, route, last ? null : route.segs[i + 1].plan.floor);
    $('textTitle').textContent = 'Directions in words: ' + seg.plan.floor;
    $('textSteps').innerHTML = lines.map((l) => '<li>' + l.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])) + '</li>').join('');
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'Floor plan of the ' + seg.plan.floor + ' with the route drawn on it. The step-by-step directions are available to screen readers on this page.');
  }

  // ---------------- floors
  function buildTabs() {
    $('tabs').innerHTML = '';
    if (route.segs.length < 2) return;
    route.segs.forEach((s, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.textContent = s.plan.floor; b.onclick = () => goFloor(i);
      $('tabs').appendChild(b);
    });
  }
  function goFloor(i) {
    if (switching || !route) return;
    switching = true; cv.classList.add('fade'); $('card').classList.remove('on');
    setTimeout(() => { cv.classList.remove('fade'); start(i); }, 350);
  }

  // ---------------- buttons
  function setMin(m) { $('card').classList.toggle('min', m); $('cardMin').textContent = m ? 'Show' : 'Hide'; $('cardMin').setAttribute('aria-expanded', String(!m)); }
  $('cardMin').onclick = () => setMin(!$('card').classList.contains('min'));
  $('cardGo').onclick = () => { const act = cardAction; $('card').classList.remove('on'); if (act) act(); };
  $('outDone').onclick = () => runLeg(legIdx + 1);
  $('startOver').onclick = () => LamparaTrip.clear();
  // Share the route: the phone's share sheet where there is one, otherwise the link is copied.
  function toast(t) { const el = $('toast'); el.textContent = t; el.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { el.hidden = true; }, 2600); }
  $('share').onclick = async () => {
    const url = location.href;
    try { if (navigator.share) { await navigator.share({ title: 'Lampara route', text: 'The way to ' + journeyTitle(), url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Link copied. Paste it in a message.'); } catch (e) { toast('Copy this address from the top of your browser.'); }
  };
  function journeyTitle() { const last = legs[legs.length - 1]; return last && last.endLabel ? last.endLabel : 'your room'; }
  $('replay').onclick = () => { if (route && !$('viewPlan').hidden) goFloor(0); };
  $('back').onclick = () => { if (history.length > 1) history.back(); else location.href = 'where.php'; };
  window.addEventListener('resize', () => { if (route && !$('viewPlan').hidden) start(segIdx); });

  // pixel icons on the buttons (they follow each button's text colour)
  document.querySelectorAll('[data-px]').forEach((el) => { if (window.LamparaMascots) el.innerHTML = LamparaMascots.icon(el.getAttribute('data-px'), 22); });

  init();

  // ---------------- background music (a quiet original walking tune; Web Audio, so it works offline)
  // On by default, off after a tap on the speaker (remembered on this phone). Browsers keep sound back until the first tap.
  (() => {
    const A = window.LamparaAudio, btn = $('snd');
    if (!A || !btn) { if (btn) btn.hidden = true; return; }
    let on = true;
    try { on = localStorage.getItem('lampara_music') !== '0'; } catch (e) { /* default on */ }
    const paint = () => { btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? 'Music is on. Tap to mute' : 'Music is off. Tap to turn on'); };
    const apply = () => { A.mute(!on); if (on && !document.hidden) A.play('route'); else A.stop(); };
    btn.addEventListener('click', () => { on = !on; try { localStorage.setItem('lampara_music', on ? '1' : '0'); } catch (e) { /* not remembered */ } paint(); apply(); });
    const unlock = () => { if (on) A.play('route'); };
    document.addEventListener('pointerdown', unlock, { once: true, capture: true });
    document.addEventListener('visibilitychange', apply);
    window.addEventListener('pagehide', () => A.stop());
    paint(); apply();
  })();
})();
