<?php

// Closing a building or a room for maintenance (or any other reason). One optional column on each table holds the reason; empty
// means open. The columns are added the first time a closure is saved, so older databases keep working.

function ensure_lock_columns(mysqli $conn): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    $ok = true;
    foreach (['buildings' => 'closed_note VARCHAR(160) NULL DEFAULT NULL', 'rooms' => 'closed_note VARCHAR(160) NULL DEFAULT NULL'] as $t => $def) {
        foreach (['closed_note' => $def, 'closed_until' => 'closed_until DATETIME NULL DEFAULT NULL'] as $col => $ddl) {
            $has = fn() => (bool) ($r = $conn->query("SHOW COLUMNS FROM $t LIKE '$col'")) && $r->num_rows > 0;   // not column_exists(): it caches "missing"
            if (!$has()) {
                try { $conn->query("ALTER TABLE $t ADD COLUMN $ddl"); } catch (Throwable $e) { $ok = false; }
            }
            if (!$has()) $ok = false;
        }
    }
    return $ok;
}

// SELECT pieces for a table's closure. The note comes back with its reopening time ("Maintenance (until Fri Oct 23, 3:00 PM)"),
// and a closure whose time has passed reads as open, so nobody has to remember to reopen it. $as_until is the raw time for the admin form.
function lock_select(mysqli $conn, string $table, string $alias, string $as, string $as_until): string
{
    if (!column_exists($conn, $table, 'closed_note')) return "NULL AS $as, NULL AS $as_until";
    if (!column_exists($conn, $table, 'closed_until')) return "$alias.closed_note AS $as, NULL AS $as_until";
    $live = "($alias.closed_note IS NOT NULL AND ($alias.closed_until IS NULL OR $alias.closed_until > NOW()))";
    return "CASE WHEN $live THEN CONCAT($alias.closed_note, IF($alias.closed_until IS NULL, '', CONCAT(' (until ', DATE_FORMAT($alias.closed_until, '%a %b %e, %l:%i %p'), ')'))) END AS $as, "
         . "CASE WHEN $live THEN $alias.closed_until END AS $as_until";
}
