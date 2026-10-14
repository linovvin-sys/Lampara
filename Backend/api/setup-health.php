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
require_once __DIR__ . '/../change_log.php';

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

$buildings = rows_of($conn, "SELECT id, name, lat, lng, floor_count, entrance_node_id, " . (column_exists($conn, 'buildings', 'is_open') ? 'is_open' : '0 AS is_open') . " FROM buildings ORDER BY name");
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

$unnumbered = [];
foreach (rows_of($conn,
    "SELECT building_id, COUNT(*) c FROM rooms
     WHERE (room_number IS NULL OR room_number = '') AND category <> 'cr' GROUP BY building_id") as $r) {
    $unnumbered[(int) $r['building_id']] = (int) $r['c'];
}

if (!rows_of($conn, "SELECT id FROM campus_nodes LIMIT 1")) {
    add($items, 'fix', 'Campus', '', 'No walkways drawn', 'Outdoor directions need a connected walkway network.', 'campus-paths.php', 'Open Campus Paths');
}

// Visitors coming from outside the gates (Heritage, JEG) must go in by the human main entrance. It is the point named "Main Entrance", or a gate
// whose name says entrance. A gate called an exit is only a way out.
if (rows_of($conn, "SELECT id FROM campus_nodes LIMIT 1") && !rows_of($conn, "SELECT id FROM campus_nodes WHERE name REGEXP 'main[[:space:]]*entrance' OR (node_type = 'gate' AND name REGEXP 'entr' AND name NOT REGEXP 'exit|vehicle') LIMIT 1")) {
    add($items, 'fix', 'Campus', '', 'No main entrance for people on foot', 'Drop a Gate point at the walking entrance, connect it to the paths, and name it "Main Entrance". Until then the guide has to send people in through the exit gate.', 'campus-paths.php', 'Add the entrance');
}

foreach ($buildings as $b) {
    $bid = (int) $b['id'];
    $name = $b['name'];
    $edit = 'buildings.php?tab=details&b=' . $bid;
    if (!empty($b['is_open'])) continue; // open type: no entrance point, hallways or floor plans to set up

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
        if (count($bp) > 1 && empty($linked[$pid])) {
            add($items, 'fix', $name, $fl, 'No stairs link to another floor', 'Routes cannot cross between floors without a stairs or elevator connection.', $edit, 'Link stairs');
        }
    }
    if (!empty($unnumbered[$bid])) {
        $n = $unnumbered[$bid];
        add($items, 'tip', $name, '', "$n room" . ($n > 1 ? 's' : '') . ' without a number', 'Sign scanning cannot find rooms that have no number.', 'buildings.php?tab=rooms&b=' . $bid, 'Review rooms');
    }
}

// ---- Guided setup: the steps per building, in the order an admin does them -------------------
$roomCounts = [];
foreach (rows_of($conn, "SELECT building_id, COUNT(*) c FROM rooms GROUP BY building_id") as $r) {
    $roomCounts[(int) $r['building_id']] = (int) $r['c'];
}
$progress = [];
foreach ($buildings as $b) {
    $bid = (int) $b['id'];
    $bp = $plansByBuilding[$bid] ?? [];
    $floors = max(1, (int) $b['floor_count']);
    $edit = 'buildings.php?tab=details&b=' . $bid;
    $isOpen = !empty($b['is_open']);
    $allHavePath = $bp && !array_filter($bp, fn($p) => empty($nodeCount[(int) $p['id']]));
    // key, label, what it means in plain words, button text, where to do it
    $defs = [
        ['pin',       'Pin it on the map',    'Tells students where the building is.',                         'Open the building', $edit,                              $b['lat'] !== null && $b['lng'] !== null],
        ['floors',    'Set the floors',       'How many floors it has.',                                       'Set the floors',    $edit,                              (int) $b['floor_count'] >= 1],
        ['plans',     'Upload floor plans',   'A picture of each floor, so rooms can be shown on it.',         'Upload plans',      $edit,                              count($bp) >= $floors],
        ['paths',     'Draw walkable paths',  'Trace the hallways the arrow will follow indoors.',             'Draw paths',        $edit,                              (bool) $allHavePath],
        ['rooms',     'Add rooms',            'Register the offices, classrooms and labs.',                    'Add rooms',         'buildings.php?tab=rooms&b=' . $bid,   ($roomCounts[$bid] ?? 0) > 0],
        ['entrance',  'Set the entrance',     'Where outdoor directions end at the door.',                     'Set the entrance',  'campus-paths.php',                 $b['entrance_node_id'] !== null],
    ];
    if ($isOpen) $defs = array_values(array_filter($defs, fn($d) => in_array($d[0], ['pin', 'rooms'], true)));
    $steps = array_map(fn($d) => ['key' => $d[0], 'label' => $d[1], 'hint' => $d[2], 'cta' => $d[3], 'href' => $d[4], 'done' => (bool) $d[5]], $defs);
    $done = count(array_filter($steps, fn($st) => $st['done']));
    $next = null;
    foreach ($steps as $st) { if (!$st['done']) { $next = ['key' => $st['key'], 'label' => $st['label'], 'hint' => $st['hint'], 'cta' => $st['cta'], 'href' => $st['href']]; break; } }
    $progress[] = ['id' => $bid, 'name' => $b['name'], 'done' => $done, 'total' => count($steps), 'next' => $next, 'steps' => $steps];
}

$fixes = count(array_filter($items, fn($i) => $i['level'] === 'fix'));
usort($items, fn($a, $b) => ($a['level'] === 'fix' ? 0 : 1) <=> ($b['level'] === 'fix' ? 0 : 1));

echo json_encode(['success' => true, 'fixes' => $fixes, 'tips' => count($items) - $fixes, 'items' => $items, 'buildings' => $progress]);
