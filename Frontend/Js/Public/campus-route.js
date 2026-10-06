// Outdoor walkway routing — pure functions, no DOM/AR dependencies, so this can
// be exercised without a camera. Loaded as a plain <script>; exposes `CampusRoute`.
//
// Graph shape (from Backend/api/campus-graph.php):
//   nodes: [{ id, lat, lng, node_type }]   edges: [{ id, node_a_id, node_b_id }]
//
// The user's GPS point is projected onto the nearest walkway segment (the same
// idea as projectOntoGraph in scan.js for floor plans), then Dijkstra runs from
// that point to the destination building's entrance node. The result is a list
// of GPS points that only ever travel along drawn walkways.

const CampusRoute = (() => {
  const M_PER_DEG = 111320;

  // Local flat-earth frame around `ref` — fine at campus scale (a few hundred m).
  function toXY(p, ref) {
    return {
      x: (p.lng - ref.lng) * M_PER_DEG * Math.cos(ref.lat * Math.PI / 180),
      y: (p.lat - ref.lat) * M_PER_DEG
    };
  }

  function meters(a, b) {
    const p = toXY(b, a);
    return Math.hypot(p.x, p.y);
  }

  // Closest point on the closest edge: { lat, lng, dist, nodeA, nodeB }.
  function snapToGraph(pos, nodes, edges) {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    let best = null;
    edges.forEach((e) => {
      const a = byId.get(e.node_a_id), b = byId.get(e.node_b_id);
      if (!a || !b) return;
      const A = toXY(a, pos), B = toXY(b, pos); // pos is the origin, so P = (0,0)
      const dx = B.x - A.x, dy = B.y - A.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.x * dx + A.y * dy) / len2));
      const cx = A.x + t * dx, cy = A.y + t * dy;
      const dist = Math.hypot(cx, cy);
      if (!best || dist < best.dist) {
        best = { lat: a.lat + t * (b.lat - a.lat), lng: a.lng + t * (b.lng - a.lng), dist, nodeA: a, nodeB: b };
      }
    });
    return best;
  }

  // Returns { points: [{lat,lng}...], length, snapDist } or null when there is
  // no graph / no such node / no connected path. points[0] is where the user
  // joins the walkway network, the last point is the entrance node.
  function findRoute(graph, from, endNodeId) {
    const { nodes, edges } = graph;
    if (!nodes.length || !edges.length) return null;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const end = byId.get(endNodeId);
    if (!end) return null;
    const snap = snapToGraph(from, nodes, edges);
    if (!snap) return null;

    const START = 'start';
    const adj = new Map(nodes.map((n) => [n.id, []]));
    adj.set(START, []);
    const link = (a, b, d) => { adj.get(a).push({ id: b, d }); adj.get(b).push({ id: a, d }); };
    edges.forEach((e) => {
      const a = byId.get(e.node_a_id), b = byId.get(e.node_b_id);
      if (a && b) link(a.id, b.id, meters(a, b));
    });
    link(START, snap.nodeA.id, meters(snap, snap.nodeA));
    link(START, snap.nodeB.id, meters(snap, snap.nodeB));

    // Plain O(n²) Dijkstra — a campus graph is a few dozen nodes.
    const dist = new Map([...adj.keys()].map((id) => [id, Infinity]));
    const prev = new Map();
    const done = new Set();
    dist.set(START, 0);
    while (done.size < dist.size) {
      let cur = null, curD = Infinity;
      dist.forEach((d, id) => { if (!done.has(id) && d < curD) { cur = id; curD = d; } });
      if (cur === null || cur === end.id) break;
      done.add(cur);
      adj.get(cur).forEach(({ id, d }) => {
        if (curD + d < dist.get(id)) { dist.set(id, curD + d); prev.set(id, cur); }
      });
    }
    if (dist.get(end.id) === Infinity) return null;

    const ids = [end.id];
    while (ids[0] !== START) ids.unshift(prev.get(ids[0]));
    const points = ids.map((id) => id === START ? { lat: snap.lat, lng: snap.lng } : { lat: byId.get(id).lat, lng: byId.get(id).lng });
    return { points, length: dist.get(end.id), snapDist: snap.dist };
  }

  // First real corner along the route: { dir: 'left'|'right'|null, distance }.
  // dir is null when the rest of the route is effectively straight.
  function nextTurn(points, minAngle = 35) {
    if (points.length < 3) return { dir: null, distance: 0 };
    const xy = points.map((p) => toXY(p, points[0]));
    const bearing = (a, b) => Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI;
    let walked = 0;
    for (let i = 1; i < xy.length - 1; i++) {
      walked += Math.hypot(xy[i].x - xy[i - 1].x, xy[i].y - xy[i - 1].y);
      const delta = ((bearing(xy[i], xy[i + 1]) - bearing(xy[i - 1], xy[i]) + 540) % 360) - 180;
      if (Math.abs(delta) >= minAngle) return { dir: delta > 0 ? 'right' : 'left', distance: walked };
    }
    return { dir: null, distance: 0 };
  }

  // Rounds off corners of an {x,y} polyline (quadratic curve through each
  // vertex) so the ground ribbon bends instead of kinking.
  function smooth(pts, radius = 3, samples = 6) {
    if (pts.length < 3) return pts.slice();
    const out = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const p0 = pts[i - 1], p1 = pts[i], p2 = pts[i + 1];
      const l1 = Math.hypot(p0.x - p1.x, p0.y - p1.y), l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (l1 === 0 || l2 === 0) { out.push(p1); continue; }
      const d1 = Math.min(radius, l1 / 2), d2 = Math.min(radius, l2 / 2);
      const a = { x: p1.x + (p0.x - p1.x) / l1 * d1, y: p1.y + (p0.y - p1.y) / l1 * d1 };
      const b = { x: p1.x + (p2.x - p1.x) / l2 * d2, y: p1.y + (p2.y - p1.y) / l2 * d2 };
      for (let s = 0; s <= samples; s++) {
        const t = s / samples, u = 1 - t;
        out.push({ x: u * u * a.x + 2 * u * t * p1.x + t * t * b.x, y: u * u * a.y + 2 * u * t * p1.y + t * t * b.y });
      }
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  // Keeps only the first `maxLen` meters of an {x,y} polyline.
  function truncate(pts, maxLen) {
    const out = [pts[0]];
    let walked = 0;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      if (walked + seg >= maxLen) {
        const t = seg === 0 ? 0 : (maxLen - walked) / seg;
        out.push({ x: pts[i - 1].x + t * (pts[i].x - pts[i - 1].x), y: pts[i - 1].y + t * (pts[i].y - pts[i - 1].y) });
        return out;
      }
      walked += seg;
      out.push(pts[i]);
    }
    return out;
  }

  return { toXY, meters, snapToGraph, findRoute, nextTurn, smooth, truncate };
})();

if (typeof module !== 'undefined') module.exports = CampusRoute;
