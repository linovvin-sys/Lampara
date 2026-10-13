<?php

// Who changed what, and when, for rooms and buildings (and a way to undo a change).
//
// Everything here is optional on purpose: if the change_log table or the newer columns (rooms.subtitle,
// buildings.entrance_floor) have not been added yet (php Backend/scripts/migrate-round3.php), these helpers quietly do nothing
// and the rest of the app works exactly as before.

function column_exists(mysqli $conn, string $table, string $column): bool
{
    static $cache = [];
    $key = $table . '.' . $column;
    if (!isset($cache[$key])) {
        if (!preg_match('/^[a-z_]+$/', $table) || !preg_match('/^[a-z_]+$/', $column)) return $cache[$key] = false;
        $r = $conn->query("SHOW COLUMNS FROM `$table` LIKE '$column'");
        $cache[$key] = (bool) ($r && $r->num_rows > 0);
    }
    return $cache[$key];
}

function change_log_ready(mysqli $conn): bool
{
    static $ready = null;
    if ($ready === null) {
        $r = $conn->query("SHOW TABLES LIKE 'change_log'");
        $ready = (bool) ($r && $r->num_rows > 0);
    }
    return $ready;
}

// The whole row as an array, or null.
function change_row(mysqli $conn, string $table, int $id): ?array
{
    if (!in_array($table, ['rooms', 'buildings'], true) || $id <= 0) return null;
    $stmt = $conn->prepare("SELECT * FROM `$table` WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    return $row ?: null;
}

// Short name for the list: "1101 - Admission" or the building's name.
function change_label(string $entity, ?array $row): string
{
    if (!$row) return $entity;
    if ($entity === 'room') return trim(($row['room_number'] ? $row['room_number'] . ' - ' : '') . ($row['room_name'] ?? ''));
    return (string) ($row['name'] ?? $entity);
}

function log_change(mysqli $conn, string $entity, int $entityId, string $action, ?array $before, ?array $after): void
{
    if (!change_log_ready($conn)) return;
    require_once __DIR__ . '/session_boot.php';
    lampara_session_start();
    $adminId = isset($_SESSION['admin_id']) ? (int) $_SESSION['admin_id'] : null;
    $adminName = (string) ($_SESSION['admin_username'] ?? 'Admin');
    $label = change_label($entity, $after ?: $before);
    $b = $before === null ? null : json_encode($before);
    $a = $after === null ? null : json_encode($after);
    try {
        $stmt = $conn->prepare("INSERT INTO change_log (entity, entity_id, action, label, admin_id, admin_name, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->bind_param('sississs', $entity, $entityId, $action, $label, $adminId, $adminName, $b, $a);
        $stmt->execute();
        $stmt->close();
    } catch (Throwable $e) { /* logging must never stop a save */ }
}
