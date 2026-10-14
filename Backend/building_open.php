<?php

// "Open type" buildings: no hallways, no entry point and no floor plan to draw (a court, a field, a pavilion).
// The flag is one optional column, added the first time it is needed so older databases keep working.

function ensure_open_column(mysqli $conn): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    $has = fn() => (bool) ($r = $conn->query("SHOW COLUMNS FROM buildings LIKE 'is_open'")) && $r->num_rows > 0; // not column_exists(): it caches "missing"
    if (!$has()) {
        try { $conn->query('ALTER TABLE buildings ADD COLUMN is_open TINYINT(1) NOT NULL DEFAULT 0'); } catch (Throwable $e) { return $ok = false; }
    }
    return $ok = $has();
}

// Save the flag from an API / offline-sync payload that carries it. Does nothing when the payload has no is_open.
function save_building_open(mysqli $conn, int $id, $input): void
{
    if (!is_array($input) || !array_key_exists('is_open', $input) || !ensure_open_column($conn)) return;
    $v = filter_var($input['is_open'], FILTER_VALIDATE_BOOLEAN) ? 1 : 0;
    $stmt = $conn->prepare('UPDATE buildings SET is_open = ? WHERE id = ?');
    $stmt->bind_param('ii', $v, $id);
    $stmt->execute();
    $stmt->close();
}
