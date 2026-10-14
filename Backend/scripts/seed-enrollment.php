<?php

// Adds the "Security / Guard Booth" room to the Amafel Building's 1st floor, which is step 1 of the Enrollment guide
// (Frontend/Js/Include/enrollment-steps.js). Safe to run more than once: it does nothing if a security room already exists there.
//   php Backend/scripts/seed-enrollment.php
// It puts the marker on the "SECURITY" room drawn on the plan, just inside the entrance, and connects it to the nearest walkable
// point. If your plan differs, open Admin > Add / Edit Room > Security / Guard Booth and move the marker.

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Run this from the command line.\n"); }

require_once __DIR__ . '/../config.php';
$conn = (new Database())->connect();

$b = $conn->query("SELECT id, name FROM buildings WHERE building_number = 1 ORDER BY id LIMIT 1")->fetch_assoc();
if (!$b) exit("No building with building number 1 (the Amafel Building) yet.\n");
$bid = (int) $b['id'];
$plan = $conn->query("SELECT id FROM floor_plans WHERE building_id = $bid AND floor LIKE '1st%' LIMIT 1")->fetch_assoc();
if (!$plan) exit("The Amafel Building has no 1st floor plan yet.\n");

$have = $conn->query("SELECT id FROM rooms WHERE building_id = $bid AND floor LIKE '1st%' AND (room_name LIKE '%security%' OR room_name LIKE '%guard%') LIMIT 1")->fetch_assoc();
if ($have) exit("A security room already exists (room id {$have['id']}). Nothing to do.\n");

// where the SECURITY room is on the plan (percent of the picture), and the corridor point just outside its door
$mapX = 71.5; $mapY = 71.0; $doorX = 62.7; $doorY = 72.1;
$node = null; $best = 1e9;
$r = $conn->query("SELECT id, x, y FROM floor_plan_nodes WHERE floor_plan_id = " . (int) $plan['id']);
while ($n = $r->fetch_assoc()) { $d = ($n['x'] - $doorX) ** 2 + ($n['y'] - $doorY) ** 2; if ($d < $best) { $best = $d; $node = (int) $n['id']; } }

$name = 'Security / Guard Booth'; $floor = '1st Floor'; $cat = 'office'; $type = 'office';
$notes = 'Just inside the entrance, on your right.';
$stmt = $conn->prepare("INSERT INTO rooms (building_id, room_number, room_name, floor, room_type, category, hours, notes, map_x, map_y, path_node_id) VALUES (?, NULL, ?, ?, ?, ?, NULL, ?, ?, ?, ?)");
$stmt->bind_param('isssssddi', $bid, $name, $floor, $type, $cat, $notes, $mapX, $mapY, $node);
$stmt->execute();
echo "Added '$name' to {$b['name']} (room id {$stmt->insert_id}), connected to path point " . ($node ?: 'none') . ".\n";
