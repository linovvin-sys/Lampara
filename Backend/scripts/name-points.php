<?php

// One-time (and safe to repeat): gives every walkway point that has no name yet the next
// free "Point A", "Point B", ... in creation order. Run it once after adding the `name`
// columns to campus_nodes and floor_plan_nodes:
//
//   php Backend/scripts/name-points.php
//
// Points that already have a name are left alone.

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line.\n");
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../point_names.php';

$db = new Database();
$conn = $db->connect();

function name_scope($conn, $table, $scopeCol, $scopeId)
{
    $ids = [];
    if ($scopeCol === null) {
        $res = $conn->query("SELECT id FROM $table WHERE name IS NULL OR name = '' ORDER BY id");
    } else {
        $stmt = $conn->prepare("SELECT id FROM $table WHERE (name IS NULL OR name = '') AND $scopeCol = ? ORDER BY id");
        $stmt->bind_param('i', $scopeId);
        $stmt->execute();
        $res = $stmt->get_result();
    }
    while ($row = $res->fetch_row()) $ids[] = (int) $row[0];
    $named = 0;
    foreach ($ids as $id) {
        $name = next_free_point_name(point_names_in_scope($conn, $table, $scopeCol, $scopeId));
        $stmt = $conn->prepare("UPDATE $table SET name = ? WHERE id = ?");
        $stmt->bind_param('si', $name, $id);
        $stmt->execute();
        $stmt->close();
        $named++;
    }
    return $named;
}

$total = name_scope($conn, 'campus_nodes', null, null);
echo "campus_nodes: named $total point(s)\n";

$plans = $conn->query("SELECT DISTINCT floor_plan_id FROM floor_plan_nodes WHERE name IS NULL OR name = ''");
$planIds = [];
while ($row = $plans->fetch_row()) $planIds[] = (int) $row[0];
$fp = 0;
foreach ($planIds as $planId) $fp += name_scope($conn, 'floor_plan_nodes', 'floor_plan_id', $planId);
echo "floor_plan_nodes: named $fp point(s) across " . count($planIds) . " floor plan(s)\n";
