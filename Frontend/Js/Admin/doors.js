// Admin → Entrance and exit: tap a path point on a building's floor plan to make it the entrance or the exit (Backend/api/building-doors.php).
// A building's door is one of the walkable path points of a floor plan, so this works on the plan itself.
(() => {
  const API = '../../../Backend/api/';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const toast = Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 2200, timerProgressBar: true });
  let buildings = [], allDoors = {}, bid = null, plans = [], nodes = [], floor = null, popNode = null;

  const get = async (url) => (await fetch(API + url, { credentials: 'same-origin', cache: 'no-store' })).json();
  const doorsOf = (id) => allDoors[id] || {};
  const ready = (id) => !!(doorsOf(id).entry && doorsOf(id).exit);

  async function init() {
    try {
      const [b, d] = await Promise.all([get('buildings.php'), get('building-doors.php')]);
      buildings = (b.buildings || []).filter((x) => !x.is_open); allDoors = d.doors || {}; // open-type buildings have no entrance or exit to mark
    } catch (e) { $('drEmpty').textContent = 'Could not load the buildings. Check your connection and reload.'; return; }
    if (!buildings.length) { $('drEmpty').textContent = 'No buildings are registered yet.'; return; }
    drawList();
    const q = new URLSearchParams(location.search).get('building');
    const first = buildings.find((b) => String(b.id) === q) || buildings.find((b) => !ready(b.id)) || buildings[0];
    select(first.id);
  }

  // ---- left: every building and whether its doors are set ----
  function drawList() {
    const done = buildings.filter((b) => ready(b.id)).length;
    $('drDone').textContent = done + ' of ' + buildings.length;
    $('drMeter').style.width = (buildings.length ? (done / buildings.length) * 100 : 0) + '%';
    $('drBuildings').innerHTML = buildings.map((b) => {
      const d = doorsOf(b.id), on = String(b.id) === String(bid);
      return '<li><button type="button" class="dr-b' + (on ? ' is-on' : '') + '" data-id="' + b.id + '"' + (on ? ' aria-current="true"' : '') + '>' +
        '<span class="dr-b-name">' + esc(b.name) + '</span>' +
        '<span class="dr-chips"><span class="dr-chip ' + (d.entry ? 'ok' : 'todo') + '">' + (d.entry ? 'Entrance set' : 'No entrance') + '</span>' +
        '<span class="dr-chip ' + (d.exit ? 'ok' : 'todo') + '">' + (d.exit ? 'Exit set' : 'No exit') + '</span></span></button></li>';
    }).join('');
  }
  $('drBuildings').addEventListener('click', (e) => { const b = e.target.closest('.dr-b'); if (b) select(b.dataset.id); });

  // ---- right: the selected building ----
  async function select(id) {
    bid = id; popNode = null; hidePop(); drawList();
    const b = buildings.find((x) => String(x.id) === String(id));
    $('drEmpty').hidden = true; $('drPanel').hidden = false; $('drName').textContent = b.name;
    $('drPlan').innerHTML = '<div class="dr-loading">Loading the floor plans&hellip;</div>';
    try {
      const [g, p] = await Promise.all([get('floor-plan-graph.php?building_id=' + id), get('floor-plans.php?building_id=' + id)]);
      nodes = g.nodes || []; plans = (p.plans || []).slice().sort((a, b) => String(a.floor).localeCompare(String(b.floor), undefined, { numeric: true }));
    } catch (e) { $('drPlan').innerHTML = '<div class="dr-loading">Could not load this building.</div>'; return; }
    const d = doorsOf(id);
    floor = (d.entry && plans.find((x) => x.id === d.entry.floor_plan_id)) || plans.find((x) => nodes.some((n) => n.floor_plan_id === x.id)) || plans[0] || null;
    drawSlots(); drawFloors(); drawPlan();
  }

  function slot(kind, label) {
    const d = doorsOf(bid)[kind], el = $(kind === 'entry' ? 'drSlotEntry' : 'drSlotExit');
    el.innerHTML = '<span class="dr-slot-label">' + label + '</span>' + (d
      ? '<span class="dr-slot-val"><strong>' + esc(d.name || 'Point') + '</strong><small>' + esc(d.floor) + '</small></span><span class="dr-slot-act"><button type="button" data-go="' + kind + '">Show</button><button type="button" data-clear="' + kind + '" aria-label="Clear the ' + label.toLowerCase() + '">Clear</button></span>'
      : '<span class="dr-slot-val is-none">Not set. The app guesses.</span>');
  }
  function drawSlots() { slot('entry', 'Entrance'); slot('exit', 'Exit'); }
  document.querySelector('.dr-slots').addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]'), clr = e.target.closest('[data-clear]');
    if (go) { const d = doorsOf(bid)[go.dataset.go]; floor = plans.find((p) => p.id === d.floor_plan_id) || floor; drawFloors(); drawPlan(d.node_id); }
    if (clr) save(clr.dataset.clear, null, 'cleared');
  });

  function drawFloors() {
    const d = doorsOf(bid);
    $('drFloors').innerHTML = plans.map((p) => {
      const n = nodes.filter((x) => x.floor_plan_id === p.id).length, on = floor && floor.id === p.id;
      const marks = ['entry', 'exit'].filter((k) => d[k] && d[k].floor_plan_id === p.id).length;
      return '<button type="button" role="tab" class="dr-floor' + (on ? ' is-on' : '') + '" aria-selected="' + on + '" data-plan="' + p.id + '">' + esc(p.floor) +
        '<small>' + (n ? n + ' point' + (n === 1 ? '' : 's') : 'no paths') + '</small>' + (marks ? '<i class="dr-floor-mark">' + marks + '</i>' : '') + '</button>';
    }).join('') || '<span class="dr-none">No floor plans uploaded.</span>';
    $('drSuggest').disabled = !floor || !nodes.some((n) => floor && n.floor_plan_id === floor.id);
  }
  $('drFloors').addEventListener('click', (e) => { const b = e.target.closest('.dr-floor'); if (!b) return; floor = plans.find((p) => String(p.id) === b.dataset.plan); hidePop(); drawFloors(); drawPlan(); });

  function drawPlan(pulseId) {
    hidePop(); const note = $('drNote');
    if (!floor) { $('drPlan').innerHTML = '<div class="dr-loading">This building has no floor plan yet. Upload one in the Building editor.</div>'; note.hidden = true; return; }
    const here = nodes.filter((n) => n.floor_plan_id === floor.id), d = doorsOf(bid);
    note.hidden = !!here.length; note.textContent = here.length ? '' : 'No walkable path has been drawn on this floor. Draw one in the Building editor, then come back.';
    const role = (id) => (d.entry && d.entry.node_id === id ? 'entry' : '') + (d.exit && d.exit.node_id === id ? 'exit' : '');
    $('drPlan').innerHTML = '<img src="../../' + esc(floor.image_path) + '" alt="Plan of ' + esc(floor.floor) + '" draggable="false">' + here.map((n) => {
      const r = role(n.id), cls = r === 'entryexit' ? 'is-entry is-exit' : r ? 'is-' + r : '';
      const tag = r === 'entryexit' ? 'IN / OUT' : r === 'entry' ? 'IN' : r === 'exit' ? 'OUT' : '';
      return '<button type="button" class="dr-dot ' + cls + (pulseId === n.id ? ' is-pulse' : '') + '" style="left:' + n.x + '%;top:' + n.y + '%" data-node="' + n.id + '" aria-label="' + esc(n.name || 'Point') + (tag ? ', ' + tag : '') + '"><span class="dr-dot-name">' + esc(n.name || '') + '</span>' + (tag ? '<em>' + tag + '</em>' : '') + '</button>';
    }).join('');
  }
  $('drPlan').addEventListener('click', (e) => { const b = e.target.closest('.dr-dot'); if (b) showPop(Number(b.dataset.node)); });

  // ---- the small chooser that opens on a point ----
  function showPop(id) {
    const n = nodes.find((x) => x.id === id); if (!n) return; popNode = id;
    const d = doorsOf(bid), isIn = d.entry && d.entry.node_id === id, isOut = d.exit && d.exit.node_id === id;
    const pop = $('drPop');
    pop.innerHTML = '<div class="dr-pop-title"><strong>' + esc(n.name || 'Point') + '</strong><small>' + esc(n.floor) + '</small></div>' +
      '<button type="button" class="dr-act is-entry" data-set="entry"' + (isIn ? ' aria-pressed="true"' : '') + '>' + (isIn ? 'This is the entrance' : 'Make it the entrance') + '</button>' +
      '<button type="button" class="dr-act is-exit" data-set="exit"' + (isOut ? ' aria-pressed="true"' : '') + '>' + (isOut ? 'This is the exit' : 'Make it the exit') + '</button>' +
      '<button type="button" class="dr-act" data-set="both">Entrance and exit</button>' +
      '<button type="button" class="dr-pop-close" data-close aria-label="Close">&times;</button>';
    pop.hidden = false;
    const stage = $('drStage'), w = stage.clientWidth, h = stage.clientHeight;
    const left = Math.min(Math.max((n.x / 100) * w, 8), w - 8), flip = n.x > 55, below = n.y < 55;
    pop.style.left = left + 'px'; pop.style.top = ((n.y / 100) * h) + 'px';
    pop.className = 'dr-pop' + (flip ? ' is-left' : ' is-right') + (below ? ' is-below' : ' is-above');
    $('drPlan').querySelectorAll('.dr-dot').forEach((b) => b.classList.toggle('is-picked', Number(b.dataset.node) === id));
    const first = pop.querySelector('.dr-act'); if (first) first.focus({ preventScroll: true });
  }
  function hidePop() { $('drPop').hidden = true; popNode = null; document.querySelectorAll('.dr-dot.is-picked').forEach((b) => b.classList.remove('is-picked')); }
  $('drPop').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) return hidePop();
    const a = e.target.closest('[data-set]'); if (a && popNode) save(a.dataset.set, popNode, 'saved');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('drPop').hidden) hidePop(); });
  document.addEventListener('pointerdown', (e) => { if (!$('drPop').hidden && !e.target.closest('#drPop') && !e.target.closest('.dr-dot')) hidePop(); });

  // ---- saving: instant, one tap ----
  async function save(kind, nodeId, verb) {
    try {
      const res = await fetch(API + 'building-doors.php', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building_id: Number(bid), kind: kind, node_id: nodeId }) });
      const r = await res.json(); if (!r.success) throw new Error(r.error || 'Could not save.');
      const fresh = await get('building-doors.php?building_id=' + bid); allDoors[bid] = (fresh.doors && fresh.doors[bid]) || {};
      hidePop(); drawList(); drawSlots(); drawFloors(); drawPlan(nodeId || undefined);
      toast.fire({ icon: 'success', title: (kind === 'both' ? 'Entrance and exit' : kind === 'entry' ? 'Entrance' : 'Exit') + ' ' + verb });
    } catch (e) { Swal.fire({ icon: 'error', title: 'That did not work', text: e.message }); }
  }

  // ---- automation: guess the door as the path point nearest the plan's edge on the entrance floor ----
  $('drSuggest').addEventListener('click', () => {
    // doors are on the ground floor: the lowest floor that has a path
    const low = plans.find((p) => nodes.some((n) => n.floor_plan_id === p.id)); if (!low) return;
    if (!floor || floor.id !== low.id) { floor = low; drawFloors(); }
    const here = nodes.filter((n) => n.floor_plan_id === floor.id);
    const edge = (n) => Math.min(n.x, 100 - n.x, n.y, 100 - n.y);
    const best = here.slice().sort((a, b) => edge(a) - edge(b))[0];
    drawPlan(best.id); showPop(best.id);
    toast.fire({ icon: 'info', title: 'Suggested: ' + (best.name || 'this point') + ' (nearest the plan edge on the ground floor). Tap an option to use it.' });
  });

  init();
})();
