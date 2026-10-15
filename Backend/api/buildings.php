<?php

// GET    /api/buildings.php          -> list all registered buildings
// POST   /api/buildings.php          -> add a new building
//        body (JSON): { name, lat, lng, directory }
// PUT    /api/buildings.php?id=1     -> update a building
//        body (JSON): { name, lat, lng, directory }
//        or { photo: "data:image/...;base64,..." | null } -> set / remove only the building's photo (online only,
//        kept out of the offline queue like floor-plan uploads) -> { success, photo_path }
// DELETE /api/buildings.php?id=1     -> delete a building (cascades to its rooms/flags)

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../photo_upload.php';
require_once __DIR__ . '/../room_number.php';
require_once __DIR__ . '/../change_log.php';
require_once __DIR__ . '/../building_open.php';

// Reads stay public (students need the directory); writes require an admin session.
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'DELETE'])) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

// The optional "entrance is on this floor" value; saved separately so everything still works before the column exists.
function save_entrance_floor(mysqli $conn, int $id, $input): void
{
    if (!is_array($input) || !array_key_exists('entrance_floor', $input) || !column_exists($conn, 'buildings', 'entrance_floor')) return;
    $f = trim((string) $input['entrance_floor']);
    $f = $f === '' ? null : mb_substr($f, 0, 50);
    $stmt = $conn->prepare("UPDATE buildings SET entrance_floor = ? WHERE id = ?");
    $stmt->bind_param('si', $f, $id);
    $stmt->execute();
    $stmt->close();
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $ef = column_exists($conn, 'buildings', 'entrance_floor') ? 'b.entrance_floor' : 'NULL AS entrance_floor';
    $io = column_exists($conn, 'buildings', 'is_open') ? 'b.is_open' : '0 AS is_open';
    require_once __DIR__ . '/../lockdown.php';
    $cn = lock_select($conn, 'buildings', 'b', 'closed_note', 'closed_until');
    $result = $conn->query(
        "SELECT b.id, b.name, b.lat, b.lng, b.entrance_node_id, b.floor_count, $ef, $io, $cn, b.building_number, b.directory, b.photo_path, b.updated_at,
                (SELECT COUNT(*) FROM rooms r WHERE r.building_id = b.id) AS room_count,
                (SELECT COUNT(*) FROM outdated_flags f
                    JOIN rooms r2 ON r2.id = f.room_id
                    WHERE r2.building_id = b.id AND f.resolved = 0) AS open_flags
         FROM buildings b
         ORDER BY b.name ASC"
    );
    require_once __DIR__ . '/../building_entrances.php';
    $extra = extra_entrances_by_building($conn);
    $buildings = [];
    while ($row = $result->fetch_assoc()) {
        $row['extra_entrances'] = $extra[(int) $row['id']] ?? [];
        $row['is_open'] = (bool) $row['is_open'];
        $row['lat'] = (float) $row['lat'];
        $row['lng'] = (float) $row['lng'];
        $row['entrance_node_id'] = $row['entrance_node_id'] !== null ? (int) $row['entrance_node_id'] : null;
        $row['floor_count'] = (int) $row['floor_count'];
        $row['building_number'] = $row['building_number'] !== null && $row['building_number'] !== '' ? (string) $row['building_number'] : null;
        $row['room_count'] = (int) $row['room_count'];
        $row['open_flags'] = (int) $row['open_flags'];
        $buildings[] = $row;
    }
    require_once __DIR__ . '/../etag.php';
    json_with_etag(['success' => true, 'buildings' => $buildings]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    $name = trim($input['name'] ?? '');
    $lat = $input['lat'] ?? null;
    $lng = $input['lng'] ?? null;
    $floorCount = max(1, (int) ($input['floor_count'] ?? 1));
    $buildingNumber = normalize_building_number($input['building_number'] ?? '');
    if ($buildingNumber === false) { http_response_code(400); echo json_encode(['success' => false, 'error' => 'The building number looks like 2, or 2-A, 2-B']); exit; }
    ensure_building_number_text($conn);
    $directory = trim($input['directory'] ?? '');

    if ($name === '' || $lat === null || $lng === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'name, lat, and lng are required']);
        exit;
    }

    $stmt = $conn->prepare("INSERT INTO buildings (name, lat, lng, floor_count, building_number, directory) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('sddiss', $name, $lat, $lng, $floorCount, $buildingNumber, $directory);

    if ($stmt->execute()) {
        $newId = $stmt->insert_id;
        save_entrance_floor($conn, $newId, $input);
        save_building_open($conn, $newId, $input);
        log_change($conn, 'building', $newId, 'create', null, change_row($conn, 'buildings', $newId));
        echo json_encode(['success' => true, 'id' => $newId]);
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
    if (is_array($input) && array_key_exists('photo', $input)) photoPut($conn, 'buildings', $id, $input['photo']);

    $name = trim($input['name'] ?? '');
    $lat = $input['lat'] ?? null;
    $lng = $input['lng'] ?? null;
    $floorCount = max(1, (int) ($input['floor_count'] ?? 1));
    $buildingNumber = normalize_building_number($input['building_number'] ?? '');
    if ($buildingNumber === false) { http_response_code(400); echo json_encode(['success' => false, 'error' => 'The building number looks like 2, or 2-A, 2-B']); exit; }
    ensure_building_number_text($conn);
    $directory = trim($input['directory'] ?? '');

    if (!$id || $name === '' || $lat === null || $lng === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id, name, lat, and lng are required']);
        exit;
    }

    $before = change_row($conn, 'buildings', $id);
    $stmt = $conn->prepare("UPDATE buildings SET name = ?, lat = ?, lng = ?, floor_count = ?, building_number = ?, directory = ? WHERE id = ?");
    $stmt->bind_param('sddissi', $name, $lat, $lng, $floorCount, $buildingNumber, $directory, $id);

    if ($stmt->execute()) {
        save_entrance_floor($conn, $id, $input);
        save_building_open($conn, $id, $input);
        log_change($conn, 'building', $id, 'update', $before, change_row($conn, 'buildings', $id));
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

    $before = change_row($conn, 'buildings', $id);
    // Photo files of the building and of its rooms: the rows go with the delete below, the files would not.
    $photos = [];
    $stmt = $conn->prepare("SELECT photo_path FROM buildings WHERE id = ? UNION ALL SELECT photo_path FROM rooms WHERE building_id = ?");
    $stmt->bind_param('ii', $id, $id);
    $stmt->execute();
    $res = $stmt->get_result();
    while ($p = $res->fetch_row()) if ($p[0]) $photos[] = $p[0];
    $stmt->close();

    // Rooms and their flags cascade automatically (FOREIGN KEY ... ON DELETE CASCADE in schema.sql)
    $stmt = $conn->prepare("DELETE FROM buildings WHERE id = ?");
    $stmt->bind_param('i', $id);

    if ($stmt->execute()) {
        foreach ($photos as $p) photoDelete($p);
        if ($before) log_change($conn, 'building', $id, 'delete', $before, null);
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
