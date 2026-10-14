// Search everything in the admin: pages, buildings and rooms. Opens with Ctrl+K (or Cmd+K), or "/" when you
// are not typing in a field; any element with data-admin-search opens it too. Arrow keys move, Enter opens,
// Esc closes. Buildings and rooms are fetched the first time it opens and kept for this page view.
(function () {
  var PAGES = [
    { label: 'Dashboard', href: 'dashboard.php', hint: 'Page' },
    { label: 'Buildings', href: 'buildings.php', hint: 'Page' },
    { label: 'Campus Paths', href: 'campus-paths.php', hint: 'Page' },
    { label: 'Building Outlines', href: 'building-outlines.php', hint: 'Page' },
    { label: 'Campus Map', href: 'campus-map.php', hint: 'Page' },
    { label: 'Entrance and exit', href: 'doors.php', hint: 'Page' },
    { label: 'Try the chat', href: 'test-chat.php', hint: 'Page' }
  ];
  var API = '../../../Backend/api/';
  var dlg, input, list, items = [], active = 0, data = null, loading = false;

  function build() {
    if (dlg) return;
    dlg = document.createElement('dialog');
    dlg.className = 'search-dialog';
    dlg.setAttribute('aria-label', 'Search the admin');
    dlg.innerHTML =
      '<div class="sd-box"><div class="sd-field"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>' +
      '<input type="text" class="sd-input" placeholder="Search pages, buildings and rooms" role="combobox" aria-expanded="true" aria-controls="sdList" aria-label="Search" autocomplete="off">' +
      '<kbd>Esc</kbd></div><ul class="sd-list" id="sdList" role="listbox" aria-label="Results"></ul>' +
      '<p class="sd-foot">Arrow keys to move &middot; Enter to open</p></div>';
    document.body.appendChild(dlg);
    input = dlg.querySelector('.sd-input');
    list = dlg.querySelector('.sd-list');
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); go(items[active]); }
    });
    list.addEventListener('click', function (e) {
      var li = e.target.closest('li[data-i]');
      if (li) go(items[Number(li.dataset.i)]);
    });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  }

  function load() {
    if (data || loading) return;
    loading = true;
    Promise.all([
      fetch(API + 'buildings.php', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch(API + 'rooms.php', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      data = {
        buildings: res[0] && res[0].success ? res[0].buildings : [],
        rooms: res[1] && res[1].success ? res[1].rooms : []
      };
      loading = false;
      render();
    });
  }

  function match(text, q) {
    var t = text.toLowerCase();
    return q.every(function (w) { return t.indexOf(w) !== -1; }) ? (t.indexOf(q[0]) === 0 ? 0 : 1) : -1;
  }

  function render() {
    var q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var out = [];
    PAGES.forEach(function (p) { var m = q.length ? match(p.label, q) : 0; if (m >= 0) out.push({ rank: m, group: 'Pages', label: p.label, hint: p.hint, href: p.href }); });
    if (data) {
      data.buildings.forEach(function (b) {
        var m = q.length ? match(b.name, q) : -1;
        if (m >= 0) {
          out.push({ rank: m, group: 'Buildings', label: b.name, hint: b.room_count + ' rooms', href: 'buildings.php?b=' + b.id + '&tab=details' });
          out.push({ rank: m + 0.5, group: 'Buildings', label: 'Rooms in ' + b.name, hint: 'Room list', href: 'buildings.php?b=' + b.id + '&tab=rooms' });
        }
      });
      data.rooms.forEach(function (r) {
        var m = q.length ? match((r.room_number || '') + ' ' + (r.room_name || '') + ' ' + (r.building_name || ''), q) : -1;
        if (m >= 0) out.push({ rank: m, group: 'Rooms', label: (r.room_number ? r.room_number + ' · ' : '') + (r.room_name || 'Unnamed'), hint: (r.building_name || '') + (r.floor ? ' · ' + r.floor : ''), href: 'room-edit.php?room=' + r.id });
      });
    }
    var order = { Pages: 0, Buildings: 1, Rooms: 2 };
    out.sort(function (a, b) { return a.rank - b.rank || order[a.group] - order[b.group]; });
    items = out.slice(0, 30);
    active = 0;
    var html = '', last = '';
    items.forEach(function (it, i) {
      if (it.group !== last) { html += '<li class="sd-group" role="presentation">' + it.group + '</li>'; last = it.group; }
      html += '<li role="option" data-i="' + i + '" id="sd-' + i + '"' + (i === 0 ? ' aria-selected="true" class="is-active"' : ' aria-selected="false"') + '><span>' + esc(it.label) + '</span><small>' + esc(it.hint) + '</small></li>';
    });
    if (!items.length) html = '<li class="sd-empty" role="presentation">' + (loading ? 'Loading…' : 'Nothing matches “' + esc(input.value) + '”.') + '</li>';
    list.innerHTML = html;
    input.setAttribute('aria-activedescendant', items.length ? 'sd-0' : '');
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function move(d) {
    if (!items.length) return;
    var old = list.querySelector('#sd-' + active);
    if (old) { old.classList.remove('is-active'); old.setAttribute('aria-selected', 'false'); }
    active = (active + d + items.length) % items.length;
    var now = list.querySelector('#sd-' + active);
    if (now) { now.classList.add('is-active'); now.setAttribute('aria-selected', 'true'); now.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', 'sd-' + active); }
  }

  function go(it) { if (it) window.location.href = it.href; }

  function open() {
    build();
    input.value = '';
    render();
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    input.focus();
    load();
  }

  document.addEventListener('keydown', function (e) {
    var typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); open(); }
    else if (e.key === '/' && !typing && !document.querySelector('dialog[open], .swal2-container')) { e.preventDefault(); open(); }
  });
  document.addEventListener('click', function (e) {
    if (e.target.closest('[data-admin-search]')) { e.preventDefault(); open(); }
  });
})();
