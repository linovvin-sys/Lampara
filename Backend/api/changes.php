<?php

// Recent changes to rooms and buildings, and an Undo for them. Admin only.
// GET  /api/changes.php            -> the latest changes, newest first: { success, changes: [{ id, entity, action, label, admin_name, created_at, undoable, why_not }] }
// POST /api/changes.php?id=12      -> undo that change: { success } or { success: false, error }
//
// What can be undone: an edit (puts the old values back), a new room or empty building (removes it), a deleted room (adds it back).
// Not undoable: a deleted building (it took its rooms and floor plans with it), or anything changed again afterwards.

header('Content-Type: application/json');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../change_log.php';
require_once __DIR__ . '/_require_admin.php';

$db = new Database();
$conn = $db->connect();

if (!change_log_ready($conn)) {
    echo json_encode(['success' => true, 'changes' => [], 'note' => 'History is not set up yet. Run: php Backend/scripts/migrate-round3.php']);
    exit;
}

// Fields an undo may write back (never ids, photos or timestamps).
const UNDO_FIELDS = [
    'room' => ['building_id' => 'i', 'room_number' => 's', 'room_name' => 's', 'subtitle' => 's', 'floor' => 's', 'room_type' => 's', 'category' => 's', 'hours' => 's', 'notes' => 's', 'map_x' => 'd', 'map_y' => 'd', 'path_node_id' => 'i'],
    'building' => ['name' => 's', 'lat' => 'd', 'lng' => 'd', 'floor_count' => 'i', 'entrance_floor' => 's', 'building_number' => 'i', 'directory' => 's'],
];

function table_for(string $entity): string { return $entity === 'room' ? 'rooms' : 'buildings'; }

// Can this entry be undone right now? [bool, reason]
function undo_state(mysqli $conn, array $c): array
{
    if (!empty($c['undone_at'])) return [false, 'Already undone'];
    $table = table_for($c['entity']);
    $id = (int) $c['entity_id'];
    // Something newer happened to the same room or building: undoing this one could overwrite it.
    $stmt = $conn->prepare("SELECT COUNT(*) FROM change_log WHERE entity = ? AND entity_id = ? AND id > ? AND undone_at IS NULL");
    $stmt->bind_param('sii', $c['entity'], $id, $c['id']);
    $stmt->execute();
    $newer = (int) $stmt->get_result()->fetch_row()[0];
    $stmt->close();
    if ($newer > 0) return [false, 'Changed again since'];
    if ($c['action'] === 'delete') {
        if ($c['entity'] === 'building') return [false, 'A deleted building cannot be restored'];
        if (change_row($conn, $table, $id)) return [false, 'Already exists'];
        return [true, ''];
    }
    $row = change_row($conn, $table, $id);
    if (!$row) return [false, 'No longer exists'];
    if ($c['action'] === 'create' && $c['entity'] === 'building') {
        $stmt = $conn->prepare("SELECT COUNT(*) FROM rooms WHERE building_id = ?");
        $stmt->bind_param('i', $id);
        $stmt->execute();
        $rooms = (int) $stmt->get_result()->fetch_row()[0];
        $stmt->close();
        if ($rooms > 0) return [false, 'The building has rooms now'];
    }
    return [true, ''];
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $res = $conn->query("SELECT id, entity, entity_id, action, label, admin_name, undone_at, created_at FROM change_log WHERE undone_at IS NULL ORDER BY id DESC LIMIT 12");
    $out = [];
    while ($c = $res->fetch_assoc()) {
        [$ok, $why] = undo_state($conn, $c);
        $out[] = [
            'id' => (int) $c['id'], 'entity' => $c['entity'], 'action' => $c['action'], 'label' => $c['label'],
            'admin_name' => $c['admin_name'], 'created_at' => $c['created_at'], 'undoable' => $ok, 'why_not' => $why,
        ];
    }
    echo json_encode(['success' => true, 'changes' => $out]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $id = (int) ($_GET['id'] ?? 0);
    $stmt = $conn->prepare("SELECT * FROM change_log WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $c = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$c) { http_response_code(404); echo json_encode(['success' => false, 'error' => 'That change was not found.']); exit; }

    [$ok, $why] = undo_state($conn, $c);
    if (!$ok) { http_response_code(409); echo json_encode(['success' => false, 'error' => $why . '.']); exit; }

    $table = table_for($c['entity']);
    $entityId = (int) $c['entity_id'];
    $before = $c['before_json'] ? json_decode($c['before_json'], true) : null;
    $fields = UNDO_FIELDS[$c['entity']];

    try {
        if ($c['action'] === 'create') {
            $stmt = $conn->prepare("DELETE FROM `$table` WHERE id = ?");
            $stmt->bind_param('i', $entityId);
            $stmt->execute();
            $stmt->close();
        } elseif ($c['action'] === 'update') {
            $sets = []; $types = ''; $vals = [];
            foreach ($fields as $col => $t) {
                if (!array_key_exists($col, $before) || !column_exists($conn, $table, $col)) continue;
                $sets[] = "`$col` = ?"; $types .= $t; $vals[] = $before[$col];
            }
            if ($sets) {
                $types .= 'i'; $vals[] = $entityId;
                $stmt = $conn->prepare("UPDATE `$table` SET " . implode(', ', $sets) . " WHERE id = ?");
                $stmt->bind_param($types, ...$vals);
                $stmt->execute();
                $stmt->close();
            }
        } else { // delete (rooms only)
            $cols = ['id']; $marks = ['?']; $types = 'i'; $vals = [$entityId];
            foreach ($fields as $col => $t) {
                if (!array_key_exists($col, $before) || !column_exists($conn, $table, $col)) continue;
                $cols[] = "`$col`"; $marks[] = '?'; $types .= $t; $vals[] = $before[$col];
            }
            $stmt = $conn->prepare("INSERT INTO `$table` (" . implode(', ', $cols) . ") VALUES (" . implode(', ', $marks) . ")");
            $stmt->bind_param($types, ...$vals);
            $stmt->execute();
            $stmt->close();
        }
    } catch (mysqli_sql_exception $e) {
        http_response_code(409);
        $msg = $conn->errno === 1062 ? 'Another room now uses that room number, so this cannot be undone.' : 'The undo could not be applied.';
        echo json_encode(['success' => false, 'error' => $msg]);
        exit;
    }

    $stmt = $conn->prepare("UPDATE change_log SET undone_at = NOW() WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['success' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
