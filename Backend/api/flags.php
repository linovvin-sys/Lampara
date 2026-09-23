<?php

// GET    /api/flags.php               -> list outdated-info flags (admin-only)
//        optional ?resolved=0|1 (default 0 — open flags only)
// POST   /api/flags.php               -> "this seems outdated — report it" from the scan-result screen
//        body (JSON): { room_id, note }
// PUT    /api/flags.php?id=1          -> mark a flag resolved (admin-only)

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

// Reading and resolving flags is an admin task; reporting one (POST) stays
// open so students can flag outdated info without logging in.
if (in_array($_SERVER['REQUEST_METHOD'], ['GET', 'PUT'])) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $resolved = isset($_GET['resolved']) ? (int) $_GET['resolved'] : 0;

    $stmt = $conn->prepare(
        "SELECT f.id, f.room_id, f.note, f.resolved, f.created_at,
                r.room_number, r.room_name, b.id AS building_id, b.name AS building_name
         FROM outdated_flags f
         JOIN rooms r ON r.id = f.room_id
         JOIN buildings b ON b.id = r.building_id
         WHERE f.resolved = ?
         ORDER BY f.created_at DESC"
    );
    $stmt->bind_param('i', $resolved);
    $stmt->execute();
    $result = $stmt->get_result();

    $flags = [];
    while ($row = $result->fetch_assoc()) {
        $row['id'] = (int) $row['id'];
        $row['room_id'] = (int) $row['room_id'];
        $row['building_id'] = (int) $row['building_id'];
        $row['resolved'] = (int) $row['resolved'];
        $flags[] = $row;
    }
    $stmt->close();
    echo json_encode(['success' => true, 'flags' => $flags]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $roomId = $input['room_id'] ?? null;
    $note = trim($input['note'] ?? '') ?: null;

    if (!$roomId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'room_id is required']);
        exit;
    }

    $stmt = $conn->prepare("INSERT INTO outdated_flags (room_id, note) VALUES (?, ?)");
    $stmt->bind_param('is', $roomId, $note);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'id' => $stmt->insert_id]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Insert failed']);
    }
    $stmt->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id is required']);
        exit;
    }

    $stmt = $conn->prepare("UPDATE outdated_flags SET resolved = 1 WHERE id = ?");
    $stmt->bind_param('i', $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Update failed']);
    }
    $stmt->close();
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
