/* AR Lab — routing over the admin "Campus Paths" walkway graph.
   Reads the SAME data the admin draws (Backend/api/campus-graph.php nodes + edges, and each building's entrance node
   from Backend/api/buildings.php) with read-only GET requests, and finds the shortest walk with Dijkstra: the same method
   as Frontend/Js/Public/campus-route.js in the main app, re-implemented here so this folder stays independent of it.

   resolve(route) turns { a, b, mode:'paths', bNode } into the same route plus
     points  [{lat,lng}...]  the walk: from A, over the walkways, to B's node
     length  metres
     snapDist / joinedAt     how far A is from the nearest walkway, and where the walk joins it
   and falls back to a straight line (route.fallback explains why) when there is no usable graph. */
(function () {
  'use strict';
  const base = document.currentScript ? new URL('../../Backend/api/', document.currentScript.src).href : '../../Backend/api/';
  let cache = null;

  async function load(force) {
    if (cache && !force) return cache;
    const get = (f) => fetch(base + f, { cache: 'no-store' }).then((r) => r.json());
    const [g, b] = await Promise.all([get('campus-graph.php'), get('buildings.php').catch(() => ({ buildings: [] }))]);
    if (!g || !g.success) throw new Error('Could not read the campus walkway graph');
    cache = { nodes: g.nodes || [], edges: g.edges || [], buildings: (b && b.buildings) || [] };
    return cache;
  }

  const M = 111320;
  const xy = (p, ref) => ({ x: (p.lng - ref.lng) * M * Math.cos(ref.lat * Math.PI / 180), y: (p.lat - ref.lat) * M });
  const dist = (a, b) => { const p = xy(b, a); return Math.hypot(p.x, p.y); };

  // Closest point on any walkway to `pos`: { lat, lng, dist, a, b } (a, b = the edge's nodes).
  function snap(pos, g) {
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    let best = null;
    g.edges.forEach((e) => {
      const a = byId.get(e.node_a_id), b = byId.get(e.node_b_id); if (!a || !b) return;
      const A = xy(a, pos), B = xy(b, pos), dx = B.x - A.x, dy = B.y - A.y, l2 = dx * dx + dy * dy;
      const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.x * dx + A.y * dy) / l2));
      const d = Math.hypot(A.x + t * dx, A.y + t * dy);
      if (!best || d < best.dist) best = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng), dist: d, a, b };
    });
    return best;
  }

  function nearestNode(pos, g) {
    let best = null;
    g.nodes.forEach((n) => { const d = dist(pos, n); if (!best || d < best.dist) best = { node: n, dist: d }; });
    return best;
  }

  // Shortest walk from `from` (snapped onto the nearest walkway) to `target`, which is either a walkway node id or a free
  // point { lat, lng } such as "where I am standing". A free point is snapped onto the nearest walkway too, and the walk
  // finishes with a short straight connector to the exact spot. Returns { points, length, snapDist, endSnapDist, joined } or null.
  function findRoute(g, from, target) {
    if (!g.edges.length) return null;
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const isPoint = target !== null && typeof target === 'object';
    const s = snap(from, g); if (!s) return null;
    const e2 = isPoint ? snap(target, g) : null;
    if (isPoint && !e2) return null;
    if (!isPoint && !byId.get(target)) return null;
    const START = 'start', END = isPoint ? 'end' : target;
    const adj = new Map(g.nodes.map((n) => [n.id, []])); adj.set(START, []); if (isPoint) adj.set(END, []);
    const link = (a, b, d) => { adj.get(a).push({ id: b, d }); adj.get(b).push({ id: a, d }); };
    g.edges.forEach((e) => { const a = byId.get(e.node_a_id), b = byId.get(e.node_b_id); if (a && b) link(a.id, b.id, dist(a, b)); });
    link(START, s.a.id, dist(s, s.a)); link(START, s.b.id, dist(s, s.b));
    if (isPoint) {
      link(END, e2.a.id, dist(e2, e2.a)); link(END, e2.b.id, dist(e2, e2.b));
      if (s.a.id === e2.a.id && s.b.id === e2.b.id) link(START, END, dist(s, e2));       // both on the same stretch of walkway
    }
    const d = new Map([...adj.keys()].map((k) => [k, Infinity])), prev = new Map(), done = new Set(); d.set(START, 0);
    while (done.size < d.size) {
      let cur = null, cd = Infinity; d.forEach((v, k) => { if (!done.has(k) && v < cd) { cur = k; cd = v; } });
      if (cur === null || cur === END) break; done.add(cur);
      adj.get(cur).forEach(({ id, d: w }) => { if (cd + w < d.get(id)) { d.set(id, cd + w); prev.set(id, cur); } });
    }
    if (d.get(END) === Infinity) return null;
    const ids = [END]; while (ids[0] !== START) ids.unshift(prev.get(ids[0]));
    const points = ids.map((id) => id === START ? { lat: s.lat, lng: s.lng } : id === 'end' && isPoint ? { lat: e2.lat, lng: e2.lng } : { lat: byId.get(id).lat, lng: byId.get(id).lng });
    let length = d.get(END);
    if (isPoint && e2.dist > 2) { points.push({ lat: target.lat, lng: target.lng }); length += e2.dist; }
    return { points, length, snapDist: s.dist, endSnapDist: e2 ? e2.dist : 0, joined: { lat: s.lat, lng: s.lng } };
  }

  // One leg: from `a` to `b` (following the walkways when mode is 'paths'). Never throws; falls back to a straight line.
  async function resolveLeg(a, b, mode, nodeId, label) {
    const straight = (why) => ({ a, b, label, points: [a, b], length: dist(a, b), fallback: why || null, snapDist: null });
    if (mode !== 'paths') return straight(null);
    let g; try { g = await load(); } catch (e) { return straight('The walkway graph could not be loaded (' + e.message + '). Using a straight line.'); }
    if (!g.nodes.length) return straight('No walkway points exist. Using a straight line.');
    // a walkway dot goes to that node; any other point (for example "my location") goes to the nearest walkway, then a short connector
    const r = findRoute(g, a, nodeId || { lat: b.lat, lng: b.lng });
    if (!r) return straight('No connected walkway leads to ' + label + '. Using a straight line for that part.');
    const pts = r.points.slice();
    if (r.snapDist > 2) pts.unshift({ lat: a.lat, lng: a.lng });   // straight connector from where you stand to the walkway
    const end = pts[pts.length - 1];
    return { a, b: { lat: end.lat, lng: end.lng }, label, points: pts, length: r.length + (r.snapDist > 2 ? r.snapDist : 0), snapDist: r.snapDist, endSnapDist: r.endSnapDist, joined: r.joined, fallback: null };
  }

  // route { a, b, label, mode, bNode, c?, cLabel?, cNode? } -> the same route plus
  //   legs   [ leg A->B, leg B->C (only when c is set) ]; each leg is { a, b, label, points, length, fallback, snapDist }
  //   points / length / b / fallback / snapDist  describe the FIRST leg (what single-stop code reads)
  //   total  metres over all legs
  async function resolve(route) {
    const legs = [await resolveLeg(route.a, route.b, route.mode, route.bNode, route.label || 'Point B')];
    if (route.c) legs.push(await resolveLeg(legs[0].b, route.c, route.mode, route.cNode, route.cLabel || 'Point C'));
    // further stops (D, E, ...): route.more = [{ lat, lng, node, label }], each leg starts where the previous one ended
    for (const [i, m] of (route.c ? route.more || [] : []).entries()) {
      legs.push(await resolveLeg(legs[legs.length - 1].b, { lat: m.lat, lng: m.lng }, route.mode, m.node || null, m.label || 'Point ' + String.fromCharCode(68 + i)));
    }
    const first = legs[0];
    return Object.assign({}, route, {
      legs, total: legs.reduce((s, l) => s + l.length, 0),
      points: first.points, length: first.length, b: first.b, snapDist: first.snapDist, joined: first.joined,
      fallback: legs.map((l) => l.fallback).filter(Boolean)[0] || null
    });
  }

  window.ARLab = Object.assign(window.ARLab || {}, { campus: { load, snap, nearestNode, findRoute, resolve } });
})();
