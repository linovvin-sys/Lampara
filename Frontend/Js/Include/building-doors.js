// Where a building's doors are on its floor plans. Plain <script>; exposes `BuildingDoors`.
//
// The floor-plan data has no "door" marker, so the doors that are known are named here by the path point (as labelled
// on the admin Floor Plans page) and the floor it is on. `entry` = where you come in, `exit` = where you leave.
// For a building not listed, a path point named like an entrance/exit is used, and failing that the point furthest
// from the middle of the entrance floor (a guess, flagged as such by `how: 'guess'`).
const BuildingDoors = (() => {
  const KNOWN = {
    1: { floor: '1st Floor', entry: 'Point AG', exit: 'Point B' },    // Amafel (Main): AG = main entrance, B = exit
    3: { floor: '2nd Floor', entry: 'Point T', exit: 'Point T' }      // Felix Amada (Annex): T = entrance stair and exit stair
  };

  const rank = (name) => {          // lowest floor first, same rule as scan.js
    const t = String(name || '').trim().toLowerCase(), m = t.match(/^(-?\d+)/);
    if (m) return parseInt(m[1], 10);
    if (/^(g|ground|lower ground)/.test(t)) return 0;
    if (/basement|^b\d?\b/.test(t)) return -1;
    return 99;
  };

  // building: { id, entrance_floor? }; graph: { nodes, edges }; plans: floor plans of the building; kind: 'entry' | 'exit'.
  // Returns { floor, x, y, how: 'known' | 'named' | 'guess', name? } (x, y = 0-100 plan percent) or null.
  function find(building, graph, plans, kind) {
    const cfg = KNOWN[building.id];
    if (cfg && cfg[kind]) {
      const plan = plans.find((p) => p.floor === cfg.floor);
      const n = plan && graph.nodes.find((x) => x.floor_plan_id === plan.id && x.name === cfg[kind]);
      if (n) return { floor: cfg.floor, x: n.x, y: n.y, how: 'known', name: cfg[kind] };
    }
    const ordered = plans.filter((p) => graph.nodes.some((n) => n.floor_plan_id === p.id)).sort((a, b) => rank(a.floor) - rank(b.floor));
    const plan = (building.entrance_floor && ordered.find((p) => p.floor === building.entrance_floor)) || ordered[0];
    if (!plan) return null;
    const nodes = graph.nodes.filter((n) => n.floor_plan_id === plan.id);
    const named = nodes.find((n) => /entr|exit|gate|door/i.test(n.name || ''));
    if (named) return { floor: plan.floor, x: named.x, y: named.y, how: 'named', name: named.name };
    const cx = nodes.reduce((t, n) => t + n.x, 0) / nodes.length, cy = nodes.reduce((t, n) => t + n.y, 0) / nodes.length;
    const far = nodes.slice().sort((a, b) => Math.hypot(b.x - cx, b.y - cy) - Math.hypot(a.x - cx, a.y - cy))[0];
    return { floor: plan.floor, x: far.x, y: far.y, how: 'guess' };
  }

  return { find };
})();
