// Buildings workspace: one place for a building's details, floors and paths, rooms, and doors.
// The building editor, the room editor and the doors page still do the real work; each runs embedded (?embed=1) as a tab here,
// so nothing about how they save has changed. The URL (?b=<id>&tab=details|rooms|doors, or ?new=1) says what is open, so every view can be linked and reloaded.
(() => {
  const API = '../../../Backend/api/';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const listView = $('listView'), bw = $('bw'), frame = $('bwFrame');
  if (!bw) return;

  const TABS = [
    { key: 'details', label: 'Details & floors', src: (id) => 'building-edit.php?' + (id ? 'edit=' + id + '&' : '') + 'embed=1' },
    { key: 'rooms', label: 'Rooms', src: (id, room) => 'room-edit.php?building=' + id + (room ? '&room=' + room : '') + '&embed=1' },
    { key: 'doors', label: 'Entrance & exit', src: (id) => 'doors.php?building=' + id + '&embed=1' }
  ];
  let buildings = [], doors = {}, state = { b: null, isNew: false, tab: 'details', room: null }, openedWorkspace = false;

  const get = async (u) => (await fetch(API + u, { credentials: 'same-origin', cache: 'no-store' })).json();
  const toast = (title, icon) => (window.Swal ? Swal.mixin({ toast: true, position: 'bottom-end', showConfirmButton: false, timer: 2400, timerProgressBar: true }).fire({ icon: icon || 'success', title }) : null);

  async function loadData() {
    try {
      const [b, d] = await Promise.all([get('buildings.php'), get('building-doors.php')]);
      buildings = b.buildings || []; doors = d.doors || {};
    } catch (e) { /* offline: the workspace still opens, just without the name and counts */ }
  }

  // ---- the URL is the state ----
  function parse() {
    const q = new URLSearchParams(location.search);
    const tab = TABS.some((t) => t.key === q.get('tab')) ? q.get('tab') : 'details';
    return { b: q.get('b') ? String(q.get('b')) : null, isNew: q.get('new') === '1', tab, room: q.get('room'), hint: q.get('tab') === 'rooms' && !q.get('b') };
  }
  function url(s) {
    if (s.isNew) return 'buildings.php?new=1';
    const p = new URLSearchParams({ b: s.b, tab: s.tab }); if (s.room) p.set('room', s.room);
    return 'buildings.php?' + p.toString();
  }
  function go(next, replace) {
    state = Object.assign({ b: null, isNew: false, tab: 'details', room: null }, next);
    history[replace ? 'replaceState' : 'pushState'](null, '', url(state));
    render();
  }

  // ---- drawing ----
  const building = () => buildings.find((x) => String(x.id) === String(state.b));

  function render() {
    const show = state.isNew || !!state.b;
    listView.hidden = show; bw.hidden = !show;
    document.querySelector('.admin-container').classList.toggle('is-ws', show);
    if (!show) { $('bwCallout').hidden = !parse().hint; frame.removeAttribute('src'); document.title = 'Lampara — Admin · Buildings'; return; }
    openedWorkspace = true;
    const b = building();
    $('bwName').textContent = state.isNew ? 'New building' : (b ? b.name : 'Building');
    document.title = 'Lampara — Admin · ' + $('bwName').textContent;
    drawChips(b); drawTabs(b);
    const t = TABS.find((x) => x.key === state.tab);
    const src = t.src(state.b, state.room);
    if (!frame.getAttribute('src') || frame.getAttribute('src') !== src) {
      $('bwLoading').hidden = false; frame.classList.add('is-loading'); frame.src = src;
    }
    window.scrollTo({ top: 0 });
  }

  function drawChips(b) {
    const d = (b && doors[b.id]) || {};
    $('bwChips').innerHTML = state.isNew ? '<span class="bw-chip">Not saved yet</span>' : b
      ? (b.is_open ? '<span class="bw-chip">Open type</span>' : '<span class="bw-chip">' + b.floor_count + ' floor' + (b.floor_count == 1 ? '' : 's') + '</span>') +
        '<span class="bw-chip">' + (b.room_count || 0) + ' room' + (b.room_count == 1 ? '' : 's') + '</span>' +
        (b.is_open ? '' : '<span class="bw-chip ' + (d.entry && d.exit ? 'ok' : 'todo') + '">' + (d.entry && d.exit ? 'Doors set' : !d.entry && !d.exit ? 'No entrance or exit' : (d.entry ? 'No exit' : 'No entrance')) + '</span>')
      : '';
  }
  function drawTabs(b) {
    $('bwTabs').innerHTML = TABS.filter((t) => !(t.key === 'doors' && b && b.is_open)).map((t) => { // an open building has no doors to set
      const off = state.isNew && t.key !== 'details';
      const count = t.key === 'rooms' && b ? ' <span class="bw-count">' + (b.room_count || 0) + '</span>' : '';
      return '<button type="button" role="tab" class="bw-tab' + (state.tab === t.key ? ' is-on' : '') + '" data-tab="' + t.key + '" aria-selected="' + (state.tab === t.key) + '"' +
        (off ? ' disabled title="Save the building first"' : '') + '>' + esc(t.key === 'details' && b && b.is_open ? 'Details' : t.label) + count + '</button>';
    }).join('');
  }
  $('bwTabs').addEventListener('click', (e) => { const t = e.target.closest('.bw-tab'); if (t && !t.disabled && t.dataset.tab !== state.tab) go({ b: state.b, tab: t.dataset.tab }); });

  // ---- the embedded page: keep its links inside the workspace ----
  frame.addEventListener('load', () => {
    $('bwLoading').hidden = true; frame.classList.remove('is-loading');
    let doc; try { doc = frame.contentDocument; } catch (e) { return; }
    if (!doc || !doc.body) return;
    doc.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href]'); if (!a || a.target === '_blank') return;
      const h = a.getAttribute('href') || '';
      const m = h.match(/^(building-edit|room-edit|buildings|doors)\.php(?:\?(.*))?$/); if (!m) { if (!/^#|^javascript:/.test(h)) a.target = '_top'; return; }
      e.preventDefault();
      const q = new URLSearchParams(m[2] || '');
      if (m[1] === 'buildings') return void (location.href = 'buildings.php');
      const id = q.get('edit') || q.get('building') || state.b;
      if (m[1] === 'building-edit') return go(id ? { b: id, tab: 'details' } : { isNew: true });
      if (m[1] === 'room-edit') return go({ b: id, tab: 'rooms', room: q.get('room') });
      go({ b: id, tab: 'doors' });
    }, true);
  });

  // a new building was saved (or an existing one edited): refresh the numbers and show the saved building
  window.addEventListener('message', async (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'lampara-building-saved') return;
    await loadData();
    let id = e.data.id || (e.data.created ? (buildings.find((x) => x.name === e.data.name) || {}).id : state.b);
    if (!id) return;
    toast(e.data.created ? 'Building created. Add its floors and rooms next.' : 'Saved');
    frame.removeAttribute('src');
    go({ b: String(id), tab: 'details' }, true);
  });

  // ---- links anywhere on the Buildings page that open a workspace view ----
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-ws]'); if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return;
    e.preventDefault();
    const q = new URLSearchParams((a.getAttribute('href') || '').split('?')[1] || '');
    go(q.get('new') ? { isNew: true } : { b: q.get('b'), tab: q.get('tab') || 'details' });
  });
  window.addEventListener('popstate', () => { const was = openedWorkspace; state = parse(); if (!state.b && !state.isNew && was) location.reload(); else render(); });
  $('bwBack').addEventListener('click', (e) => { e.preventDefault(); location.href = 'buildings.php'; }); // a fresh list, with the latest counts

  (async () => { state = parse(); if (state.b || state.isNew || state.hint) { await loadData(); } render(); if (!state.b && !state.isNew) loadData(); })();
})();
