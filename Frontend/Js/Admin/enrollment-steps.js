// Enrollment steps page: build the route the student Enrollment guide follows (Backend/api/enrollment-steps.php).
// Each stop is picked from the room directory (room_id), so its title, place and wording fill in by themselves.
// Starts from what is saved, or from the built-in list (LamparaEnroll.DEFAULTS) when nothing is saved yet.
(() => {
  const API = '../../../Backend/api/enrollment-steps.php';
  const ROOMS = '../../../Backend/api/rooms.php';
  const $ = (id) => document.getElementById(id);
  let stops = [];
  let rooms = [];
  let saved = '';          // JSON of the last saved list, to know when something is unsaved
  let openIdx = null;      // the one stop being edited; the rest show as a one-line summary

  const msg = (t, bad) => { const m = $('esMsg'); m.textContent = t; m.classList.toggle('bad', !!bad); m.hidden = !t; if (t) m.scrollIntoView({ block: 'nearest' }); };
  const defaults = () => LamparaEnroll.DEFAULTS.map(LamparaEnroll.plain);
  const clean = (s) => Object.fromEntries(Object.entries(s).filter(([, v]) => v !== undefined && v !== ''));
  const roomById = (id) => rooms.find((r) => String(r.id) === String(id));
  const snap = () => JSON.stringify(stops.map(clean));
  const dirty = () => snap() !== saved;

  // ---------- what a room tells us about its stop ----------
  const roomLabel = (r) => (r.room_number ? r.room_number + ' · ' : '') + r.room_name + ' (' + r.floor + ')';
  const suggestWhat = (r) => {
    const where = (r.room_number ? 'Room ' + r.room_number + ', ' : '') + r.floor + ', ' + r.building_name;
    return 'Go to ' + r.room_name + ' (' + where + ').' + (r.notes ? ' ' + r.notes.replace(/\s+$/, '') : '');
  };
  // Fill a stop from a directory room. Anything the admin already wrote is kept unless force is set.
  function applyRoom(s, r, force) {
    s.room_id = r.id; delete s.room; delete s.match;
    if (force || !s.title) s.title = r.room_name;
    if (force || !s.place) s.place = r.room_name + ' · ' + r.floor;
    if (force || !s.what) s.what = suggestWhat(r);
  }
  const missing = (s) => (!s.title ? 'a title' : !s.place ? 'a place' : !s.what ? 'what the student does' : '');

  // ---------- loading ----------
  async function load() {
    try { rooms = ((await (await fetch(ROOMS, { cache: 'no-store' })).json()).rooms || []).filter((r) => r.room_name); } catch (e) { rooms = []; }
    try { const d = await (await fetch(API, { cache: 'no-store' })).json(); stops = (d.stops && d.stops.length ? d.stops : defaults()).map(clean); }
    catch (e) { stops = defaults().map(clean); msg('Could not reach the server: showing the built-in steps, saving will not work until you are back online.', true); }
    saved = snap(); draw();
  }

  // ---------- room picker (a plain <select>; the admin UX layer turns it into the animated dropdown) ----------
  function roomSelect(value, onPick, placeholder) {
    const sel = document.createElement('select');
    const first = document.createElement('option'); first.value = ''; first.textContent = placeholder || 'Choose an office or room…'; sel.append(first);
    const byB = new Map();
    rooms.forEach((r) => { if (!byB.has(r.building_name)) byB.set(r.building_name, []); byB.get(r.building_name).push(r); });
    byB.forEach((list, name) => {
      const g = document.createElement('optgroup'); g.label = name;
      list.forEach((r) => { const o = document.createElement('option'); o.value = r.id; o.textContent = roomLabel(r); g.append(o); });
      sel.append(g);
    });
    sel.value = value || '';
    sel.addEventListener('change', () => { if (sel.value) onPick(roomById(sel.value)); });
    return sel;
  }

  function labeled(text, hint, control, wide) {
    const l = document.createElement('label'); if (wide) l.className = 'wide';
    l.append(text); if (hint) { const h = document.createElement('small'); h.textContent = hint; l.append(h); }
    l.append(control); return l;
  }
  function input(i, key, area) {
    const el = document.createElement(area ? 'textarea' : 'input'); if (!area) el.type = 'text'; else el.rows = 3;
    el.value = stops[i][key] || '';
    el.addEventListener('input', () => { stops[i][key] = el.value; summary(i); status(); });
    return el;
  }

  // ---------- drawing ----------
  function draw() {
    const list = $('esList'); list.textContent = '';
    let step = 0;
    stops.forEach((s, i) => {
      const starts = !!(s.heading || !i);
      if (starts) step++;
      const card = document.createElement('li');
      card.className = 'es-card' + (starts ? ' new-step' : '') + (openIdx === i ? ' is-open' : '') + (missing(s) ? ' is-incomplete' : '');
      card.dataset.i = i;

      // --- header row: drag handle, step, summary, order buttons ---
      const top = document.createElement('div'); top.className = 'es-top';
      const grip = document.createElement('span'); grip.className = 'es-grip'; grip.draggable = true; grip.title = 'Drag to reorder'; grip.setAttribute('aria-hidden', 'true'); grip.textContent = '⠿';
      grip.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; card.classList.add('is-dragging'); });
      grip.addEventListener('dragend', () => card.classList.remove('is-dragging'));
      card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('is-over'); });
      card.addEventListener('dragleave', () => card.classList.remove('is-over'));
      card.addEventListener('drop', (e) => { e.preventDefault(); const from = Number(e.dataTransfer.getData('text/plain')); if (!Number.isNaN(from) && from !== i) reorder(from, i); });
      const tog = document.createElement('button'); tog.type = 'button'; tog.className = 'es-toggle'; tog.setAttribute('aria-expanded', String(openIdx === i));
      const num = document.createElement('span'); num.className = 'es-num'; num.textContent = starts ? 'Step ' + step : 'Step ' + step + ' · also';
      const sum = document.createElement('span'); sum.className = 'es-sum';
      const edit = document.createElement('span'); edit.className = 'es-edit'; edit.textContent = openIdx === i ? 'Close' : 'Edit';
      tog.append(num, sum, edit); tog.addEventListener('click', () => { openIdx = openIdx === i ? null : i; draw(); });
      top.append(grip, tog);
      [['↑', 'Move up', () => move(i, -1), i === 0], ['↓', 'Move down', () => move(i, 1), i === stops.length - 1], ['Remove', 'Remove this stop', () => remove(i), false]].forEach(([t, a, fn, off]) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'es-btn alt sm'; b.textContent = t; b.setAttribute('aria-label', a); b.disabled = off; b.addEventListener('click', fn); top.append(b);
      });
      card.append(top);

      // --- body: the room first, everything else follows from it ---
      const fields = document.createElement('div'); fields.className = 'es-fields';
      const pick = roomSelect(s.room_id, (r) => { applyRoom(s, r, false); draw(); }, s.room || s.match ? 'Linked by number/name: choose a room to link it properly' : undefined);
      fields.append(labeled('Which office or room is this stop?', 'Pick it from the directory. Title, place and wording fill in for you.', pick, true));
      fields.append(labeled('Title', 'The stop’s name, e.g. Pay your tuition', input(i, 'title')));
      fields.append(labeled('Place', 'Shown under the title', input(i, 'place')));
      const what = labeled('What the student does', 'Plain words, one or two sentences.', input(i, 'what', true), true);
      const row = document.createElement('div'); row.className = 'es-inline';
      const sug = document.createElement('button'); sug.type = 'button'; sug.className = 'es-btn alt sm'; sug.textContent = 'Write it for me';
      sug.disabled = !roomById(s.room_id); sug.title = roomById(s.room_id) ? 'Fill this in from the room’s details' : 'Pick a room first';
      sug.addEventListener('click', () => { stops[i].what = suggestWhat(roomById(s.room_id)); draw(); });
      row.append(sug); what.append(row); fields.append(what);

      const grp = document.createElement('label'); grp.className = 'chk wide';
      const gc = document.createElement('input'); gc.type = 'checkbox'; gc.checked = !starts; gc.disabled = i === 0;
      gc.addEventListener('change', () => { if (gc.checked) delete stops[i].heading; else stops[i].heading = stops[i].title || 'New step'; draw(); });
      grp.append(gc, 'Part of the step above (same number). Untick to start a new numbered step.');
      fields.append(grp);

      const more = document.createElement('details'); more.className = 'es-more wide';
      const ms = document.createElement('summary'); ms.textContent = 'More options'; more.append(ms);
      const mf = document.createElement('div'); mf.className = 'es-fields-sub';
      if (starts) mf.append(labeled('Step heading', 'Shown for the whole step. Leave as the title unless it needs its own words.', input(i, 'heading')));
      mf.append(labeled('Small label', 'Optional, e.g. "Pay for it"', input(i, 'sub')));
      const h = document.createElement('label'); h.className = 'chk';
      const c = document.createElement('input'); c.type = 'checkbox'; c.checked = !!s.houses; c.addEventListener('change', () => { stops[i].houses = c.checked || undefined; status(); });
      h.append(c, 'Show the school houses here'); mf.append(h);
      more.append(mf); fields.append(more);

      const wrap = document.createElement('div'); wrap.className = 'es-body'; const inner = document.createElement('div'); inner.className = 'es-inner'; inner.append(fields); wrap.append(inner); card.append(wrap);
      list.append(card); summary(i, card);
    });
    status();
  }

  function summary(i, card) {
    card = card || $('esList').children[i]; if (!card) return;
    const s = stops[i], r = roomById(s.room_id);
    const bit = [s.title || s.heading || 'Untitled stop', r ? r.building_name : s.place, r && r.room_number ? 'Room ' + r.room_number : (s.room ? 'Room ' + s.room : '')].filter(Boolean).join(' · ');
    const m = missing(s);
    card.querySelector('.es-sum').textContent = m ? bit + ' — needs ' + m : bit;
    card.classList.toggle('is-incomplete', !!m);
  }

  // the line above the list: how many stops, what is wrong, whether it is saved
  function status() {
    const steps = stops.filter((s, i) => s.heading || !i).length, bad = stops.filter(missing).length;
    $('esCount').textContent = stops.length + ' stop' + (stops.length === 1 ? '' : 's') + ' in ' + steps + ' step' + (steps === 1 ? '' : 's');
    const issue = $('esIssue'); issue.hidden = !bad; issue.textContent = bad ? bad + ' stop' + (bad === 1 ? ' needs' : 's need') + ' finishing' : '';
    const d = dirty(); $('esDirty').hidden = !d; $('esSave').disabled = !d;
    const linked = stops.filter((s) => s.room_id).length;
    $('esLink').hidden = linked === stops.length || !rooms.length;
  }

  function reorder(from, to) { const [x] = stops.splice(from, 1); stops.splice(to, 0, x); if (!stops[0].heading) stops[0].heading = stops[0].title || 'Step 1'; openIdx = null; draw(); }
  const move = (i, d) => reorder(i, i + d);
  const remove = (i) => { if (stops.length > 1 && confirm('Remove this stop?')) { stops.splice(i, 1); if (!stops[0].heading) stops[0].heading = stops[0].title || 'Step 1'; openIdx = null; draw(); } };
  const slug = (t) => (t || 'stop').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'stop';
  const newKey = () => { let k = 'stop-' + (stops.length + 1); while (stops.some((s) => s.key === k)) k += 'x'; return k; };

  // ---------- automation 1: add stops straight from the directory ----------
  const addPanel = $('esPicker'), addList = $('esPickList');
  function openPicker() {
    addPanel.hidden = false; addList.textContent = '';
    const chosen = new Set(stops.map((s) => String(s.room_id)));
    const bsel = $('esPickBuilding'); bsel.textContent = '';
    const names = [...new Set(rooms.map((r) => r.building_name))];
    names.forEach((n) => { const o = document.createElement('option'); o.value = n; o.textContent = n; bsel.append(o); });
    const first = rooms.find((r) => /^1(-A)?$/i.test(String(r.building_number == null ? '' : r.building_number).trim())); const main = (first && first.building_name) || names[0]; if (main) bsel.value = main;   // the building numbered 1 first, as the built-in steps assume
    fillPick(chosen); addPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function fillPick(chosen) {
    addList.textContent = '';
    const b = $('esPickBuilding').value, q = $('esPickSearch').value.trim().toLowerCase();
    rooms.filter((r) => r.building_name === b && (r.category === 'office' || r.category === 'canteen' || r.room_type === 'office')
      && (!q || (r.room_name + ' ' + (r.room_number || '') + ' ' + r.floor).toLowerCase().includes(q)))
      .forEach((r) => {
        const l = document.createElement('label'); l.className = 'es-pick';
        const c = document.createElement('input'); c.type = 'checkbox'; c.value = r.id; c.checked = false; c.disabled = chosen.has(String(r.id));
        c.addEventListener('change', countPicked);
        const t = document.createElement('span'); t.textContent = roomLabel(r) + (c.disabled ? ' — already a stop' : '');
        l.append(c, t); addList.append(l);
      });
    if (!addList.children.length) { const p = document.createElement('p'); p.className = 'es-pick-empty'; p.textContent = 'No offices match.'; addList.append(p); }
    countPicked();
  }
  function countPicked() { const n = addList.querySelectorAll('input:checked').length; $('esPickAdd').disabled = !n; $('esPickAdd').textContent = n ? 'Add ' + n + ' stop' + (n === 1 ? '' : 's') : 'Add stops'; }
  $('esAdd').addEventListener('click', openPicker);
  $('esPickBuilding').addEventListener('change', () => fillPick(new Set(stops.map((s) => String(s.room_id)))));
  $('esPickSearch').addEventListener('input', () => fillPick(new Set(stops.map((s) => String(s.room_id)))));
  $('esPickClose').addEventListener('click', () => { addPanel.hidden = true; });
  $('esPickAdd').addEventListener('click', () => {
    addList.querySelectorAll('input:checked').forEach((c) => {
      const r = roomById(c.value); const s = { key: newKey(), heading: r.room_name };
      applyRoom(s, r, true); stops.push(s);
    });
    addPanel.hidden = true; openIdx = null; draw(); $('esList').lastElementChild.scrollIntoView({ block: 'center', behavior: 'smooth' });
    msg('Added. Reorder by dragging, then Save.');
  });
  $('esBlank').addEventListener('click', () => {
    stops.push({ key: newKey(), heading: 'New step', title: '', place: '', what: '' }); openIdx = stops.length - 1; addPanel.hidden = true; draw(); $('esList').lastElementChild.scrollIntoView({ block: 'center' });
  });

  // ---------- automation 2: link the existing stops to real directory rooms ----------
  $('esLink').addEventListener('click', () => {
    let n = 0;
    stops.forEach((s) => {
      if (s.room_id) return;
      let r = null;
      if (s.room) r = rooms.find((x) => String(x.room_number) === String(s.room) && /^1(-A)?$/i.test(String(x.building_number == null ? '' : x.building_number).trim())) || rooms.find((x) => String(x.room_number) === String(s.room));
      if (!r && s.match) { try { const re = new RegExp(s.match, 'i'); r = rooms.find((x) => re.test(x.room_name)); } catch (e) { /* bad pattern */ } }
      if (r) { s.room_id = r.id; delete s.room; delete s.match; n++; }
    });
    draw(); msg(n ? 'Linked ' + n + ' stop' + (n === 1 ? '' : 's') + ' to rooms in the directory. Save to keep it.' : 'Nothing more could be linked automatically. Pick the room on each remaining stop.', !n);
  });

  // ---------- saving ----------
  async function post(body) {
    const r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await r.json(); if (!d.success) throw new Error(d.error || 'Could not save.'); return d;
  }

  $('esSave').addEventListener('click', async () => {
    const badAt = stops.findIndex(missing);
    if (badAt >= 0) { openIdx = badAt; draw(); msg('Stop ' + (badAt + 1) + ' still needs ' + missing(stops[badAt]) + '.', true); return; }
    // a stop's key is what a student's saved progress hangs on, so new stops get one made from their title
    stops.forEach((s) => { if (/^stop-\d+x*$/.test(s.key) && s.title) { let k = slug(s.title); while (stops.some((o) => o !== s && o.key === k)) k += '-2'; s.key = k; } });
    $('esSave').disabled = true;
    try { const d = await post({ stops: stops.map(clean) }); stops = d.stops; saved = snap(); draw(); msg('Saved. Students will see the new steps next time they open the guide.'); }
    catch (e) { msg(e.message, true); status(); }
  });

  $('esReset').addEventListener('click', async () => {
    if (!confirm('Throw away your changes and go back to the built-in steps?')) return;
    try { await post({ reset: true }); stops = defaults().map(clean); saved = snap(); openIdx = null; draw(); msg('Back to the built-in steps.'); } catch (e) { msg(e.message, true); }
  });

  window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
  load();
})();
