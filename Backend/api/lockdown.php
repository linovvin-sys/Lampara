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
$until = null;   // optional "reopens at", local time as YYYY-MM-DDTHH:MM
if (!empty($in['until'])) {
    $dt = DateTime::createFromFormat('Y-m-d\TH:i', (string) $in['until']);
    if (!$dt || $dt->format('Y-m-d\TH:i') !== (string) $in['until']) { http_response_code(400); echo json_encode(['success' => false, 'error' => 'That reopening date and time is not valid.']); exit; }
    if ($dt <= new DateTime()) { http_response_code(400); echo json_encode(['success' => false, 'error' => 'The reopening time must be in the future.']); exit; }
    $until = $dt->format('Y-m-d H:i:s');
}
if ($reason !== '' && $until === null) { http_response_code(400); echo json_encode(['success' => false, 'error' => 'Choose the date and time it reopens.']); exit; }
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
if ($val === null) $until = null;
$stmt = $conn->prepare("UPDATE $table SET closed_note = ?, closed_until = ? WHERE id = ?");
$stmt->bind_param('ssi', $val, $until, $id); $stmt->execute(); $stmt->close();
audit_log($conn, $val === null ? 'reopened' : 'closed', $type, $row['n'] . ($val === null ? '' : ': ' . $val . ($until ? ' until ' . $until : '')));
echo json_encode(['success' => true, 'type' => $type, 'id' => $id, 'closed_note' => $val === null ? null : $val . ($until ? ' (until ' . date('D M j, g:i A', strtotime($until)) . ')' : ''), 'closed_until' => $until]);
