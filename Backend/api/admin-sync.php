<?php

// POST /api/admin-sync.php   (admin only)
//   body (JSON): { ops: [ { id, type, payload, force? }, ... ] }
//
// Applies changes an admin made while offline, in order, and reports what
// happened to each one:
//   { success: true, results: [ { op_id, status, message?, server_id?, temp_id?, server? } ], temp_map: { t_abc: 42 } }
//   status: ok | conflict | error | skipped
//
// - Idempotent: every applied op id is remembered (sync_ops), so a retry after a
//   dropped connection can never create a duplicate.
// - Temp ids: things created offline get client ids like "t_x1y2". Later ops may
//   reference them; they're resolved to real ids here (and remembered in
//   sync_temp_ids so a later batch can still resolve them).
// - Conflicts: an update carries the version the admin saw offline. If the row
//   changed on the server since, the op is NOT applied and comes back as a
//   conflict with the server's current values, unless it was sent with force.
// - Each op runs under its own savepoint: one failing op never undoes the others.
//
// Op types: building.create/update, room.create/update, node.create/update/delete,
// edge.create/delete, entrance.set, calibration.set.

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/_require_admin.php';
require_once __DIR__ . '/../room_number.php';
require_once __DIR__ . '/../point_names.php';

class SyncSkip extends RuntimeException {}

$input = json_decode(file_get_contents('php://input'), true);
$ops = is_array($input) ? ($input['ops'] ?? null) : null;
if (!is_array($ops) || count($ops) > 300) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'ops must be an array of at most 300 changes']);
    exit;
}

$db = new Database();
$conn = $db->connect();

// ---------- helpers ----------

// Client-made ids look like "t_abc123"; anything else is a real database id.
function isTempId($v) {
    return is_string($v) && strncmp($v, 't_', 2) === 0;
}

function resolveId($conn, $v, array &$tempMap) {
    if ($v === null || $v === '') return null;
    if (isTempId($v)) {
        if (isset($tempMap[$v])) return $tempMap[$v];
        $stmt = $conn->prepare("SELECT real_id FROM sync_temp_ids WHERE temp_id = ?");
        $stmt->bind_param('s', $v);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_assoc();
        $stmt->close();
        if ($row) return $tempMap[$v] = (int) $row['real_id'];
        throw new SyncSkip("Depends on a change that hasn't been saved yet.");
    }
    return (int) $v;
}

function rememberTemp($conn, $tempId, $entity, $realId, array &$tempMap) {
    if (!isTempId($tempId)) return;
    $tempMap[$tempId] = (int) $realId;
    $stmt = $conn->prepare("INSERT INTO sync_temp_ids (temp_id, entity, real_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE real_id = VALUES(real_id)");
    $stmt->bind_param('ssi', $tempId, $entity, $realId);
    $stmt->execute();
    $stmt->close();
}

function fetchRow($conn, $sql, $types, ...$params) {
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$params);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

function nullableInt($v) { return ($v === null || $v === '') ? null : (int) $v; }
function nullableFloat($v) { return ($v === null || $v === '') ? null : (float) $v; }

// Same derivation rooms.php applies, so a synced room is identical to one saved online.
function roomFields(array $p) {
    $category = in_array($p['category'] ?? '', ['office', 'classroom', 'cr', 'canteen'], true) ? $p['category'] : 'office';
    $roomType = in_array($category, ['office', 'canteen'], true) ? 'office' : 'classroom';
    return [
        'room_number' => normalize_room_number($p['room_number'] ?? ''), // "1101-a" -> "1101 - A"
        'room_name'   => trim((string) ($p['room_name'] ?? '')),
        'floor'       => trim((string) ($p['floor'] ?? '')),
        'category'    => $category,
        'room_type'   => $roomType,
        'hours'       => $roomType === 'office' ? trim((string) ($p['hours'] ?? '')) : null,
        'notes'       => trim((string) ($p['notes'] ?? '')) ?: null,
        'map_x'       => nullableFloat($p['map_x'] ?? null),
        'map_y'       => nullableFloat($p['map_y'] ?? null),
    ];
}

function conflict($message, $server = null) {
    return ['status' => 'conflict', 'message' => $message, 'server' => $server];
}
function failure($message) {
    return ['status' => 'error', 'message' => $message];
}

// ---------- applying one op ----------

function applyOp($conn, $type, array $p, $force, array &$tempMap) {
    switch ($type) {

        case 'building.create': {
            $name = trim((string) ($p['name'] ?? ''));
            if ($name === '' || !isset($p['lat'], $p['lng'])) return failure('A building needs a name and a location.');
            $lat = (float) $p['lat']; $lng = (float) $p['lng'];
            $floors = max(1, (int) ($p['floor_count'] ?? 1));
            $number = nullableInt($p['building_number'] ?? null);
            $dir = trim((string) ($p['directory'] ?? ''));
            $stmt = $conn->prepare("INSERT INTO buildings (name, lat, lng, floor_count, building_number, directory) VALUES (?, ?, ?, ?, ?, ?)");
            $stmt->bind_param('sddiis', $name, $lat, $lng, $floors, $number, $dir);
            $stmt->execute();
            $id = $stmt->insert_id;
            $stmt->close();
            rememberTemp($conn, $p['temp_id'] ?? null, 'building', $id, $tempMap);
            return ['status' => 'ok', 'server_id' => $id, 'temp_id' => $p['temp_id'] ?? null];
        }

        case 'building.update': {
            $id = resolveId($conn, $p['id'] ?? null, $tempMap);
            $row = fetchRow($conn, "SELECT name, lat, lng, floor_count, building_number, directory, updated_at FROM buildings WHERE id = ?", 'i', $id);
            if (!$row) return failure('This building no longer exists on the server.');
            if (!$force && !empty($p['base_updated_at']) && $row['updated_at'] !== $p['base_updated_at']) {
                return conflict('This building was changed on the server after you edited it offline.', $row);
            }
            $name = trim((string) ($p['name'] ?? ''));
            if ($name === '' || !isset($p['lat'], $p['lng'])) return failure('A building needs a name and a location.');
            $lat = (float) $p['lat']; $lng = (float) $p['lng'];
            $floors = max(1, (int) ($p['floor_count'] ?? 1));
            $number = nullableInt($p['building_number'] ?? null);
            $dir = trim((string) ($p['directory'] ?? ''));
            $stmt = $conn->prepare("UPDATE buildings SET name = ?, lat = ?, lng = ?, floor_count = ?, building_number = ?, directory = ? WHERE id = ?");
            $stmt->bind_param('sddiisi', $name, $lat, $lng, $floors, $number, $dir, $id);
            $stmt->execute();
            $stmt->close();
            return ['status' => 'ok', 'server_id' => $id];
        }

        case 'room.create': {
            $buildingId = resolveId($conn, $p['building_id'] ?? null, $tempMap);
            $f = roomFields($p);
            if (!$buildingId || $f['room_name'] === '' || $f['floor'] === '') return failure('A room needs a building, a name and a floor.');
            if (room_number_taken($conn, $f['room_number'])) return failure("Room {$f['room_number']} is already registered.");
            try {
                $stmt = $conn->prepare("INSERT INTO rooms (building_id, room_number, room_name, floor, room_type, category, hours, notes, map_x, map_y) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->bind_param('isssssssdd', $buildingId, $f['room_number'], $f['room_name'], $f['floor'], $f['room_type'], $f['category'], $f['hours'], $f['notes'], $f['map_x'], $f['map_y']);
                $stmt->execute();
            } catch (mysqli_sql_exception $e) {
                if ($conn->errno === 1062) return failure("Room {$f['room_number']} is already registered.");
                throw $e;
            }
            $id = $stmt->insert_id;
            $stmt->close();
            rememberTemp($conn, $p['temp_id'] ?? null, 'room', $id, $tempMap);
            return ['status' => 'ok', 'server_id' => $id, 'temp_id' => $p['temp_id'] ?? null];
        }

        case 'room.update': {
            $id = resolveId($conn, $p['id'] ?? null, $tempMap);
            $row = fetchRow($conn, "SELECT room_number, room_name, floor, category, hours, notes, map_x, map_y, updated_at FROM rooms WHERE id = ?", 'i', $id);
            if (!$row) return failure('This room no longer exists on the server.');
            if (!$force && !empty($p['base_updated_at']) && $row['updated_at'] !== $p['base_updated_at']) {
                return conflict('This room was changed on the server after you edited it offline.', $row);
            }
            $f = roomFields($p);
            if ($f['room_name'] === '' || $f['floor'] === '') return failure('A room needs a name and a floor.');
            if (room_number_taken($conn, $f['room_number'], $id)) return failure("Room {$f['room_number']} is already registered.");
            try {
                $stmt = $conn->prepare("UPDATE rooms SET room_number = ?, room_name = ?, floor = ?, room_type = ?, category = ?, hours = ?, notes = ?, map_x = ?, map_y = ? WHERE id = ?");
                $stmt->bind_param('sssssssddi', $f['room_number'], $f['room_name'], $f['floor'], $f['room_type'], $f['category'], $f['hours'], $f['notes'], $f['map_x'], $f['map_y'], $id);
                $stmt->execute();
            } catch (mysqli_sql_exception $e) {
                if ($conn->errno === 1062) return failure("Room {$f['room_number']} is already registered.");
                throw $e;
            }
            $stmt->close();
            return ['status' => 'ok', 'server_id' => $id];
        }

        case 'node.create': {
            $type = $p['node_type'] ?? 'junction';
            if (!isset($p['lat'], $p['lng']) || !in_array($type, ['junction', 'gate', 'entrance'], true)) return failure('A walkway point needs a location.');
            $lat = (float) $p['lat']; $lng = (float) $p['lng'];
            // The name picked offline may have been taken since: fall back to the next free one.
            $name = assign_point_name($conn, 'campus_nodes', null, null, $p['name'] ?? '');
            $stmt = $conn->prepare("INSERT INTO campus_nodes (lat, lng, node_type, name) VALUES (?, ?, ?, ?)");
            $stmt->bind_param('ddss', $lat, $lng, $type, $name);
            $stmt->execute();
            $id = $stmt->insert_id;
            $stmt->close();
            rememberTemp($conn, $p['temp_id'] ?? null, 'node', $id, $tempMap);
            return ['status' => 'ok', 'server_id' => $id, 'temp_id' => $p['temp_id'] ?? null];
        }

        case 'node.update': {
            $id = resolveId($conn, $p['id'] ?? null, $tempMap);
            $row = fetchRow($conn, "SELECT lat, lng, node_type FROM campus_nodes WHERE id = ?", 'i', $id);
            if (!$row) return failure('This walkway point no longer exists on the server.');
            $base = $p['base'] ?? null;
            if (!$force && is_array($base) && (
                abs((float) $row['lat'] - (float) ($base['lat'] ?? 0)) > 1e-6 ||
                abs((float) $row['lng'] - (float) ($base['lng'] ?? 0)) > 1e-6 ||
                ($row['node_type'] !== ($base['node_type'] ?? $row['node_type']))
            )) {
                return conflict('This walkway point was moved or changed on the server after you edited it offline.', $row);
            }
            $type = $p['node_type'] ?? 'junction';
            if (!isset($p['lat'], $p['lng']) || !in_array($type, ['junction', 'gate', 'entrance'], true)) return failure('A walkway point needs a location.');
            $lat = (float) $p['lat']; $lng = (float) $p['lng'];
            if (array_key_exists('name', $p)) {
                $name = clean_point_name($p['name']);
                if ($name === '') return failure('A point needs a name.');
                if (!point_name_is_free($conn, 'campus_nodes', null, null, $name, $id)) return failure("Another point is already named \"$name\".");
                $stmt = $conn->prepare("UPDATE campus_nodes SET lat = ?, lng = ?, node_type = ?, name = ? WHERE id = ?");
                $stmt->bind_param('ddssi', $lat, $lng, $type, $name, $id);
            } else {
                $stmt = $conn->prepare("UPDATE campus_nodes SET lat = ?, lng = ?, node_type = ? WHERE id = ?");
                $stmt->bind_param('ddsi', $lat, $lng, $type, $id);
            }
            $stmt->execute();
            $stmt->close();
            return ['status' => 'ok', 'server_id' => $id];
        }

        case 'node.delete': {
            $id = resolveId($conn, $p['id'] ?? null, $tempMap);
            $stmt = $conn->prepare("DELETE FROM campus_nodes WHERE id = ?"); // cascades its edges; unlinks entrances
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $stmt->close();
            return ['status' => 'ok'];
        }

        case 'edge.create': {
            $a = resolveId($conn, $p['node_a_id'] ?? null, $tempMap);
            $b = resolveId($conn, $p['node_b_id'] ?? null, $tempMap);
            if (!$a || !$b || $a === $b) return failure('A connection needs two different points.');
            $lo = min($a, $b); $hi = max($a, $b);
            try {
                $stmt = $conn->prepare("INSERT INTO campus_edges (node_a_id, node_b_id) VALUES (?, ?)");
                $stmt->bind_param('ii', $lo, $hi);
                $stmt->execute();
                $id = $stmt->insert_id;
                $stmt->close();
            } catch (mysqli_sql_exception $e) {
                if ($conn->errno === 1062) return ['status' => 'ok', 'message' => 'Already connected.'];
                if ($conn->errno === 1452) return failure('One of the points no longer exists on the server.');
                throw $e;
            }
            rememberTemp($conn, $p['temp_id'] ?? null, 'edge', $id, $tempMap);
            return ['status' => 'ok', 'server_id' => $id, 'temp_id' => $p['temp_id'] ?? null];
        }

        case 'edge.delete': {
            $id = resolveId($conn, $p['id'] ?? null, $tempMap);
            $stmt = $conn->prepare("DELETE FROM campus_edges WHERE id = ?");
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $stmt->close();
            return ['status' => 'ok'];
        }

        case 'entrance.set': {
            $buildingId = resolveId($conn, $p['building_id'] ?? null, $tempMap);
            $nodeId = resolveId($conn, $p['node_id'] ?? null, $tempMap);
            $row = fetchRow($conn, "SELECT entrance_node_id FROM buildings WHERE id = ?", 'i', $buildingId);
            if (!$row) return failure('This building no longer exists on the server.');
            if (!$force && array_key_exists('base_entrance', $p)) {
                $base = nullableInt($p['base_entrance']);
                $current = nullableInt($row['entrance_node_id']);
                if ($base !== $current) return conflict("This building's entrance was changed on the server after you set it offline.", $row);
            }
            try {
                $stmt = $conn->prepare("UPDATE buildings SET entrance_node_id = ? WHERE id = ?");
                $stmt->bind_param('ii', $nodeId, $buildingId);
                $stmt->execute();
                $stmt->close();
            } catch (mysqli_sql_exception $e) {
                if ($conn->errno === 1452) return failure('That walkway point no longer exists on the server.');
                throw $e;
            }
            return ['status' => 'ok'];
        }

        case 'calibration.set': {
            $id = resolveId($conn, $p['plan_id'] ?? null, $tempMap);
            $row = fetchRow($conn, "SELECT north_offset, meters_per_unit_x, meters_per_unit_y, updated_at FROM floor_plans WHERE id = ?", 'i', $id);
            if (!$row) return failure('This floor plan no longer exists on the server.');
            if (!$force && !empty($p['base_updated_at']) && $row['updated_at'] !== $p['base_updated_at']) {
                return conflict('This floor was calibrated or changed on the server after you calibrated it offline.', $row);
            }
            $north = isset($p['north_offset']) ? fmod((float) $p['north_offset'] + 360, 360) : null;
            $mx = (float) ($p['meters_per_unit_x'] ?? 0);
            $my = (float) ($p['meters_per_unit_y'] ?? 0);
            if ($north === null || $mx <= 0 || $my <= 0) return failure('Calibration needs a direction and a positive size.');
            $stmt = $conn->prepare("UPDATE floor_plans SET north_offset = ?, meters_per_unit_x = ?, meters_per_unit_y = ? WHERE id = ?");
            $stmt->bind_param('dddi', $north, $mx, $my, $id);
            $stmt->execute();
            $stmt->close();
            return ['status' => 'ok', 'server_id' => $id];
        }
    }
    return failure("Unknown change type: $type");
}

// ---------- run the batch ----------

$results = [];
$tempMap = [];
$conn->begin_transaction();

foreach ($ops as $op) {
    $opId = substr((string) ($op['id'] ?? ''), 0, 64);
    $type = (string) ($op['type'] ?? '');
    $payload = is_array($op['payload'] ?? null) ? $op['payload'] : [];
    $force = !empty($op['force']);

    if ($opId === '') {
        $results[] = ['op_id' => '', 'status' => 'error', 'message' => 'Change has no id.'];
        continue;
    }

    // Already applied by an earlier request (e.g. the response got lost)? Return that result.
    $prior = fetchRow($conn, "SELECT result_json FROM sync_ops WHERE op_id = ?", 's', $opId);
    if ($prior) {
        $r = json_decode($prior['result_json'], true) ?: ['status' => 'ok'];
        $r['op_id'] = $opId;
        $r['replayed'] = true;
        $results[] = $r;
        continue;
    }

    $conn->query('SAVEPOINT op_sp');
    try {
        $r = applyOp($conn, $type, $payload, $force, $tempMap);
    } catch (SyncSkip $e) {
        $r = ['status' => 'skipped', 'message' => $e->getMessage()];
    } catch (mysqli_sql_exception $e) {
        error_log('admin-sync ' . $type . ' failed: ' . $e->getMessage());
        $r = failure('The server could not save this change.');
    }

    if ($r['status'] === 'ok') {
        $conn->query('RELEASE SAVEPOINT op_sp');
        $json = json_encode($r);
        $stmt = $conn->prepare("INSERT INTO sync_ops (op_id, result_json) VALUES (?, ?)");
        $stmt->bind_param('ss', $opId, $json);
        $stmt->execute();
        $stmt->close();
    } else {
        $conn->query('ROLLBACK TO SAVEPOINT op_sp');
    }
    $r['op_id'] = $opId;
    $results[] = $r;
}

$conn->commit();
echo json_encode(['success' => true, 'results' => $results, 'temp_map' => (object) $tempMap]);
