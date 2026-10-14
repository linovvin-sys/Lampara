/* The campus base map for the admin map pickers: the 2D topo export (building outlines and roads, already in GPS coordinates),
   drawn on a plain background instead of OpenStreetMap tiles. Works offline once loaded. TopoBase.add(map) puts it under everything else. */
(function () {
  'use strict';
  var URL = '../../../Backend/api/campus-footprints.php';
  var cache = null;
  function load() {
    if (cache) return cache;
    cache = fetch(URL, { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) { return d.footprints || []; }).catch(function () { cache = null; return []; });
    return cache;
  }
  function add(map) {
    var el = map.getContainer(); el.style.background = '#f4f5fb';
    var g = L.layerGroup().addTo(map);
    load().then(function (list) {
      list.forEach(function (f) {
        if (!f.points || f.points.length < 2) return;
        if (f.kind === 'road') L.polyline(f.points, { color: '#c9cde8', weight: 4, opacity: 0.95, interactive: false }).addTo(g);
        else L.polygon(f.points, { color: '#9ca2cf', weight: 1, fillColor: f.building_id ? '#d8dbf3' : '#e6e8f5', fillOpacity: 0.95, interactive: false }).addTo(g);
      });
      g.eachLayer(function (l) { if (l.bringToBack) l.bringToBack(); });
    });
    return g;
  }
  window.TopoBase = { add: add };
})();
