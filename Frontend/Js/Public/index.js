// Landing page: the destination quick-pick and the building list.
// Buildings come from the same cached list the guide uses (see offline-cache.js), so this works with a weak signal too.
(function () {
  var API = '../../../Backend/api/buildings.php';
  var qEl = document.getElementById('q');
  var chipsEl = document.getElementById('chips');
  var goEl = document.getElementById('go');
  var hintEl = document.getElementById('quick-hint');
  var bldEl = document.getElementById('bld');
  var emptyEl = document.getElementById('bld-empty');
  var form = document.getElementById('quick');

  var buildings = [];
  var picked = null;               // the building chosen in the quick-pick

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function guideUrl(b) { return 'guide-ar.php' + (b ? '?to=' + encodeURIComponent(b.id) : ''); }

  // The start button always goes to the guide, straight to the chosen building when there is one.
  function syncGo() {
    goEl.href = guideUrl(picked);
    goEl.textContent = picked ? 'Navigate to ' + picked.name : 'Start navigating';
    hintEl.textContent = picked
      ? 'The guide opens with ' + picked.name + ' already chosen.'
      : 'Choose one to start straight to it, or start and search inside the guide.';
  }

  function renderChips() {
    var q = (qEl.value || '').trim().toLowerCase();
    var list = buildings.filter(function (b) { return !q || b.name.toLowerCase().indexOf(q) !== -1; });
    if (!buildings.length) { chipsEl.innerHTML = ''; return; }
    if (!list.length) { chipsEl.innerHTML = '<li class="chip-none">No building matches &ldquo;' + esc(qEl.value.trim()) + '&rdquo;.</li>'; return; }
    chipsEl.innerHTML = list.slice(0, 8).map(function (b) {
      var on = picked && String(picked.id) === String(b.id);
      return '<li><button type="button" class="chip' + (on ? ' on' : '') + '" data-id="' + esc(b.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(b.name) + '</button></li>';
    }).join('');
  }

  function renderGrid() {
    if (!buildings.length) { bldEl.innerHTML = ''; emptyEl.hidden = false; return; }
    emptyEl.hidden = true;
    bldEl.innerHTML = buildings.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (b) {
      return '<li class="bld-card"><h3>' + esc(b.name) + '</h3>' +
        '<p>' + (b.floor_count > 1 ? b.floor_count + ' floors' : '1 floor') + (b.building_number ? ' &middot; Building ' + esc(b.building_number) : '') + '</p>' +
        '<a class="bld-go" href="' + guideUrl(b) + '">Navigate here<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a></li>';
    }).join('');
  }

  chipsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-id]');
    if (!btn) return;
    var b = buildings.find(function (x) { return String(x.id) === btn.getAttribute('data-id'); });
    picked = picked && b && String(picked.id) === String(b.id) ? null : b;      // tap again to unpick
    renderChips();
    syncGo();
  });
  qEl.addEventListener('input', renderChips);
  form.addEventListener('submit', function (e) { e.preventDefault(); location.href = goEl.href; });

  function load() {
    if (typeof LamparaCache === 'undefined') { renderGrid(); return; }
    LamparaCache.loadBuildings(API).then(function (list) {
      buildings = Array.isArray(list) ? list : [];
      renderChips();
      renderGrid();
    }).catch(function () { buildings = []; renderGrid(); });
  }
  load();
})();
