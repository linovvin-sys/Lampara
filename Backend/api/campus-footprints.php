<?php

// Building outlines and road lines for drawing the campus (the AR mini-map). Imported from the campus map
// export, already in GPS coordinates, so nothing has to be lined up on the phone.
//
// GET /api/campus-footprints.php -> { success, footprints: [ { id, kind: "building"|"road", building_id, points: [[lat, lng], ...] } ] }   (public)
// building_id is set when the outline was matched to a registered building (used to highlight the destination).
// PUT /api/campus-footprints.php?id=4  body { building_id: 1 | null }  -> link / unlink one outline (admin only)

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    require_once __DIR__ . '/_require_admin.php';
    $id = (int) ($_GET['id'] ?? 0);
    $in = json_decode(file_get_contents('php://input'), true);
    if ($id <= 0 || !is_array($in) || !array_key_exists('building_id', $in)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Need an outline id and a building_id (or null)']);
        exit;
    }
    $bid = $in['building_id'] === null || $in['building_id'] === '' ? null : (int) $in['building_id'];
    $db = new Database();
    $conn = $db->connect();
    if ($bid !== null) {
        $chk = $conn->prepare("SELECT 1 FROM buildings WHERE id = ?");
        $chk->bind_param('i', $bid);
        $chk->execute();
        if (!$chk->get_result()->fetch_row()) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'That building does not exist']);
            exit;
        }
    }
    $stmt = $conn->prepare("UPDATE campus_footprints SET building_id = ? WHERE id = ? AND kind = 'building'");
    $stmt->bind_param('ii', $bid, $id);
    $stmt->execute();
    echo json_encode(['success' => true, 'id' => $id, 'building_id' => $bid]);
    exit;
}

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
