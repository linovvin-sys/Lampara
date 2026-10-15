<?php

// After importing a shared database dump, this writes the photos that travelled inside it (table shared_photo_files) back into
// Frontend/assets/photos/, where the app expects them, then removes the table.
//   cd path/to/lampara
//   php Backend/scripts/restore-photos.php

if (php_sapi_name() !== 'cli') die("Run this from the command line: php Backend/scripts/restore-photos.php\n");

require_once __DIR__ . '/../config.php';
$conn = (new Database())->connect();
$t = $conn->query("SHOW TABLES LIKE 'shared_photo_files'");
if (!$t || !$t->num_rows) die("No shared_photo_files table here. Import the shared dump first.\n");

$root = realpath(__DIR__ . '/../../Frontend/assets/photos');
if ($root === false) die("Frontend/assets/photos does not exist.\n");

$n = 0;
$r = $conn->query('SELECT path, data FROM shared_photo_files');
while ($row = $r->fetch_assoc()) {
    $rel = str_replace('\\', '/', $row['path']);
    if ($rel === '' || strpos($rel, '..') !== false || $rel[0] === '/') { echo "Skipped an unsafe path: $rel\n"; continue; }
    $dest = $root . '/' . $rel;
    if (!is_dir(dirname($dest))) mkdir(dirname($dest), 0775, true);
    file_put_contents($dest, $row['data']);
    $n++;
}
$conn->query('DROP TABLE shared_photo_files');
echo "Restored $n photos into Frontend/assets/photos and removed the helper table.\n";
