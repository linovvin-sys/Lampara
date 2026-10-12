<?php

// Adds the optional columns and the change history table used by the newer admin features. Safe to run more than once.
//   php Backend/scripts/migrate-round3.php
//   rooms.subtitle           a short line under a room's name (department, equipment) so rooms with the same name can be told apart
//   buildings.entrance_floor which floor the main entrance is on (the indoor "I just arrived at the entrance" list uses it)
//   change_log               who changed which room or building, and what it looked like before (for the Undo list)

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line.\n");
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../change_log.php';

$db = new Database();
$conn = $db->connect();

$cols = [
    ['rooms', 'subtitle', "ALTER TABLE rooms ADD COLUMN subtitle VARCHAR(120) NULL AFTER room_name"],
    ['buildings', 'entrance_floor', "ALTER TABLE buildings ADD COLUMN entrance_floor VARCHAR(50) NULL AFTER floor_count"],
];
foreach ($cols as [$table, $col, $sql]) {
    if (column_exists($conn, $table, $col)) { echo "$table.$col already exists.\n"; continue; }
    if ($conn->query($sql)) echo "$table: added $col.\n";
    else { fwrite(STDERR, "$table.$col: " . $conn->error . "\n"); exit(1); }
}

$conn->query("CREATE TABLE IF NOT EXISTS change_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    entity ENUM('room','building') NOT NULL,
    entity_id INT NOT NULL,
    action ENUM('create','update','delete') NOT NULL,
    label VARCHAR(200) NOT NULL,
    admin_id INT NULL,
    admin_name VARCHAR(100) NOT NULL DEFAULT 'Admin',
    before_json MEDIUMTEXT NULL,
    after_json MEDIUMTEXT NULL,
    undone_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY entity_idx (entity, entity_id, id),
    KEY created_idx (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
echo $conn->error ? "change_log: " . $conn->error . "\n" : "change_log ready.\n";
echo "Done.\n";
