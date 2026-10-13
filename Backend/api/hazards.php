<?php

// Live hazard reports: a visitor photographs a restricted building or a blocked path, and everyone using the app (and
// every admin) is told.
// A new report starts as 'pending': only admins see it until one approves it (then it is 'active' and shown to everyone).
// GET    /api/hazards.php                 -> reports that are active, i.e. approved (public). They fade out after 12 hours.
//        ?status=pending|active|resolved|all -> admin only; also lifts the 12-hour limit
// POST   /api/hazards.php                 -> a new report (public, throttled); an admin's own report is approved at once
//        body (JSON): { kind: 'restricted'|'blocked', building_id?, lat?, lng?, note?, image?: data URL }
// PUT    /api/hazards.php?id=1&action=approve|resolve|reopen   -> show it to everyone, clear it, or bring a cleared one back (admin)
// DELETE /api/hazards.php?id=1            -> remove a report and its photo (admin)

header('Content-Type: application/json');
header('Cache-Control: no-store');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../photo_upload.php';
require_once __DIR__ . '/../rate_limit.php';

if (session_status() !== PHP_SESSION_ACTIVE) session_start();
$isAdmin = !empty($_SESSION['admin_id']);
$method = $_SERVER['REQUEST_METHOD'];

if (in_array($method, ['PUT', 'DELETE'], true)) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

// Created on first use, so nobody has to remember to run a migration.
$conn->query(
    "CREATE TABLE IF NOT EXISTS hazard_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        kind VARCHAR(12) NOT NULL,
        building_id INT NULL,
        lat DOUBLE NULL,
        lng DOUBLE NULL,
        note VARCHAR(255) NULL,
        photo_path VARCHAR(255) NULL,
        status VARCHAR(10) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        resolved_at TIMESTAMP NULL,
        resolved_by VARCHAR(60) NULL,
        KEY idx_status_created (status, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
);

function hazard_row(array $r): array
{
    return [
        'id' => (int) $r['id'],
        'kind' => $r['kind'],
        'building_id' => $r['building_id'] !== null ? (int) $r['building_id'] : null,
        'building_name' => $r['building_name'],
        'lat' => $r['lat'] !== null ? (float) $r['lat'] : null,
        'lng' => $r['lng'] !== null ? (float) $r['lng'] : null,
        'note' => $r['note'],
        'photo_path' => $r['photo_path'],
        'status' => $r['status'],
        'created_at' => $r['created_at'],
        'age_min' => (int) $r['age_min'],
    ];
}

if ($method === 'GET') {
    $status = $_GET['status'] ?? '';
    $sql = "SELECT h.id, h.kind, h.building_id, b.name AS building_name, h.lat, h.lng, h.note, h.photo_path, h.status, h.created_at,
                   TIMESTAMPDIFF(MINUTE, h.created_at, NOW()) AS age_min
            FROM hazard_reports h LEFT JOIN buildings b ON b.id = h.building_id";
    if ($status !== '') {
        if (!$isAdmin) { http_response_code(401); echo json_encode(['success' => false, 'error' => 'Admin login required']); exit; }
        $sql .= $status === 'all' ? '' : " WHERE h.status = '" . (in_array($status, ['pending', 'resolved'], true) ? $status : 'active') . "'";
        $sql .= ' ORDER BY h.id DESC LIMIT 200';
    } else {
        $sql .= " WHERE h.status = 'active' AND h.created_at > NOW() - INTERVAL 12 HOUR ORDER BY h.id DESC LIMIT 50";
    }
    $res = $conn->query($sql);
    $out = [];
    while ($r = $res->fetch_assoc()) $out[] = hazard_row($r);
    echo json_encode(['success' => true, 'reports' => $out]);
    exit;
}

if ($method === 'POST') {
    rate_limit_or_die('hazard_report', 5, 600, 'You have sent several reports just now. Please wait a few minutes before sending another.');
    $in = json_decode(file_get_contents('php://input'), true);
    if (!is_array($in)) photoFail(400, 'Invalid request');

    $kind = $in['kind'] ?? '';
    if (!in_array($kind, ['restricted', 'blocked'], true)) photoFail(400, 'Say whether a building is closed or a path is blocked');

    $buildingId = isset($in['building_id']) && $in['building_id'] !== '' ? (int) $in['building_id'] : null;
    if ($buildingId !== null) {
        $stmt = $conn->prepare('SELECT id FROM buildings WHERE id = ?');
        $stmt->bind_param('i', $buildingId);
        $stmt->execute();
        if (!$stmt->get_result()->fetch_row()) $buildingId = null;
        $stmt->close();
    }
    $lat = isset($in['lat']) && is_numeric($in['lat']) ? (float) $in['lat'] : null;
    $lng = isset($in['lng']) && is_numeric($in['lng']) ? (float) $in['lng'] : null;
    if ($lat !== null && ($lat < -90 || $lat > 90)) $lat = null;
    if ($lng !== null && ($lng < -180 || $lng > 180)) $lng = null;
    if ($lat === null || $lng === null) { $lat = null; $lng = null; }

    $note = trim((string) ($in['note'] ?? ''));
    if (function_exists('mb_substr')) $note = mb_substr($note, 0, 255); else $note = substr($note, 0, 255);
    $note = $note === '' ? null : $note;
    $image = $in['image'] ?? null;
    if ($image === null && $buildingId === null && $lat === null) photoFail(400, 'Add a photo or say where this is');

    $startStatus = $isAdmin ? 'active' : 'pending';
    $stmt = $conn->prepare('INSERT INTO hazard_reports (kind, building_id, lat, lng, note, status) VALUES (?, ?, ?, ?, ?, ?)');
    $stmt->bind_param('siddss', $kind, $buildingId, $lat, $lng, $note, $startStatus);
    if (!$stmt->execute()) photoFail(500, 'Could not save the report');
    $id = $conn->insert_id;
    $stmt->close();

    if (is_string($image) && $image !== '') {
        $path = photoSave('hazards', $id, $image);        // checks the real bytes; answers 400 for anything that is not a photo
        $stmt = $conn->prepare('UPDATE hazard_reports SET photo_path = ? WHERE id = ?');
        $stmt->bind_param('si', $path, $id);
        $stmt->execute();
        $stmt->close();
    }
    echo json_encode(['success' => true, 'id' => $id, 'pending' => !$isAdmin]);
    exit;
}

// PUT / DELETE (admin)
$id = (int) ($_GET['id'] ?? 0);
if ($id <= 0) photoFail(400, 'id is required');

if ($method === 'PUT') {
    $action = $_GET['action'] ?? 'resolve';
    $who = $_SESSION['admin_username'] ?? 'admin';
    if ($action === 'approve') {
        $stmt = $conn->prepare("UPDATE hazard_reports SET status = 'active', created_at = NOW() WHERE id = ? AND status = 'pending'");
        $stmt->bind_param('i', $id);
    } elseif ($action === 'reopen') {
        $stmt = $conn->prepare("UPDATE hazard_reports SET status = 'active', resolved_at = NULL, resolved_by = NULL WHERE id = ?");
        $stmt->bind_param('i', $id);
    } else {
        $stmt = $conn->prepare("UPDATE hazard_reports SET status = 'resolved', resolved_at = NOW(), resolved_by = ? WHERE id = ?");
        $stmt->bind_param('si', $who, $id);
    }
    $stmt->execute();
    echo json_encode(['success' => true]);
    exit;
}

if ($method === 'DELETE') {
    $stmt = $conn->prepare('SELECT photo_path FROM hazard_reports WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) photoFail(404, 'Not found');
    photoDelete($row['photo_path']);
    $stmt = $conn->prepare('DELETE FROM hazard_reports WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    echo json_encode(['success' => true]);
    exit;
}

photoFail(405, 'Method not allowed');
