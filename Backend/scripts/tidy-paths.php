<?php

// Straightens the walkable paths drawn on floor plans and drops points that only sit in the
// middle of a straight hallway. Every junction, turn, dead end, stairs point and room entry
// point is kept, and connections across floors are never touched.
//
//   php Backend/scripts/tidy-paths.php                  show what it would do (changes nothing)
//   php Backend/scripts/tidy-paths.php --apply          do it
//   php Backend/scripts/tidy-paths.php --plan=16        only that floor plan id
//
// Back the database up before --apply (for example: mysqldump lampara_db floor_plan_nodes
// floor_plan_edges rooms > backup.sql). Hallways that are almost horizontal or vertical
// (within about 6 degrees) are snapped to exactly horizontal or vertical; anything more
// slanted is left exactly as drawn.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line.\n");
}

require_once __DIR__ . '/../config.php';

$apply = in_array('--apply', $argv, true);
$only = null;
foreach ($argv as $a) if (preg_match('/^--plan=(\d+)$/', $a, $m)) $only = (int) $m[1];

const SNAP_SLOPE = 0.10;        // sine of the largest angle from an axis that still counts as "meant to be straight"
const MAX_SPREAD_PCT = 6.0;     // never pull a group of points further apart than this (percent of the plan)
const STRAIGHT_COS = -0.985;    // a point whose two connections are this straight (about 10 degrees) is pass-through

$db = new Database();
$conn = $db->connect();

function rows($conn, $sql) {
    $out = [];
    $r = $conn->query($sql);
    while ($row = $r->fetch_assoc()) $out[] = $row;
    return $out;
}

$plans = rows($conn, "SELECT id, building_id, floor, image_path FROM floor_plans" . ($only ? " WHERE id = $only" : '') . " ORDER BY id");
$totalMoved = 0; $totalRemoved = 0; $totalAdded = 0;

if ($apply) $conn->begin_transaction();

foreach ($plans as $p) {
    $pid = (int) $p['id'];
    $file = __DIR__ . '/../../Frontend/' . $p['image_path'];
    $size = is_file($file) ? @getimagesize($file) : false;
    $W = $size ? $size[0] : 1000; $H = $size ? $size[1] : 1000;

    $nodes = [];
    foreach (rows($conn, "SELECT id, x, y, name FROM floor_plan_nodes WHERE floor_plan_id = $pid ORDER BY id") as $n) {
        $nodes[(int) $n['id']] = ['x' => (float) $n['x'], 'y' => (float) $n['y'], 'name' => $n['name'] ?: '#' . $n['id']];
    }
    if (count($nodes) < 2) continue;
    $ids = array_keys($nodes);
    $in = implode(',', $ids);

    $edges = []; $pinned = [];
    foreach (rows($conn, "SELECT node_a_id a, node_b_id b FROM floor_plan_edges WHERE node_a_id IN ($in) OR node_b_id IN ($in)") as $e) {
        $a = (int) $e['a']; $b = (int) $e['b'];
        if (isset($nodes[$a]) && isset($nodes[$b])) $edges[min($a, $b) . '-' . max($a, $b)] = [min($a, $b), max($a, $b)];
        else { if (isset($nodes[$a])) $pinned[$a] = true; if (isset($nodes[$b])) $pinned[$b] = true; }   // stairs to another floor
    }
    foreach (rows($conn, "SELECT path_node_id FROM rooms WHERE path_node_id IN ($in)") as $r) $pinned[(int) $r['path_node_id']] = true;

    $orig = $nodes;

    // ---- 1. snap nearly-straight hallways to exactly horizontal / vertical
    foreach (['x', 'y'] as $axis) {
        $parent = array_combine($ids, $ids);
        $find = function ($v) use (&$parent, &$find) { while ($parent[$v] !== $v) { $parent[$v] = $parent[$parent[$v]]; $v = $parent[$v]; } return $v; };
        foreach ($edges as [$a, $b]) {
            $dx = ($nodes[$b]['x'] - $nodes[$a]['x']) / 100 * $W;
            $dy = ($nodes[$b]['y'] - $nodes[$a]['y']) / 100 * $H;
            $len = hypot($dx, $dy);
            if ($len < 1) continue;
            // an edge that runs along the y axis (vertical) shares one x; along the x axis (horizontal) shares one y
            $off = $axis === 'x' ? abs($dx) / $len : abs($dy) / $len;
            if ($off < SNAP_SLOPE) $parent[$find($a)] = $find($b);
        }
        $groups = [];
        foreach ($ids as $i) $groups[$find($i)][] = $i;
        foreach ($groups as $g) {
            if (count($g) < 2) continue;
            $vals = array_map(fn($i) => $nodes[$i][$axis], $g);
            if (max($vals) - min($vals) > MAX_SPREAD_PCT) continue;      // would drag points too far; leave as drawn
            $mean = round(array_sum($vals) / count($vals), 2);
            foreach ($g as $i) $nodes[$i][$axis] = $mean;
        }
    }

    // ---- 2. drop pass-through points (never stairs points or room entry points)
    $removed = [];
    $added = [];
    do {
        $again = false;
        $adj = array_fill_keys(array_keys($nodes), []);
        foreach ($edges as [$a, $b]) { $adj[$a][] = $b; $adj[$b][] = $a; }
        foreach ($nodes as $i => $n) {
            if (isset($pinned[$i]) || count($adj[$i]) !== 2) continue;
            [$a, $b] = $adj[$i];
            $v1 = [($nodes[$a]['x'] - $n['x']) / 100 * $W, ($nodes[$a]['y'] - $n['y']) / 100 * $H];
            $v2 = [($nodes[$b]['x'] - $n['x']) / 100 * $W, ($nodes[$b]['y'] - $n['y']) / 100 * $H];
            $l1 = hypot(...$v1); $l2 = hypot(...$v2);
            if ($l1 < 1 || $l2 < 1 || ($v1[0] * $v2[0] + $v1[1] * $v2[1]) / ($l1 * $l2) >= STRAIGHT_COS) continue;
            unset($edges[min($a, $i) . '-' . max($a, $i)], $edges[min($b, $i) . '-' . max($b, $i)]);
            $k = min($a, $b) . '-' . max($a, $b);
            if (!isset($edges[$k])) { $edges[$k] = [min($a, $b), max($a, $b)]; $added[$k] = [min($a, $b), max($a, $b)]; }
            $removed[$i] = $n['name'];
            unset($nodes[$i]);
            $again = true;
            break;                      // adjacency changed; start over
        }
    } while ($again);

    $moved = [];
    foreach ($nodes as $i => $n) {
        if (abs($n['x'] - $orig[$i]['x']) > 0.004 || abs($n['y'] - $orig[$i]['y']) > 0.004) $moved[] = $i;
    }
    $before = count($orig);
    echo sprintf("Plan %d (%s, building %d): %d points -> %d; %d moved, %d removed%s\n", $pid, $p['floor'], $p['building_id'], $before, count($nodes), count($moved), count($removed),
        $removed ? ' (' . implode(', ', $removed) . ')' : '');
    $totalMoved += count($moved); $totalRemoved += count($removed); $totalAdded += count($added);

    if ($apply) {
        $up = $conn->prepare("UPDATE floor_plan_nodes SET x = ?, y = ? WHERE id = ?");
        foreach ($moved as $i) { $x = $nodes[$i]['x']; $y = $nodes[$i]['y']; $up->bind_param('ddi', $x, $y, $i); $up->execute(); }
        $up->close();
        $ins = $conn->prepare("INSERT IGNORE INTO floor_plan_edges (node_a_id, node_b_id) VALUES (?, ?)");
        foreach ($added as [$a, $b]) { $ins->bind_param('ii', $a, $b); $ins->execute(); }
        $ins->close();
        $del = $conn->prepare("DELETE FROM floor_plan_nodes WHERE id = ? AND floor_plan_id = ?");
        foreach (array_keys($removed) as $i) { $del->bind_param('ii', $i, $pid); $del->execute(); }
        $del->close();
    }
}

if ($apply) $conn->commit();
echo sprintf("\n%s: %d point(s) moved, %d removed, %d connection(s) joined.%s\n", $apply ? 'Done' : 'Dry run', $totalMoved, $totalRemoved, $totalAdded, $apply ? '' : ' Run again with --apply to do it.');
