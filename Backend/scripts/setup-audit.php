<?php

// Read-only checkup of the whole campus setup. It changes nothing; it lists what is done,
// what is missing, and what to fix, in the order the admin would do it:
//
//   php Backend/scripts/setup-audit.php
//
// Sections: 1 server  2 campus walkways  3 each building (entrance, floor plans, paths,
// calibration, rooms, stairs)  4 summary. "FIX" lines block a working AR guide, "TIP" lines
// are optional polish (for example points that can be merged into a straight hallway).

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line.\n");
}

require_once __DIR__ . '/../config.php';

$db = new Database();
$conn = $db->connect();
$root = realpath(__DIR__ . '/../../');

$fixes = 0;
$tips = 0;
function ok($m)  { echo "  [ok]   $m\n"; }
function fix($m) { global $fixes; $fixes++; echo "  [FIX]  $m\n"; }
function tip($m) { global $tips; $tips++; echo "  [tip]  $m\n"; }
function head($m) { echo "\n== $m ==\n"; }

function rows($conn, $sql) {
    $out = [];
    $r = $conn->query($sql);
    while ($row = $r->fetch_assoc()) $out[] = $row;
    return $out;
}

// Connected components of an undirected graph given node ids and [a,b] edges.
function components(array $ids, array $edges): array {
    $parent = [];
    foreach ($ids as $i) $parent[$i] = $i;
    $find = function ($x) use (&$parent, &$find) {
        while ($parent[$x] !== $x) { $parent[$x] = $parent[$parent[$x]]; $x = $parent[$x]; }
        return $x;
    };
    foreach ($edges as [$a, $b]) {
        if (isset($parent[$a], $parent[$b])) $parent[$find($a)] = $find($b);
    }
    $groups = [];
    foreach ($ids as $i) $groups[$find($i)][] = $i;
    return array_values($groups);
}

function dist_to_segment($px, $py, $ax, $ay, $bx, $by) {
    $dx = $bx - $ax; $dy = $by - $ay;
    $len2 = $dx * $dx + $dy * $dy;
    $t = $len2 > 0 ? max(0, min(1, (($px - $ax) * $dx + ($py - $ay) * $dy) / $len2)) : 0;
    return hypot($px - ($ax + $t * $dx), $py - ($ay + $t * $dy));
}

// ---------------------------------------------------------------- 1. server
head('1. Server');
$secrets = $root . '/Backend/secrets.php';
if (is_file($secrets)) ok('Backend/secrets.php exists (Gemini key for sign reading and chat).');
else fix('Backend/secrets.php is missing: add your Gemini key there, or sign scanning and the chat will not work.');
foreach (['campus_nodes', 'floor_plan_nodes'] as $t) {
    $c = $conn->query("SHOW COLUMNS FROM $t LIKE 'name'");
    if ($c && $c->num_rows) ok("$t has the point-name column.");
    else fix("$t has no name column: run the ALTER TABLE line in Backend/schema.sql, then php Backend/scripts/name-points.php.");
}
foreach (['sync_ops', 'sync_temp_ids'] as $t) {
    $c = $conn->query("SHOW TABLES LIKE '$t'");
    if ($c && $c->num_rows) ok("$t table exists (admin offline sync).");
    else fix("$t table is missing: run the offline-sync part of Backend/schema.sql.");
}

// ---------------------------------------------------------------- 2. campus
head('2. Campus walkways (outdoor)');
$nodes = rows($conn, "SELECT id, lat, lng, node_type, name FROM campus_nodes ORDER BY id");
$edges = rows($conn, "SELECT node_a_id a, node_b_id b FROM campus_edges");
$buildings = rows($conn, "SELECT id, name, lat, lng, floor_count, entrance_node_id FROM buildings ORDER BY id");
$ids = array_map('intval', array_column($nodes, 'id'));
$pairs = array_map(fn($e) => [(int) $e['a'], (int) $e['b']], $edges);
$label = [];
foreach ($nodes as $n) $label[(int) $n['id']] = $n['name'] ?: ('#' . $n['id']);

if (!$nodes) {
    fix('No walkway points yet. Campus Paths: walk the campus with "Record my walk", or tap the map.');
} else {
    ok(count($nodes) . ' points, ' . count($edges) . ' connections.');
    $comps = components($ids, $pairs);
    if (count($comps) === 1) ok('All walkway points are one connected network.');
    else {
        usort($comps, fn($x, $y) => count($y) - count($x));
        fix(count($comps) . ' separate walkway networks. A route cannot cross between them. Join the pieces: '
            . implode(' | ', array_map(fn($c) => implode(', ', array_map(fn($i) => $label[$i], $c)), $comps)));
    }
    $deg = array_fill_keys($ids, 0);
    foreach ($pairs as [$a, $b]) { $deg[$a]++; $deg[$b]++; }
    foreach ($nodes as $n) {
        $i = (int) $n['id'];
        if ($deg[$i] === 0) fix("{$label[$i]} is not connected to anything.");
        elseif ($deg[$i] === 1 && $n['node_type'] === 'junction') tip("{$label[$i]} is a dead end (one connection). Fine for a path end; otherwise connect it.");
    }
    // Points that could be merged: a degree-2 junction sitting on a straight line.
    foreach ($nodes as $n) {
        $i = (int) $n['id'];
        if ($deg[$i] !== 2 || $n['node_type'] !== 'junction') continue;
        $nb = [];
        foreach ($pairs as [$a, $b]) { if ($a === $i) $nb[] = $b; elseif ($b === $i) $nb[] = $a; }
        $P = $nodes[array_search($i, $ids)];
        $A = $nodes[array_search($nb[0], $ids)]; $B = $nodes[array_search($nb[1], $ids)];
        $k = cos(deg2rad((float) $P['lat']));
        $v1 = [((float) $A['lng'] - (float) $P['lng']) * $k, (float) $A['lat'] - (float) $P['lat']];
        $v2 = [((float) $B['lng'] - (float) $P['lng']) * $k, (float) $B['lat'] - (float) $P['lat']];
        $l1 = hypot(...$v1); $l2 = hypot(...$v2);
        if ($l1 > 0 && $l2 > 0) {
            $cos = ($v1[0] * $v2[0] + $v1[1] * $v2[1]) / ($l1 * $l2);
            if ($cos < -0.985) tip("{$label[$i]} sits on a straight stretch between {$label[$nb[0]]} and {$label[$nb[1]]}; it could be removed and those two joined.");
        }
    }
}
$unplaced = array_filter($buildings, fn($b) => $b['lat'] === null || $b['lng'] === null);
if ($unplaced) fix('Buildings without coordinates: ' . implode(', ', array_column($unplaced, 'name')));

// ---------------------------------------------------------------- 3. buildings
foreach ($buildings as $b) {
    $bid = (int) $b['id'];
    head("3. {$b['name']} (id $bid)");

    // entrance
    if ($b['entrance_node_id'] === null) fix('No entrance set. Campus Paths: tap the building door point, then "Entrance of" this building.');
    else {
        $e = (int) $b['entrance_node_id'];
        if (!isset($deg[$e])) fix('Entrance points to a missing point.');
        elseif ($deg[$e] === 0) fix("Entrance {$label[$e]} is not connected to the walkways.");
        else {
            $comps = components($ids, $pairs);
            $main = 0; $mine = null;
            foreach ($comps as $c) { if (count($c) > $main) $main = count($c); if (in_array($e, $c, true)) $mine = count($c); }
            if ($mine === $main) ok("Entrance {$label[$e]} is connected to the campus network.");
            else fix("Entrance {$label[$e]} is on a detached piece of the walkway network.");
        }
    }

    // floors
    $plans = rows($conn, "SELECT id, floor, image_path, north_offset, meters_per_unit_x mx, meters_per_unit_y my FROM floor_plans WHERE building_id = $bid ORDER BY id");
    if (!$plans) { echo "  (no floor plans uploaded: indoor AR is off; text directions still work)\n"; $roomsOnly = rows($conn, "SELECT COUNT(*) c FROM rooms WHERE building_id = $bid"); echo '  ' . $roomsOnly[0]['c'] . " rooms registered.\n"; continue; }
    $declared = (int) $b['floor_count'];
    if (count($plans) < $declared) tip(count($plans) . " floor plan(s) uploaded for $declared floors. Upload the rest in Register Building, or lower the floor count.");
    else ok(count($plans) . ' floor plan(s) uploaded.');

    $floorOfNode = [];
    $allNodeIds = [];
    $planNodes = [];
    $planEdges = [];
    foreach ($plans as $p) {
        $pid = (int) $p['id'];
        $planNodes[$pid] = rows($conn, "SELECT id, x, y, name FROM floor_plan_nodes WHERE floor_plan_id = $pid ORDER BY id");
        foreach ($planNodes[$pid] as $n) { $floorOfNode[(int) $n['id']] = $pid; $allNodeIds[] = (int) $n['id']; }
    }
    $edgeRows = $allNodeIds ? rows($conn, "SELECT node_a_id a, node_b_id b FROM floor_plan_edges WHERE node_a_id IN (" . implode(',', $allNodeIds) . ")") : [];
    $stairs = [];
    foreach ($edgeRows as $e) {
        $a = (int) $e['a']; $bb = (int) $e['b'];
        if (!isset($floorOfNode[$bb])) continue;
        if ($floorOfNode[$a] === $floorOfNode[$bb]) $planEdges[$floorOfNode[$a]][] = [$a, $bb];
        else $stairs[] = [$a, $bb];
    }

    $floorsLinked = [];
    foreach ($stairs as [$a, $bb]) { $floorsLinked[$floorOfNode[$a]] = true; $floorsLinked[$floorOfNode[$bb]] = true; }

    foreach ($plans as $p) {
        $pid = (int) $p['id'];
        echo "\n  -- {$p['floor']} (plan $pid) --\n";
        $file = $root . '/Frontend/' . $p['image_path'];
        $size = is_file($file) ? @getimagesize($file) : false;
        if (!$size) fix('The plan image file is missing on disk: ' . $p['image_path']);
        $w = $size ? $size[0] : 1; $h = $size ? $size[1] : 1;

        $pn = $planNodes[$pid];
        $pe = $planEdges[$pid] ?? [];
        $pl = []; foreach ($pn as $n) $pl[(int) $n['id']] = $n['name'] ?: ('#' . $n['id']);
        if (!$pn) fix('No walkable path drawn. Register Building, "Edit walkable paths".');
        else {
            ok(count($pn) . ' points, ' . count($pe) . ' connections.');
            $pids = array_map(fn($n) => (int) $n['id'], $pn);
            $comps = components($pids, $pe);
            if (count($comps) === 1) ok('Path is one connected network.');
            else fix(count($comps) . ' separate path pieces on this floor: ' . implode(' | ', array_map(fn($c) => implode(', ', array_map(fn($i) => $pl[$i], $c)), $comps)));

            // tidy-up hints: off-axis edges and pass-through points
            $pdeg = array_fill_keys($pids, 0);
            foreach ($pe as [$a, $bb]) { $pdeg[$a]++; $pdeg[$bb]++; }
            $byId = []; foreach ($pn as $n) $byId[(int) $n['id']] = $n;
            $crooked = 0;
            foreach ($pe as [$a, $bb]) {
                $dx = ((float) $byId[$bb]['x'] - (float) $byId[$a]['x']) / 100 * $w;
                $dy = ((float) $byId[$bb]['y'] - (float) $byId[$a]['y']) / 100 * $h;
                $len = hypot($dx, $dy);
                if ($len < 1) continue;
                $off = min(abs($dx), abs($dy)) / $len;        // sine of the angle from the nearest axis
                if ($off > 0.004 && $off < 0.10) $crooked++;
            }
            if ($crooked) tip("$crooked connection(s) are almost, but not exactly, horizontal or vertical. Drag their points into line for straighter AR arrows.");
            $hasStairs = isset($floorsLinked[$pid]);
            foreach ($pn as $n) {
                $i = (int) $n['id'];
                if ($pdeg[$i] !== 2) continue;
                $nb = [];
                foreach ($pe as [$a, $bb]) { if ($a === $i) $nb[] = $bb; elseif ($bb === $i) $nb[] = $a; }
                $v1 = [((float) $byId[$nb[0]]['x'] - (float) $n['x']) / 100 * $w, ((float) $byId[$nb[0]]['y'] - (float) $n['y']) / 100 * $h];
                $v2 = [((float) $byId[$nb[1]]['x'] - (float) $n['x']) / 100 * $w, ((float) $byId[$nb[1]]['y'] - (float) $n['y']) / 100 * $h];
                $l1 = hypot(...$v1); $l2 = hypot(...$v2);
                if ($l1 > 0 && $l2 > 0 && ($v1[0] * $v2[0] + $v1[1] * $v2[1]) / ($l1 * $l2) < -0.985) {
                    tip("{$pl[$i]} is in the middle of a straight hallway between {$pl[$nb[0]]} and {$pl[$nb[1]]}; it can be removed.");
                }
            }
        }

        // calibration
        if ($p['north_offset'] !== null && (float) $p['mx'] > 0 && (float) $p['my'] > 0) {
            ok(sprintf('Calibrated: about %.1f m wide, plan-up points %d deg from north.', (float) $p['mx'] * 100, (int) round((float) $p['north_offset'])));
        } else {
            fix('Not calibrated: the indoor AR guide is off for this floor. Floor Calibration (two ends of a hallway, real distance, compass).');
        }

        // rooms
        $rooms = rows($conn, "SELECT id, room_number, room_name, map_x, map_y FROM rooms WHERE building_id = $bid AND floor = '" . $conn->real_escape_string($p['floor']) . "' ORDER BY room_number");
        if (!$rooms) { echo "  (no rooms registered on this floor)\n"; }
        $noMarker = array_filter($rooms, fn($r) => $r['map_x'] === null || $r['map_y'] === null);
        $noNumber = array_filter($rooms, fn($r) => $r['room_number'] === null || $r['room_number'] === '');
        if ($rooms) ok(count($rooms) . ' room(s).');
        foreach ($noMarker as $r) fix('Room ' . ($r['room_number'] ?: ($r["room_name"] ?: "#" . $r["id"])) . ' has no marker on the plan (Register Room / Manage Buildings).');
        foreach ($noNumber as $r) tip('Room #' . $r['id'] . ' (' . ($r["room_name"] ?: "unnamed") . ') has no room number, so sign scanning cannot find it.');
        // rooms far from any path
        if ($pn && $pe) {
            foreach ($rooms as $r) {
                if ($r['map_x'] === null) continue;
                $best = INF;
                foreach ($pe as [$a, $bb]) {
                    $best = min($best, dist_to_segment((float) $r['map_x'] / 100 * $w, (float) $r['map_y'] / 100 * $h,
                        (float) $byId[$a]['x'] / 100 * $w, (float) $byId[$a]['y'] / 100 * $h,
                        (float) $byId[$bb]['x'] / 100 * $w, (float) $byId[$bb]['y'] / 100 * $h));
                }
                $pct = $best / max($w, $h) * 100;
                if ($pct > 12) tip(sprintf('Room %s is about %.0f%% of the plan away from the nearest path; extend a path toward its door so the arrow leads to it.', $r['room_number'] ?: '#' . $r['id'], $pct));
            }
        }
        if (count($plans) > 1 && !isset($floorsLinked[$pid])) fix('No stairs or elevator link to another floor from here. In the path editor, select a stairs point, "Connect to another floor".');
    }
    if (count($plans) > 1 && $stairs) ok(count($stairs) . ' stairs/elevator link(s) between floors.');
}

// ---------------------------------------------------------------- 4. summary
head('4. Summary');
echo "  $fixes item(s) to FIX, $tips optional tip(s).\n";
echo $fixes === 0 ? "  The setup is complete: every floor with a route is ready for the AR guide.\n" : "  Fix the [FIX] lines first; they are the ones that stop the AR guide or routes from working.\n";
exit($fixes === 0 ? 0 : 1);
