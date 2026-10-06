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

// Is this number already used by another room (ignoring case, spaces and dashes)?
function room_number_taken($conn, $roomNumber, $exceptId = 0)
{
    if ($roomNumber === null) return false;
    $key = compact_room_number($roomNumber);
    $stmt = $conn->prepare("SELECT 1 FROM rooms r WHERE " . ROOM_NUMBER_COMPACT_SQL . " = ? AND r.id <> ? LIMIT 1");
    $stmt->bind_param('si', $key, $exceptId);
    $stmt->execute();
    $taken = (bool) $stmt->get_result()->fetch_row();
    $stmt->close();
    return $taken;
}
