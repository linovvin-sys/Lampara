// The "Street" view of the campus map: OpenStreetMap with a pin for every building, the same base map as the AR guide's mini-map.
// It sits on top of the 2D and 3D views without changing them: opening it covers them, and tapping 2D or 3D uncovers them again.
(function () {
  'use strict';
  var BUILDINGS_API = '../../../Backend/api/buildings.php';
  var app = document.getElementById('mapApp');
  var tabStreet = document.getElementById('tab-street');
  var view = document.getElementById('streetView');
  if (!app || !tabStreet || !view || typeof L === 'undefined') return;

  var tab2d = document.getElementById('tab-2d'), tab3d = document.getElementById('tab-3d');
  var mapEl = document.getElementById('streetMap'), chipsEl = document.getElementById('streetChips'), cardEl = document.getElementById('streetCard');
  var map = null, markers = {}, buildings = [], selected = null, built = false;
  var CENTER = [14.3283, 120.9372];
  var captionEl = document.getElementById('caption'), savedCaption = '';

  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function pinIcon(on) {
    return L.divIcon({ className: '', html: '<div class="st-pin' + (on ? ' on' : '') + '"></div>', iconSize: [26, 26], iconAnchor: [13, 26] });
  }

  function select(b, fly) {
    selected = b;
    Object.keys(markers).forEach(function (id) { markers[id].setIcon(pinIcon(b && String(b.id) === id)); });
    chipsEl.querySelectorAll('button').forEach(function (c) { c.classList.toggle('on', !!b && c.dataset.id === String(b.id)); });
    if (!b) { cardEl.hidden = true; return; }
    if (fly && map) map.flyTo([b.lat, b.lng], Math.max(map.getZoom(), 18), { duration: 0.6 });
    var rooms = b.room_count, floors = b.floor_count;
    var meta = [floors ? floors + (floors === 1 ? ' floor' : ' floors') : '', rooms ? rooms + (rooms === 1 ? ' room' : ' rooms') : 'Outdoor route only'].filter(Boolean).join(' · ');
    cardEl.innerHTML = '<div class="st-card-head"><div><strong>' + esc(b.name) + '</strong><span>' + esc(meta) + '</span></div>' +
      '<button type="button" class="st-x" aria-label="Close" id="stClose">&times;</button></div>' +
      '<div class="st-card-actions"><a class="st-go" href="guide-ar.php?to=' + encodeURIComponent(b.id) + '">Walk there</a>' +
      (rooms ? '<a class="st-alt" href="../Student/manual-search.php">Find a room</a>' : '') + '</div>';
    cardEl.hidden = false;
    var x = document.getElementById('stClose');
    if (x) x.addEventListener('click', function () { select(null); });
  }

  function build() {
    if (built) return;
    built = true;
    map = L.map(mapEl, { zoomControl: true, attributionControl: true }).setView(CENTER, 17);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);
    LamparaCache.loadBuildings(BUILDINGS_API).then(function (list) {
      buildings = (list || []).filter(function (b) { return isFinite(b.lat) && isFinite(b.lng); });
      var pts = [];
      buildings.forEach(function (b) {
        var m = L.marker([b.lat, b.lng], { icon: pinIcon(false), title: b.name, keyboard: true }).addTo(map);
        m.on('click', function () { select(b, false); });
        markers[String(b.id)] = m;
        pts.push([b.lat, b.lng]);
      });
      chipsEl.innerHTML = buildings.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (b) {
        return '<button type="button" data-id="' + esc(b.id) + '">' + esc(b.name) + '</button>';
      }).join('');
      chipsEl.querySelectorAll('button').forEach(function (c) {
        c.addEventListener('click', function () { var b = buildings.find(function (x) { return String(x.id) === c.dataset.id; }); if (b) select(b, true); });
      });
      if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 18 });
    }).catch(function () { /* the map still shows; there are just no pins */ });
    map.on('click', function () { select(null); });
  }

  function open() {
    app.classList.add('street-on');
    view.hidden = false;
    if (captionEl) { if (!savedCaption) savedCaption = captionEl.textContent; captionEl.textContent = 'Streets and buildings'; }
    [tab2d, tab3d].forEach(function (t) { t.setAttribute('aria-selected', 'false'); });
    tabStreet.setAttribute('aria-selected', 'true');
    build();
    setTimeout(function () { if (map) map.invalidateSize(); }, 50);
  }
  function close(toTab) {
    if (view.hidden) return;
    app.classList.remove('street-on');
    view.hidden = true;
    if (captionEl && savedCaption) { captionEl.textContent = savedCaption; savedCaption = ''; }
    tabStreet.setAttribute('aria-selected', 'false');
    if (toTab && !toTab.disabled) toTab.setAttribute('aria-selected', 'true');
  }

  tabStreet.addEventListener('click', open);
  tab2d.addEventListener('click', function () { close(tab2d); });
  tab3d.addEventListener('click', function () { close(tab3d); });

  // No 2D or 3D map uploaded yet: the street map is the useful default instead of an empty page.
  setTimeout(function () { if (tab2d.disabled && tab3d.disabled && view.hidden) open(); }, 1500);
})();
