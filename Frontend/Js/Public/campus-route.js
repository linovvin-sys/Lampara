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

  // Shortest walk from `from` (snapped onto the nearest walkway) to `target`, which is either a walkway node id (a building's
  // entrance) or a free point { lat, lng } (a building with no entrance set, or "where I am standing"). A free point is
  // snapped onto the nearest walkway too, and the walk finishes with a short straight connector to the exact spot. This is
  // the same routing the AR Lab uses. Returns { points: [{lat,lng}...], length, snapDist, endSnapDist } or null when there is
  // no graph / no such node / no connected path. points[0] is where the user joins the walkway network.
  function findRoute(graph, from, target) {
    const { nodes, edges } = graph;
    if (!nodes.length || !edges.length) return null;
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const isPoint = target !== null && typeof target === 'object';
    const s = snapToGraph(from, nodes, edges);
    if (!s) return null;
    const e2 = isPoint ? snapToGraph(target, nodes, edges) : null;
    if (isPoint && !e2) return null;
    if (!isPoint && !byId.get(target)) return null;
    const START = 'start', END = isPoint ? 'end' : target;

    const adj = new Map(nodes.map((n) => [n.id, []]));
    adj.set(START, []);
    if (isPoint) adj.set(END, []);
    const link = (x, y, d) => { adj.get(x).push({ id: y, d }); adj.get(y).push({ id: x, d }); };
    edges.forEach((e) => {
      const x = byId.get(e.node_a_id), y = byId.get(e.node_b_id);
      if (x && y) link(x.id, y.id, meters(x, y));
    });
    link(START, s.nodeA.id, meters(s, s.nodeA));
    link(START, s.nodeB.id, meters(s, s.nodeB));
    if (isPoint) {
      link(END, e2.nodeA.id, meters(e2, e2.nodeA));
      link(END, e2.nodeB.id, meters(e2, e2.nodeB));
      // both on the same stretch of walkway: no node in between
      if (s.nodeA.id === e2.nodeA.id && s.nodeB.id === e2.nodeB.id) link(START, END, meters(s, e2));
    }

    // Plain O(n^2) Dijkstra: a campus graph is a few dozen nodes.
    const dist = new Map([...adj.keys()].map((id) => [id, Infinity]));
    const prev = new Map();
    const done = new Set();
    dist.set(START, 0);
    while (done.size < dist.size) {
      let cur = null, curD = Infinity;
      dist.forEach((d, id) => { if (!done.has(id) && d < curD) { cur = id; curD = d; } });
      if (cur === null || cur === END) break;
      done.add(cur);
      adj.get(cur).forEach(({ id, d }) => {
        if (curD + d < dist.get(id)) { dist.set(id, curD + d); prev.set(id, cur); }
      });
    }
    if (dist.get(END) === Infinity) return null;

    const ids = [END];
    while (ids[0] !== START) ids.unshift(prev.get(ids[0]));
    const points = ids.map((id) => id === START ? { lat: s.lat, lng: s.lng }
      : (id === 'end' && isPoint) ? { lat: e2.lat, lng: e2.lng }
      : { lat: byId.get(id).lat, lng: byId.get(id).lng, id, name: byId.get(id).name || '' });   // a walkway point keeps its id and name
    let length = dist.get(END);
    if (isPoint && e2.dist > 2) { points.push({ lat: target.lat, lng: target.lng }); length += e2.dist; }
    return { points, length, snapDist: s.dist, endSnapDist: e2 ? e2.dist : 0 };
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

  // ---- the campus gates: which side is which (shared by the AR guide and the Campus Paths admin page) ----
  // A building whose name matches OUTSIDE_BUILDING_RE stands outside the campus gates (Heritage Building, JEG Building).
  // The walkway point whose name matches MAIN_ENTRANCE_RE is the one way in for people coming from outside.
  // A gate point whose name matches VEHICLE_GATE_RE is a vehicle gate (e.g. "Vehicle Exit"); on foot it is only chosen when it
  // clearly saves VEHICLE_GATE_PENALTY_M over the other gate.
  const OUTSIDE_BUILDING_RE = /heritage|\bjeg\b/i;
  const MAIN_ENTRANCE_RE = /main\s*entrance/i;
  const EXIT_RE = /exit|\bout\b/i;
  const VEHICLE_GATE_RE = /vehicle|car\b|truck|service|delivery/i;
  const VEHICLE_GATE_PENALTY_M = 40;
  const isOutsideBuilding = (b) => OUTSIDE_BUILDING_RE.test((b && b.name) || '');
  const gateKind = (name) => (VEHICLE_GATE_RE.test(name || '') ? 'vehicle' : 'main');
  // A gate whose name says entrance (and not exit) is for coming in only: it is not offered as the way out.
  const entranceOnly = (name) => /entr/i.test(name || '') && !EXIT_RE.test(name || '');

  // The two sides of the gates, worked out from the drawn walkways. The "portals" are the gate points and the main entrance.
  // The OUTSIDE walkways are the ones reachable from an outside building without going through a portal; everything else
  // (the portals included) is inside. Returns { portals, mainEntrance, outsideNodes, insideNodes, outsideBuildingIds }
  // (node ids as they are in the graph; building ids as strings).
  function regions(graph, buildings) {
    const nodes = graph.nodes, edges = graph.edges;
    const portals = new Set(nodes.filter((n) => n.node_type === 'gate').map((n) => n.id));
    // The way in for people on foot: the point named "Main Entrance"; failing that a human gate (never a vehicle gate), preferring
    // one that says entrance or main and one that does not say exit. If the only human gate is called an exit, it is still the only
    // way in (people use the same gate both ways), but it is flagged so the screen does not tell anyone to go "in through the exit".
    const humanGates = nodes.filter((n) => n.node_type === 'gate' && !VEHICLE_GATE_RE.test(n.name || ''));
    const notExit = humanGates.filter((n) => !EXIT_RE.test(n.name || ''));
    const mainEntrance = nodes.find((n) => MAIN_ENTRANCE_RE.test(n.name || ''))
      || notExit.find((n) => /entr|main/i.test(n.name || '')) || notExit[0] || humanGates[0] || null;
    if (mainEntrance) portals.add(mainEntrance.id);
    const adj = new Map(nodes.map((n) => [n.id, []]));
    edges.forEach((e) => { if (adj.has(e.node_a_id) && adj.has(e.node_b_id)) { adj.get(e.node_a_id).push(e.node_b_id); adj.get(e.node_b_id).push(e.node_a_id); } });
    const outsideB = (buildings || []).filter(isOutsideBuilding);
    const near = (b) => { let best = null; nodes.forEach((n) => { const d = meters(n, b); if (!best || d < best.d) best = { id: n.id, d }; }); return best ? best.id : null; };
    const seeds = outsideB.map((b) => (b.entrance_node_id !== null && b.entrance_node_id !== undefined ? b.entrance_node_id : near(b))).filter((x) => x !== null && adj.has(x));
    const outsideNodes = new Set(), stack = [];
    seeds.forEach((x) => { if (!portals.has(x) && !outsideNodes.has(x)) { outsideNodes.add(x); stack.push(x); } });
    while (stack.length) {
      const c = stack.pop();
      adj.get(c).forEach((o) => { if (!portals.has(o) && !outsideNodes.has(o)) { outsideNodes.add(o); stack.push(o); } });
    }
    const insideNodes = new Set(nodes.filter((n) => !outsideNodes.has(n.id)).map((n) => n.id));
    return { portals, mainEntrance, outsideNodes, insideNodes, outsideBuildingIds: new Set(outsideB.map((b) => String(b.id))) };
  }
  // A copy of the graph limited to some points (and the connections between them).
  function subGraph(graph, ids) {
    return { nodes: graph.nodes.filter((n) => ids.has(n.id)), edges: graph.edges.filter((e) => ids.has(e.node_a_id) && ids.has(e.node_b_id)) };
  }

  return { toXY, meters, snapToGraph, findRoute, nextTurn, smooth, truncate, regions, subGraph, isOutsideBuilding, gateKind, entranceOnly, EXIT_RE, VEHICLE_GATE_PENALTY_M, OUTSIDE_BUILDING_RE, MAIN_ENTRANCE_RE };
})();

if (typeof module !== 'undefined') module.exports = CampusRoute;
