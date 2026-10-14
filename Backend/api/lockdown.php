<?php

// Close a building or a room for maintenance, or open it again. Signed-in staff only (an administrator or PSMO).
//   POST /api/lockdown.php   body { type: "building"|"room", id, reason }   reason "" (or missing) opens it again; text closes it.
// Students see the closure on the map, the directory and the guide, and cannot start a walk to a closed building.

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/_require_admin.php';
require_once __DIR__ . '/../lockdown.php';
require_once __DIR__ . '/../audit_log.php';

header('Content-Type: application/json');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'error' => 'Use POST.']); exit; }

$in = json_decode(file_get_contents('php://input'), true) ?: [];
$type = $in['type'] ?? '';
$id = (int) ($in['id'] ?? 0);
$reason = trim((string) ($in['reason'] ?? ''));
if (mb_strlen($reason) > 160) $reason = mb_substr($reason, 0, 160);
if (!in_array($type, ['building', 'room'], true) || $id <= 0) { http_response_code(400); echo json_encode(['success' => false, 'error' => 'Say which building or room.']); exit; }

$conn = (new Database())->connect();
if (!ensure_lock_columns($conn)) { http_response_code(500); echo json_encode(['success' => false, 'error' => 'Could not prepare the database for closures.']); exit; }

$table = $type === 'building' ? 'buildings' : 'rooms';
$nameCol = $type === 'building' ? 'name' : 'room_name';
$stmt = $conn->prepare("SELECT $nameCol AS n FROM $table WHERE id = ?");
$stmt->bind_param('i', $id); $stmt->execute();
$row = $stmt->get_result()->fetch_assoc(); $stmt->close();
if (!$row) { http_response_code(404); echo json_encode(['success' => false, 'error' => 'That ' . $type . ' no longer exists.']); exit; }

$val = $reason === '' ? null : $reason;
$stmt = $conn->prepare("UPDATE $table SET closed_note = ? WHERE id = ?");
$stmt->bind_param('si', $val, $id); $stmt->execute(); $stmt->close();
audit_log($conn, $val === null ? 'reopened' : 'closed', $type, $row['n'] . ($val === null ? '' : ': ' . $val));
echo json_encode(['success' => true, 'type' => $type, 'id' => $id, 'closed_note' => $val]);
