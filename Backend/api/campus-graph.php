<?php

// Outdoor walkway graph (GPS coordinates) — the AR guide routes over this so the
// ground arrow follows real walkways instead of cutting through buildings.
//
// GET    /api/campus-graph.php                         -> { nodes: [...], edges: [...] }
// POST   /api/campus-graph.php                         -> add a node
//        body (JSON): { lat, lng, node_type?, name? }  (node_type: junction | gate | entrance)
//        name is optional: a new point gets the next free "Point A", "Point B", ... automatically
// PUT    /api/campus-graph.php?node_id=1               -> move a node / change its type / rename it
//        body (JSON): { lat, lng, node_type, name? }   (name omitted = keep the current one)
// DELETE /api/campus-graph.php?node_id=1               -> remove a node (cascades its edges, unlinks any building using it)
//        the reply carries a `snapshot` of what was removed, for Undo
// DELETE /api/campus-graph.php?all=1                   -> remove EVERY node (and so every edge, and every building's entrance)
//        the reply carries a `snapshot` for Undo
// POST   /api/campus-graph.php?action=restore          -> put a snapshot back (same ids, names, connections and entrances)
//        body (JSON): the `snapshot` returned by either delete above
// POST   /api/campus-graph.php?action=edge             -> connect two nodes
//        body (JSON): { node_a_id, node_b_id }
// DELETE /api/campus-graph.php?edge_id=1               -> remove one connection
// POST   /api/campus-graph.php?action=entrance         -> set which node is a building's door
//        body (JSON): { building_id, node_id }         (node_id null clears it)

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

const CAMPUS_NODE_TYPES = ['junction', 'gate', 'entrance'];

// Everything a delete of these nodes takes with it, so it can be put back: the nodes, the
// connections touching them, and the buildings whose entrance they were.
function campus_snapshot(mysqli $conn, array $ids): array {
    $snap = ['nodes' => [], 'edges' => [], 'entrances' => []];
    if (!$ids) return $snap;
    $in = implode(',', array_map('intval', $ids));
    $r = $conn->query("SELECT id, lat, lng, node_type, name FROM campus_nodes WHERE id IN ($in) ORDER BY id");
    while ($row = $r->fetch_assoc()) {
        $snap['nodes'][] = ['id' => (int) $row['id'], 'lat' => (float) $row['lat'], 'lng' => (float) $row['lng'], 'node_type' => $row['node_type'], 'name' => $row['name']];
    }
    $r = $conn->query("SELECT node_a_id, node_b_id FROM campus_edges WHERE node_a_id IN ($in) OR node_b_id IN ($in)");
    while ($row = $r->fetch_assoc()) {
        $snap['edges'][] = ['node_a_id' => (int) $row['node_a_id'], 'node_b_id' => (int) $row['node_b_id']];
    }
    $r = $conn->query("SELECT id, entrance_node_id FROM buildings WHERE entrance_node_id IN ($in)");
    while ($row = $r->fetch_assoc()) {
        $snap['entrances'][] = ['building_id' => (int) $row['id'], 'node_id' => (int) $row['entrance_node_id']];
    }
    return $snap;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $nodes = [];
    $result = $conn->query("SELECT id, lat, lng, node_type, name FROM campus_nodes ORDER BY id");
    while ($row = $result->fetch_assoc()) {
        $row['id'] = (int) $row['id'];
        $row['lat'] = (float) $row['lat'];
        $row['lng'] = (float) $row['lng'];
        $nodes[] = $row;
    }

    $edges = [];
    $result = $conn->query("SELECT id, node_a_id, node_b_id FROM campus_edges");
    while ($row = $result->fetch_assoc()) {
        $edges[] = [
            'id' => (int) $row['id'],
            'node_a_id' => (int) $row['node_a_id'],
            'node_b_id' => (int) $row['node_b_id'],
        ];
    }

    echo json_encode(['success' => true, 'nodes' => $nodes, 'edges' => $edges]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $action = $_GET['action'] ?? '';

    if ($action === 'edge') {
        $nodeA = (int) ($input['node_a_id'] ?? 0);
        $nodeB = (int) ($input['node_b_id'] ?? 0);
        if (!$nodeA || !$nodeB || $nodeA === $nodeB) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'node_a_id and node_b_id (distinct) are required']);
            exit;
        }
        // Consistent order so the UNIQUE key treats A-B and B-A as one edge.
        $lo = min($nodeA, $nodeB);
        $hi = max($nodeA, $nodeB);
        $stmt = $conn->prepare("INSERT INTO campus_edges (node_a_id, node_b_id) VALUES (?, ?)");
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

    if ($action === 'restore') {
        $restored = 0;
        $conn->begin_transaction();
        foreach (($input['nodes'] ?? []) as $n) {
            $id = (int) ($n['id'] ?? 0);
            $type = $n['node_type'] ?? 'junction';
            if (!$id || !isset($n['lat'], $n['lng']) || !in_array($type, CAMPUS_NODE_TYPES, true)) continue;
            $lat = (float) $n['lat'];
            $lng = (float) $n['lng'];
            // The old name if nobody has taken it since, otherwise the next free one.
            $name = assign_point_name($conn, 'campus_nodes', null, null, $n['name'] ?? '');
            $stmt = $conn->prepare("INSERT INTO campus_nodes (id, lat, lng, node_type, name) VALUES (?, ?, ?, ?, ?)");
            $stmt->bind_param('iddss', $id, $lat, $lng, $type, $name);
            try { $stmt->execute(); $restored++; } catch (mysqli_sql_exception $e) { /* that id is already back */ }
            $stmt->close();
        }
        foreach (($input['edges'] ?? []) as $e) {
            $a = (int) ($e['node_a_id'] ?? 0);
            $b = (int) ($e['node_b_id'] ?? 0);
            if (!$a || !$b || $a === $b) continue;
            $lo = min($a, $b);
            $hi = max($a, $b);
            $stmt = $conn->prepare("INSERT IGNORE INTO campus_edges (node_a_id, node_b_id) VALUES (?, ?)");
            $stmt->bind_param('ii', $lo, $hi);
            try { $stmt->execute(); } catch (mysqli_sql_exception $ex) { /* an end no longer exists */ }
            $stmt->close();
        }
        foreach (($input['entrances'] ?? []) as $en) {
            $bid = (int) ($en['building_id'] ?? 0);
            $nid = (int) ($en['node_id'] ?? 0);
            if (!$bid || !$nid) continue;
            // Only if the building has not been given a different entrance in the meantime.
            $stmt = $conn->prepare("UPDATE buildings SET entrance_node_id = ? WHERE id = ? AND entrance_node_id IS NULL");
            $stmt->bind_param('ii', $nid, $bid);
            try { $stmt->execute(); } catch (mysqli_sql_exception $ex) { /* building or point gone */ }
            $stmt->close();
        }
        $conn->commit();
        echo json_encode(['success' => true, 'restored' => $restored]);
        exit;
    }

    if ($action === 'entrance') {
        $buildingId = (int) ($input['building_id'] ?? 0);
        $nodeId = isset($input['node_id']) && $input['node_id'] !== null ? (int) $input['node_id'] : null;
        if (!$buildingId) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'building_id is required']);
            exit;
        }
        $stmt = $conn->prepare("UPDATE buildings SET entrance_node_id = ? WHERE id = ?");
        $stmt->bind_param('ii', $nodeId, $buildingId);
        try {
            $stmt->execute();
            echo json_encode(['success' => true]);
        } catch (mysqli_sql_exception $e) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'That node does not exist']);
        }
        $stmt->close();
        exit;
    }

    $lat = isset($input['lat']) ? (float) $input['lat'] : null;
    $lng = isset($input['lng']) ? (float) $input['lng'] : null;
    $type = $input['node_type'] ?? 'junction';
    if ($lat === null || $lng === null || !in_array($type, CAMPUS_NODE_TYPES, true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'lat and lng are required, node_type must be junction, gate, or entrance']);
        exit;
    }
    $name = assign_point_name($conn, 'campus_nodes', null, null, $input['name'] ?? '');
    $stmt = $conn->prepare("INSERT INTO campus_nodes (lat, lng, node_type, name) VALUES (?, ?, ?, ?)");
    $stmt->bind_param('ddss', $lat, $lng, $type, $name);
    $stmt->execute();
    echo json_encode(['success' => true, 'id' => $stmt->insert_id, 'name' => $name]);
    $stmt->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $id = (int) ($_GET['node_id'] ?? 0);
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $lat = isset($input['lat']) ? (float) $input['lat'] : null;
    $lng = isset($input['lng']) ? (float) $input['lng'] : null;
    $type = $input['node_type'] ?? 'junction';
    if (!$id || $lat === null || $lng === null || !in_array($type, CAMPUS_NODE_TYPES, true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'node_id, lat, lng, and a valid node_type are required']);
        exit;
    }
    // Renaming is optional: no name in the body keeps the current one. A name another point
    // already uses is refused, so the list beside the map stays unambiguous.
    $renamed = array_key_exists('name', $input);
    $name = $renamed ? clean_point_name($input['name']) : null;
    if ($renamed) {
        if ($name === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'A point needs a name.']);
            exit;
        }
        if (!point_name_is_free($conn, 'campus_nodes', null, null, $name, $id)) {
            http_response_code(409);
            echo json_encode(['success' => false, 'error' => "Another point is already named \"$name\"."]);
            exit;
        }
        $stmt = $conn->prepare("UPDATE campus_nodes SET lat = ?, lng = ?, node_type = ?, name = ? WHERE id = ?");
        $stmt->bind_param('ddssi', $lat, $lng, $type, $name, $id);
    } else {
        $stmt = $conn->prepare("UPDATE campus_nodes SET lat = ?, lng = ?, node_type = ? WHERE id = ?");
        $stmt->bind_param('ddsi', $lat, $lng, $type, $id);
    }
    $stmt->execute();
    echo json_encode(['success' => true]);
    $stmt->close();
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    if (!empty($_GET['edge_id'])) {
        $id = (int) $_GET['edge_id'];
        $stmt = $conn->prepare("DELETE FROM campus_edges WHERE id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        echo json_encode(['success' => true]);
        $stmt->close();
        exit;
    }
    if (!empty($_GET['all'])) {
        $ids = [];
        $r = $conn->query("SELECT id FROM campus_nodes");
        while ($row = $r->fetch_assoc()) $ids[] = (int) $row['id'];
        $snapshot = campus_snapshot($conn, $ids);
        $conn->query("DELETE FROM campus_nodes");   // edges cascade, entrances are set to NULL
        echo json_encode(['success' => true, 'removed' => count($ids), 'snapshot' => $snapshot]);
        exit;
    }
    if (!empty($_GET['node_id'])) {
        $id = (int) $_GET['node_id'];
        $snapshot = campus_snapshot($conn, [$id]);
        // Cascades to its edges; buildings pointing at it get entrance_node_id = NULL.
        $stmt = $conn->prepare("DELETE FROM campus_nodes WHERE id = ?");
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
