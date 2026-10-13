<?php

// GET /api/setup-health.php -> { success, fixes: n, tips: n, items: [...] }   (admin-only)
//
// The same questions Backend/scripts/setup-audit.php asks, trimmed to the ones that block the
// AR guide or leave a room unfindable, so the admin dashboard can show "what to fix next" with
// a link to the page that fixes it. Read-only; every item is { level: fix|tip, title, detail,
// href, action }. The CLI script stays the full checkup (path geometry, tidy-up hints).

header('Content-Type: application/json');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/_require_admin.php';

$db = new Database();
$conn = $db->connect();

function rows_of($conn, $sql) {
    $out = [];
    $r = $conn->query($sql);
    if ($r) while ($row = $r->fetch_assoc()) $out[] = $row;
    return $out;
}

$items = [];
function add(&$items, $level, $building, $floor, $problem, $detail, $href, $action) {
    $title = trim($building . ($floor !== '' ? ', ' . $floor : '') . ': ' . $problem, ': ');
    $items[] = ['level' => $level, 'building' => $building, 'floor' => $floor, 'problem' => $problem,
                'title' => $title, 'detail' => $detail, 'href' => $href, 'action' => $action];
}

$buildings = rows_of($conn, "SELECT id, name, lat, lng, floor_count, entrance_node_id FROM buildings ORDER BY name");
$plans = rows_of($conn, "SELECT id, building_id, floor, north_offset, meters_per_unit_x mx, meters_per_unit_y my FROM floor_plans ORDER BY building_id, id");
$plansByBuilding = [];
foreach ($plans as $p) $plansByBuilding[(int) $p['building_id']][] = $p;

// Node counts per plan, and which plans have a stairs/elevator link to another floor.
$nodeCount = [];
foreach (rows_of($conn, "SELECT floor_plan_id id, COUNT(*) c FROM floor_plan_nodes GROUP BY floor_plan_id") as $r) {
    $nodeCount[(int) $r['id']] = (int) $r['c'];
}
$linked = [];
foreach (rows_of($conn,
    "SELECT DISTINCT a.floor_plan_id AS pa, b.floor_plan_id AS pb
     FROM floor_plan_edges e
     JOIN floor_plan_nodes a ON a.id = e.node_a_id
     JOIN floor_plan_nodes b ON b.id = e.node_b_id
     WHERE a.floor_plan_id <> b.floor_plan_id") as $r) {
    $linked[(int) $r['pa']] = true;
    $linked[(int) $r['pb']] = true;
}

// Rooms on a floor that has a plan but no marker placed on it.
$unmarked = [];
foreach (rows_of($conn,
    "SELECT r.building_id, r.floor, COUNT(*) c
     FROM rooms r
     JOIN floor_plans fp ON fp.building_id = r.building_id AND fp.floor = r.floor
     WHERE r.map_x IS NULL OR r.map_y IS NULL
     GROUP BY r.building_id, r.floor") as $r) {
    $unmarked[(int) $r['building_id']][$r['floor']] = (int) $r['c'];
}
// Buildings whose entrance and exit were chosen in Admin > Doors (the table may not exist yet: then none were).
$doorsSet = [];
try {
    foreach (rows_of($conn, "SELECT building_id, COUNT(DISTINCT kind) k FROM building_doors GROUP BY building_id") as $r) $doorsSet[(int) $r['building_id']] = (int) $r['k'] >= 2;
} catch (Throwable $e) { /* no doors saved yet */ }
$unnumbered = [];
foreach (rows_of($conn,
    "SELECT building_id, COUNT(*) c FROM rooms
     WHERE (room_number IS NULL OR room_number = '') AND category <> 'cr' GROUP BY building_id") as $r) {
    $unnumbered[(int) $r['building_id']] = (int) $r['c'];
}

if (!rows_of($conn, "SELECT id FROM campus_nodes LIMIT 1")) {
    add($items, 'fix', 'Campus', '', 'No walkways drawn', 'Outdoor directions need a connected walkway network.', 'campus-paths.php', 'Open Campus Paths');
}

foreach ($buildings as $b) {
    $bid = (int) $b['id'];
    $name = $b['name'];
    $edit = 'building-edit.php?edit=' . $bid;

    if ($b['entrance_node_id'] === null) {
        add($items, 'fix', $name, '', 'No entrance set', 'Outdoor routing to this building fails until an entrance point is set.', 'campus-paths.php', 'Set entrance');
    }

    $bp = $plansByBuilding[$bid] ?? [];
    if (!$bp) {
        add($items, 'tip', $name, '', 'No floor plans uploaded', 'Indoor AR is off; students still get text directions.', $edit, 'Upload plans');
        continue;
    }
    if (count($bp) < (int) $b['floor_count']) {
        add($items, 'tip', $name, '', count($bp) . ' of ' . (int) $b['floor_count'] . ' floor plans uploaded', 'Upload the missing floors, or lower the floor count.', $edit, 'Edit building');
    }
    foreach ($bp as $p) {
        $pid = (int) $p['id'];
        $fl = $p['floor'];
        if (empty($nodeCount[$pid])) {
            add($items, 'fix', $name, $fl, 'No walkable path', 'Draw the hallways so routes and the indoor arrow can follow them.', $edit, 'Draw paths');
        }
        if ($p['north_offset'] === null || (float) $p['mx'] <= 0 || (float) $p['my'] <= 0) {
            add($items, 'fix', $name, $fl, 'Not calibrated', 'Indoor AR stays off for this floor until it is calibrated.', 'floor-calibration.php', 'Calibrate');
        }
        if (count($bp) > 1 && empty($linked[$pid])) {
            add($items, 'fix', $name, $fl, 'No stairs link to another floor', 'Routes cannot cross between floors without a stairs or elevator connection.', $edit, 'Link stairs');
        }
        $n = $unmarked[$bid][$p['floor']] ?? 0;
        if ($n > 0) {
            add($items, 'fix', $name, $fl, "$n room" . ($n > 1 ? 's' : '') . ' without a plan marker', 'Place each room on the plan so the arrow can lead to its door.', 'room-edit.php?building=' . $bid, 'Place markers');
        }
    }
    if (empty($doorsSet[$bid]) && count($buildings) > 1) {
        add($items, 'tip', $name, '', 'Entrance and exit points not set', 'Routes between buildings guess where the door is until it is chosen.', 'doors.php?building=' . $bid, 'Set doors');
    }
    if (!empty($unnumbered[$bid])) {
        $n = $unnumbered[$bid];
        add($items, 'tip', $name, '', "$n room" . ($n > 1 ? 's' : '') . ' without a number', 'Sign scanning cannot find rooms that have no number.', 'room-edit.php?building=' . $bid, 'Review rooms');
    }
}

// ---- Guided setup: nine steps per building, in the order an admin does them -------------------
$roomCounts = [];
foreach (rows_of($conn, "SELECT building_id, COUNT(*) c FROM rooms GROUP BY building_id") as $r) {
    $roomCounts[(int) $r['building_id']] = (int) $r['c'];
}
$progress = [];
foreach ($buildings as $b) {
    $bid = (int) $b['id'];
    $bp = $plansByBuilding[$bid] ?? [];
    $floors = max(1, (int) $b['floor_count']);
    $edit = 'building-edit.php?edit=' . $bid;
    $allHavePath = $bp && !array_filter($bp, fn($p) => empty($nodeCount[(int) $p['id']]));
    $allCalibrated = $bp && !array_filter($bp, fn($p) => $p['north_offset'] === null || (float) $p['mx'] <= 0 || (float) $p['my'] <= 0);
    $unmarkedHere = array_sum($unmarked[$bid] ?? []);
    // key, label, what it means in plain words, button text, where to do it
    $defs = [
        ['pin',       'Pin it on the map',    'Tells students where the building is.',                         'Open the building', $edit,                              $b['lat'] !== null && $b['lng'] !== null],
        ['floors',    'Set the floors',       'How many floors it has.',                                       'Set the floors',    $edit,                              (int) $b['floor_count'] >= 1],
        ['plans',     'Upload floor plans',   'A picture of each floor, so rooms can be shown on it.',         'Upload plans',      $edit,                              count($bp) >= $floors],
        ['paths',     'Draw walkable paths',  'Trace the hallways the arrow will follow indoors.',             'Draw paths',        $edit,                              (bool) $allHavePath],
        ['calibrate', 'Calibrate each floor', 'Tells the indoor guide how big each floor really is.',          'Calibrate floors',  'floor-calibration.php',            (bool) $allCalibrated],
        ['rooms',     'Add rooms',            'Register the offices, classrooms and labs.',                    'Add rooms',         'room-edit.php?building=' . $bid,   ($roomCounts[$bid] ?? 0) > 0],
        ['markers',   'Place room markers',   'Pin each room on its floor plan so the arrow can reach its door.', 'Place markers',  'room-edit.php?building=' . $bid,   ($roomCounts[$bid] ?? 0) > 0 && $unmarkedHere === 0],
        ['entrance',  'Set the entrance',     'Where outdoor directions end at the door.',                     'Set the entrance',  'campus-paths.php',                 $b['entrance_node_id'] !== null],
        ['doors',     'Mark the doors',       'Which path point is the way in and the way out, inside the building.', 'Set doors',        'doors.php?building=' . $bid,       !empty($doorsSet[$bid])],
    ];
    $steps = array_map(fn($d) => ['key' => $d[0], 'label' => $d[1], 'hint' => $d[2], 'cta' => $d[3], 'href' => $d[4], 'done' => (bool) $d[5]], $defs);
    $done = count(array_filter($steps, fn($st) => $st['done']));
    $next = null;
    foreach ($steps as $st) { if (!$st['done']) { $next = ['key' => $st['key'], 'label' => $st['label'], 'hint' => $st['hint'], 'cta' => $st['cta'], 'href' => $st['href']]; break; } }
    $progress[] = ['id' => $bid, 'name' => $b['name'], 'done' => $done, 'total' => count($steps), 'next' => $next, 'steps' => $steps];
}

$fixes = count(array_filter($items, fn($i) => $i['level'] === 'fix'));
usort($items, fn($a, $b) => ($a['level'] === 'fix' ? 0 : 1) <=> ($b['level'] === 'fix' ? 0 : 1));

echo json_encode(['success' => true, 'fixes' => $fixes, 'tips' => count($items) - $fixes, 'items' => $items, 'buildings' => $progress]);
