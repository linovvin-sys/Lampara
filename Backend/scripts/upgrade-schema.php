<?php

// Brings the database that Backend/db.php points at up to date with this version of the code. Most of these changes also happen by
// themselves the first time the app needs them; run this to do them all at once, for example after pointing db.php at a new database.
//   php Backend/scripts/upgrade-schema.php            shows what would change and changes nothing
//   php Backend/scripts/upgrade-schema.php --apply    makes the changes
// Only adds or converts; it never deletes rows. Safe to run more than once.

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Run this from the command line.\n"); }

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../room_number.php';
require_once __DIR__ . '/../admin_roles.php';
$apply = in_array('--apply', $argv, true);
$conn = (new Database())->connect();
echo 'Database: ' . $conn->query('SELECT DATABASE()')->fetch_row()[0] . ($apply ? "  (applying)\n" : "  (dry run: nothing is changed)\n") . "\n";

function has_col($c, $t, $col) { $r = $c->query("SHOW COLUMNS FROM `$t` LIKE '$col'"); return $r && $r->num_rows > 0; }
function has_table($c, $t) { $r = $c->query("SHOW TABLES LIKE '$t'"); return $r && $r->num_rows > 0; }
function has_index($c, $t, $k) { $r = $c->query("SHOW INDEX FROM `$t` WHERE Key_name = '$k'"); return $r && $r->num_rows > 0; }
$todo = 0;
function step($apply, $label, $needed, callable $do) { global $todo; if (!$needed) { echo "  ok       $label\n"; return; } $todo++; if ($apply) { try { $do(); echo "  CHANGED  $label\n"; } catch (Throwable $e) { echo "  FAILED   $label: " . $e->getMessage() . "\n"; } } else echo "  needed   $label\n"; }

$col = fn($t, $c, $def) => fn() => $conn->query("ALTER TABLE `$t` ADD COLUMN $c $def");

step($apply, 'rooms.subtitle', !has_col($conn, 'rooms', 'subtitle'), $col('rooms', 'subtitle', 'VARCHAR(120) NULL AFTER room_name'));
step($apply, 'buildings.entrance_floor', !has_col($conn, 'buildings', 'entrance_floor'), $col('buildings', 'entrance_floor', 'VARCHAR(50) NULL AFTER floor_count'));
step($apply, 'rooms: one number per building (not per school)', !has_index($conn, 'rooms', 'room_building_number') || has_index($conn, 'rooms', 'room_number_unique'), fn() => ensure_room_number_key($conn));
$bn = $conn->query("SHOW COLUMNS FROM buildings LIKE 'building_number'")->fetch_assoc();
step($apply, 'buildings.building_number accepts letters (2-A)', $bn && stripos($bn['Type'], 'int') !== false, fn() => ensure_building_number_text($conn));
foreach (['role' => "VARCHAR(10) NOT NULL DEFAULT 'admin'", 'disabled' => 'TINYINT(1) NOT NULL DEFAULT 0', 'totp_secret' => 'VARCHAR(64) NULL'] as $c => $d) step($apply, "admins.$c", !has_col($conn, 'admins', $c), $col('admins', $c, $d));
step($apply, 'hazard_reports.device', has_table($conn, 'hazard_reports') && !has_col($conn, 'hazard_reports', 'device'), $col('hazard_reports', 'device', 'VARCHAR(16) NULL'));

$tables = [
    'hazard_flags' => 'CREATE TABLE hazard_flags (report_id INT NOT NULL, device VARCHAR(16) NOT NULL, PRIMARY KEY (report_id, device)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'hazard_strikes' => 'CREATE TABLE hazard_strikes (id INT AUTO_INCREMENT PRIMARY KEY, device VARCHAR(16) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_device (device, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'audit_log' => 'CREATE TABLE audit_log (id INT AUTO_INCREMENT PRIMARY KEY, at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, actor VARCHAR(60) NULL, role VARCHAR(10) NULL, action VARCHAR(40) NOT NULL, target VARCHAR(120) NULL, detail VARCHAR(255) NULL, ip VARCHAR(45) NULL, KEY idx_at (at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4',
    'change_log' => "CREATE TABLE change_log (id INT AUTO_INCREMENT PRIMARY KEY, entity ENUM('room','building') NOT NULL, entity_id INT NOT NULL, action ENUM('create','update','delete') NOT NULL, label VARCHAR(200) NOT NULL, admin_id INT NULL, admin_name VARCHAR(100) NOT NULL DEFAULT 'Admin', before_json MEDIUMTEXT NULL, after_json MEDIUMTEXT NULL, undone_at TIMESTAMP NULL DEFAULT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, KEY entity_idx (entity, entity_id, id), KEY created_idx (created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
];
foreach ($tables as $t => $sql) step($apply, "table $t", !has_table($conn, $t), fn() => $conn->query($sql));

echo "\n" . ($todo === 0 ? "Everything is already up to date.\n" : ($apply ? "Done.\n" : "$todo change(s) needed. Run again with --apply.\n"));
echo "Data you may still want to add: php Backend/scripts/seed-enrollment.php  (the Security / Guard Booth room for Enrollment step 1)\n";
