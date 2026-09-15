<?php

// GET    /api/buildings.php          -> list all registered buildings
// POST   /api/buildings.php          -> add a new building
//        body (JSON): { name, lat, lng, directory }
// PUT    /api/buildings.php?id=1     -> update a building
//        body (JSON): { name, lat, lng, directory }
// DELETE /api/buildings.php?id=1     -> delete a building (cascades to its rooms/flags)

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
    $result = $conn->query(
        "SELECT b.id, b.name, b.lat, b.lng, b.directory, b.updated_at,
                (SELECT COUNT(*) FROM rooms r WHERE r.building_id = b.id) AS room_count,
                (SELECT COUNT(*) FROM outdated_flags f
                    JOIN rooms r2 ON r2.id = f.room_id
                    WHERE r2.building_id = b.id AND f.resolved = 0) AS open_flags
         FROM buildings b
         ORDER BY b.name ASC"
    );
    $buildings = [];
    while ($row = $result->fetch_assoc()) {
        $row['lat'] = (float) $row['lat'];
        $row['lng'] = (float) $row['lng'];
        $row['room_count'] = (int) $row['room_count'];
        $row['open_flags'] = (int) $row['open_flags'];
        $buildings[] = $row;
    }
    echo json_encode(['success' => true, 'buildings' => $buildings]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    $name = trim($input['name'] ?? '');
    $lat = $input['lat'] ?? null;
    $lng = $input['lng'] ?? null;
    $directory = trim($input['directory'] ?? '');

    if ($name === '' || $lat === null || $lng === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'name, lat, and lng are required']);
        exit;
    }

    $stmt = $conn->prepare("INSERT INTO buildings (name, lat, lng, directory) VALUES (?, ?, ?, ?)");
    $stmt->bind_param('sdds', $name, $lat, $lng, $directory);

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

    $name = trim($input['name'] ?? '');
    $lat = $input['lat'] ?? null;
    $lng = $input['lng'] ?? null;
    $directory = trim($input['directory'] ?? '');

    if (!$id || $name === '' || $lat === null || $lng === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id, name, lat, and lng are required']);
        exit;
    }

    $stmt = $conn->prepare("UPDATE buildings SET name = ?, lat = ?, lng = ?, directory = ? WHERE id = ?");
    $stmt->bind_param('sddsi', $name, $lat, $lng, $directory, $id);

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

    // Rooms and their flags cascade automatically (FOREIGN KEY ... ON DELETE CASCADE in schema.sql)
    $stmt = $conn->prepare("DELETE FROM buildings WHERE id = ?");
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
