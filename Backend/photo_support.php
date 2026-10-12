<?php

// Small helper for the optional building / room photos (buildings.photo_path, rooms.photo_path).
// Saving, validating and deleting the files lives in photo_upload.php; this only answers "has the column been added yet?"
// so the admin photo endpoint and the migration script can say so instead of failing with a SQL error.

function photo_column_exists(mysqli $conn, string $table): bool
{
    if (!in_array($table, ['buildings', 'rooms'], true)) return false;
    $r = $conn->query("SHOW COLUMNS FROM `$table` LIKE 'photo_path'");
    return $r && $r->num_rows > 0;
}
