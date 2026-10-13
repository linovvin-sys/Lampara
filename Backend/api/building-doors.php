<?php

// Where each building's doors are on its floor plans: the point you come in by (entry) and the point you leave by (exit). A door is
// one of the walkable path points of a floor plan, so the floor-plan and camera guides can end a route "at the exit" or start one
// "at the entrance".
// GET  /api/building-doors.php[?building_id=1] -> { doors: { "<building id>": { entry: {...}, exit: {...} } } }   (public)
//        each door: { node_id, floor_plan_id, floor, name, x, y }   (x, y = 0-100 plan percent)
// POST /api/building-doors.php -> body (JSON) { building_id, kind: 'entry'|'exit'|'both', node_id: number|null }   (admin)
//        node_id null clears it. The point must belong to a floor plan of that building.

header('Content-Type: application/json');

require_once __DIR__ . '/../config.php';

$db = new Database();
$conn = $db->connect();

// Created the first time a query finds it missing, not on every request.
function doors_run(mysqli $conn, callable $fn)
{
    try {
        return $fn();
    } catch (mysqli_sql_exception $e) {
        if ($e->getCode() !== 1146) throw $e;
        $conn->query(
            "CREATE TABLE IF NOT EXISTS building_doors (
                building_id INT NOT NULL,
                kind VARCHAR(5) NOT NULL,
                node_id INT NOT NULL,
                PRIMARY KEY (building_id, kind),
                FOREIGN KEY (node_id) REFERENCES floor_plan_nodes(id) ON DELETE CASCADE
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
        );
        return $fn();
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Cache-Control: no-store');
    require_once __DIR__ . '/_require_admin.php';
    $in = json_decode(file_get_contents('php://input'), true);
    $bid = (int) ($in['building_id'] ?? 0);
    $kind = $in['kind'] ?? '';
    $nodeId = isset($in['node_id']) && $in['node_id'] !== '' ? (int) $in['node_id'] : null;
    if ($bid <= 0 || !in_array($kind, ['entry', 'exit', 'both'], true)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'building_id and kind (entry, exit or both) are required']);
        exit;
    }
    $kinds = $kind === 'both' ? ['entry', 'exit'] : [$kind];
    doors_run($conn, function () use ($conn, $bid, $kinds, $nodeId) {
        if ($nodeId === null) {
            $stmt = $conn->prepare('DELETE FROM building_doors WHERE building_id = ? AND kind = ?');
            foreach ($kinds as $k) { $stmt->bind_param('is', $bid, $k); $stmt->execute(); }
            $stmt->close();
            return;
        }
        $stmt = $conn->prepare('SELECT 1 FROM floor_plan_nodes n JOIN floor_plans fp ON fp.id = n.floor_plan_id WHERE n.id = ? AND fp.building_id = ?');
        $stmt->bind_param('ii', $nodeId, $bid);
        $stmt->execute();
        $ok = (bool) $stmt->get_result()->fetch_row();
        $stmt->close();
        if (!$ok) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'That point is not on a floor plan of this building']);
            exit;
        }
        $stmt = $conn->prepare('INSERT INTO building_doors (building_id, kind, node_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE node_id = VALUES(node_id)');
        foreach ($kinds as $k) { $stmt->bind_param('isi', $bid, $k, $nodeId); $stmt->execute(); }
        $stmt->close();
    });
    echo json_encode(['success' => true]);
    exit;
}

// GET
header('Cache-Control: public, max-age=60');
$only = (int) ($_GET['building_id'] ?? 0);
$rows = doors_run($conn, function () use ($conn, $only) {
    $sql = "SELECT d.building_id, d.kind, n.id AS node_id, n.floor_plan_id, fp.floor, n.name, n.x, n.y
            FROM building_doors d
            JOIN floor_plan_nodes n ON n.id = d.node_id
            JOIN floor_plans fp ON fp.id = n.floor_plan_id" . ($only > 0 ? ' WHERE d.building_id = ' . $only : '');
    $out = [];
    $res = $conn->query($sql);
    while ($r = $res->fetch_assoc()) $out[] = $r;
    return $out;
});
$doors = [];
foreach ($rows as $r) {
    $doors[(string) $r['building_id']][$r['kind']] = [
        'node_id' => (int) $r['node_id'], 'floor_plan_id' => (int) $r['floor_plan_id'], 'floor' => $r['floor'],
        'name' => $r['name'], 'x' => (float) $r['x'], 'y' => (float) $r['y'],
    ];
}
echo json_encode(['success' => true, 'doors' => (object) $doors]);
