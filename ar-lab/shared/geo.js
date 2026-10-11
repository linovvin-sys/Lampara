/* AR Lab — shared geo math + route storage. Classic script (no modules) so every engine page,
   including the 8th Wall one that needs a global THREE, can use it. Exposes window.ARLab. */
(function () {
  'use strict';
  const R = 6371008.8;                       // mean earth radius, m
  const rad = (d) => d * Math.PI / 180;
  const deg = (r) => r * 180 / Math.PI;
  const norm360 = (d) => ((d % 360) + 360) % 360;
  const norm180 = (d) => { d = norm360(d); return d > 180 ? d - 360 : d; };

  // Great-circle distance, metres.
  function distance(a, b) {
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  // Initial compass bearing a -> b, degrees clockwise from true north (0..360).
  function bearing(a, b) {
    const f1 = rad(a.lat), f2 = rad(b.lat), dl = rad(b.lng - a.lng);
    const y = Math.sin(dl) * Math.cos(f2);
    const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
    return norm360(deg(Math.atan2(y, x)));
  }

  // Point `meters` away from `a` along compass `bearingDeg`.
  function destination(a, bearingDeg, meters) {
    const d = meters / R, t = rad(bearingDeg), f1 = rad(a.lat), l1 = rad(a.lng);
    const f2 = Math.asin(Math.sin(f1) * Math.cos(d) + Math.cos(f1) * Math.sin(d) * Math.cos(t));
    const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(f1), Math.cos(d) - Math.sin(f1) * Math.sin(f2));
    return { lat: deg(f2), lng: ((deg(l2) + 540) % 360) - 180 };
  }

  // Flat-earth offset of `p` from `origin`, metres: { e: east, n: north }. Fine below a few km.
  function enu(origin, p) {
    return {
      e: rad(p.lng - origin.lng) * R * Math.cos(rad(origin.lat)),
      n: rad(p.lat - origin.lat) * R
    };
  }

  // Straight-line chevron stations from A to B. Spacing grows on long routes so the scene never
  // holds more than `maxCount` chevrons. Each station is { lat, lng, dist, bearing } (bearing = A->B).
  function sample(a, b, spacing, maxCount) {
    const total = distance(a, b), brg = bearing(a, b);
    spacing = Math.max(spacing || 2.5, total / (maxCount || 60));
    const out = [];
    for (let d = spacing; d < total - 1.5; d += spacing) {
      const p = destination(a, brg, d);
      out.push({ lat: p.lat, lng: p.lng, dist: d, bearing: brg });
    }
    return { stations: out, total, bearing: brg, spacing };
  }


  // Same as sample() but along a polyline of waypoints (a route that follows walkways and turns corners).
  // Each station carries the bearing of the segment it sits on, so chevrons bend around corners.
  function samplePolyline(points, spacing, maxCount) {
    const seg = [], cum = [0];
    for (let i = 0; i < points.length - 1; i++) { const d = distance(points[i], points[i + 1]); seg.push(d); cum.push(cum[i] + d); }
    const total = cum[cum.length - 1];
    spacing = Math.max(spacing || 2.5, total / (maxCount || 60));
    const out = []; let i = 0;
    for (let d = spacing; d < total - 1.5; d += spacing) {
      while (i < seg.length - 1 && cum[i + 1] < d) i++;
      const t = seg[i] ? (d - cum[i]) / seg[i] : 0, a = points[i], b = points[i + 1];
      out.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t, dist: d, bearing: bearing(a, b) });
    }
    return { stations: out, total, bearing: points.length > 1 ? bearing(points[0], points[1]) : 0, spacing };
  }

  // How far is left to walk along `points` from the point nearest to `fix`? { remaining, off } (off = distance from the path).
  function remaining(points, fix) {
    if (!points || points.length < 2) return { remaining: 0, off: 0 };
    const seg = []; let total = 0;
    for (let i = 0; i < points.length - 1; i++) { const d = distance(points[i], points[i + 1]); seg.push(d); total += d; }
    let best = null, before = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const A = enu(fix, points[i]), B = enu(fix, points[i + 1]);          // fix is the origin
      const dx = B.e - A.e, dy = B.n - A.n, l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.e * dx + A.n * dy) / l2));
      const off = Math.hypot(A.e + t * dx, A.n + t * dy);
      if (!best || off < best.off) best = { off, along: before + t * seg[i] };
      before += seg[i];
    }
    return { remaining: Math.max(0, total - best.along), off: best.off };
  }

  // Follows a walker along a route. Unlike remaining() (nearest point, no memory) it remembers how far along the route
  // you are, so a route that doubles back or loops near its own start cannot make you "jump ahead" to the end:
  //   - the first reading may only match the first part of the route (a leg begins where you are);
  //   - after that only a window around the last position is searched (a little backwards, well forward);
  //   - if you really are far from that window (a long GPS jump or a detour) the whole route is searched again.
  // update(fix) -> { along, remaining, off, total }; .last holds the latest result.
  function tracker(points) {
    const seg = [], cum = [0];
    for (let i = 0; i < points.length - 1; i++) { const d = distance(points[i], points[i + 1]); seg.push(d); cum.push(cum[i] + d); }
    const total = cum[cum.length - 1] || 0;
    const tr = { total, last: null };
    let along = 0, started = false;
    function project(fix, lo, hi) {                     // best match whose position along the route lies in [lo, hi]
      let best = null;
      for (let i = 0; i < seg.length; i++) {
        if (cum[i + 1] < lo || cum[i] > hi) continue;
        const A = enu(fix, points[i]), B = enu(fix, points[i + 1]);          // fix is the origin
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
      if (seg.length === 0) return (tr.last = { along: 0, remaining: 0, off: 0, total });
      let b;
      if (!started) { b = project(fix, 0, Math.min(total, 40)); if (!b || b.off > 60) b = project(fix, 0, total); started = true; }
      else {
        b = project(fix, Math.max(0, along - 15), Math.min(total, along + 80));
        if (!b || b.off > 60) { const g = project(fix, 0, total); if (g && (!b || g.off < b.off - 20)) b = g; }
      }
      along = b.along;
      return (tr.last = { along, remaining: Math.max(0, total - along), off: b.off, total });
    };
    // Same windowed match as update(), but it remembers nothing: for asking "where on this route is this
    // position?" more often than the route's own progress should move (a render loop reading a predicted fix).
    tr.project = project;
    // The point `a` metres along the route, for drawing a position that has been snapped onto it.
    tr.pointAt = function (a) {
      if (!seg.length) return { lat: points[0].lat, lng: points[0].lng };
      a = Math.max(0, Math.min(total, a));
      let i = 0; while (i < seg.length - 1 && cum[i + 1] < a) i++;
      const t = seg[i] ? (a - cum[i]) / seg[i] : 0;
      return { lat: points[i].lat + t * (points[i + 1].lat - points[i].lat),
               lng: points[i].lng + t * (points[i + 1].lng - points[i].lng) };
    };
    return tr;
  }

  // ENU offset -> position in a "view" frame whose -Z axis points at heading `viewHeadingDeg` (the
  // compass heading the camera's forward direction had when the frame was fixed). This is how the
  // SLAM engines (8th Wall, WebXR) lay GPS data into their private coordinate space.
  //   x = right, z = -forward. `phiDeg` is the frame's own yaw offset (0 for 8th Wall, measured for WebXR).
  function enuToView(off, compassHeadingDeg, phiDeg) {
    const alpha = Math.atan2(off.e, off.n);                    // compass angle of the offset
    const r = Math.hypot(off.e, off.n);
    const ang = alpha - rad(compassHeadingDeg) + rad(phiDeg || 0);
    return { x: r * Math.sin(ang), z: -r * Math.cos(ang) };
  }

  // Circular mean-style smoothing for compass headings (avoids the 359 -> 0 jump).
  function lerpAngle(cur, target, k) { return norm360(cur + norm180(target - cur) * k); }

  // ----- Route storage: shared by every page through localStorage, or deep-linked with ?a=lat,lng&b=lat,lng
  const KEY = 'arlab.route', RES_KEY = 'arlab.results';
  function parsePair(s) {
    if (!s) return null; const m = String(s).split(',').map(Number);
    return m.length === 2 && isFinite(m[0]) && isFinite(m[1]) && Math.abs(m[0]) <= 90 && Math.abs(m[1]) <= 180 ? { lat: m[0], lng: m[1] } : null;
  }
  function getRoute() {
    const q = new URLSearchParams(location.search);
    const a = parsePair(q.get('a')), b = parsePair(q.get('b'));
    if (a && b) {
      const r = { a, b, label: q.get('label') || 'Point B', mode: q.get('mode') === 'paths' ? 'paths' : 'straight', bNode: q.get('node') ? +q.get('node') : null, live: q.get('live') !== '0' };
      const c = parsePair(q.get('c'));                                  // optional second stop: A -> B -> C
      if (c) { r.c = c; r.cLabel = q.get('cl') || 'Point C'; r.cNode = q.get('cnode') ? +q.get('cnode') : null; }
      return r;
    }
    try { const r = JSON.parse(localStorage.getItem(KEY) || 'null'); if (r && r.a && r.b) return r; } catch (e) { /* none */ }
    return null;
  }
  function setRoute(r) { try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) { /* private mode */ } }
  function clearRoute() { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
  function getResults() { try { return JSON.parse(localStorage.getItem(RES_KEY) || '[]'); } catch (e) { return []; } }
  function addResult(r) { const all = getResults(); all.push(r); try { localStorage.setItem(RES_KEY, JSON.stringify(all)); } catch (e) { /* ignore */ } }
  function clearResults() { try { localStorage.removeItem(RES_KEY); } catch (e) { /* ignore */ } }

  // Ground clearance + camera FOV tuning, same URL knobs the main app uses (?h= and ?fov=).
  function numParam(name, lo, hi, dflt) {
    try { const v = parseFloat(new URLSearchParams(location.search).get(name)); if (v > lo && v < hi) return v; } catch (e) { /* default */ }
    return dflt;
  }

  window.ARLab = Object.assign(window.ARLab || {}, {
    geo: { distance, bearing, destination, enu, sample, samplePolyline, remaining, tracker, enuToView, lerpAngle, norm360, norm180, rad, deg },
    route: {
      get: getRoute, set: setRoute, clear: clearRoute,
      // metres still to walk: along the resolved walkway route if there is one, else straight to B
      remaining: (r, fix) => r.points && r.points.length > 1 ? remaining(r.points, fix).remaining : distance(fix, r.b)
    },
    results: { get: getResults, add: addResult, clear: clearResults },
    cfg: {
      eyeHeight: numParam('h', 0.5, 2.5, 1.6),      // phone height above the ground, m
      longFov: numParam('fov', 20, 120, 67),        // phone camera field of view across its long side, deg
      spacing: numParam('gap', 1, 10, 3),           // chevron spacing, m
      arrive: numParam('arrive', 1, 40, 3),         // how close to a stop counts as reaching it, m: you have to be standing on it
      headingSmooth: numParam('hsmooth', 0.2, 0.98, 0.85),  // device-orientation smoothing: higher = less jitter, more lag
      xrScale: numParam('xrscale', 0.5, 1.5, 1)             // WebXR framebuffer scale: below 1 renders fewer pixels when a phone struggles
    }
  });
})();
