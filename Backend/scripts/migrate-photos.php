<?php

// Adds the optional photo column to buildings and rooms. Safe to run more than once.
//   php Backend/scripts/migrate-photos.php

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit("Run this from the command line.\n");
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../photo_support.php';

$db = new Database();
$conn = $db->connect();

foreach (['buildings' => 'directory', 'rooms' => 'notes'] as $table => $after) {
    if (photo_column_exists($conn, $table)) {
        echo "$table: photo_path already exists.\n";
        continue;
    }
    if ($conn->query("ALTER TABLE `$table` ADD COLUMN photo_path VARCHAR(255) NULL AFTER `$after`")) {
        echo "$table: added photo_path.\n";
    } else {
        fwrite(STDERR, "$table: could not add photo_path: " . $conn->error . "\n");
        exit(1);
    }
}
foreach (['buildings', 'rooms'] as $table) {
    $dir = __DIR__ . '/../../Frontend/assets/photos/' . $table;
    if (!is_dir($dir)) mkdir($dir, 0755, true);
}
echo "Done.\n";
