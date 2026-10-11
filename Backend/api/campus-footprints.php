<?php

// Building outlines and road lines for drawing the campus (the AR mini-map). Imported from the campus map
// export, already in GPS coordinates, so nothing has to be lined up on the phone.
//
// GET /api/campus-footprints.php -> { success, footprints: [ { id, kind: "building"|"road", building_id, points: [[lat, lng], ...] } ] }   (public)
// building_id is set when the outline was matched to a registered building (used to highlight the destination).

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$db = new Database();
$conn = $db->connect();

$footprints = [];
$result = $conn->query("SELECT id, kind, building_id, points FROM campus_footprints ORDER BY id");
if ($result) {
    while ($row = $result->fetch_assoc()) {
        $points = json_decode($row['points'], true);
        if (!is_array($points)) continue;
        $footprints[] = [
            'id' => (int) $row['id'],
            'kind' => $row['kind'],
            'building_id' => $row['building_id'] !== null ? (int) $row['building_id'] : null,
            'points' => $points,
        ];
    }
}
echo json_encode(['success' => true, 'footprints' => $footprints]);
