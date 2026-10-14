// Where a building's doors are on its floor plans. Plain <script>; exposes `BuildingDoors`.
//
// A door is one of a floor plan's walkable path points: `entry` = where you come in, `exit` = where you leave.
// Order of trust, for a building and a kind:
//   1. the admin's choice, saved in the database (Admin > Doors; Backend/api/building-doors.php), kept on the phone for offline use
//   2. the points built in below for the buildings that were set up before the admin page existed
//   3. a path point on the entrance floor named like an entrance or exit
//   4. the path point furthest from the middle of the entrance floor (a guess, flagged `how: 'guess'`)
// People leave a building by the same door they come in by: the main (human) entrance. So an `exit` that nobody chose in the
// admin is the building's `entry` door, never a side, back or fire exit.
const BuildingDoors = (() => {
  const KEY = 'lampara_doors_cache';
  const KNOWN = {
    1: { floor: '1st Floor', entry: 'Point AG', exit: 'Point AG' },   // Amafel (Main): AG = the main entrance (B is a side exit, not used to leave)
    3: { floor: '2nd Floor', entry: 'Point T', exit: 'Point T' }      // Felix Amada (Annex): T = entrance stair and exit stair
  };
  let saved = {};      // { "<building id>": { entry: {floor, x, y, name}, exit: {...} } }

  try { saved = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { saved = {}; }

  // Fetches the admin's choices (and remembers them for offline). Never throws: with no answer, what was remembered is used.
  async function load(url) {
    try {
      const d = await (await fetch(url, { cache: 'no-store' })).json();
      if (d && d.success && d.doors) {
        saved = d.doors;
        try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch (e) { /* not remembered */ }
      }
    } catch (e) { /* offline: keep what is remembered */ }
    return saved;
  }

  const rank = (name) => {          // lowest floor first, same rule as scan.js
    const t = String(name || '').trim().toLowerCase(), m = t.match(/^(-?\d+)/);
    if (m) return parseInt(m[1], 10);
    if (/^(g|ground|lower ground)/.test(t)) return 0;
    if (/basement|^b\d?\b/.test(t)) return -1;
    return 99;
  };

  // building: { id, entrance_floor? }; graph: { nodes, edges }; plans: floor plans of the building; kind: 'entry' | 'exit'.
  // Returns { floor, x, y, how: 'set' | 'known' | 'named' | 'guess', name? } (x, y = 0-100 plan percent) or null.
  function find(building, graph, plans, kind) {
    const mine = saved[String(building.id)] && saved[String(building.id)][kind];
    if (mine && plans.find((p) => p.floor === mine.floor)) return { floor: mine.floor, x: Number(mine.x), y: Number(mine.y), how: 'set', name: mine.name };
    if (kind === 'exit') return find(building, graph, plans, 'entry');     // leave by the main entrance unless an exit was chosen on purpose

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

  return { find, load };
})();
