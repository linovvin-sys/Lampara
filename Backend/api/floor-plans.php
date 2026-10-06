<?php

// GET    /api/floor-plans.php?building_id=1              -> all floor plans for a building
// GET    /api/floor-plans.php?building_id=1&floor=2nd+Floor -> one specific floor's plan (or success:true, plan:null)
// POST   /api/floor-plans.php                             -> upload/replace a floor's plan (admin)
//        body (JSON): { building_id, floor, image: "data:image/jpeg;base64,..." }
// DELETE /api/floor-plans.php?id=1                        -> remove a floor's plan (admin)
// POST   /api/floor-plans.php?action=calibrate            -> save indoor-AR calibration for a floor (admin)
//        body (JSON): { id, north_offset, meters_per_unit_x, meters_per_unit_y }
//        north_offset = compass bearing (0-360, clockwise from north) that "up" on the plan image points to.

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

// Reads stay public (students need these to see markers on the scan result
// screen); writes require an admin session, same discipline as buildings/rooms.
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'DELETE'])) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

// Where uploaded images actually land on disk, and the URL path students'
// browsers use to fetch them — kept in one place so they can't drift apart.
$uploadDir = __DIR__ . '/../../Frontend/assets/floorplans';
$publicPathPrefix = 'assets/floorplans/';

// DECIMAL columns come back from mysqli as strings — the AR guide does math on
// these, so hand them over as real numbers (or null when not calibrated yet).
function castPlan($row) {
    if (!$row) return $row;
    foreach (['north_offset', 'meters_per_unit_x', 'meters_per_unit_y'] as $k) {
        $row[$k] = $row[$k] !== null ? (float) $row[$k] : null;
    }
    return $row;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $buildingId = (int) ($_GET['building_id'] ?? 0);
    if (!$buildingId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'building_id is required']);
        exit;
    }

    if (!empty($_GET['floor'])) {
        $stmt = $conn->prepare("SELECT id, building_id, floor, image_path, north_offset, meters_per_unit_x, meters_per_unit_y, updated_at FROM floor_plans WHERE building_id = ? AND floor = ?");
        $stmt->bind_param('is', $buildingId, $_GET['floor']);
        $stmt->execute();
        $plan = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        echo json_encode(['success' => true, 'plan' => $plan ? castPlan($plan) : null]);
        exit;
    }

    $stmt = $conn->prepare("SELECT id, building_id, floor, image_path, north_offset, meters_per_unit_x, meters_per_unit_y, updated_at FROM floor_plans WHERE building_id = ?");
    $stmt->bind_param('i', $buildingId);
    $stmt->execute();
    $result = $stmt->get_result();
    $plans = [];
    while ($row = $result->fetch_assoc()) $plans[] = castPlan($row);
    $stmt->close();
    echo json_encode(['success' => true, 'plans' => $plans]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST' && ($_GET['action'] ?? '') === 'calibrate') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $id = (int) ($input['id'] ?? 0);
    $north = isset($input['north_offset']) ? fmod((float) $input['north_offset'] + 360, 360) : null;
    $mx = isset($input['meters_per_unit_x']) ? (float) $input['meters_per_unit_x'] : null;
    $my = isset($input['meters_per_unit_y']) ? (float) $input['meters_per_unit_y'] : null;
    if (!$id || $north === null || !$mx || !$my || $mx <= 0 || $my <= 0) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'id, north_offset, and positive meters_per_unit_x/y are required']);
        exit;
    }
    $stmt = $conn->prepare("UPDATE floor_plans SET north_offset = ?, meters_per_unit_x = ?, meters_per_unit_y = ? WHERE id = ?");
    $stmt->bind_param('dddi', $north, $mx, $my, $id);
    $stmt->execute();
    echo json_encode(['success' => true]);
    $stmt->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $buildingId = (int) ($input['building_id'] ?? 0);
    $floor = trim($input['floor'] ?? '');
    $imageDataUrl = $input['image'] ?? '';

    if (!$buildingId || $floor === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'building_id and floor are required']);
        exit;
    }
    if (!preg_match('/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/', $imageDataUrl, $matches)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'A valid base64 image is required']);
        exit;
    }
    $ext = $matches[1] === 'jpg' ? 'jpeg' : $matches[1];
    $binaryData = base64_decode($matches[2]);
    if ($binaryData === false) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Could not decode image data']);
        exit;
    }
    // ~8MB cap — these are phone photos of a printed plan, not anything
    // that should ever legitimately need to be huge.
    if (strlen($binaryData) > 8 * 1024 * 1024) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Image is too large (max 8MB)']);
        exit;
    }

    if (!is_dir($uploadDir)) mkdir($uploadDir, 0755, true);

    // Filename derived from building+floor (not the original filename, which
    // we never had anyway from a base64 upload) — re-uploading the same
    // floor overwrites its old image file directly instead of accumulating
    // orphaned old versions on disk.
    $slug = $buildingId . '-' . preg_replace('/[^a-z0-9]+/i', '-', strtolower($floor));
    $filename = $slug . '-' . time() . '.' . $ext;
    $filePath = $uploadDir . '/' . $filename;

    if (file_put_contents($filePath, $binaryData) === false) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Could not save image to disk']);
        exit;
    }

    // Clean up this floor's previous image file, if any, now that the new
    // one is safely written — avoids piling up old uploads on disk forever.
    $stmt = $conn->prepare("SELECT image_path FROM floor_plans WHERE building_id = ? AND floor = ?");
    $stmt->bind_param('is', $buildingId, $floor);
    $stmt->execute();
    $existing = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if ($existing && $existing['image_path']) {
        $oldFile = __DIR__ . '/../../Frontend/' . $existing['image_path'];
        if (is_file($oldFile)) @unlink($oldFile);
    }

    $publicPath = $publicPathPrefix . $filename;
    $stmt = $conn->prepare(
        "INSERT INTO floor_plans (building_id, floor, image_path) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE image_path = VALUES(image_path)"
    );
    $stmt->bind_param('iss', $buildingId, $floor, $publicPath);

    if ($stmt->execute()) {
        // insert_id is unreliable here on the UPDATE branch of ON DUPLICATE
        // KEY (MySQL only guarantees it on a fresh INSERT) — look the row
        // back up directly so callers (Register Building's "Remove" button,
        // the path-graph editor) always get a real id to work with.
        $stmt->close();
        $stmt = $conn->prepare("SELECT id FROM floor_plans WHERE building_id = ? AND floor = ?");
        $stmt->bind_param('is', $buildingId, $floor);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        echo json_encode(['success' => true, 'id' => (int) $row['id'], 'image_path' => $publicPath]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Save failed']);
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

    $stmt = $conn->prepare("SELECT image_path FROM floor_plans WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $stmt = $conn->prepare("DELETE FROM floor_plans WHERE id = ?");
    $stmt->bind_param('i', $id);
    if ($stmt->execute()) {
        if ($row && $row['image_path']) {
            $file = __DIR__ . '/../../Frontend/' . $row['image_path'];
            if (is_file($file)) @unlink($file);
        }
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
