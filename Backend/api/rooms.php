<?php

// GET    /api/rooms.php                       -> list all rooms (optionally ?building_id=1, ?q=search, ?room_number=204)
// POST   /api/rooms.php                       -> add a new room
//        body (JSON): { building_id, room_number, room_name, floor, category, hours, notes }
//        category: 'office' | 'classroom' | 'cr' | 'canteen' — room_type is derived from it server-side
// PUT    /api/rooms.php?id=1                  -> update a room
//        body (JSON): { room_number, room_name, floor, category, hours, notes }
// DELETE /api/rooms.php?id=1                  -> delete a room (cascades to its flags)

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

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
                   r.floor, r.room_type, r.category, r.hours, r.notes, r.updated_at,
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
    // Genuinely optional — some real spaces (comfort rooms, stairwells)
    // have no number and no signage at all. NULL here, not an empty
    // string, so it's exempt from the UNIQUE constraint (MySQL allows
    // multiple NULLs) instead of colliding as if they were all "".
    $roomNumberInput = trim($input['room_number'] ?? '');
    $roomNumber = $roomNumberInput === '' ? null : $roomNumberInput;
    $roomName = trim($input['room_name'] ?? '');
    $floor = trim($input['floor'] ?? '');
    // category is the human-facing "what this actually is" — office,
    // classroom, cr, or canteen. room_type stays as the internal "does this
    // have fixed hours" flag, derived here (not trusted from the client)
    // rather than exposed as a second thing the UI has to keep in sync.
    $allowedCategories = ['office', 'classroom', 'cr', 'canteen'];
    $category = in_array($input['category'] ?? '', $allowedCategories, true) ? $input['category'] : 'office';
    $roomType = in_array($category, ['office', 'canteen'], true) ? 'office' : 'classroom';
    // Hours only make sense for offices/canteens — classrooms and CRs don't
    // get fixed hours (class scheduling is a deliberately separate scope).
    $hours = $roomType === 'office' ? trim($input['hours'] ?? '') : null;
    $notes = trim($input['notes'] ?? '') ?: null;

    if (!$buildingId || $roomName === '' || $floor === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'building_id, room_name, and floor are required']);
        exit;
    }

    $stmt = $conn->prepare("INSERT INTO rooms (building_id, room_number, room_name, floor, room_type, category, hours, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('isssssss', $buildingId, $roomNumber, $roomName, $floor, $roomType, $category, $hours, $notes);

    // mysqli throws on error by default (PHP 8.1+) rather than returning
    // false from execute() — the duplicate-key case has to be caught, not
    // branched on a falsy return value.
    try {
        $stmt->execute();
        echo json_encode(['success' => true, 'id' => $stmt->insert_id]);
    } catch (mysqli_sql_exception $e) {
        if ($conn->errno === 1062) {
            // The admin UI already checks for this client-side, but the DB
            // constraint is the real guarantee — two admins saving at once,
            // or anything hitting this API directly, could still race past
            // a client-only check.
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => "Room $roomNumber is already registered."]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Insert failed']);
        }
    }
    $stmt->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    $input = json_decode(file_get_contents('php://input'), true);

    $roomNumberInput = trim($input['room_number'] ?? '');
    $roomNumber = $roomNumberInput === '' ? null : $roomNumberInput;
    $roomName = trim($input['room_name'] ?? '');
    $floor = trim($input['floor'] ?? '');
    $allowedCategories = ['office', 'classroom', 'cr', 'canteen'];
    $category = in_array($input['category'] ?? '', $allowedCategories, true) ? $input['category'] : 'office';
    $roomType = in_array($category, ['office', 'canteen'], true) ? 'office' : 'classroom';
    $hours = $roomType === 'office' ? trim($input['hours'] ?? '') : null;
    $notes = trim($input['notes'] ?? '') ?: null;

    if (!$id || $roomName === '' || $floor === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id, room_name, and floor are required']);
        exit;
    }

    $stmt = $conn->prepare("UPDATE rooms SET room_number = ?, room_name = ?, floor = ?, room_type = ?, category = ?, hours = ?, notes = ? WHERE id = ?");
    $stmt->bind_param('sssssssi', $roomNumber, $roomName, $floor, $roomType, $category, $hours, $notes, $id);

    try {
        $stmt->execute();
        echo json_encode(['success' => true]);
    } catch (mysqli_sql_exception $e) {
        if ($conn->errno === 1062) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => "Room $roomNumber is already registered."]);
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'Update failed']);
        }
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
