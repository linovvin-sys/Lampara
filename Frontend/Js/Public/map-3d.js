// Student · Campus Map — the 3D viewer for an uploaded .obj model (three.js, loaded only when a 3D .obj map is opened).
// Drag to rotate, pinch / scroll to zoom, two-finger drag (or right-drag) to move.
// Exposes { zoom, reset, resize, dispose, selectBuilding, anchor }.
//
// Tapping a building: the model knows nothing about the database, so its buildings are matched to the registered
// building footprints (campus-footprints.php, real lat/lng) by shape and position — see solveAnchor(). Nothing is
// read from mesh names and admins annotate nothing; a re-uploaded model of the same area just works, and a model
// the footprints don't line up with simply has no tappable buildings rather than wrong ones.
import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const EARTH_R = 6371008.8;
// Colour carries meaning: campus buildings in the Lampara navy family (one tint each), everything else quiet, gold for
// what you are looking at. Red stays reserved for alerts elsewhere in the app.
const COLOR_NEUTRAL = 0xe2e4ea;      // neighbourhood buildings: neutral, so the campus is what stands out
const COLOR_TREE = 0xc9d2c4;         // trees: a quiet sage, readable as greenery without competing
const COLOR_EDGE = 0x7c8bb5;
const COLOR_HOVER_EDGE = 0xf5b400;   // the 2D map's gold selection ring, as an outline: "you can tap this"
const COLOR_SELECTED = 0xffd100;     // Lampara gold, filled: "this is the one you picked"

// One navy-family tint per registered building: Lampara's navy hue (~238 deg) varied a little in hue and more in
// lightness and saturation, stepping light/dark through the buildings in id order. Deterministic, so a building keeps
// its colour between visits, and buildings registered one after another never get near-identical shades.
// ponytail: 8 steps, then the cycle repeats; widen TINT_STEPS if the campus ever registers more than 8 buildings.
// Steps chosen to keep the closest two as far apart as possible to the eye (CIELAB): 17.5 dE across the first six,
// 12.7 across all eight.
const TINT_STEPS = [[238, 0.44, 0.65], [243, 0.60, 0.55], [228, 0.28, 0.80], [248, 0.44, 0.55],
  [238, 0.60, 0.80], [228, 0.28, 0.60], [228, 0.60, 0.60], [228, 0.28, 0.70]];
export function buildingTints(ids) {
  const sorted = [...new Set(ids.map(Number))].sort((a, b) => a - b);
  return new Map(sorted.map((id, i) => { const [h, s, l] = TINT_STEPS[i % TINT_STEPS.length]; return [id, { h: h / 360, s, l }]; }));
}

// ---- plan-view geometry helpers (x east, y north, metres) ----
function hull(pts) {                 // convex hull, monotone chain
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}
function hullArea(h) {
  let s = 0;
  for (let i = 0; i < h.length; i++) { const a = h[i], b = h[(i + 1) % h.length]; s += a[0] * b[1] - b[0] * a[1]; }
  return Math.abs(s) / 2;
}
function bbox(pts) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0, h: y1 - y0 };
}
export function shape(pts) {         // size signature that does not change when the shape is rotated or moved
  return { pts, area: hullArea(hull(pts)), box: bbox(pts) };
}
const applyT = (t, p) => [t.c * p[0] - t.s * p[1] + t.tx, t.s * p[0] + t.c * p[1] + t.ty];

// Similarity (rotation + scale + shift) taking a1 -> b1 and a2 -> b2.
function similarity(a1, a2, b1, b2) {
  const vax = a2[0] - a1[0], vay = a2[1] - a1[1], vbx = b2[0] - b1[0], vby = b2[1] - b1[1];
  const d = vax * vax + vay * vay;
  if (d < 400) return null;          // closer than 20 m: too short a baseline to fix the rotation
  const c = (vax * vbx + vay * vby) / d, s = (vax * vby - vay * vbx) / d;
  return { c, s, tx: b1[0] - (c * a1[0] - s * a1[1]), ty: b1[1] - (s * a1[0] + c * a1[1]) };
}

// Every footprint whose transformed outline lands on a model building of the same size (one building each).
function matchAll(F, M, t, tol = 1.5) {
  const used = new Set(), pairs = [];
  for (const f of F) {
    const b = bbox(f.pts.map((p) => applyT(t, p)));
    let best = null;
    for (const m of M) {
      if (used.has(m)) continue;
      const d = Math.hypot(b.cx - m.box.cx, b.cy - m.box.cy);
      if (d < tol && Math.abs(b.w - m.box.w) < tol && Math.abs(b.h - m.box.h) < tol && (!best || d < best.d)) best = { m, d };
    }
    if (best) { used.add(best.m); pairs.push({ f, m: best.m, d: best.d }); }
  }
  return pairs;
}

// Where are the footprints (metres east/north of their own centre) inside the model's own coordinates?
// Model exports from map data are in metres, but their north and origin are their own: here about 2.3 degrees and
// ~180 m off. A few large, distinctively sized buildings are paired by area (which ignores rotation), each pair of
// pairs proposes a transform, and the one that lines up the most outlines wins. Measured on the current campus
// model: 68 of 84 outlines within 0.5 m of their building.
export function solveAnchor(F, M) {
  const big = F.filter((f) => f.area > 40).sort((a, b) => b.area - a.area).slice(0, 12);
  const cand = [];
  for (const f of big) for (const m of M) if (m.area > 40 && Math.abs(f.area - m.area) / m.area < 0.06) cand.push([f, m]);
  let best = null;
  for (let a = 0; a < cand.length; a++) {
    for (let b = a + 1; b < cand.length; b++) {
      const [f1, m1] = cand[a], [f2, m2] = cand[b];
      if (f1 === f2 || m1 === m2) continue;
      const t = similarity([f1.box.cx, f1.box.cy], [f2.box.cx, f2.box.cy], [m1.box.cx, m1.box.cy], [m2.box.cx, m2.box.cy]);
      if (!t) continue;
      const scale = Math.hypot(t.c, t.s);
      if (scale < 0.9 || scale > 1.1) continue;
      const pairs = matchAll(F, M, t);
      if (!best || pairs.length > best.pairs.length) best = { t, pairs };
    }
  }
  if (!best) return null;
  // least-squares refinement over every matched outline
  const t = fitSimilarity(best.pairs.map((p) => [p.f.box.cx, p.f.box.cy]), best.pairs.map((p) => [p.m.box.cx, p.m.box.cy]));
  const pairs = matchAll(F, M, t);
  // Too few agreeing outlines means this model is not of the mapped area: no hotspots beats wrong hotspots.
  if (pairs.length < Math.max(6, Math.ceil(F.length * 0.4))) return null;
  return { t, pairs, rotationDeg: Math.atan2(t.s, t.c) * 180 / Math.PI, scale: Math.hypot(t.c, t.s) };
}

// Least-squares similarity taking points A onto points B.
function fitSimilarity(A, B) {
  const n = A.length;
  const ax = A.reduce((s, p) => s + p[0], 0) / n, ay = A.reduce((s, p) => s + p[1], 0) / n;
  const bx = B.reduce((s, p) => s + p[0], 0) / n, by = B.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, sxy = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const u = A[i][0] - ax, v = A[i][1] - ay, x = B[i][0] - bx, y = B[i][1] - by;
    sxx += u * x + v * y; sxy += u * y - v * x; den += u * u + v * v;
  }
  const c = sxx / den, s = sxy / den;
  return { c, s, tx: bx - (c * ax - s * ay), ty: by - (s * ax + c * ay) };
}

// Metres east/north of a reference latitude/longitude (flat-earth: fine across a campus).
export function geoFrame(la, ln) {
  const kx = EARTH_R * Math.cos(la * Math.PI / 180) * Math.PI / 180, ky = EARTH_R * Math.PI / 180;
  return { local: (lat, lng) => [(lng - ln) * kx, (lat - la) * ky], geo: (e, n) => ({ lat: la + n / ky, lng: ln + e / kx }) };
}
export function footprintFrame(footprints) {
  let n = 0, la = 0, ln = 0;
  (footprints || []).forEach((f) => (f.points || []).forEach(([a, b]) => { la += +a; ln += +b; n++; }));
  return n ? geoFrame(la / n, ln / n) : null;
}

// footprints: campus-footprints.php's list. Building outlines with a building_id become tappable.
export function footprintShapes(footprints, frame) {
  const fp = (footprints || []).filter((f) => f.kind === 'building' && f.points && f.points.length >= 3);
  if (!fp.length) return [];
  frame = frame || footprintFrame(fp);
  return fp.map((f) => Object.assign(shape(f.points.map(([a, b]) => frame.local(+a, +b))),
    { id: f.id, buildingId: f.building_id == null ? null : +f.building_id }));
}

// The 2D map's pins are stored as percent of the picture. Where a pin's real position is known (a building-entrance pin
// and that building's GPS entrance point), those pairs fix how the picture lies on the ground, and every other pin
// (gates, landmarks) is placed through it. Needs 3+ pairs so the fit can be checked against itself, and the picture's
// true width/height. Returns { toLatLng(x, y), rms } — or null when the pairs disagree by more than PIN_MAX_RMS_M,
// so a pin goes missing rather than standing in the wrong place.
const PIN_MAX_RMS_M = 8;
export function georefPicture(pairs, page) {
  if (!page || !(page.width > 0) || !(page.height > 0) || !pairs || pairs.length < 3) return null;
  const f = geoFrame(pairs.reduce((s, p) => s + p.lat, 0) / pairs.length, pairs.reduce((s, p) => s + p.lng, 0) / pairs.length);
  const onPage = (x, y) => [x / 100 * page.width, -(y / 100 * page.height)];   // picture y runs down, north runs up
  const A = pairs.map((p) => onPage(p.x, p.y)), B = pairs.map((p) => f.local(p.lat, p.lng));
  const t = fitSimilarity(A, B);
  const rms = Math.sqrt(A.reduce((s, a, i) => { const q = applyT(t, a); return s + (q[0] - B[i][0]) ** 2 + (q[1] - B[i][1]) ** 2; }, 0) / A.length);
  if (rms > PIN_MAX_RMS_M) return null;
  return { rms, toLatLng: (x, y) => { const q = applyT(t, onPage(x, y)); return f.geo(q[0], q[1]); } };
}

// ---- map pins (entrances, gates, landmarks), drawn like the 2D map's pins ----
const PIN_COLOR = { entrance: '#2e3192', gate: '#ffd100', landmark: '#ef6c00' };
const PIN_PX = 38;                   // on-screen height, whatever the zoom

function pinTexture(type, selected) {
  const W = 96, H = 128, cx = 48, cy = 46, r = 30;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const drop = () => {                 // the 2D pin: a circle drawn down to a point
    g.beginPath();
    g.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
    g.lineTo(cx, cy + r * Math.SQRT2);
    g.closePath();
  };
  if (selected) { drop(); g.lineWidth = 16; g.strokeStyle = 'rgba(245, 180, 0, 0.55)'; g.stroke(); }
  g.save();
  g.shadowColor = 'rgba(11, 37, 89, 0.45)'; g.shadowBlur = 8; g.shadowOffsetY = 3;
  drop(); g.fillStyle = PIN_COLOR[type] || PIN_COLOR.entrance; g.fill();
  g.restore();
  drop(); g.lineWidth = 5; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff';
  if (type === 'landmark') { g.font = 'bold 34px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('★', cx, cy + 1); }
  else { g.beginPath(); g.arc(cx, cy, 9, 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, tipFromBottom: (H - (cy + r * Math.SQRT2 + 2.5)) / H, aspect: W / H };
}

export async function createViewer(container, url, { onProgress, footprints, onSelect, markers, onMarker } = {}) {
  // ---- download the model (text) with progress ----
  const res = await fetch(url);
  if (!res.ok) throw new Error('Could not download the model');
  const total = Number(res.headers.get('Content-Length')) || 0;
  let text;
  if (res.body && total && onProgress) {
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); got += value.length;
      onProgress(Math.min(1, got / total));
    }
    text = await new Blob(chunks).text();
  } else {
    text = await res.text();
  }

  const object = new OBJLoader().parse(text);
  let vertexCount = 0;
  const material = new THREE.MeshStandardMaterial({ color: COLOR_NEUTRAL, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  const treeMat = new THREE.MeshStandardMaterial({ color: COLOR_TREE, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
  const meshes = [];
  object.traverse((child) => {
    if (!child.isMesh) return;
    const g = child.geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    vertexCount += g.attributes.position.count;
    // Cosmetic only: exporters that name their tree layer get sage trees; anything else stays neutral. (Which mesh is
    // which BUILDING never depends on names — see solveAnchor.)
    child.material = /tree/i.test(child.name) ? treeMat : material;
    meshes.push(child);
  });
  if (!vertexCount) throw new Error('The model has no shapes to show');

  // Many exporters use Z as "up". A campus is wide and low, so the thinnest direction should be vertical.
  const box0 = new THREE.Box3().setFromObject(object);
  const size0 = box0.getSize(new THREE.Vector3());
  const zUp = size0.z < size0.y && size0.z < size0.x;
  if (zUp) object.rotation.x = -Math.PI / 2;

  // Plan-view outline of every mesh (east, north) in the file's own coordinates: the geometry itself is untouched by
  // the rotation and centring applied to `object`. Z-up files keep north on +y; Y-up files (three.js's own
  // convention) keep it on -z. Tiny meshes (trees, props) cannot be buildings and are skipped.
  const modelShapes = [];
  let ground = Infinity;               // lowest building base, where pins stand
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position, seen = new Set(), pts = [];
    let low = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = zUp ? pos.getY(i) : -pos.getZ(i), k = Math.round(x * 100) + ',' + Math.round(y * 100);
      const up = zUp ? pos.getZ(i) : pos.getY(i);
      if (up < low) low = up;
      if (!seen.has(k)) { seen.add(k); pts.push([x, y]); }
    }
    const sh = shape(pts);
    if (sh.area > 15) { modelShapes.push(Object.assign(sh, { mesh })); ground = Math.min(ground, low); }
  }
  if (!isFinite(ground)) ground = 0;

  const box = new THREE.Box3().setFromObject(object);
  const centre = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  object.position.sub(centre);                 // model sits at the origin
  const radius = Math.max(size.x, size.y, size.z) || 1;

  // thin outlines make the buildings readable (skipped for very heavy models)
  const lineMat = new THREE.LineBasicMaterial({ color: COLOR_EDGE, transparent: true, opacity: 0.55 });
  const hoverLineMat = new THREE.LineBasicMaterial({ color: COLOR_HOVER_EDGE });
  if (vertexCount < 400000) {
    const lines = [];
    object.traverse((child) => { if (child.isMesh) lines.push(child); });
    lines.forEach((m) => {
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 35), lineMat);
      m.add(edges);
      m.userData.edges = edges;        // a hovered building swaps these to gold
    });
  }

  // ---- scene ----
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.touchAction = 'none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xeef1f8);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a97b8, 1.05));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(radius, radius * 1.6, radius * 0.8);
  scene.add(sun);
  scene.add(object);

  const camera = new THREE.PerspectiveCamera(45, 1, radius / 1000, radius * 40);
  const home = new THREE.Vector3(radius * 0.95, radius * 0.8, radius * 0.95);
  camera.position.copy(home);
  camera.lookAt(0, 0, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.screenSpacePanning = true;
  controls.minDistance = radius * 0.15;
  controls.maxDistance = radius * 6;
  controls.maxPolarAngle = Math.PI * 0.495;   // stay above the ground
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.update();

  // A panel covering the bottom of the view: the projection is shifted so the camera's focus sits in the middle of
  // the part still visible. Taps stay exact because the raycaster reads the same shifted projection.
  let bottomInset = 0;
  const pins = [];                     // map pins (sprites); filled once the model is anchored
  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = w + 'px';
    renderer.domElement.style.height = h + 'px';
    camera.aspect = w / h;
    if (bottomInset > 0) camera.setViewOffset(w, h, 0, Math.min(bottomInset, h * 0.8) / 2, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // pins keep a fixed size on screen: a sprite drawn without size attenuation is sized in view height units
    const unit = 2 * Math.tan(camera.fov * Math.PI / 360) / h;
    pins.forEach((p) => { const k = p.userData.selected ? 1.18 : 1; p.scale.set(PIN_PX * k * unit * p.userData.aspect, PIN_PX * k * unit, 1); });
  }
  resize();
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container);

  // ---- registered buildings: match, tint, tap, fly ----
  const geoRef = footprintFrame((footprints || []).filter((f) => f.kind === 'building'));
  const anchor = solveAnchor(footprintShapes(footprints, geoRef), modelShapes);
  const byBuilding = new Map();        // building id -> its meshes
  const selectedMat = new THREE.MeshStandardMaterial({ color: COLOR_SELECTED, emissive: 0x5c4a00, roughness: 0.6, metalness: 0, side: THREE.DoubleSide });
  if (anchor) {
    for (const { f, m } of anchor.pairs) {
      if (f.buildingId == null) continue;
      m.mesh.userData.buildingId = f.buildingId;
      // one building can be several outlines (a main block plus its wings): they select, frame and colour together
      if (!byBuilding.has(f.buildingId)) byBuilding.set(f.buildingId, []);
      byBuilding.get(f.buildingId).push(m.mesh);
    }
  }
  // its own navy tint, plus the same tint lifted for hover
  const tintMats = new Map();
  for (const [id, t] of buildingTints([...byBuilding.keys()])) {
    const base = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(t.h, t.s, t.l), roughness: 0.8, metalness: 0, side: THREE.DoubleSide });
    const hover = new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(t.h, t.s, Math.min(0.9, t.l + 0.1)), emissive: 0x1b1d52, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
    tintMats.set(id, { base, hover });
    byBuilding.get(id).forEach((x) => { x.material = base; });
  }
  let selectedId = null, hoverId = null;

  // Open (and "fit to screen") on the campus itself, not the whole exported area, which is mostly neighbourhood and
  // left the campus at the screen's edge. Distance picked so the campus fits the narrower side of the screen (a
  // portrait phone's width).
  const homeTarget = new THREE.Vector3();
  function fitHome() {
    if (!byBuilding.size) return;
    object.updateMatrixWorld(true);
    const b = new THREE.Box3();
    byBuilding.forEach((parts) => parts.forEach((x) => b.expandByObject(x)));
    b.getCenter(homeTarget);
    const half = b.getSize(new THREE.Vector3()).length() / 2;
    const vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
    const dist = Math.min(controls.maxDistance, Math.max(controls.minDistance, half / Math.tan(Math.min(vf, hf) / 2) * 1.05));
    // looking down ~45 deg: steep enough that the campus fills the screen instead of a band of empty sky above it
    home.copy(homeTarget).add(new THREE.Vector3(0.8, 1.15, 0.8).normalize().multiplyScalar(dist));
  }
  fitHome();
  camera.position.copy(home);
  controls.target.copy(homeTarget);
  controls.update();

  // Pins stand on the ground at their real position: GPS -> footprint metres -> the model, through the same anchor as
  // the buildings. They are children of the model, so its rotation and centring apply to them too.
  const pinTextures = {};
  const texFor = (type, sel) => (pinTextures[type + sel] = pinTextures[type + sel] || pinTexture(type, sel));
  if (anchor && geoRef) {
    for (const m of markers || []) {
      if (!(isFinite(m.lat) && isFinite(m.lng))) continue;
      const [X, Y] = applyT(anchor.t, geoRef.local(m.lat, m.lng));
      const t = texFor(m.marker_type, false);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: t.tex, sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true }));
      sprite.center.set(0.5, t.tipFromBottom);        // the tip, not the middle, touches the ground
      sprite.renderOrder = 10;                         // drawn over buildings, like pins on a map
      if (zUp) sprite.position.set(X, Y, ground); else sprite.position.set(X, ground, -Y);
      sprite.userData = { markerId: m.id, type: m.marker_type, aspect: t.aspect, selected: false };
      object.add(sprite);
      pins.push(sprite);
    }
    resize();
  }
  const pinById = new Map(pins.map((p) => [p.userData.markerId, p]));
  let selectedPin = null;
  function markPin(id) {
    if (selectedPin) { selectedPin.userData.selected = false; selectedPin.material.map = texFor(selectedPin.userData.type, false).tex; }
    selectedPin = id == null ? null : pinById.get(id) || null;
    if (selectedPin) { selectedPin.userData.selected = true; selectedPin.material.map = texFor(selectedPin.userData.type, true).tex; }
    resize();
  }

  // One place decides a building's look: selected beats hovered beats plain.
  // Hovered: its own tint lifted, outlined in gold. Selected: filled gold (its outline stays plain, gold-on-gold
  // would vanish). So hover reads as an outline and selection as a fill, distinguishable at a glance.
  function paint(id) {
    const own = tintMats.get(id), sel = id === selectedId, hov = id === hoverId && !sel;
    byBuilding.get(id).forEach((x) => {
      x.material = sel ? selectedMat : hov ? own.hover : own.base;
      if (x.userData.edges) x.userData.edges.material = hov ? hoverLineMat : lineMat;
    });
  }
  function highlight(id) {
    const prev = selectedId;
    selectedId = id;
    if (prev != null) paint(prev);
    if (id != null) paint(id);
  }
  function setHover(id) {
    if (id === hoverId) return;
    const prev = hoverId;
    hoverId = id;
    if (prev != null) paint(prev);
    if (id != null) paint(id);
    renderer.domElement.style.cursor = id != null ? 'pointer' : '';
  }

  // Camera glide that frames one building (all of its parts). Instant when the person has asked for reduced motion.
  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let glide = null;
  function glideTo(centre, dist) {
    const dir = camera.position.clone().sub(controls.target).normalize();
    const toPos = centre.clone().add(dir.multiplyScalar(Math.min(controls.maxDistance, Math.max(controls.minDistance, dist))));
    if (reduceMotion) { controls.target.copy(centre); camera.position.copy(toPos); controls.update(); return; }
    glide = { t0: performance.now(), ms: 650, fromT: controls.target.clone(), toT: centre, fromP: camera.position.clone(), toP: toPos };
  }
  function frame(parts) {
    object.updateMatrixWorld(true);
    const b = new THREE.Box3();
    parts.forEach((x) => b.expandByObject(x));
    glideTo(b.getCenter(new THREE.Vector3()), b.getSize(new THREE.Vector3()).length() * 2.2);
  }

  function select(id, fly) {
    highlight(id);
    if (id != null && fly) frame(byBuilding.get(id));
  }

  // What is under a screen point: { pin } or { building } (or neither). Pins are drawn over buildings, so a pin wins;
  // for buildings the nearest of ALL meshes counts, so a building standing in front blocks the one behind it.
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(clientX, clientY) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const pinHit = pins.length && raycaster.intersectObjects(pins, false)[0];
    if (pinHit) return { pin: pinHit.object.userData.markerId, building: null };
    const hit = raycaster.intersectObjects(meshes, false)[0];
    return { pin: null, building: hit && hit.object.userData.buildingId != null ? hit.object.userData.buildingId : null };
  }

  // A tap selects; a drag rotates. Only a short, nearly still press counts as a tap.
  // A building and a pin are never selected at once: choosing one lets go of the other.
  let down = null;
  function onDown(e) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; glide = null; setHover(null); }
  function onUp(e) {
    if (!down || (!byBuilding.size && !pins.length)) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), held = performance.now() - down.t;
    down = null;
    if (moved > 6 || held > 450) return;
    const hit = pick(e.clientX, e.clientY);
    const pinId = selectedPin ? selectedPin.userData.markerId : null;
    if (hit.pin != null) {
      if (hit.pin === pinId) return;
      if (selectedId != null) { select(null); if (onSelect) onSelect(null); }
      markPin(hit.pin);
      if (onMarker) onMarker(hit.pin);
      return;
    }
    if (pinId != null) { markPin(null); if (onMarker) onMarker(null); }
    if (hit.building === selectedId) return;
    select(hit.building, true);
    if (onSelect) onSelect(hit.building);
  }
  // Hover: mouse and pen only (a finger has no hover, and its tap already selects). Never while a button is held,
  // so dragging to rotate doesn't flicker buildings. The ray is cast once per frame, not once per mouse event.
  let hoverAt = null;
  function onMove(e) {
    if ((!byBuilding.size && !pins.length) || e.pointerType === 'touch') return;
    if (e.buttons) { hoverAt = null; setHover(null); return; }
    hoverAt = { x: e.clientX, y: e.clientY };
  }
  function onLeave() { hoverAt = null; setHover(null); }
  function hoverTo(x, y) {
    const hit = pick(x, y);
    setHover(hit.building);
    if (hit.pin != null) renderer.domElement.style.cursor = 'pointer';
  }
  renderer.domElement.addEventListener('pointerdown', onDown);
  renderer.domElement.addEventListener('pointerup', onUp);
  renderer.domElement.addEventListener('pointermove', onMove);
  renderer.domElement.addEventListener('pointerleave', onLeave);

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  let raf = 0, alive = true;
  (function tick() {
    if (!alive) return;
    raf = requestAnimationFrame(tick);
    if (hoverAt) { hoverTo(hoverAt.x, hoverAt.y); hoverAt = null; }
    if (glide) {
      const k = Math.min(1, (performance.now() - glide.t0) / glide.ms), e = ease(k);
      controls.target.lerpVectors(glide.fromT, glide.toT, e);
      camera.position.lerpVectors(glide.fromP, glide.toP, e);
      if (k === 1) glide = null;
    }
    controls.update();
    renderer.render(scene, camera);
  })();

  return {
    zoom(factor) {
      glide = null;
      const offset = camera.position.clone().sub(controls.target);
      const dist = Math.min(controls.maxDistance, Math.max(controls.minDistance, offset.length() / factor));
      camera.position.copy(controls.target).add(offset.setLength(dist));
      controls.update();
    },
    reset() {
      glide = null;
      fitHome();                               // the screen may have turned since the map opened
      controls.target.copy(homeTarget);
      camera.position.copy(home);
      camera.lookAt(homeTarget);
      controls.update();
    },
    resize,
    // Pixels of the view hidden behind a bottom panel (0 when none).
    setBottomInset(px) { bottomInset = Math.max(0, px || 0); resize(); },
    // Highlight (and fly to) a registered building, or clear with null. False when it is not on this model.
    selectBuilding(id, { fly = true } = {}) {
      if (id != null && !byBuilding.has(+id)) return false;
      if (id != null && selectedPin) markPin(null);
      select(id == null ? null : +id, fly);
      return true;
    },
    // Highlight a pin (and glide to it), or clear with null. Lets go of any selected building. False when not placed.
    selectMarker(id, { fly = true } = {}) {
      if (id != null && !pinById.has(id)) return false;
      if (id != null && selectedId != null) select(null);
      markPin(id);
      if (id != null && fly) {
        object.updateMatrixWorld(true);
        const at = pinById.get(id).getWorldPosition(new THREE.Vector3());
        glideTo(at, Math.min(camera.position.distanceTo(controls.target), radius * 0.45));
      }
      return true;
    },
    // How well the database outlines lined up with this model; null when they did not.
    anchor: anchor && { matched: anchor.pairs.length, buildings: byBuilding.size, pins: pins.length, rotationDeg: anchor.rotationDeg, scale: anchor.scale },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      object.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
      [material, treeMat, selectedMat, lineMat, hoverLineMat].forEach((m) => m.dispose());
      tintMats.forEach(({ base, hover }) => { base.dispose(); hover.dispose(); });
      pins.forEach((p) => p.material.dispose());
      Object.values(pinTextures).forEach((t) => t.tex.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
