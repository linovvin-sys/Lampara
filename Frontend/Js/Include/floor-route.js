// Walkable-graph routing over a floor plan (plan coordinates are 0-100 percentages).
// Shared by the scan result screen (draws the route on the plan image) and the
// indoor AR guide (walks the same route in the camera view). Plain <script>, globals.

// Closest point on segment A-B to point P, clamped to the segment itself
// (not the infinite line) — standard vector projection.
function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return { x: ax + t * dx, y: ay + t * dy };
}

// Where a point (a room's own pin) actually joins the walkable graph: the
// closest point on the closest EDGE, not the closest node. Snapping to the
// nearest full junction could be arbitrarily far down the corridor from the
// room's actual door; snapping to the nearest point on the nearest corridor
// segment gives a short, direct "spur" instead — no per-room linking needed,
// any room with a marker just plugs into whatever's nearest.
function projectOntoGraph(point, nodes, edges) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let best = null;
  edges.forEach((e) => {
    const a = byId.get(e.node_a_id), b = byId.get(e.node_b_id);
    if (!a || !b) return;
    const proj = closestPointOnSegment(point.x, point.y, a.x, a.y, b.x, b.y);
    const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
    if (!best || dist < best.dist) best = { x: proj.x, y: proj.y, dist, nodeA: a, nodeB: b };
  });
  return best;
}

// Generic Dijkstra over an adjacency map (id -> [{id, dist}]) — small graph
// (a floor's worth of junctions plus two virtual endpoints), plain O(n^2)
// is more than fast enough, no library needed.
function dijkstra(nodeIds, neighbors, startId, endId) {
  const dist = new Map(nodeIds.map((id) => [id, Infinity]));
  const prev = new Map();
  const visited = new Set();
  dist.set(startId, 0);
  while (visited.size < nodeIds.length) {
    let currentId = null, currentDist = Infinity;
    for (const [id, d] of dist) {
      if (!visited.has(id) && d < currentDist) { currentId = id; currentDist = d; }
    }
    if (currentId === null || currentId === endId) break;
    visited.add(currentId);
    (neighbors.get(currentId) || []).forEach(({ id, dist: edgeDist }) => {
      const alt = currentDist + edgeDist;
      if (alt < dist.get(id)) { dist.set(id, alt); prev.set(id, currentId); }
    });
  }
  if (startId !== endId && !prev.has(endId)) return null;
  const path = [endId];
  let cur = endId;
  while (cur !== startId) {
    cur = prev.get(cur);
    if (cur === undefined) return null;
    path.unshift(cur);
  }
  return path;
}

// Full route between two arbitrary points (room pins) over the walkable
// graph: project each pin onto the nearest point on the nearest corridor
// segment, route between those two projected points through the graph
// (with a direct shortcut when they land on the same segment), then hand
// back the actual pin-to-pin point list ready to draw as a polyline.
function routeBetweenPoints(nodes, edges, startPoint, endPoint) {
  if (!edges.length) return null;
  const startProj = projectOntoGraph(startPoint, nodes, edges);
  const endProj = projectOntoGraph(endPoint, nodes, edges);
  if (!startProj || !endProj) return null;

  const neighbors = new Map();
  const addEdge = (idA, idB, dist) => {
    if (!neighbors.has(idA)) neighbors.set(idA, []);
    if (!neighbors.has(idB)) neighbors.set(idB, []);
    neighbors.get(idA).push({ id: idB, dist });
    neighbors.get(idB).push({ id: idA, dist });
  };
  edges.forEach((e) => {
    const a = nodes.find((n) => n.id === e.node_a_id), b = nodes.find((n) => n.id === e.node_b_id);
    if (a && b) addEdge(e.node_a_id, e.node_b_id, Math.hypot(a.x - b.x, a.y - b.y));
  });
  const START = '__start__', END = '__end__';
  addEdge(START, startProj.nodeA.id, Math.hypot(startProj.x - startProj.nodeA.x, startProj.y - startProj.nodeA.y));
  addEdge(START, startProj.nodeB.id, Math.hypot(startProj.x - startProj.nodeB.x, startProj.y - startProj.nodeB.y));
  addEdge(END, endProj.nodeA.id, Math.hypot(endProj.x - endProj.nodeA.x, endProj.y - endProj.nodeA.y));
  addEdge(END, endProj.nodeB.id, Math.hypot(endProj.x - endProj.nodeB.x, endProj.y - endProj.nodeB.y));
  // Both pins snap to the same corridor segment — a direct shortcut along
  // it is always at least as short as detouring via either endpoint node.
  const sameSegment = (startProj.nodeA.id === endProj.nodeA.id && startProj.nodeB.id === endProj.nodeB.id) ||
                       (startProj.nodeA.id === endProj.nodeB.id && startProj.nodeB.id === endProj.nodeA.id);
  if (sameSegment) addEdge(START, END, Math.hypot(startProj.x - endProj.x, startProj.y - endProj.y));

  const nodeIds = [...nodes.map((n) => n.id), START, END];
  const ids = dijkstra(nodeIds, neighbors, START, END);
  if (!ids) return null;

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const coords = { [START]: startProj, [END]: endProj };
  return [startPoint, ...ids.map((id) => coords[id] || byId.get(id)), endPoint];
}

// A cross-floor edge (its two nodes live on different floor plan images, so
// their x/y aren't in the same coordinate space — a Euclidean distance
// between them would be meaningless) gets this flat cost instead, standing
// in for "walk up/down one flight." It's deliberately mid-sized on the same
// 0-100 percentage scale same-floor distances use: cheap enough that a real
// stairs link still gets used, expensive enough that a same-floor shortcut
// always wins over needlessly leaving the floor.
const VERTICAL_CROSSING_COST = 25;

// Routes between two rooms that may be on DIFFERENT floors of the same
// building. Subsumes the same-floor case (routeBetweenPoints) — if start and
// end land on the same floor, the shortest path just never crosses a
// cross-floor edge, since VERTICAL_CROSSING_COST is never worth paying
// twice for no reason. Returns an ORDERED LIST OF SEGMENTS, one per floor
// the route touches: [{ floorPlanId, points: [{x,y}, ...] }, ...] — each
// segment is drawn as its own polyline on its own floor plan image, with a
// "take the stairs" transition between segments. Null if unreachable.
function routeAcrossFloors(nodes, edges, startPoint, startFloorPlanId, endPoint, endFloorPlanId) {
  if (!edges.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  function edgeWeight(e) {
    const a = byId.get(e.node_a_id), b = byId.get(e.node_b_id);
    if (!a || !b) return null;
    return a.floor_plan_id !== b.floor_plan_id ? VERTICAL_CROSSING_COST : Math.hypot(a.x - b.x, a.y - b.y);
  }

  // A pin's coordinates only make sense on its OWN floor's image — only
  // consider edges fully within that one floor plan when snapping it in.
  function projectOnFloor(point, floorPlanId) {
    let best = null;
    edges.forEach((e) => {
      const a = byId.get(e.node_a_id), b = byId.get(e.node_b_id);
      if (!a || !b || a.floor_plan_id !== floorPlanId || b.floor_plan_id !== floorPlanId) return;
      const proj = closestPointOnSegment(point.x, point.y, a.x, a.y, b.x, b.y);
      const dist = Math.hypot(point.x - proj.x, point.y - proj.y);
      if (!best || dist < best.dist) best = { x: proj.x, y: proj.y, dist, nodeA: a, nodeB: b };
    });
    return best;
  }

  const startProj = projectOnFloor(startPoint, startFloorPlanId);
  const endProj = projectOnFloor(endPoint, endFloorPlanId);
  if (!startProj || !endProj) return null;

  const neighbors = new Map();
  const addEdge = (idA, idB, dist) => {
    if (!neighbors.has(idA)) neighbors.set(idA, []);
    if (!neighbors.has(idB)) neighbors.set(idB, []);
    neighbors.get(idA).push({ id: idB, dist });
    neighbors.get(idB).push({ id: idA, dist });
  };
  edges.forEach((e) => {
    const w = edgeWeight(e);
    if (w !== null) addEdge(e.node_a_id, e.node_b_id, w);
  });
  const START = '__start__', END = '__end__';
  addEdge(START, startProj.nodeA.id, Math.hypot(startProj.x - startProj.nodeA.x, startProj.y - startProj.nodeA.y));
  addEdge(START, startProj.nodeB.id, Math.hypot(startProj.x - startProj.nodeB.x, startProj.y - startProj.nodeB.y));
  addEdge(END, endProj.nodeA.id, Math.hypot(endProj.x - endProj.nodeA.x, endProj.y - endProj.nodeA.y));
  addEdge(END, endProj.nodeB.id, Math.hypot(endProj.x - endProj.nodeB.x, endProj.y - endProj.nodeB.y));
  const sameSegment = startFloorPlanId === endFloorPlanId &&
    ((startProj.nodeA.id === endProj.nodeA.id && startProj.nodeB.id === endProj.nodeB.id) ||
     (startProj.nodeA.id === endProj.nodeB.id && startProj.nodeB.id === endProj.nodeA.id));
  if (sameSegment) addEdge(START, END, Math.hypot(startProj.x - endProj.x, startProj.y - endProj.y));

  const nodeIds = [...nodes.map((n) => n.id), START, END];
  const ids = dijkstra(nodeIds, neighbors, START, END);
  if (!ids) return null;

  const sequence = [{ x: startPoint.x, y: startPoint.y, floorPlanId: startFloorPlanId }];
  ids.forEach((id) => {
    if (id === START) sequence.push({ x: startProj.x, y: startProj.y, floorPlanId: startFloorPlanId });
    else if (id === END) sequence.push({ x: endProj.x, y: endProj.y, floorPlanId: endFloorPlanId });
    else { const n = byId.get(id); sequence.push({ x: n.x, y: n.y, floorPlanId: n.floor_plan_id }); }
  });
  sequence.push({ x: endPoint.x, y: endPoint.y, floorPlanId: endFloorPlanId });

  // Split wherever the floor changes — that's exactly a cross-floor edge,
  // i.e. a stairs/elevator transition, and the natural page break for a
  // Next/Previous viewer (each page is one floor's own image + sub-route).
  const segments = [];
  sequence.forEach((point) => {
    const last = segments[segments.length - 1];
    if (!last || last.floorPlanId !== point.floorPlanId) segments.push({ floorPlanId: point.floorPlanId, points: [point] });
    else last.points.push(point);
  });
  return segments;
}
