<?php

// Closing a building or a room for maintenance (or any other reason). One optional column on each table holds the reason; empty
// means open. The columns are added the first time a closure is saved, so older databases keep working.

function ensure_lock_columns(mysqli $conn): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    $ok = true;
    foreach (['buildings', 'rooms'] as $t) {
        $has = fn() => (bool) ($r = $conn->query("SHOW COLUMNS FROM $t LIKE 'closed_note'")) && $r->num_rows > 0;   // not column_exists(): it caches "missing"
        if (!$has()) {
            try { $conn->query("ALTER TABLE $t ADD COLUMN closed_note VARCHAR(160) NULL DEFAULT NULL"); } catch (Throwable $e) { $ok = false; }
        }
        if (!$has()) $ok = false;
    }
    return $ok;
}
