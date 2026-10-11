/* Lampara — keeps the admin Leaflet maps within the neighbourhood of the school.
   One place defines "the vicinity", so every map (Campus Paths, building pin picker, campus preview) agrees.
   Usage:  const map = L.map(el, CampusBounds.mapOptions()); CampusBounds.apply(map);
           CampusBounds.contains(lat, lng)  -> true when a point is inside the allowed area. */
(function () {
  // Centre of the NCST campus and how far the maps may wander from it (about 450 m each way).
  var CENTER = [14.3279, 120.9408];
  var PAD_LAT = 0.0042, PAD_LNG = 0.0046;
  var MIN_ZOOM = 16, MAX_ZOOM = 21;

  var BOUNDS = [[CENTER[0] - PAD_LAT, CENTER[1] - PAD_LNG], [CENTER[0] + PAD_LAT, CENTER[1] + PAD_LNG]];

  function contains(lat, lng) {
    return lat >= BOUNDS[0][0] && lat <= BOUNDS[1][0] && lng >= BOUNDS[0][1] && lng <= BOUNDS[1][1];
  }

  // Options for L.map(): can't zoom out past the neighbourhood or pan away from it.
  function mapOptions(extra) {
    var o = { maxBounds: BOUNDS, maxBoundsViscosity: 1.0, minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM };
    for (var k in (extra || {})) o[k] = extra[k];
    return o;
  }

  // For tile layers: never request tiles from outside the allowed area.
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
    if (!map.getBounds().intersects(BOUNDS)) map.fitBounds(BOUNDS);
    return map;
  }

  window.CampusBounds = { CENTER: CENTER, BOUNDS: BOUNDS, contains: contains, mapOptions: mapOptions, tileOptions: tileOptions, apply: apply };
})();
