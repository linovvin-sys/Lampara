/* The campus gates, for search and for walking to them. A gate is a "gate" point on the campus walkway map; the name an admin gave it
   says who uses it. Name one "Main gate (people)" or "Back gate (vehicles)" (or use words like pedestrian, car, motorcycle, drive) and
   students can search for it by that. A gate whose name says neither is shown as a plain entrance and exit. */
(function () {
  'use strict';
  var VEHICLE = /vehicle|\bcars?\b|motor|truck|\bdrive|parking|service|\bvan\b|jeep|tricycle/i;
  var PEOPLE = /pedestrian|people|human|\bwalk|foot|person|student|\bgate for\b/i;
  var AUTO = /^\s*point\s+[a-z]+\s*$/i;                      // the automatic "Point D" kind of name

  function kindOf(name) {
    var v = VEHICLE.test(name || ''), p = PEOPLE.test(name || '');
    return v && p ? 'both' : v ? 'vehicles' : p ? 'people' : 'any';
  }
  var LABEL = { people: 'People on foot', vehicles: 'Vehicles', both: 'People and vehicles', any: 'Entrance and exit' };
  var SYN = {
    people: 'people pedestrian pedestrians walking walk human humans person on foot',
    vehicles: 'vehicle vehicles car cars motorcycle motorbike jeep tricycle drive driveway parking',
    both: 'people pedestrian human vehicle vehicles car cars walk',
    any: ''
  };

  // [{ nodeId, name, kind, kindLabel, lat, lng, words }] from the campus graph ({ nodes: [...] })
  function list(graph) {
    var out = [];
    ((graph && graph.nodes) || []).forEach(function (n) {
      if (n.node_type !== 'gate') return;
      var raw = String(n.name || '').trim(), kind = kindOf(raw);
      var name = !raw || AUTO.test(raw) ? 'Campus gate' + (raw ? ' (' + raw + ')' : '') : raw;
      out.push({ nodeId: n.id, name: name, kind: kind, kindLabel: LABEL[kind], lat: Number(n.lat), lng: Number(n.lng),
        words: (name + ' gate gates entrance entrances exit exits entry enter in out leave way ' + SYN[kind] + ' ' + LABEL[kind]).toLowerCase() });
    });
    return out.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }
  // The shape the walking guide uses for a destination: it routes to the gate's walkway point.
  function asTarget(g) {
    return { id: 'gate-' + g.nodeId, gate: true, name: g.name, lat: g.lat, lng: g.lng, entrance_node_id: g.nodeId, floor_count: 0, room_count: 0, directory: '' };
  }
  window.LamparaGates = { list: list, kindOf: kindOf, asTarget: asTarget, LABEL: LABEL };
})();
