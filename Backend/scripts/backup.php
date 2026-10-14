<?php

// A full backup, from the server's command line:   php Backend/scripts/backup.php
// Writes backups/lampara-YYYYMMDD-HHMM/ with
//   database.sql   every table (structure and rows), restorable with:  mysql -u USER -p lampara_db < database.sql
//   files.zip      the uploaded photos, floor plans and campus maps (the database only stores their file names)
// and keeps the 14 newest backups. Run it daily (cron on Linux, Task Scheduler on Windows) and copy the folder somewhere ELSE
// (another disk, cloud storage): a backup on the same machine does not survive that machine. The backups/ folder is blocked from the
// web by .htaccess and is not in git. The database holds staff password hashes, so treat the files as private.

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Run this from the command line.\n"); }

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../audit_log.php';

$conn = (new Database())->connect();
$root = dirname(__DIR__, 2);
$dir = $root . '/backups/lampara-' . date('Ymd-Hi');
if (!is_dir($dir) && !mkdir($dir, 0700, true)) exit("Could not create $dir\n");

// ---- database
$out = fopen($dir . '/database.sql', 'w');
fwrite($out, "-- Lampara backup " . date('c') . "\nSET FOREIGN_KEY_CHECKS=0;\nSET NAMES utf8mb4;\n\n");
$tables = [];
$r = $conn->query('SHOW TABLES');
while ($row = $r->fetch_row()) $tables[] = $row[0];
foreach ($tables as $t) {
    $create = $conn->query("SHOW CREATE TABLE `$t`")->fetch_row()[1];
    fwrite($out, "DROP TABLE IF EXISTS `$t`;\n$create;\n");
    $res = $conn->query("SELECT * FROM `$t`", MYSQLI_USE_RESULT);
    $n = 0;
    while ($x = $res->fetch_assoc()) {
        $vals = array_map(fn($v) => $v === null ? 'NULL' : "'" . $conn->real_escape_string((string) $v) . "'", $x);
        fwrite($out, "INSERT INTO `$t` VALUES (" . implode(',', $vals) . ");\n");
        $n++;
    }
    $res->free();
    fwrite($out, "-- $t: $n rows\n\n");
}
fwrite($out, "SET FOREIGN_KEY_CHECKS=1;\n");
fclose($out);

// ---- uploaded files
$files = 0;
if (class_exists('ZipArchive')) {
    $zip = new ZipArchive();
    if ($zip->open($dir . '/files.zip', ZipArchive::CREATE) === true) {
        foreach (['photos', 'floorplans', 'maps'] as $sub) {
            $base = $root . '/Frontend/assets/' . $sub;
            if (!is_dir($base)) continue;
            foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator($base, FilesystemIterator::SKIP_DOTS)) as $f) {
                if ($f->isFile() && !in_array($f->getFilename(), ['.htaccess', '.gitkeep'], true)) { $zip->addFile($f->getPathname(), 'assets/' . $sub . '/' . substr($f->getPathname(), strlen($base) + 1)); $files++; }
            }
        }
        $zip->close();
    }
} else {
    fwrite(STDERR, "The PHP zip extension is not available, so the uploaded files were NOT backed up. Copy Frontend/assets/{photos,floorplans,maps} by hand.\n");
}

// ---- keep the newest 14
$all = glob($root . '/backups/lampara-*', GLOB_ONLYDIR);
sort($all);
foreach (array_slice($all, 0, max(0, count($all) - 14)) as $old) {
    foreach (glob($old . '/*') as $f) @unlink($f);
    @rmdir($old);
}

audit_log($conn, 'backup', basename($dir), count($tables) . ' tables, ' . $files . ' files', 'cli');
echo "Backup written to $dir (" . count($tables) . " tables, $files uploaded files).\nNow copy it somewhere else.\n";
