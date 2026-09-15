<?php

// GET    /api/rooms.php                       -> list all rooms (optionally ?building_id=1, ?q=search, ?room_number=204)
// POST   /api/rooms.php                       -> add a new room
//        body (JSON): { building_id, room_number, room_name, floor, room_type, hours, notes }
// PUT    /api/rooms.php?id=1                  -> update a room
//        body (JSON): { room_number, room_name, floor, room_type, hours, notes }
// DELETE /api/rooms.php?id=1                  -> delete a room (cascades to its flags)

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config/config.php';

// Reads stay public (students need the directory); writes require an admin session.
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'DELETE'])) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $where = [];
    $params = [];
    $types = '';

    if (!empty($_GET['building_id'])) {
        $where[] = 'r.building_id = ?';
        $params[] = (int) $_GET['building_id'];
        $types .= 'i';
    }
    if (!empty($_GET['room_number'])) {
        // Exact match — this is the lookup signage scanning uses (OCR'd number -> room record)
        $where[] = 'r.room_number = ?';
        $params[] = $_GET['room_number'];
        $types .= 's';
    }
    if (!empty($_GET['q'])) {
        // Loose search — this is what Manual Search uses
        $where[] = '(r.room_name LIKE ? OR r.room_number LIKE ?)';
        $like = '%' . $_GET['q'] . '%';
        $params[] = $like;
        $params[] = $like;
        $types .= 'ss';
    }

    $sql = "SELECT r.id, r.building_id, b.name AS building_name, r.room_number, r.room_name,
                   r.floor, r.room_type, r.hours, r.notes, r.updated_at,
                   (SELECT COUNT(*) FROM outdated_flags f WHERE f.room_id = r.id AND f.resolved = 0) AS open_flags
            FROM rooms r
            JOIN buildings b ON b.id = r.building_id";
    if ($where) $sql .= ' WHERE ' . implode(' AND ', $where);
    $sql .= ' ORDER BY b.name ASC, r.floor ASC, r.room_number ASC';

    $stmt = $conn->prepare($sql);
    if ($params) $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $result = $stmt->get_result();

    $rooms = [];
    while ($row = $result->fetch_assoc()) {
        $row['open_flags'] = (int) $row['open_flags'];
        $rooms[] = $row;
    }
    $stmt->close();

    echo json_encode(['success' => true, 'rooms' => $rooms]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    $buildingId = $input['building_id'] ?? null;
    $roomNumber = trim($input['room_number'] ?? '');
    $roomName = trim($input['room_name'] ?? '');
    $floor = trim($input['floor'] ?? '');
    $roomType = ($input['room_type'] ?? 'office') === 'classroom' ? 'classroom' : 'office';
    // Hours only make sense for offices — classrooms/labs don't get fixed hours,
    // that's a deliberate scope boundary (class scheduling is a separate problem).
    $hours = $roomType === 'office' ? trim($input['hours'] ?? '') : null;
    $notes = trim($input['notes'] ?? '') ?: null;

    if (!$buildingId || $roomNumber === '' || $roomName === '' || $floor === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'building_id, room_number, room_name, and floor are required']);
        exit;
    }

    $stmt = $conn->prepare("INSERT INTO rooms (building_id, room_number, room_name, floor, room_type, hours, notes) VALUES (?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('issssss', $buildingId, $roomNumber, $roomName, $floor, $roomType, $hours, $notes);

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
    $input = json_decode(file_get_contents('php://input'), true);

    $roomNumber = trim($input['room_number'] ?? '');
    $roomName = trim($input['room_name'] ?? '');
    $floor = trim($input['floor'] ?? '');
    $roomType = ($input['room_type'] ?? 'office') === 'classroom' ? 'classroom' : 'office';
    $hours = $roomType === 'office' ? trim($input['hours'] ?? '') : null;
    $notes = trim($input['notes'] ?? '') ?: null;

    if (!$id || $roomNumber === '' || $roomName === '' || $floor === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id, room_number, room_name, and floor are required']);
        exit;
    }

    $stmt = $conn->prepare("UPDATE rooms SET room_number = ?, room_name = ?, floor = ?, room_type = ?, hours = ?, notes = ? WHERE id = ?");
    $stmt->bind_param('ssssssi', $roomNumber, $roomName, $floor, $roomType, $hours, $notes, $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Update failed']);
    }
    $stmt->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id is required']);
        exit;
    }

    $stmt = $conn->prepare("DELETE FROM rooms WHERE id = ?");
    $stmt->bind_param('i', $id);

    if ($stmt->execute()) {
        echo json_encode(['success' => true]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Delete failed']);
    }
    $stmt->close();
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
