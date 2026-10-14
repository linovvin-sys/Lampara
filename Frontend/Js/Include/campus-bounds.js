/* Lampara — the one definition of "the campus" for every map and for the on-campus check.
   BOUNDS is the area shown in the satellite view of the campus (the Campus Paths map when it is fitted to the walkways).
   It is used three ways:
     - maps cannot be panned or zoomed out past it (CampusBounds.mapOptions / apply),
     - tile layers never request imagery outside it (CampusBounds.tileOptions),
     - a white line marks its edge on every map (CampusBounds.drawBoundary, added automatically),
     - visitors must be inside it, give or take GPS error, to use the student pages (Js/Include/geofence.js).
   Usage:  const map = L.map(el, CampusBounds.mapOptions()); CampusBounds.apply(map);
           CampusBounds.contains(lat, lng)   -> true when a point is inside the area
           CampusBounds.outsideBy(lat, lng)  -> metres from the area (0 when inside) */
(function () {
  // South-west and north-east corners, read off the campus satellite reference view (about 280 m wide, 215 m tall).
  var CFG = window.LAMPARA_CONFIG || {};   // the school's settings (Backend/api/institution.php); the numbers below are the fallback
  var BOUNDS = (CFG.bounds && CFG.bounds.length === 2) ? CFG.bounds : [[14.32685, 120.93987], [14.32880, 120.94248]];
  var CENTER = [(BOUNDS[0][0] + BOUNDS[1][0]) / 2, (BOUNDS[0][1] + BOUNDS[1][1]) / 2];
  var MIN_ZOOM = 17, MAX_ZOOM = 21;
  var M_PER_DEG = 111320;

  function contains(lat, lng) {
    return lat >= BOUNDS[0][0] && lat <= BOUNDS[1][0] && lng >= BOUNDS[0][1] && lng <= BOUNDS[1][1];
  }

  // How far outside the area a point is, in metres (0 when it is inside).
  function outsideBy(lat, lng) {
    var dLat = Math.max(BOUNDS[0][0] - lat, 0, lat - BOUNDS[1][0]) * M_PER_DEG;
    var dLng = Math.max(BOUNDS[0][1] - lng, 0, lng - BOUNDS[1][1]) * M_PER_DEG * Math.cos(CENTER[0] * Math.PI / 180);
    return Math.hypot(dLat, dLng);
  }

  // Options for L.map(): can't zoom out past the campus or pan away from it.
  function mapOptions(extra) {
    var o = { maxBounds: BOUNDS, maxBoundsViscosity: 1.0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM };
    for (var k in (extra || {})) o[k] = extra[k];
    return o;
  }

  // For tile layers: never request tiles from outside the campus.
  function tileOptions(extra) {
    var o = { bounds: BOUNDS, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, maxNativeZoom: 19 };
    for (var k in (extra || {})) o[k] = extra[k];
    return o;
  }

  // Applies the limits to a map that already exists (e.g. created with plain L.map).
  function apply(map) {
    map.setMaxBounds(BOUNDS);
    map.options.maxBoundsViscosity = 1.0;
    map.setMinZoom(MIN_ZOOM);
    map.setMaxZoom(MAX_ZOOM);
    fitMinZoom(map);
    drawBoundary(map);
    if (!map.getBounds().intersects(BOUNDS)) map.fitBounds(BOUNDS);
    return map;
  }

  // The lowest zoom is the one at which the whole campus just fits on the screen, so a visitor can see all of it and the white line
  // around it, but never zoom out into the surroundings.
  function fitMinZoom(map) {
    var size = map.getSize();
    if (!size.x || !size.y) return;
    var z = map.getBoundsZoom(BOUNDS, false);
    if (isFinite(z)) map.setMinZoom(Math.max(MIN_ZOOM, Math.min(z, MAX_ZOOM)));
  }

  // The campus limit drawn on the map as a white line (with a thin dark edge so it also shows on bright imagery).
  // It ignores taps, so the map underneath still works normally.
  function drawBoundary(map) {
    if (map._lamparaBoundary || !window.L) return;
    var world = [[-85, -180], [-85, 180], [85, 180], [85, -180]];
    var hole = [[BOUNDS[0][0], BOUNDS[0][1]], [BOUNDS[0][0], BOUNDS[1][1]], [BOUNDS[1][0], BOUNDS[1][1]], [BOUNDS[1][0], BOUNDS[0][1]]];
    map._lamparaBoundary = L.layerGroup([
      // everything outside the campus is covered in flat grey (a polygon with the campus cut out of it)
      L.polygon([world, hole], { stroke: false, fillColor: '#dddddd', fillOpacity: 1, interactive: false, className: 'campus-mask' }),
      L.rectangle(BOUNDS, { color: '#000', opacity: 0.35, weight: 6, fill: false, interactive: false, className: 'campus-limit' }),
      L.rectangle(BOUNDS, { color: '#fff', opacity: 1, weight: 3, fill: false, interactive: false, className: 'campus-limit' })
    ]).addTo(map);
  }

  // Every map created with CampusBounds.mapOptions() gets the screen-size fit automatically.
  if (window.L && L.Map && L.Map.addInitHook) {
    L.Map.addInitHook(function () {
      var m = this, mb = m.options.maxBounds;
      if (!mb) return;
      var sw = mb.getSouthWest ? mb.getSouthWest() : null;
      if (!sw || Math.abs(sw.lat - BOUNDS[0][0]) > 1e-9) return;
      fitMinZoom(m);
      drawBoundary(m);
      m.on('resize', function () { fitMinZoom(m); });
    });
  }

  window.CampusBounds = { CENTER: CENTER, BOUNDS: BOUNDS, contains: contains, outsideBy: outsideBy, mapOptions: mapOptions, tileOptions: tileOptions, apply: apply, drawBoundary: drawBoundary };
})();
