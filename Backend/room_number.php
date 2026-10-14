<?php

// Room numbers may carry a section, e.g. "1101 - A". People type that many ways
// ("1101-a", "1101 A", "1101A", "1101 - A"), so every write goes through
// normalize_room_number() and is stored in ONE canonical form, and every lookup
// compares with compact_room_number(), which ignores case, spaces and dashes.
// Keep this in step with Frontend/Js/Include/room-number.js (same rules, same output).

// Canonical form: upper case, single spaces, " - " around any dash, and a short
// trailing section glued to the digits ("1101A" / "1101 A") gets the dash.
// Returns null for an empty value.
function normalize_room_number($value)
{
    $s = trim((string) $value);
    if ($s === '') return null;
    $s = mb_strtoupper(preg_replace('/\s+/u', ' ', $s), 'UTF-8');
    $s = preg_replace('/\s*[-–—]\s*/u', ' - ', $s);
    $s = trim($s, " -–—");
    if ($s === '') return null;
    if (preg_match('/^(\d+) ?([A-Z][A-Z0-9]{0,3})$/', $s, $m)) {
        $s = $m[1] . ' - ' . $m[2];
    }
    return $s;
}

// Comparison key: "1101 - A", "1101-a" and "1101A" all become "1101A".
function compact_room_number($value)
{
    return preg_replace('/[\s\-–—]+/u', '', mb_strtoupper(trim((string) $value), 'UTF-8'));
}

// SQL that gives the same key for a column, so lookups can compare in the database.
const ROOM_NUMBER_COMPACT_SQL = "REPLACE(REPLACE(UPPER(r.room_number), ' ', ''), '-', '')";

// Is this number already used by another room IN THE SAME BUILDING (ignoring case, spaces and dashes)?
// Two buildings may both have a 1101: a room is its building plus its number. For an existing room ($exceptId) the building is
// looked up; for a new one pass $buildingId.
function room_number_taken($conn, $roomNumber, $exceptId = 0, $buildingId = null)
{
    if ($roomNumber === null) return false;
    ensure_room_number_key($conn);
    if ($buildingId === null && $exceptId > 0) {
        $q = $conn->prepare('SELECT building_id FROM rooms WHERE id = ?');
        $q->bind_param('i', $exceptId);
        $q->execute();
        $row = $q->get_result()->fetch_row();
        $q->close();
        $buildingId = $row ? (int) $row[0] : null;
    }
    $key = compact_room_number($roomNumber);
    $stmt = $conn->prepare("SELECT 1 FROM rooms r WHERE " . ROOM_NUMBER_COMPACT_SQL . " = ? AND r.id <> ? AND r.building_id <=> ? LIMIT 1");
    $stmt->bind_param('sii', $key, $exceptId, $buildingId);
    $stmt->execute();
    $taken = (bool) $stmt->get_result()->fetch_row();
    $stmt->close();
    return $taken;
}

// The database used to allow each room number once across the whole school. It is now once per building: swaps the old unique key for
// (building_id, room_number) the first time a write needs it (a no-op afterwards, and safe to run on a database that is already updated).
function ensure_room_number_key($conn)
{
    static $done = false;
    if ($done) return;
    $done = true;
    $old = false; $new = false;
    $r = $conn->query('SHOW INDEX FROM rooms');
    while ($i = $r->fetch_assoc()) {
        if ($i['Key_name'] === 'room_number_unique') $old = true;
        if ($i['Key_name'] === 'room_building_number') $new = true;
    }
    if ($new && !$old) return;
    $parts = [];
    if ($old) $parts[] = 'DROP INDEX room_number_unique';
    if (!$new) $parts[] = 'ADD UNIQUE KEY room_building_number (building_id, room_number)';
    try { $conn->query('ALTER TABLE rooms ' . implode(', ', $parts)); } catch (Throwable $e) { /* writes still work; the per-building check above is the guard */ }
}
