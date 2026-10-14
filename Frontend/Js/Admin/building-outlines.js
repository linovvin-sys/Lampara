// Admin: link each building outline (the shapes the 3D map and AR guide use) to a registered building.
// Writes go to PUT api/campus-footprints.php?id=; the 3D map picks the change up on its next load.
(function () {
  var API = '../../../Backend/api/campus-footprints.php';
  var $ = function (id) { return document.getElementById(id); };
  var outlines = [];                 // { id, building_id, points, poly }
  var buildings = [];
  var selected = null;

  var map = L.map('map', CampusBounds.mapOptions()).setView(CampusBounds.CENTER, 19);
  var sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri', bounds: CampusBounds.BOUNDS, maxZoom: 21, maxNativeZoom: 19 }).addTo(map);
  var osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', bounds: CampusBounds.BOUNDS, maxZoom: 21, maxNativeZoom: 19 });
  L.control.layers({ Satellite: sat, Streets: osm }, null, { position: 'topright' }).addTo(map);

  function nameOf(id) { var b = buildings.find(function (x) { return +x.id === +id; }); return b ? b.name : 'Building ' + id; }
  function colourFor(id) { return 'hsl(' + ((id * 67) % 360) + ', 62%, 48%)'; }
  function style(o) {
    if (o === selected) return { color: '#e6bb00', weight: 3, fillColor: '#ffd100', fillOpacity: 0.7 };
    if (o.building_id == null) return { color: '#fff', weight: 1.5, fillColor: '#fff', fillOpacity: 0.25 };
    var c = colourFor(o.building_id);
    return { color: c, weight: 2, fillColor: c, fillOpacity: 0.5 };
  }
  function refresh(o) {
    o.poly.setStyle(style(o));
    o.poly.setTooltipContent('<span class="ol-tip">' + (o.building_id == null ? 'Not linked' : esc(nameOf(o.building_id))) + '</span> (#' + o.id + ')');
  }
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  function summary() {
    var n = outlines.length, linked = outlines.filter(function (o) { return o.building_id != null; }).length;
    $('summary').textContent = linked + ' of ' + n + ' outlines are linked to a building.';
    var unlinked = buildings.filter(function (b) { return !outlines.some(function (o) { return +o.building_id === +b.id; }); });
    var note = $('unlinked-note');
    note.hidden = !unlinked.length;
    note.textContent = unlinked.length ? 'No outline yet for: ' + unlinked.map(function (b) { return b.name; }).join(', ') + '.' : '';
  }

  function select(o) {
    var prev = selected; selected = o;
    if (prev) refresh(prev);
    if (!o) { $('form').hidden = true; $('empty').hidden = false; return; }
    refresh(o); o.poly.bringToFront();
    $('empty').hidden = true; $('form').hidden = false;
    $('oid').textContent = 'Outline #' + o.id;
    $('bsel').value = o.building_id == null ? '' : String(o.building_id);
  }

  function save(bid) {
    var o = selected; if (!o) return;
    fetch(API + '?id=' + o.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building_id: bid }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.success) throw new Error(j.error || 'Could not save'); return j; }); })
      .then(function () {
        o.building_id = bid; refresh(o); summary(); $('bsel').value = bid == null ? '' : String(bid);
        Swal.fire({ icon: 'success', title: bid == null ? 'Outline unlinked' : 'Linked to ' + nameOf(bid) });
      })
      .catch(function (e) { Swal.fire({ icon: 'error', title: 'Error', text: e.message }); });
  }

  $('save').addEventListener('click', function () { save($('bsel').value === '' ? null : +$('bsel').value); });
  $('unlink').addEventListener('click', function () { save(null); });
  map.on('click', function () { select(null); });

  Promise.all([
    fetch(API).then(function (r) { return r.json(); }),
    fetch('../../../Backend/api/buildings.php').then(function (r) { return r.json(); })
  ]).then(function (res) {
    buildings = (Array.isArray(res[1]) ? res[1] : res[1].buildings || []).slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
    $('bsel').innerHTML = '<option value="">Not linked</option>' + buildings.map(function (b) { return '<option value="' + b.id + '">' + esc(b.name) + '</option>'; }).join('');
    var all = [];
    (res[0].footprints || []).filter(function (f) { return f.kind === 'building'; }).forEach(function (f) {
      var o = { id: f.id, building_id: f.building_id, points: f.points };
      o.poly = L.polygon(f.points, style(o)).addTo(map).bindTooltip('', { sticky: true });
      o.poly.on('click', function (e) { L.DomEvent.stopPropagation(e); select(o); });
      outlines.push(o); all = all.concat(f.points);
      refresh(o);
    });
    if (all.length) map.fitBounds(all, { padding: [30, 30], maxZoom: 20 });
    summary();
  }).catch(function () { $('summary').textContent = 'Could not load the outlines.'; });
})();
