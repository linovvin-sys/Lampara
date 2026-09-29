<?php

// GET    /api/floor-plan-graph.php?floor_plan_id=1   -> { nodes: [...], edges: [...] } for that floor
// GET    /api/floor-plan-graph.php?building_id=1      -> the COMBINED graph across every floor
//        plan in that building — nodes tagged with floor_plan_id/floor, and
//        edges including cross-floor ones (a node on floor 2 connected to a
//        node on floor 3 — the stairs/elevator link between them). This is
//        what multi-floor routing needs: a room-to-room route can span more
//        than one floor plan image, so the graph has to be fetched whole.
// POST   /api/floor-plan-graph.php                   -> add a node
//        body (JSON): { floor_plan_id, x, y }
// DELETE /api/floor-plan-graph.php?node_id=1          -> remove a node (cascades its edges, unlinks any room using it)
// POST   /api/floor-plan-graph.php?action=edge        -> connect two nodes
//        body (JSON): { node_a_id, node_b_id }
// DELETE /api/floor-plan-graph.php?edge_id=1          -> remove one connection

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

// Reads stay public (students' route drawing needs the graph); writes need an admin session.
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'DELETE'])) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $floorPlanId = (int) ($_GET['floor_plan_id'] ?? 0);
    $buildingId = (int) ($_GET['building_id'] ?? 0);
    if (!$floorPlanId && !$buildingId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'floor_plan_id or building_id is required']);
        exit;
    }

    if ($buildingId) {
        $stmt = $conn->prepare(
            "SELECT n.id, n.x, n.y, n.floor_plan_id, fp.floor
             FROM floor_plan_nodes n JOIN floor_plans fp ON fp.id = n.floor_plan_id
             WHERE fp.building_id = ?"
        );
        $stmt->bind_param('i', $buildingId);
    } else {
        $stmt = $conn->prepare(
            "SELECT n.id, n.x, n.y, n.floor_plan_id, fp.floor
             FROM floor_plan_nodes n JOIN floor_plans fp ON fp.id = n.floor_plan_id
             WHERE n.floor_plan_id = ?"
        );
        $stmt->bind_param('i', $floorPlanId);
    }
    $stmt->execute();
    $result = $stmt->get_result();
    $nodes = [];
    while ($row = $result->fetch_assoc()) {
        $row['id'] = (int) $row['id'];
        $row['x'] = (float) $row['x'];
        $row['y'] = (float) $row['y'];
        $row['floor_plan_id'] = (int) $row['floor_plan_id'];
        $nodes[] = $row;
    }
    $stmt->close();

    $edges = [];
    if ($nodes) {
        $ids = array_column($nodes, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $types = str_repeat('i', count($ids));
        // Both ends have to be in this set — otherwise a single-floor query
        // (floor_plan_id=) would leak in the OTHER end of a cross-floor edge
        // as a bare id with no coordinates the caller never asked for.
        $stmt = $conn->prepare("SELECT id, node_a_id, node_b_id FROM floor_plan_edges WHERE node_a_id IN ($placeholders) AND node_b_id IN ($placeholders)");
        $stmt->bind_param($types . $types, ...array_merge($ids, $ids));
        $stmt->execute();
        $result = $stmt->get_result();
        while ($row = $result->fetch_assoc()) {
            $edges[] = [
                'id' => (int) $row['id'],
                'node_a_id' => (int) $row['node_a_id'],
                'node_b_id' => (int) $row['node_b_id'],
            ];
        }
        $stmt->close();
    }

    echo json_encode(['success' => true, 'nodes' => $nodes, 'edges' => $edges]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);

    if (($_GET['action'] ?? '') === 'edge') {
        $nodeA = (int) ($input['node_a_id'] ?? 0);
        $nodeB = (int) ($input['node_b_id'] ?? 0);
        if (!$nodeA || !$nodeB || $nodeA === $nodeB) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'node_a_id and node_b_id (distinct) are required']);
            exit;
        }
        // Store the pair in a consistent order so the UNIQUE constraint
        // catches "A-B" and "B-A" as the same edge, regardless of click order.
        $lo = min($nodeA, $nodeB);
        $hi = max($nodeA, $nodeB);
        $stmt = $conn->prepare("INSERT INTO floor_plan_edges (node_a_id, node_b_id) VALUES (?, ?)");
        $stmt->bind_param('ii', $lo, $hi);
        try {
            $stmt->execute();
            echo json_encode(['success' => true, 'id' => $stmt->insert_id]);
        } catch (mysqli_sql_exception $e) {
            if ($conn->errno === 1062) {
                echo json_encode(['success' => true, 'already_existed' => true]);
            } else {
                http_response_code(500);
                echo json_encode(['success' => false, 'error' => 'Could not save connection']);
            }
        }
        $stmt->close();
        exit;
    }

    $floorPlanId = (int) ($input['floor_plan_id'] ?? 0);
    $x = isset($input['x']) ? (float) $input['x'] : null;
    $y = isset($input['y']) ? (float) $input['y'] : null;
    if (!$floorPlanId || $x === null || $y === null) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'floor_plan_id, x, and y are required']);
        exit;
    }
    $stmt = $conn->prepare("INSERT INTO floor_plan_nodes (floor_plan_id, x, y) VALUES (?, ?, ?)");
    $stmt->bind_param('idd', $floorPlanId, $x, $y);
    $stmt->execute();
    echo json_encode(['success' => true, 'id' => $stmt->insert_id]);
    $stmt->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (!empty($_GET['edge_id'])) {
        $id = (int) $_GET['edge_id'];
        $stmt = $conn->prepare("DELETE FROM floor_plan_edges WHERE id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        echo json_encode(['success' => true]);
        $stmt->close();
        exit;
    }
    if (!empty($_GET['node_id'])) {
        $id = (int) $_GET['node_id'];
        // Cascades to its edges and, via ON DELETE SET NULL, unlinks any
        // room that pointed at this node as its walkable entry point.
        $stmt = $conn->prepare("DELETE FROM floor_plan_nodes WHERE id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        echo json_encode(['success' => true]);
        $stmt->close();
        exit;
    }
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'node_id or edge_id is required']);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
