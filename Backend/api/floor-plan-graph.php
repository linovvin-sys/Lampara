<?php

// GET    /api/floor-plan-graph.php?floor_plan_id=1   -> { nodes: [...], edges: [...] } for that floor
// GET    /api/floor-plan-graph.php?building_id=1      -> the COMBINED graph across every floor
//        plan in that building — nodes tagged with floor_plan_id/floor, and
//        edges including cross-floor ones (a node on floor 2 connected to a
//        node on floor 3 — the stairs/elevator link between them). This is
//        what multi-floor routing needs: a room-to-room route can span more
//        than one floor plan image, so the graph has to be fetched whole.
// POST   /api/floor-plan-graph.php                   -> add a node
//        body (JSON): { floor_plan_id, x, y, name? }   (no name = the next free "Point A", "Point B", ...)
// PUT    /api/floor-plan-graph.php?node_id=1         -> rename and/or move a node
//        body (JSON): { name? , x? , y? }   (x and y together, percent of the plan; either part may be sent alone)
// DELETE /api/floor-plan-graph.php?node_id=1          -> remove a node (cascades its edges, unlinks any room using it)
//        the reply carries a `snapshot` of what was removed, for Undo
// DELETE /api/floor-plan-graph.php?floor_plan_id=1&all=1  -> remove EVERY node on that floor plan (snapshot returned for Undo)
// POST   /api/floor-plan-graph.php?action=restore     -> put a snapshot back (same ids, names, connections — including
//        stairs links to other floors — and each room's walkable entry point)
// POST   /api/floor-plan-graph.php?action=edge        -> connect two nodes
//        body (JSON): { node_a_id, node_b_id }
// DELETE /api/floor-plan-graph.php?edge_id=1          -> remove one connection

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../point_names.php';

// Reads stay public (students' route drawing needs the graph); writes need an admin session.
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'DELETE'])) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

// Everything a delete of these nodes takes with it, so it can be put back: the nodes, every
// connection touching them (stairs links to other floors included) and the rooms that used
// one of them as their walkable entry point.
function plan_snapshot(mysqli $conn, array $ids): array {
    $snap = ['nodes' => [], 'edges' => [], 'rooms' => []];
    if (!$ids) return $snap;
    $in = implode(',', array_map('intval', $ids));
    $r = $conn->query("SELECT id, floor_plan_id, x, y, name FROM floor_plan_nodes WHERE id IN ($in) ORDER BY id");
    while ($row = $r->fetch_assoc()) {
        $snap['nodes'][] = ['id' => (int) $row['id'], 'floor_plan_id' => (int) $row['floor_plan_id'], 'x' => (float) $row['x'], 'y' => (float) $row['y'], 'name' => $row['name']];
    }
    $r = $conn->query("SELECT node_a_id, node_b_id FROM floor_plan_edges WHERE node_a_id IN ($in) OR node_b_id IN ($in)");
    while ($row = $r->fetch_assoc()) {
        $snap['edges'][] = ['node_a_id' => (int) $row['node_a_id'], 'node_b_id' => (int) $row['node_b_id']];
    }
    $r = $conn->query("SELECT id, path_node_id FROM rooms WHERE path_node_id IN ($in)");
    while ($row = $r->fetch_assoc()) {
        $snap['rooms'][] = ['room_id' => (int) $row['id'], 'node_id' => (int) $row['path_node_id']];
    }
    return $snap;
}

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
            "SELECT n.id, n.x, n.y, n.name, n.floor_plan_id, fp.floor
             FROM floor_plan_nodes n JOIN floor_plans fp ON fp.id = n.floor_plan_id
             WHERE fp.building_id = ? ORDER BY n.id"
        );
        $stmt->bind_param('i', $buildingId);
    } else {
        $stmt = $conn->prepare(
            "SELECT n.id, n.x, n.y, n.name, n.floor_plan_id, fp.floor
             FROM floor_plan_nodes n JOIN floor_plans fp ON fp.id = n.floor_plan_id
             WHERE n.floor_plan_id = ? ORDER BY n.id"
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

    if (($_GET['action'] ?? '') === 'restore') {
        $restored = 0;
        $conn->begin_transaction();
        foreach (($input['nodes'] ?? []) as $n) {
            $id = (int) ($n['id'] ?? 0);
            $fp = (int) ($n['floor_plan_id'] ?? 0);
            if (!$id || !$fp || !isset($n['x'], $n['y'])) continue;
            $x = (float) $n['x'];
            $y = (float) $n['y'];
            $name = assign_point_name($conn, 'floor_plan_nodes', 'floor_plan_id', $fp, $n['name'] ?? '');
            $stmt = $conn->prepare("INSERT INTO floor_plan_nodes (id, floor_plan_id, x, y, name) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param('iidds', $id, $fp, $x, $y, $name);
            try { $stmt->execute(); $restored++; } catch (mysqli_sql_exception $e) { /* already back, or the floor plan is gone */ }
            $stmt->close();
        }
        foreach (($input['edges'] ?? []) as $e) {
            $a = (int) ($e['node_a_id'] ?? 0);
            $b = (int) ($e['node_b_id'] ?? 0);
            if (!$a || !$b || $a === $b) continue;
            $lo = min($a, $b);
            $hi = max($a, $b);
            $stmt = $conn->prepare("INSERT IGNORE INTO floor_plan_edges (node_a_id, node_b_id) VALUES (?, ?)");
            $stmt->bind_param('ii', $lo, $hi);
            try { $stmt->execute(); } catch (mysqli_sql_exception $ex) { /* an end no longer exists */ }
            $stmt->close();
        }
        foreach (($input['rooms'] ?? []) as $rm) {
            $rid = (int) ($rm['room_id'] ?? 0);
            $nid = (int) ($rm['node_id'] ?? 0);
            if (!$rid || !$nid) continue;
            // Only if the room has not been given a different entry point in the meantime.
            $stmt = $conn->prepare("UPDATE rooms SET path_node_id = ? WHERE id = ? AND path_node_id IS NULL");
            $stmt->bind_param('ii', $nid, $rid);
            try { $stmt->execute(); } catch (mysqli_sql_exception $ex) { /* room or point gone */ }
            $stmt->close();
        }
        $conn->commit();
        echo json_encode(['success' => true, 'restored' => $restored]);
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
    $name = assign_point_name($conn, 'floor_plan_nodes', 'floor_plan_id', $floorPlanId, $input['name'] ?? '');
    $stmt = $conn->prepare("INSERT INTO floor_plan_nodes (floor_plan_id, x, y, name) VALUES (?, ?, ?, ?)");
    $stmt->bind_param('idds', $floorPlanId, $x, $y, $name);
    $stmt->execute();
    echo json_encode(['success' => true, 'id' => $stmt->insert_id, 'name' => $name]);
    $stmt->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $id = (int) ($_GET['node_id'] ?? 0);
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $moving = isset($input['x'], $input['y']) && is_numeric($input['x']) && is_numeric($input['y']);
    $renaming = array_key_exists('name', $input);
    $name = $renaming ? clean_point_name($input['name']) : '';
    if (!$id || (!$moving && !$renaming) || ($renaming && $name === '')) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'node_id and a name and/or x and y are required']);
        exit;
    }
    if ($moving) {
        $x = max(0, min(100, (float) $input['x']));
        $y = max(0, min(100, (float) $input['y']));
        $stmt = $conn->prepare("UPDATE floor_plan_nodes SET x = ?, y = ? WHERE id = ?");
        $stmt->bind_param('ddi', $x, $y, $id);
        $stmt->execute();
        $found = $stmt->affected_rows > 0 || $conn->query("SELECT 1 FROM floor_plan_nodes WHERE id = " . (int) $id)->num_rows > 0;
        $stmt->close();
        if (!$found) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'That point no longer exists.']);
            exit;
        }
        if (!$renaming) {
            echo json_encode(['success' => true]);
            exit;
        }
    }
    $stmt = $conn->prepare("SELECT floor_plan_id FROM floor_plan_nodes WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'That point no longer exists.']);
        exit;
    }
    if (!point_name_is_free($conn, 'floor_plan_nodes', 'floor_plan_id', (int) $row['floor_plan_id'], $name, $id)) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => "Another point on this floor is already named \"$name\"."]);
        exit;
    }
    $stmt = $conn->prepare("UPDATE floor_plan_nodes SET name = ? WHERE id = ?");
    $stmt->bind_param('si', $name, $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['success' => true]);
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
    if (!empty($_GET['all'])) {
        $fp = (int) ($_GET['floor_plan_id'] ?? 0);
        if (!$fp) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'floor_plan_id is required']);
            exit;
        }
        $ids = [];
        $stmt = $conn->prepare("SELECT id FROM floor_plan_nodes WHERE floor_plan_id = ?");
        $stmt->bind_param('i', $fp);
        $stmt->execute();
        $res = $stmt->get_result();
        while ($row = $res->fetch_assoc()) $ids[] = (int) $row['id'];
        $stmt->close();
        $snapshot = plan_snapshot($conn, $ids);
        $stmt = $conn->prepare("DELETE FROM floor_plan_nodes WHERE floor_plan_id = ?");
        $stmt->bind_param('i', $fp);
        $stmt->execute();
        $stmt->close();
        echo json_encode(['success' => true, 'removed' => count($ids), 'snapshot' => $snapshot]);
        exit;
    }
    if (!empty($_GET['node_id'])) {
        $id = (int) $_GET['node_id'];
        $snapshot = plan_snapshot($conn, [$id]);
        // Cascades to its edges and, via ON DELETE SET NULL, unlinks any
        // room that pointed at this node as its walkable entry point.
        $stmt = $conn->prepare("DELETE FROM floor_plan_nodes WHERE id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        echo json_encode(['success' => true, 'snapshot' => $snapshot]);
        $stmt->close();
        exit;
    }
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'node_id or edge_id is required']);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
