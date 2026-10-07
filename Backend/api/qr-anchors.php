<?php

// The AR guide's starting anchor — scanned once, right before the student
// starts walking, to fix the real starting position instead of trusting
// wherever the camera happens to be facing (indoor: no GPS at all; outdoor:
// GPS exists but drifts a few meters near buildings). At most ONE anchor
// per floor plan, and at most ONE for the whole outdoor campus graph — not
// one per node, and not a per-room/signage location resolver (that's
// scan.php's Gemini OCR job, untouched by this).
//
// GET    /api/qr-anchors.php?code=abc123 -> public, resolves a scanned QR
//        indoor  -> { success, kind:'indoor', floor_plan_node_id, floor_plan_id, floor, building_id, building_name, x, y, label }
//        outdoor -> { success, kind:'outdoor', campus_node_id, lat, lng, node_type, label }
// GET    /api/qr-anchors.php?floor_plan_id=1 -> admin/indoor AR guide, that floor's anchor if set
//        -> { success, anchors: [{ id, floor_plan_node_id, code, label }] }  (0 or 1 entries)
// GET    /api/qr-anchors.php?campus=1        -> admin/outdoor AR guide, the one campus-wide anchor if set
//        -> { success, anchors: [{ id, campus_node_id, code, label }] }  (0 or 1 entries)
// POST   /api/qr-anchors.php                 -> admin, sets an anchor to one node (replaces any existing
//        one in the same scope — same floor, or the campus-wide one)
//        body (JSON): { floor_plan_node_id, label? } OR { campus_node_id, label? } -> { success, id, code, label }
// DELETE /api/qr-anchors.php?id=1            -> admin, removes the anchor (the node itself is untouched)

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

// Reads stay public (a student scanning a QR has no admin session); writes need one.
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'DELETE'])) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (!empty($_GET['code'])) {
        $code = (string) $_GET['code'];
        $stmt = $conn->prepare("SELECT floor_plan_node_id, campus_node_id, label FROM qr_anchors WHERE code = ?");
        $stmt->bind_param('s', $code);
        $stmt->execute();
        $anchor = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$anchor) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'That QR code is not registered.']);
            exit;
        }

        if ($anchor['floor_plan_node_id']) {
            $stmt = $conn->prepare(
                "SELECT n.x, n.y, n.floor_plan_id, fp.floor, fp.building_id, b.name AS building_name
                 FROM floor_plan_nodes n JOIN floor_plans fp ON fp.id = n.floor_plan_id JOIN buildings b ON b.id = fp.building_id
                 WHERE n.id = ?"
            );
            $stmt->bind_param('i', $anchor['floor_plan_node_id']);
            $stmt->execute();
            $row = $stmt->get_result()->fetch_assoc();
            $stmt->close();
            if (!$row) { http_response_code(404); echo json_encode(['success' => false, 'error' => 'That point no longer exists.']); exit; }
            echo json_encode([
                'success' => true, 'kind' => 'indoor',
                'floor_plan_node_id' => (int) $anchor['floor_plan_node_id'],
                'floor_plan_id' => (int) $row['floor_plan_id'],
                'floor' => $row['floor'],
                'building_id' => (int) $row['building_id'],
                'building_name' => $row['building_name'],
                'x' => (float) $row['x'], 'y' => (float) $row['y'],
                'label' => $anchor['label'],
            ]);
            exit;
        }

        $stmt = $conn->prepare("SELECT lat, lng, node_type FROM campus_nodes WHERE id = ?");
        $stmt->bind_param('i', $anchor['campus_node_id']);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$row) { http_response_code(404); echo json_encode(['success' => false, 'error' => 'That point no longer exists.']); exit; }
        echo json_encode([
            'success' => true, 'kind' => 'outdoor',
            'campus_node_id' => (int) $anchor['campus_node_id'],
            'lat' => (float) $row['lat'], 'lng' => (float) $row['lng'],
            'node_type' => $row['node_type'],
            'label' => $anchor['label'],
        ]);
        exit;
    }

    $floorPlanId = (int) ($_GET['floor_plan_id'] ?? 0);
    $campus = !empty($_GET['campus']);
    if (!$floorPlanId && !$campus) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'code, floor_plan_id, or campus is required']);
        exit;
    }

    if ($campus) {
        $stmt = $conn->prepare("SELECT id, campus_node_id, code, label FROM qr_anchors WHERE campus_node_id IS NOT NULL ORDER BY id");
        $stmt->execute();
        $result = $stmt->get_result();
        $anchors = [];
        while ($row = $result->fetch_assoc()) {
            $anchors[] = ['id' => (int) $row['id'], 'campus_node_id' => (int) $row['campus_node_id'], 'code' => $row['code'], 'label' => $row['label']];
        }
        $stmt->close();
        echo json_encode(['success' => true, 'anchors' => $anchors]);
        exit;
    }

    $stmt = $conn->prepare(
        "SELECT a.id, a.floor_plan_node_id, a.code, a.label
         FROM qr_anchors a JOIN floor_plan_nodes n ON n.id = a.floor_plan_node_id
         WHERE n.floor_plan_id = ? ORDER BY a.id"
    );
    $stmt->bind_param('i', $floorPlanId);
    $stmt->execute();
    $result = $stmt->get_result();
    $anchors = [];
    while ($row = $result->fetch_assoc()) {
        $anchors[] = ['id' => (int) $row['id'], 'floor_plan_node_id' => (int) $row['floor_plan_node_id'], 'code' => $row['code'], 'label' => $row['label']];
    }
    $stmt->close();
    echo json_encode(['success' => true, 'anchors' => $anchors]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $floorPlanNodeId = (int) ($input['floor_plan_node_id'] ?? 0);
    $campusNodeId = (int) ($input['campus_node_id'] ?? 0);
    $label = trim((string) ($input['label'] ?? ''));
    if (!$floorPlanNodeId && !$campusNodeId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'floor_plan_node_id or campus_node_id is required']);
        exit;
    }

    if ($floorPlanNodeId) {
        $stmt = $conn->prepare("SELECT floor_plan_id FROM floor_plan_nodes WHERE id = ?");
        $stmt->bind_param('i', $floorPlanNodeId);
        $stmt->execute();
        $node = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if (!$node) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'That point no longer exists.']);
            exit;
        }
        // A floor has at most one anchor — setting a new one replaces whatever was there.
        $floorPlanId = (int) $node['floor_plan_id'];
        $stmt = $conn->prepare(
            "DELETE a FROM qr_anchors a JOIN floor_plan_nodes n ON n.id = a.floor_plan_node_id WHERE n.floor_plan_id = ?"
        );
        $stmt->bind_param('i', $floorPlanId);
        $stmt->execute();
        $stmt->close();

        $code = bin2hex(random_bytes(10));
        $labelOrNull = $label !== '' ? $label : null;
        $stmt = $conn->prepare("INSERT INTO qr_anchors (floor_plan_node_id, code, label) VALUES (?, ?, ?)");
        $stmt->bind_param('iss', $floorPlanNodeId, $code, $labelOrNull);
        $stmt->execute();
        echo json_encode(['success' => true, 'id' => $stmt->insert_id, 'code' => $code, 'label' => $labelOrNull]);
        $stmt->close();
        exit;
    }

    $stmt = $conn->prepare("SELECT 1 FROM campus_nodes WHERE id = ?");
    $stmt->bind_param('i', $campusNodeId);
    $stmt->execute();
    $exists = $stmt->get_result()->num_rows > 0;
    $stmt->close();
    if (!$exists) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'That point no longer exists.']);
        exit;
    }
    // Only one campus-wide anchor, period — replaces whatever was there.
    $conn->query("DELETE FROM qr_anchors WHERE campus_node_id IS NOT NULL");

    $code = bin2hex(random_bytes(10));
    $labelOrNull = $label !== '' ? $label : null;
    $stmt = $conn->prepare("INSERT INTO qr_anchors (campus_node_id, code, label) VALUES (?, ?, ?)");
    $stmt->bind_param('iss', $campusNodeId, $code, $labelOrNull);
    $stmt->execute();
    echo json_encode(['success' => true, 'id' => $stmt->insert_id, 'code' => $code, 'label' => $labelOrNull]);
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
    $stmt = $conn->prepare("DELETE FROM qr_anchors WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    echo json_encode(['success' => true]);
    $stmt->close();
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
