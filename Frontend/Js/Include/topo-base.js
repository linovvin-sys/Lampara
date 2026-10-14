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
        if (f.kind === 'road') L.polyline(f.points, { color: '#aab0d8', weight: 5, opacity: 1, interactive: false }).addTo(g);
        else L.polygon(f.points, { color: '#7f87c0', weight: 1.5, fillColor: f.building_id ? '#c3c8ee' : '#dfe2f4', fillOpacity: 1, interactive: false }).addTo(g);
      });
      g.eachLayer(function (l) { if (l.bringToBack) l.bringToBack(); });
    });
    return g;
  }
  window.TopoBase = { add: add };
})();
