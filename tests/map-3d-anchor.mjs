// Check that the 3D campus map can still tell which model building is which registered building.
// Run: node tests/map-3d-anchor.mjs
// Uses the committed campus model and a snapshot of campus-footprints.php (tests/fixtures). Re-snapshot the fixture
// if the footprints are re-imported; update EXPECTED if buildings are re-linked to different outlines.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL, fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODEL = path.join(ROOT, 'Frontend/assets/maps/map-3d-1791420622.obj');
// a building can be several outlines: Amafel is four, closing a ring around its central courtyard
const EXPECTED = { 1: ['TPX_Buildings_mesh2', 'TPX_Buildings_mesh3', 'TPX_Buildings_mesh4', 'TPX_Buildings_mesh25', 'TPX_Buildings_mesh5'], 3: ['TPX_Buildings_mesh15'], 4: ['TPX_Buildings_mesh1'], 5: ['TPX_Buildings_mesh54'], 6: ['TPX_Buildings_mesh51'], 7: ['TPX_Buildings_mesh46'] };

// map-3d.js imports three.js by bare name (the browser resolves it through map.php's import map). The anchor maths
// does not touch three.js, so load a copy with those imports stubbed out.
const src = fs.readFileSync(path.join(ROOT, 'Frontend/Js/Public/map-3d.js'), 'utf8')
  .replace(/^import \* as THREE from 'three';$/m, 'const THREE = {};')
  .replace(/^import \{ (\w+) \} from 'three\/addons\/.*';$/gm, 'class $1 {}');
const tmp = path.join(os.tmpdir(), 'map-3d-under-test-' + process.pid + '.mjs');
fs.writeFileSync(tmp, src);
const { solveAnchor, footprintShapes, shape, georefPicture, geoFrame, buildingTints } = await import(pathToFileURL(tmp).href);
fs.unlinkSync(tmp);

let pass = 0, fail = 0;
const check = (name, ok, detail) => { ok ? pass++ : fail++; console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? ' (' + detail + ')' : '')); };

// the model, one mesh per `o` like three.js's OBJLoader; Z-up, so plan view is (x, y)
const meshes = []; let cur = null;
for (const line of fs.readFileSync(MODEL, 'utf8').split('\n')) {
  const p = line.trim().split(/\s+/);
  if (p[0] === 'o') { cur = { name: p[1], v: [] }; meshes.push(cur); }
  else if (p[0] === 'v' && cur) cur.v.push([+p[1], +p[2]]);
}
const M = [];
for (const m of meshes) {
  const seen = new Set(), pts = [];
  for (const [x, y] of m.v) { const k = Math.round(x * 100) + ',' + Math.round(y * 100); if (!seen.has(k)) { seen.add(k); pts.push([x, y]); } }
  const sh = shape(pts);
  if (sh.area > 15) M.push(Object.assign(sh, { name: m.name }));
}
const F = footprintShapes(JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/campus-footprints.json'), 'utf8')));

const a = solveAnchor(F, M);
check('finds where the footprints sit in the model', !!a);
check('lines up most building outlines', a && a.pairs.length >= 70, a && a.pairs.length + ' of ' + F.length);
check('model is in metres (scale near 1)', a && Math.abs(a.scale - 1) < 0.05, a && a.scale.toFixed(4));
const got = {};
if (a) for (const p of a.pairs) if (p.f.buildingId != null) (got[p.f.buildingId] = got[p.f.buildingId] || []).push(p.m.name);
for (const [id, names] of Object.entries(EXPECTED)) {
  const have = (got[id] || []).sort().join(', ');
  check('building ' + id + ' is ' + names.join(' + '), have === names.slice().sort().join(', '), have || 'not matched');
}

// A model of somewhere else must give no tappable buildings at all, never wrong ones.
const elsewhere = M.map((m) => Object.assign({}, m, { box: Object.assign({}, m.box, { cx: m.box.cx * 1.7 + 400, cy: -m.box.cy * 0.6 }) }));
check('refuses a model the footprints do not fit', solveAnchor(F, elsewhere) === null);
check('no footprints, no anchor', solveAnchor([], M) === null);

// 2D map pins -> real positions. Snapshot of the live data: the 2D map's building-entrance pins (percent of the picture)
// paired with each building's GPS entrance point, and the 2D map PDF's page size.
const PAGE = { width: 5733.33, height: 4935.56 };
const PAIRS = [
  { x: 29.06, y: 53.76, lat: 14.3275902, lng: 120.9406593 },   // Annex
  { x: 37.33, y: 23.82, lat: 14.3283182, lng: 120.9409051 },   // Multipurpose
  { x: 20.66, y: 73.45, lat: 14.3270445, lng: 120.9404649 },   // JEG
  { x: 50.86, y: 76.43, lat: 14.3269419, lng: 120.9412772 }    // Heritage
];
const g = georefPicture(PAIRS, PAGE);
check('2D map lines up with the GPS entrances', !!g && g.rms < 8, g && g.rms.toFixed(1) + ' m rms');
// independent check: the gate labelled "Campus Entrance / Main Building Entrance" must land by Amafel's real entrance
if (g) {
  const gate = g.toLatLng(21.47, 68.65), f = geoFrame(14.3272046, 120.9403606), [e, n] = f.local(gate.lat, gate.lng);
  check('main entrance gate lands by Amafel\'s entrance', Math.hypot(e, n) < 15, Math.hypot(e, n).toFixed(1) + ' m away');
}
check('pins that disagree are refused', georefPicture(PAIRS.map((p, i) => Object.assign({}, p, { x: [80, 10, 55, 5][i] })), PAGE) === null);
check('two pairs are too few to trust', georefPicture(PAIRS.slice(0, 2), PAGE) === null);
check('no page size, no placement', georefPicture(PAIRS, null) === null);

// Building colours: one navy-family tint each, stable, and never two that look alike.
const hsl2rgb = ({ h, s, l }) => {
  const f = (n) => { const k = (n + h * 12) % 12, a = s * Math.min(l, 1 - l); return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
};
const ids = [1, 3, 4, 5, 6, 7];
const tints = buildingTints(ids);
check('every building gets a tint', ids.every((id) => tints.has(id)));
check('same buildings, same colours (order does not matter)', JSON.stringify([...buildingTints([7, 1, 5, 3, 6, 4])]) === JSON.stringify([...tints]));
check('all tints stay in the navy hue family', [...tints.values()].every((t) => t.h * 360 >= 225 && t.h * 360 <= 250));
check('all tints are clearly coloured, not neutral grey', [...tints.values()].every((t) => t.s >= 0.25));
// distance as the eye sees it (CIELAB delta E); below ~5 two colours read as the same
const lab = ([r, g, b]) => {
  const lin = (u) => (u <= 0.04045 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4);
  [r, g, b] = [r, g, b].map(lin);
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
};
const closestDE = (list) => { let m = Infinity; const L = list.map((t) => lab(hsl2rgb(t))); for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) m = Math.min(m, Math.hypot(L[i][0] - L[j][0], L[i][1] - L[j][1], L[i][2] - L[j][2])); return m; };
const de6 = closestDE([...tints.values()]), de8 = closestDE([...buildingTints([1, 2, 3, 4, 5, 6, 7, 8]).values()]);
check('no two of the campus buildings look alike', de6 > 12, 'closest pair ' + de6.toFixed(1) + ' dE');
check('still distinct with 8 buildings', de8 > 10, 'closest pair ' + de8.toFixed(1) + ' dE');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
