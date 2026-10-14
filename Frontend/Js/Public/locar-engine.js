// LocAR.js engine for the student AR guide (guide-ar.php). ES module; exposes window.LamparaLocar.
//
// LocAR (https://github.com/AR-js-org/locar.js) is the location-based half of AR.js rebuilt on three.js. It owns the
// camera video, the device-orientation camera and the GPS -> world mapping. This file adds what the guide needs on top:
//   - a Kalman GPS filter that glides the camera every frame (instead of jumping on each raw fix),
//   - the route as flat chevrons lying on the ground, snapped to the route being walked,
//   - building labels, a beacon on the chosen building, the whole walkway network, and tap selection,
//   - automatic compass correction from walking along a drawn walkway, and QR-anchor position/heading resets.
// The Vue page (Js/Public/guide-ar.js) decides WHAT to show; this decides how it is drawn and where the camera is.
//
// Needs the classic script CampusRoute (Js/Public/campus-route.js) for walkway snapping.
import * as THREE from 'three';
import * as LocAR from '../../assets/vendor/locar-0.2.12/locar.es.js';

const R = 6371008.8, M_PER_DEG = 111320;
const STOP_REACH_M = 5;     // within this much of the next point (along the route) counts as having reached it
const rad = (d) => d * Math.PI / 180, deg = (r) => r * 180 / Math.PI;
const norm360 = (d) => ((d % 360) + 360) % 360;
const norm180 = (d) => { d = norm360(d); return d > 180 ? d - 360 : d; };

function distance(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}
function bearing(a, b) {
  const f1 = rad(a.lat), f2 = rad(b.lat), dl = rad(b.lng - a.lng);
  const y = Math.sin(dl) * Math.cos(f2), x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return norm360(deg(Math.atan2(y, x)));
}
function enu(origin, p) {
  return { e: rad(p.lng - origin.lng) * R * Math.cos(rad(origin.lat)), n: rad(p.lat - origin.lat) * R };
}

// Chevron stations along a polyline; each carries the bearing of the segment it sits on so the ribbon bends round corners.
function samplePolyline(points, spacing, maxCount) {
  const seg = [], cum = [0];
  for (let i = 0; i < points.length - 1; i++) { const d = distance(points[i], points[i + 1]); seg.push(d); cum.push(cum[i] + d); }
  const total = cum[cum.length - 1];
  spacing = Math.max(spacing, total / maxCount);
  const out = []; let i = 0;
  for (let d = spacing; d < total - 1.5; d += spacing) {
    while (i < seg.length - 1 && cum[i + 1] < d) i++;
    const t = seg[i] ? (d - cum[i]) / seg[i] : 0, a = points[i], b = points[i + 1];
    out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, dist: d, bearing: bearing(a, b) });
  }
  return { stations: out, total };
}

// Remembers how far along the route you are (windowed search), so a route that doubles back cannot make you jump ahead.
function makeTracker(points) {
  const seg = [], cum = [0];
  for (let i = 0; i < points.length - 1; i++) { const d = distance(points[i], points[i + 1]); seg.push(d); cum.push(cum[i] + d); }
  const total = cum[cum.length - 1] || 0;
  const tr = { total, last: null };
  let along = 0, started = false;
  function project(fix, lo, hi) {
    let best = null;
    for (let i = 0; i < seg.length; i++) {
      if (cum[i + 1] < lo || cum[i] > hi) continue;
      const A = enu(fix, points[i]), B = enu(fix, points[i + 1]);
      const dx = B.e - A.e, dy = B.n - A.n, l2 = dx * dx + dy * dy;
      let t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.e * dx + A.n * dy) / l2));
      let a = cum[i] + t * seg[i];
      if (a < lo || a > hi) { a = Math.max(lo, Math.min(hi, a)); t = seg[i] ? (a - cum[i]) / seg[i] : 0; }
      const off = Math.hypot(A.e + t * dx, A.n + t * dy);
      if (!best || off < best.off) best = { off, along: a };
    }
    return best;
  }
  tr.update = function (fix) {
    if (!seg.length) return (tr.last = { along: 0, remaining: 0, off: 0, total });
    let b;
    if (!started) { b = project(fix, 0, Math.min(total, 40)); if (!b || b.off > 60) b = project(fix, 0, total); started = true; }
    else {
      b = project(fix, Math.max(0, along - 15), Math.min(total, along + 80));
      if (!b || b.off > 60) { const g = project(fix, 0, total); if (g && (!b || g.off < b.off - 20)) b = g; }
    }
    along = b.along;
    return (tr.last = { along, remaining: Math.max(0, total - along), off: b.off, total });
  };
  tr.project = project;
  tr.pointAt = function (a) {
    if (!seg.length) return { lat: points[0].lat, lng: points[0].lng };
    a = Math.max(0, Math.min(total, a));
    let i = 0; while (i < seg.length - 1 && cum[i + 1] < a) i++;
    const t = seg[i] ? (a - cum[i]) / seg[i] : 0;
    return { lat: points[i].lat + t * (points[i + 1].lat - points[i].lat), lng: points[i].lng + t * (points[i + 1].lng - points[i].lng) };
  };
  return tr;
}

// Kalman position filter: each fix is weighed by its claimed accuracy against how sure we already are; an alpha-beta
// tracker learns walking velocity so predict() can glide the camera between the (slow) fixes.
function gpsFilter() {
  const WALK = 2.5, FLOOR = 3;
  let est = null;
  const out = () => ({ lat: est.lat, lng: est.lng, acc: Math.sqrt(est.v) });
  const fn = function (f) {
    const acc = Math.max(f.acc || 25, FLOOR), t = f.ts || Date.now();
    if (!est) { est = { lat: f.lat, lng: f.lng, v: acc * acc, t, ve: 0, vn: 0 }; return out(); }
    const dt = Math.max(0, Math.min(10, (t - est.t) / 1000));
    est.t = t;
    est.lat += est.vn * dt / M_PER_DEG; est.lng += est.ve * dt / (M_PER_DEG * Math.cos(rad(est.lat)));
    est.v += dt * WALK * WALK;
    const k = est.v / (est.v + acc * acc);
    const r = enu(est, f);
    est.lat += r.n * k / M_PER_DEG; est.lng += r.e * k / (M_PER_DEG * Math.cos(rad(est.lat)));
    if (dt > 0.3) {
      const beta = k * k / (2 - k);
      est.ve += beta * r.e / dt; est.vn += beta * r.n / dt;
      const sp = Math.hypot(est.ve, est.vn); if (sp > 3) { est.ve *= 3 / sp; est.vn *= 3 / sp; }
      if (sp < 0.4) { est.ve *= 0.5; est.vn *= 0.5; }
    }
    est.v *= (1 - k);
    return out();
  };
  fn.reset = (f, stopped) => { const acc = Math.max(f.acc || 1, 1); est = { lat: f.lat, lng: f.lng, v: acc * acc, t: Date.now(), ve: stopped ? 0 : (est && est.ve) || 0, vn: stopped ? 0 : (est && est.vn) || 0 }; return out(); };
  fn.predict = () => {
    if (!est) return null;
    const dt = Math.max(0, Math.min(10, (Date.now() - est.t) / 1000));
    return { lat: est.lat + est.vn * dt / M_PER_DEG, lng: est.lng + est.ve * dt / (M_PER_DEG * Math.cos(rad(est.lat))), acc: Math.sqrt(est.v + dt * WALK * WALK) };
  };
  return fn;
}

// Compass correction by walking along a drawn walkway (a walkway has a known true bearing). Returns the absolute
// offset in degrees when it changed, else null.
function autoHeading() {
  const MIN_WALK_M = 6, MAX_WINDOW_MS = 25000, SAMPLES_NEEDED = 3, MAX_SPREAD_DEG = 25, STEP = 0.35, DEADBAND_DEG = 2, MAX_SNAP_M = 25, COURSE_TOL_DEG = 40;
  let track = [], samples = [], offset = 0, locked = false;
  function update(graph, fix, rawHeadingDeg) {
    if (!fix || rawHeadingDeg == null || !graph || !graph.edges.length) return null;
    const cur = { lat: fix.lat, lng: fix.lng, t: Date.now() };
    track.push(cur);
    let ref = null;
    for (let i = track.length - 2; i >= 0; i--) {
      if (cur.t - track[i].t > MAX_WINDOW_MS) break;
      if (distance(track[i], cur) >= MIN_WALK_M) { ref = track[i]; break; }
    }
    if (!ref) return null;
    track = [cur];
    const course = bearing(ref, cur);
    const snap = CampusRoute.snapToGraph({ lat: (ref.lat + cur.lat) / 2, lng: (ref.lng + cur.lng) / 2 }, graph.nodes, graph.edges);
    if (!snap || snap.dist > MAX_SNAP_M) return null;
    const fwd = bearing(snap.nodeA, snap.nodeB), back = norm360(fwd + 180);
    let pathBearing;
    if (Math.abs(norm180(course - fwd)) <= COURSE_TOL_DEG) pathBearing = fwd;
    else if (Math.abs(norm180(course - back)) <= COURSE_TOL_DEG) pathBearing = back;
    else return null;
    samples = samples.concat(norm180(rawHeadingDeg - pathBearing)).slice(-7);
    if (samples.length < SAMPLES_NEEDED) return null;
    const base = samples[0];
    const rel = samples.map((v) => norm180(v - base)).sort((a, b) => a - b);
    const med = rel[Math.floor(rel.length / 2)];
    const spread = rel.map((v) => Math.abs(v - med)).sort((a, b) => a - b)[Math.floor(rel.length / 2)];
    if (spread > MAX_SPREAD_DEG) return null;
    const target = norm180(base + med), err = norm180(target - offset);
    if (locked && Math.abs(err) < DEADBAND_DEG) return null;
    offset = norm180(locked ? offset + err * STEP : target);
    locked = true;
    return offset;
  }
  return { update, set(deg) { offset = norm180(deg); locked = true; samples = []; }, get offset() { return offset; }, get locked() { return locked; } };
}

// ---------- drawing
const YELLOW = 0xffd100, NAVY = 0x161850;
const basicMat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, depthTest: false, depthWrite: false });

function chevronShape(grow) {
  const g = grow || 0, s = new THREE.Shape();
  s.moveTo(0, 0.5 + g * 1.2); s.lineTo(0.7 + g, -0.2 - g * 0.5); s.lineTo(0.7 + g, -0.6 - g); s.lineTo(0, 0.05 - g * 0.2);
  s.lineTo(-0.7 - g, -0.6 - g); s.lineTo(-0.7 - g, -0.2 - g * 0.5); s.closePath();
  return s;
}
const flatGeo = (shape) => new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);

// Name label: the building name (shrunk to fit, never cut off) and, under it, the live distance. Drawn at 2x so it stays
// sharp when the sprite is scaled up for a far-away building.
function labelSprite(text, accent) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 320;
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.renderOrder = 20;
  sprite.userData.setText = function (name, color, sub) {
    const x = c.getContext('2d'); x.clearRect(0, 0, c.width, c.height);
    x.fillStyle = 'rgba(22,24,80,.92)'; x.beginPath(); x.roundRect(16, 16, 992, 288, 72); x.fill();
    x.lineWidth = 12; x.strokeStyle = color || accent || '#ffd100'; x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    let size = 124;
    do { x.font = '700 ' + size + 'px system-ui, sans-serif'; size -= 4; } while (size > 44 && x.measureText(String(name)).width > 900);
    x.fillStyle = '#ffffff';
    x.fillText(String(name), 512, sub ? 120 : 164);
    if (sub) { x.fillStyle = '#ffd100'; x.font = '700 84px system-ui, sans-serif'; x.fillText(String(sub), 512, 232); }
    tex.needsUpdate = true;
  };
  sprite.userData.setText(text);
  return sprite;
}
const distText = (d) => d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';

function disposeObj(o) {
  o.traverse((n) => {
    if (n.geometry) n.geometry.dispose();
    [].concat(n.material || []).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
  });
}

// ---------- the engine
const E = {
  ready: false,
  _app: null, _locar: null, _filt: gpsFilter(), _ah: autoHeading(),
  _graph: null, _appliedOffset: 0, _corr: null, _last: null, _lastRawFix: null,
  _route: null, _network: null, _beacon: null, _labels: new Map(), _opts: null, _stopGps: null,
  _isIOS: /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1),

  // iOS only grants motion/compass from inside a tap, so the page calls this synchronously in its click handler.
  requestMotion() {
    try {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        return DeviceOrientationEvent.requestPermission().catch(() => 'denied');
      }
    } catch (e) { return Promise.resolve('denied'); }
    return Promise.resolve('granted');
  },

  // opts: { origin:{lat,lng} (projection centre, anywhere on campus), eyeHeight, fov, onFix(raw, filtered, snapped),
  //         onHeadingLock(offsetDeg), onError(msg), onTap(building) }
  async start(opts) {
    if (E.ready) return;
    E._opts = opts;
    const o = opts.origin, lat0 = o.lat, lng0 = o.lng;
    const projection = {   // true local metres; LocAR's default (mercator) stretches distances by 1/cos(lat), about 3% here
      project: (lon, lat) => [rad(lon - lng0) * R * Math.cos(rad(lat0)), rad(lat - lat0) * R],
      unproject: (x, y) => [lng0 + deg(x / (R * Math.cos(rad(lat0)))), lat0 + deg(y / R)],
      getID: () => 'lampara-local-metres'
    };
    E._app = new LocAR.App({
      cameraOptions: { hFov: opts.fov, near: 0.1, far: 4000 },
      // Our own filter decides what to trust before anything reaches LocAR, so LocAR must not drop or hold back any fix.
      gpsOptions: { gpsMinDistance: 0, gpsMinAccuracy: 1000 },
      deviceOrientationOptions: { enabled: true, enablePermissionDialog: false, smoothingFactor: 0.85 },
      projection
    });
    E._locar = await E._app.start();
    // LocAR refuses to place anything ("No initial position determined") until its first accepted GPS reading fixes the
    // world origin. Seed that with the campus centre so the world is ENU metres from `origin`, and buildings, the route and
    // the network can be added at once; the real position then moves the camera inside that world every frame.
    E._locar.fakeGps(o.lng, o.lat, null, 1);
    // LocAR appends its canvas under the page at z-index 999 and its video at -100; pin both full-screen behind the UI.
    const cv = E._app.renderer.domElement;
    cv.style.cssText += ';position:fixed;inset:0;width:100%;height:100%;z-index:0;';
    const vid = document.querySelector('body > video');
    if (vid) vid.style.cssText += ';position:fixed;inset:0;width:100%;height:100%;object-fit:cover;z-index:-100;';
    E._origin = o; E._eye = opts.eyeHeight;
    E._raycaster = new THREE.Raycaster(); E._pointer = new THREE.Vector2();
    const tap = (x, y) => E._pick(x, y);
    cv.addEventListener('click', (e) => tap(e.clientX, e.clientY));
    cv.addEventListener('touchend', (e) => { const t = e.changedTouches && e.changedTouches[0]; if (t) tap(t.clientX, t.clientY); });
    E._startGps();
    E.ready = true;
    requestAnimationFrame(E._loop);
  },

  _startGps() {
    if (!navigator.geolocation) { E._opts.onError && E._opts.onError('Geolocation not supported.'); return; }
    const id = navigator.geolocation.watchPosition((p) => {
      const raw = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp };
      E._lastRawFix = { lat: raw.lat, lng: raw.lng, t: Date.now() };
      // After a QR scan the GPS error at the sign is known; it is subtracted from every later fix.
      const f = E._corr ? { lat: raw.lat - E._corr.lat, lng: raw.lng - E._corr.lng, acc: raw.acc, ts: raw.ts } : raw;
      if (E._refreshWait) E._refreshWait(f);
      if (E._fixWait) E._fixWait(f);
      const ff = E._filt(f);
      E._last = ff;
      const off = E._ah.update(E._graph, ff, E.rawHeading(0.05));
      if (off !== null) { E._applyOffset(off); E._opts.onHeadingLock && E._opts.onHeadingLock(off); }
      E._opts.onFix && E._opts.onFix(raw, ff);
    }, (err) => { E._opts.onError && E._opts.onError('GPS error: ' + err.message); },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    E._stopGps = () => navigator.geolocation.clearWatch(id);
  },

  // ---- compass. LocAR takes yaw from alpha (+ alphaOffset) on Android and from webkitCompassHeading (+ orientationOffset)
  // on iOS, so a correction has to go to the matching one. rawHeading() is the heading with OUR correction taken back out.
  _applyOffset(degrees) {
    E._appliedOffset = degrees;
    const c = E._app.deviceOrientationControls;
    if (E._isIOS) c.orientationOffset = -rad(degrees); else c.alphaOffset = rad(degrees);
  },
  _horizontal(minH) {
    const d = E._app.camera.getWorldDirection(new THREE.Vector3());
    return Math.hypot(d.x, d.z) >= minH;
  },
  rawHeading(minHorizontal) {
    if (!E._app) return null;
    if (minHorizontal && !E._horizontal(minHorizontal)) return null;
    let h; try { h = E._app.deviceOrientationControls.getCorrectedHeading(); } catch (e) { return null; }
    if (h == null) return null;
    return E._isIOS ? norm360(h - E._appliedOffset) : h;
  },
  // Where the camera really points (compass degrees, correction applied). null when the phone is aimed too far up/down.
  heading(minHorizontal) {
    const r = E.rawHeading(minHorizontal);
    return r == null ? null : norm360(r - E._appliedOffset);
  },
  get headingLocked() { return E._ah.locked; },
  get headingOffset() { return E._appliedOffset; },
  // Manual / QR-derived correction: the compass reads `errorDeg` too far clockwise.
  setHeadingOffset(errorDeg) { E._ah.set(errorDeg); E._applyOffset(errorDeg); },

  setGraph(graph) { E._graph = graph; },

  // ---- position
  position() { return E._last; },
  lastRawFix() { return E._lastRawFix; },
  // Snap the position to a trusted spot (scanned QR). `corr` = {lat,lng} GPS error to keep subtracting from later fixes.
  resetPosition(lat, lng, corr) {
    E._corr = corr || E._corr;
    E._last = E._filt.reset({ lat, lng, acc: 1 });
    E._locar.fakeGps(lng, lat, null, 1);
  },
  video() { return document.querySelector('body > video'); },

  // Start-up, like the AR Lab: wait for a good GPS fix (up to `ms`) and start the position filter from it, instead of from the
  // first noisy reading, so the path is laid from where you really are and does not slide while the filter settles.
  // Resolves with { lat, lng, acc } of the best reading, or null when no reading arrived at all. onProgress(best, count).
  waitForFix(ms, goodAcc, onProgress) {
    return new Promise((resolve) => {
      let best = null, n = 0, goodTimer = null;
      const done = () => {
        E._fixWait = null; clearTimeout(timer); clearTimeout(goodTimer);
        if (!best) { resolve(null); return; }
        E._last = E._filt.reset({ lat: best.lat, lng: best.lng, acc: Math.max(best.acc, 3) }, true);
        E._locar.fakeGps(best.lng, best.lat, null, best.acc);
        resolve({ lat: best.lat, lng: best.lng, acc: best.acc });
      };
      const timer = setTimeout(done, ms);
      E._fixWait = (f) => {
        n++; if (!best || f.acc < best.acc) best = f;
        if (onProgress) onProgress(best, n);
        if (best.acc <= goodAcc) {
          if (n >= 2) done();
          else if (!goodTimer) goodTimer = setTimeout(done, 2500);   // a lone reading is not trusted: a second one, or 2.5 s
        }
      };
    });
  },

  // "Refresh path" = recapture where you are. Throws away the drifted estimate and takes a fresh location the way "capture my
  // location" does: it asks the phone for a brand-new reading (and listens to the live ones), ignores anything taken before the
  // tap, and waits up to 10 s for a good one (within +/-10 m, confirmed by a second reading). The position filter then restarts
  // from it (forgetting the learned walking speed, which is what makes a bad estimate keep sailing off), and the chevrons are
  // removed so the page can lay them again from the new spot, flat on the ground. onProgress(best, count) reports each reading.
  // Resolves with { lat, lng, acc, fresh, readings }; fresh=false means no new reading arrived and the old estimate was kept.
  refresh(onProgress) {
    return new Promise((resolve) => {
      const asked = Date.now();
      let best = null, n = 0, goodTimer = null;
      const done = () => {
        E._refreshWait = null; clearTimeout(timer); clearTimeout(goodTimer);
        if (best) {
          E._last = E._filt.reset({ lat: best.lat, lng: best.lng, acc: Math.max(best.acc, 3) }, true);
          E._locar.fakeGps(best.lng, best.lat, null, best.acc); E._shown = null;
        }
        E.clearRoute();
        const pos = E._last || best;
        resolve({ lat: pos.lat, lng: pos.lng, acc: best ? best.acc : pos.acc, fresh: !!best, readings: n });
      };
      const timer = setTimeout(done, 10000);
      const take = (f) => {
        if (f.ts && f.ts < asked - 1000) return;               // taken before the tap: that is the drift we are throwing away
        n++; if (!best || f.acc < best.acc) best = f;
        if (onProgress) onProgress(best, n);
        if (best.acc <= 10) {
          if (n >= 2) done();
          else if (!goodTimer) goodTimer = setTimeout(done, 2500);   // a lone reading is not trusted: a second one, or 2.5 s
        } else if (n >= 8) done();
      };
      E._refreshWait = take;
      // a one-off brand-new reading on top of the live watch (some phones deliver the watch slowly)
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((p) => {
          if (!E._refreshWait) return;
          const raw = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, ts: p.timestamp };
          E._lastRawFix = { lat: raw.lat, lng: raw.lng, t: Date.now() };
          take(E._corr ? { lat: raw.lat - E._corr.lat, lng: raw.lng - E._corr.lng, acc: raw.acc, ts: raw.ts } : raw);
        }, () => { /* the live watch is still listening */ }, { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 });
      }
    });
  },

  // ---- scene content
  _place(obj, lat, lng, y) { E._locar.add(obj, lng, lat, y); },
  _remove(obj) { if (!obj) return; E._app.scene.remove(obj); disposeObj(obj); },

  // Name labels for every building (small, white). Tapping one calls opts.onTap(building).
  setBuildings(list) {
    E._labels.forEach((l) => E._remove(l.group)); E._labels.clear();
    list.forEach((b) => {
      const sprite = labelSprite(b.name, '#ffffff'); sprite.userData.building = b;
      const group = new THREE.Group(); group.add(sprite);
      E._place(group, b.lat, b.lng, 0);
      E._labels.set(b.id, { group, sprite, b, lastText: '' });
    });
    // the chosen building already has its own marker with its name: its plain label must not show as well
    const cur = E._beacon && E._labels.get(E._beacon.userData.b.id);
    if (cur) cur.group.visible = false;
  },

  // The chosen building: a tall beacon with its name and live distance. null clears it.
  setTarget(b) {
    E._remove(E._beacon); E._beacon = null;
    E._labels.forEach((l) => { l.group.visible = true; });
    if (!b) return;
    const l = E._labels.get(b.id); if (l) l.group.visible = false;   // the beacon carries its own label
    const g = new THREE.Group();
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 14, 24, 1, true), basicMat(YELLOW, 0.28));
    pillar.position.y = 7; pillar.renderOrder = 9;
    const base = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 48).rotateX(-Math.PI / 2), basicMat(YELLOW, 0.95));
    base.renderOrder = 10;
    const sprite = labelSprite(b.name); sprite.userData.building = b;
    sprite.scale.set(4.8, 1.5, 1); sprite.position.y = 15.15;
    g.add(pillar, base, sprite);
    E._place(g, b.lat, b.lng, -E._eye);
    E._beacon = g; g.userData = { b, at: { lat: b.lat, lng: b.lng }, base, pillar, sprite, lastText: '' };
  },

  // Moves the destination marker to the end of the route (the entrance), so the path and the marker meet. Small moves are ignored.
  moveTarget(lat, lng) {
    const g = E._beacon; if (!g) return;
    if (distance(g.userData.at, { lat, lng }) < 1.5) return;
    const [x, z] = E._locar.lonLatToWorldCoords(lng, lat);
    g.position.x = x; g.position.z = z;
    g.userData.at = { lat, lng };
  },

  // The route as chevrons on the ground. Rebuilt only when `key` changes or you have strayed >15 m from it.
  // Points flagged `stop` (with a `name`) are the places to reach one by one: only the path to the NEXT one is drawn, and
  // once you reach it the path to the one after appears while the walked part disappears (A > B, then B > C, ...).
  setRoute(points, key) {
    if (E._route && E._route.key === key && (!E._route.tracker.last || E._route.tracker.last.off < 15)) return;
    E.clearRoute();
    if (!points || points.length < 2) return;
    const sm = samplePolyline(points, 3, 90);
    const fillGeo = flatGeo(chevronShape(0)), edgeGeo = flatGeo(chevronShape(0.1));
    const chevrons = [];
    sm.stations.forEach((st) => {
      const obj = new THREE.Group();
      const edge = new THREE.Mesh(edgeGeo, basicMat(NAVY, 0.85)), fill = new THREE.Mesh(fillGeo, basicMat(YELLOW, 0.95));
      edge.renderOrder = 10; fill.renderOrder = 11; fill.position.y = 0.01;
      obj.add(edge, fill); obj.rotation.y = -rad(st.bearing);
      E._place(obj, st.lat, st.lng, -E._eye);
      chevrons.push({ obj, fill, edge, dist: st.dist });
    });
    // where along the route each stop is; the last point always counts, and one right at your feet is skipped
    const cum = [0];
    for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distance(points[i - 1], points[i]));
    const total = cum[cum.length - 1];
    const stops = [];
    points.forEach((p, i) => { if (p.stop && cum[i] >= STOP_REACH_M + 1 && total - cum[i] >= 1) stops.push({ along: cum[i], lat: p.lat, lng: p.lng, name: p.name || '' }); });
    const end = points[points.length - 1];
    stops.push({ along: total, lat: end.lat, lng: end.lng, name: end.name || '', last: true });
    E._route = { key, points, tracker: makeTracker(points), chevrons, geoms: [fillGeo, edgeGeo], stops, next: 0, marker: null };
    E._updateStopMarker();
  },
  // A small marker (ring, short pillar, name and distance) on the NEXT point to reach. Not drawn on the last one: the
  // destination has its own big marker.
  _updateStopMarker() {
    const r = E._route; if (!r) return;
    const st = r.stops[r.next];
    if (!st || st.last) { if (r.marker) r.marker.visible = false; return; }
    if (!r.marker) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 1.1, 40).rotateX(-Math.PI / 2), basicMat(YELLOW, 0.95)); ring.renderOrder = 10;
      const pil = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 6, 16, 1, true), basicMat(YELLOW, 0.3)); pil.position.y = 3; pil.renderOrder = 9;
      const sp = labelSprite(st.name || 'Next point'); sp.scale.set(4, 1.25, 1); sp.position.y = 7;
      g.add(ring, pil, sp);
      E._place(g, st.lat, st.lng, -E._eye);
      r.marker = g; g.userData = { sprite: sp, lastText: '' };
    } else {
      const [x, z] = E._locar.lonLatToWorldCoords(st.lng, st.lat);
      r.marker.position.x = x; r.marker.position.z = z;
      r.marker.userData.lastText = '';
    }
    r.marker.visible = true;
  },
  clearRoute() {
    const r = E._route; if (!r) return;
    r.chevrons.forEach((c) => { E._app.scene.remove(c.obj); c.obj.traverse((n) => { [].concat(n.material || []).forEach((m) => m.dispose()); }); });
    r.geoms.forEach((g) => g.dispose());
    if (r.marker) E._remove(r.marker);
    E._route = null;
  },
  nextStop() { const r = E._route; return r ? { index: r.next, of: r.stops.length, name: r.stops[r.next].name, last: !!r.stops[r.next].last } : null; },
  routeOffMeters() { return E._route && E._route.tracker.last ? E._route.tracker.last.off : null; },
  routeRemaining() { return E._route && E._route.tracker.last ? E._route.tracker.last.remaining : null; },

  // The whole walkway network as one flat ribbon mesh (shown right after a QR scan, before a building is chosen).
  setNetwork(graph) {
    E._remove(E._network); E._network = null;
    if (!graph || !graph.edges.length) return;
    const o = E._origin, byId = new Map(graph.nodes.map((n) => [String(n.id), n]));
    const pos = []; const W = 0.35;
    graph.edges.forEach((e) => {
      const a = byId.get(String(e.node_a_id)), b = byId.get(String(e.node_b_id)); if (!a || !b) return;
      const A = enu(o, a), B = enu(o, b);                 // world x = east, z = -north (matches LocAR's projection)
      const dx = B.e - A.e, dz = -(B.n - A.n), len = Math.hypot(dx, dz) || 1, px = -dz / len * W, pz = dx / len * W;
      const ax = A.e, az = -A.n, bx = B.e, bz = -B.n;
      pos.push(ax - px, 0, az - pz, ax + px, 0, az + pz, bx + px, 0, bz + pz, ax - px, 0, az - pz, bx + px, 0, bz + pz, bx - px, 0, bz - pz);
    });
    const geom = new THREE.BufferGeometry(); geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const mesh = new THREE.Mesh(geom, basicMat(YELLOW, 0.8)); mesh.renderOrder = 8;
    const g = new THREE.Group(); g.add(mesh);
    E._place(g, o.lat, o.lng, -E._eye);
    E._network = g;
  },
  clearNetwork() { E._remove(E._network); E._network = null; },

  _pick(clientX, clientY) {
    const cv = E._app.renderer.domElement, rect = cv.getBoundingClientRect();
    E._pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1; E._pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    E._raycaster.setFromCamera(E._pointer, E._app.camera);
    const sprites = [];
    E._labels.forEach((l) => { if (l.group.visible) sprites.push(l.sprite); });
    if (E._beacon) sprites.push(E._beacon.userData.sprite);
    const hits = E._raycaster.intersectObjects(sprites, false);
    if (hits.length && hits[0].object.userData.building) E._opts.onTap && E._opts.onTap(hits[0].object.userData.building);
  },

  _lastLbl: 0,
  _loop(ms) {
    requestAnimationFrame(E._loop);
    const p = E._filt.predict();            // null until the first real fix has landed
    if (p) {
      let placed = p;
      // Snap onto the route being walked (not any nearby walkway), searching only near how far along we already are.
      const r = E._route;
      if (r) {
        const t = r.tracker.last || r.tracker.update(p);
        const w = r.tracker.project(p, Math.max(0, t.along - 10), Math.min(t.total, t.along + 30));
        if (w && w.off <= 15) placed = r.tracker.pointAt(w.along);
        r.tracker.update(p);
      }
      // Hold the camera still while the estimate only wobbles (GPS jitter slides the whole path under your feet); once it has
      // really moved more than ~1 m, glide to it instead of jumping. The path is fixed in the world, so this is what makes it feel stuck.
      const sh = E._shown;
      if (!sh || distance(sh, placed) > 25) E._shown = { lat: placed.lat, lng: placed.lng };
      else if (distance(sh, placed) > 1) { sh.lat += (placed.lat - sh.lat) * 0.12; sh.lng += (placed.lng - sh.lng) * 0.12; }
      placed = { lat: E._shown.lat, lng: E._shown.lng };
      E._locar.fakeGps(placed.lng, placed.lat, null, p.acc);
      E._placed = placed;
    }
    const r = E._route;
    if (r) {
      const along = r.tracker.last ? r.tracker.last.along : 0, s = ms / 1000;
      // Reached the next point? Then the path to the one after it appears (and the walked part is already hidden).
      let moved = false;
      while (r.next < r.stops.length - 1 && along >= r.stops[r.next].along - STOP_REACH_M) { r.next++; moved = true; }
      if (moved) { E._updateStopMarker(); if (E._opts && E._opts.onStop) E._opts.onStop(r.next, r.stops); }
      const limit = r.stops[r.next].along + 0.5;                            // nothing beyond the next point is drawn yet
      r.chevrons.forEach((c) => {
        c.obj.visible = c.dist > along - 1.5 && c.dist <= limit;            // hide the walked part and the part not yet unlocked
        const pulse = 0.5 + 0.5 * Math.sin((c.dist / 9 - s * 1.1) * Math.PI * 2);
        c.fill.material.opacity = 0.45 + 0.55 * pulse; c.edge.material.opacity = 0.35 + 0.5 * pulse;
      });
    }
    if (E._beacon) E._beacon.userData.base.rotation.y = ms / 1000 * 0.8;
    if (E._placed && ms - E._lastLbl > 400) {
      E._lastLbl = ms;
      const me = E._placed;
      E._labels.forEach((l) => {          // label grows with distance so it stays readable; its bottom stays put
        const d = distance(me, l.b), k = Math.max(1, d / 25);
        l.sprite.scale.set(4.8 * k, 1.5 * k, 1); l.sprite.position.y = 3 + 0.75 * k;
        const txt = distText(d);
        if (txt !== l.lastText) { l.lastText = txt; l.sprite.userData.setText(l.b.name, '#ffffff', txt); }
      });
      const rt = E._route;
      if (rt && rt.marker && rt.marker.visible) {
        const st = rt.stops[rt.next], txt = distText(distance(me, st));
        if (txt !== rt.marker.userData.lastText) { rt.marker.userData.lastText = txt; rt.marker.userData.sprite.userData.setText(st.name || 'Next point', null, txt); }
      }
      const bc = E._beacon;
      if (bc) {
        const d = distance(me, bc.userData.at), k = Math.max(1, d / 25), sp = bc.userData.sprite;
        sp.scale.set(4.8 * k, 1.5 * k, 1); sp.position.y = 14.4 + 0.75 * k;
        const txt = distText(d);
        if (txt !== bc.userData.lastText) { bc.userData.lastText = txt; sp.userData.setText(bc.userData.b.name, null, txt); }
      }
    }
  }
};
E._loop = E._loop.bind(E);
window.LamparaLocar = E;
window.dispatchEvent(new Event('lampara-locar-loaded'));
