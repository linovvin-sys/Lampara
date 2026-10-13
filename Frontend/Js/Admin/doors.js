// Admin → Doors: choose which path point is each building's entrance and exit (Backend/api/building-doors.php).
(() => {
  const API = '../../../Backend/api/';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let nodes = [], doors = {};

  async function get(url) { return (await fetch(API + url, { credentials: 'same-origin', cache: 'no-store' })).json(); }

  async function init() {
    try {
      const d = await get('buildings.php');
      $('drBuilding').innerHTML = '<option value="">Choose a building…</option>' + (d.buildings || []).map((b) => '<option value="' + b.id + '">' + esc(b.name) + '</option>').join('');
    } catch (e) { note('Could not load the buildings.'); }
    const q = new URLSearchParams(location.search).get('building');
    if (q) { $('drBuilding').value = q; pick(); }
  }
  function note(t) { $('drNote').textContent = t || ''; $('drNote').hidden = !t; }

  async function pick() {
    const bid = $('drBuilding').value;
    $('drForm').hidden = true; $('drActions').hidden = true; note('');
    if (!bid) return;
    try {
      const [g, dd] = await Promise.all([get('floor-plan-graph.php?building_id=' + bid), get('building-doors.php?building_id=' + bid)]);
      nodes = (g.nodes || []).slice();
      doors = (dd.doors && dd.doors[bid]) || {};
    } catch (e) { note('Could not load this building.'); return; }
    if (!nodes.length) { note('This building has no walkable path points yet. Draw its paths first (Buildings, then Draw paths).'); return; }
    const floors = [...new Set(nodes.map((n) => n.floor))];
    const opts = '<option value="">Not set (the app guesses)</option>' + floors.map((f) =>
      '<optgroup label="' + esc(f) + '">' + nodes.filter((n) => n.floor === f).map((n) => '<option value="' + n.id + '">' + esc(n.name || ('Point ' + n.id)) + '</option>').join('') + '</optgroup>').join('');
    $('drEntry').innerHTML = opts; $('drExit').innerHTML = opts;
    if (doors.entry) $('drEntry').value = doors.entry.node_id;
    if (doors.exit) $('drExit').value = doors.exit.node_id;
    $('drForm').hidden = false; $('drActions').hidden = false;
  }

  async function post(kind, nodeId) {
    const res = await fetch(API + 'building-doors.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building_id: Number($('drBuilding').value), kind, node_id: nodeId ? Number(nodeId) : null }) });
    const d = await res.json();
    if (!d.success) throw new Error(d.error || 'Could not save.');
  }

  $('drSave').onclick = async () => {
    try {
      await post('entry', $('drEntry').value);
      await post('exit', $('drExit').value);
      Swal.fire({ icon: 'success', title: 'Doors saved', timer: 1500, showConfirmButton: false });
    } catch (e) { Swal.fire({ icon: 'error', title: 'That did not work', text: e.message }); }
  };
  $('drSame').onclick = () => { $('drExit').value = $('drEntry').value; };
  $('drBuilding').onchange = pick;
  init();
})();
