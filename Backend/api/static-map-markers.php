<?php

// Pins on the static campus map: building entrances (shown with the building's name) and campus gates.
//
// GET    /api/static-map-markers.php?kind=2d     -> { success, markers: [ { id, kind, marker_type, building_id, building_name, label, name, x, y } ] }   (public)
//        (no kind = markers for both maps)
// POST   /api/static-map-markers.php             -> add a pin (admin)
//        body (JSON): { kind: "2d"|"3d", marker_type: "entrance"|"gate", building_id?, label?, x, y }   x / y = percent of the picture
// PUT    /api/static-map-markers.php?id=1        -> change a pin: any of marker_type, building_id, label, x, y (admin)
// DELETE /api/static-map-markers.php?id=1        -> remove a pin (admin)
//
// marker_type: "entrance" (belongs to a building), "gate" (a campus gate) or "landmark" (a highlighted key place such as
// Admission, Treasury, Clinic or the Faculty room; needs a label, the building is optional).
//
// "name" is the text students see: "<Building> – Entrance" (or "<Building> – <label>" when a label is set, e.g. "North door"),
// the label of a gate ("Main Gate"), or the label of a landmark with its building ("Admission – Main Building").

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'DELETE'])) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

const MARKER_KINDS = ['2d', '3d'];
const MARKER_TYPES = ['entrance', 'gate', 'landmark'];

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function cleanLabel($value) {
    $v = trim((string) $value);
    return $v === '' ? null : mb_substr($v, 0, 100, 'UTF-8');
}

function pct($value) {
    return round(max(0, min(100, (float) $value)), 2);
}

function displayName($row) {
    $label = $row['label'];
    if ($row['marker_type'] === 'gate') return $label !== null ? $label : 'Campus Gate';
    if ($row['marker_type'] === 'landmark') {
        $name = $label !== null ? $label : 'Key place';
        return $row['building_name'] !== null ? $name . ' – ' . $row['building_name'] : $name;
    }
    $building = $row['building_name'] !== null ? $row['building_name'] : 'Building';
    return $building . ' – ' . ($label !== null ? $label : 'Entrance');
}

function fetchMarker($conn, $id) {
    $stmt = $conn->prepare("SELECT m.id, m.kind, m.marker_type, m.building_id, b.name AS building_name, m.label, m.x, m.y
                            FROM static_map_markers m LEFT JOIN buildings b ON b.id = m.building_id WHERE m.id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ? shapeMarker($row) : null;
}

function shapeMarker($row) {
    return [
        'id' => (int) $row['id'],
        'kind' => $row['kind'],
        'marker_type' => $row['marker_type'],
        'building_id' => $row['building_id'] !== null ? (int) $row['building_id'] : null,
        'building_name' => $row['building_name'],
        'label' => $row['label'],
        'name' => displayName($row),
        'x' => (float) $row['x'],
        'y' => (float) $row['y'],
    ];
}

function checkBuilding($conn, $buildingId) {
    $stmt = $conn->prepare("SELECT id FROM buildings WHERE id = ?");
    $stmt->bind_param('i', $buildingId);
    $stmt->execute();
    $ok = (bool) $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$ok) fail(400, 'That building does not exist');
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $kind = $_GET['kind'] ?? '';
    $sql = "SELECT m.id, m.kind, m.marker_type, m.building_id, b.name AS building_name, m.label, m.x, m.y
            FROM static_map_markers m LEFT JOIN buildings b ON b.id = m.building_id";
    if ($kind !== '') {
        if (!in_array($kind, MARKER_KINDS, true)) fail(400, 'kind must be "2d" or "3d"');
        $stmt = $conn->prepare($sql . " WHERE m.kind = ? ORDER BY m.marker_type, b.name, m.label, m.id");
        $stmt->bind_param('s', $kind);
        $stmt->execute();
        $result = $stmt->get_result();
    } else {
        $result = $conn->query($sql . " ORDER BY m.kind, m.marker_type, b.name, m.label, m.id");
    }
    $markers = [];
    while ($row = $result->fetch_assoc()) $markers[] = shapeMarker($row);
    echo json_encode(['success' => true, 'markers' => $markers]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $in = json_decode(file_get_contents('php://input'), true) ?? [];
    $kind = $in['kind'] ?? '';
    $type = $in['marker_type'] ?? 'entrance';
    if (!in_array($kind, MARKER_KINDS, true)) fail(400, 'kind must be "2d" or "3d"');
    if (!in_array($type, MARKER_TYPES, true)) fail(400, 'marker_type must be "entrance" or "gate"');
    if (!isset($in['x'], $in['y'])) fail(400, 'x and y are required');
    $label = cleanLabel($in['label'] ?? '');
    $buildingId = null;
    if ($type === 'entrance') {
        $buildingId = (int) ($in['building_id'] ?? 0);
        if (!$buildingId) fail(400, 'Choose which building this entrance belongs to');
        checkBuilding($conn, $buildingId);
    } elseif ($type === 'landmark') {
        if ($label === null) fail(400, 'Give the key place a name, for example Admission or Treasury');
        $buildingId = (int) ($in['building_id'] ?? 0) ?: null;
        if ($buildingId) checkBuilding($conn, $buildingId);
    } elseif ($label === null) {
        $label = 'Campus Gate';
    }
    $x = pct($in['x']); $y = pct($in['y']);
    $stmt = $conn->prepare("INSERT INTO static_map_markers (kind, marker_type, building_id, label, x, y) VALUES (?, ?, ?, ?, ?, ?)");
    $stmt->bind_param('ssisdd', $kind, $type, $buildingId, $label, $x, $y);
    $stmt->execute();
    $id = $stmt->insert_id;
    $stmt->close();
    echo json_encode(['success' => true, 'marker' => fetchMarker($conn, $id)]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) fail(400, 'id is required');
    $current = fetchMarker($conn, $id);
    if (!$current) fail(404, 'Marker not found');
    $in = json_decode(file_get_contents('php://input'), true) ?? [];

    $type = array_key_exists('marker_type', $in) ? $in['marker_type'] : $current['marker_type'];
    if (!in_array($type, MARKER_TYPES, true)) fail(400, 'marker_type must be "entrance" or "gate"');
    $label = array_key_exists('label', $in) ? cleanLabel($in['label']) : $current['label'];
    $buildingId = array_key_exists('building_id', $in) ? ((int) $in['building_id'] ?: null) : $current['building_id'];
    if ($type === 'entrance') {
        if (!$buildingId) fail(400, 'Choose which building this entrance belongs to');
        checkBuilding($conn, $buildingId);
    } elseif ($type === 'landmark') {
        if ($label === null) fail(400, 'Give the key place a name, for example Admission or Treasury');
        if ($buildingId) checkBuilding($conn, $buildingId);
    } else {
        $buildingId = null;
        if ($label === null) $label = 'Campus Gate';
    }
    $x = array_key_exists('x', $in) ? pct($in['x']) : $current['x'];
    $y = array_key_exists('y', $in) ? pct($in['y']) : $current['y'];

    $stmt = $conn->prepare("UPDATE static_map_markers SET marker_type = ?, building_id = ?, label = ?, x = ?, y = ? WHERE id = ?");
    $stmt->bind_param('sisddi', $type, $buildingId, $label, $x, $y, $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['success' => true, 'marker' => fetchMarker($conn, $id)]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $id = (int) ($_GET['id'] ?? 0);
    if (!$id) fail(400, 'id is required');
    $stmt = $conn->prepare("DELETE FROM static_map_markers WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['success' => true]);
    exit;
}

fail(405, 'Method not allowed');
