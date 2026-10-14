<?php

// A "data pack": one ZIP that holds a whole school's directory, so it can be moved to another install or restored.
//   data.json    every table below, using positions in its own lists as keys (never database ids), plus a version
//   images/...   the floor plan pictures
// What goes in: institution settings, buildings, campus walkway points and links, floor plans with their path points and links, rooms, doors,
// campus-map pins, building-outline links, and the saved enrollment steps.
// What never goes in: staff accounts, password hashes, two-step secrets, the audit and change logs, visitor reports, building and room photos.
//
//   data_pack_collect($conn)            -> ['data' => array, 'images' => [zip name => file on disk]]
//   data_pack_zip($collected, $path)    writes the zip (or returns false)
//   data_pack_read($path)               -> ['data' => array, 'images' => [zip name => bytes]] or a string with the reason it cannot be read
//   data_pack_check($pack)              -> list of problems (empty = importable)
//   data_pack_counts($data)             -> counts for the preview
//   data_pack_import($conn, $pack)      replaces the school's content inside one transaction; returns counts; throws on any error

const DATA_PACK_VERSION = 1;
const DATA_PACK_MAX_BYTES = 25 * 1024 * 1024;

function dp_has_table(mysqli $conn, string $t): bool
{
    $r = $conn->query("SHOW TABLES LIKE '" . $conn->real_escape_string($t) . "'");
    return (bool) ($r && $r->num_rows);
}

function dp_has_column(mysqli $conn, string $t, string $c): bool
{
    $r = $conn->query("SHOW COLUMNS FROM `$t` LIKE '" . $conn->real_escape_string($c) . "'");
    return (bool) ($r && $r->num_rows);
}

function dp_rows(mysqli $conn, string $sql): array
{
    $out = [];
    $r = $conn->query($sql);
    while ($r && ($row = $r->fetch_assoc())) $out[] = $row;
    return $out;
}

function dp_num($v) { return $v === null ? null : $v + 0; }

// ---------------------------------------------------------------- export

function data_pack_collect(mysqli $conn): array
{
    $frontend = dirname(__DIR__) . '/Frontend/';
    $isOpen = dp_has_column($conn, 'buildings', 'is_open') ? ', is_open' : ', 0 AS is_open';
    $efl = dp_has_column($conn, 'buildings', 'entrance_floor') ? ', entrance_floor' : ', NULL AS entrance_floor';

    $cn = dp_rows($conn, 'SELECT id, lat, lng, node_type, name FROM campus_nodes ORDER BY id');
    $cnIdx = []; foreach ($cn as $i => $r) $cnIdx[(int) $r['id']] = $i;
    $campusNodes = array_map(fn($r) => ['lat' => (float) $r['lat'], 'lng' => (float) $r['lng'], 'node_type' => $r['node_type'], 'name' => $r['name']], $cn);
    $campusEdges = [];
    foreach (dp_rows($conn, 'SELECT node_a_id, node_b_id FROM campus_edges ORDER BY id') as $e) {
        if (isset($cnIdx[(int) $e['node_a_id']], $cnIdx[(int) $e['node_b_id']])) $campusEdges[] = [$cnIdx[(int) $e['node_a_id']], $cnIdx[(int) $e['node_b_id']]];
    }

    $b = dp_rows($conn, "SELECT id, name, lat, lng, floor_count, building_number, directory, entrance_node_id $efl $isOpen FROM buildings ORDER BY id");
    $bIdx = []; foreach ($b as $i => $r) $bIdx[(int) $r['id']] = $i;
    $buildings = array_map(fn($r) => [
        'name' => $r['name'], 'lat' => (float) $r['lat'], 'lng' => (float) $r['lng'], 'floor_count' => (int) $r['floor_count'],
        'building_number' => $r['building_number'], 'directory' => (string) $r['directory'], 'entrance_floor' => $r['entrance_floor'],
        'is_open' => (bool) $r['is_open'],
        'entrance_node' => ($r['entrance_node_id'] !== null && isset($cnIdx[(int) $r['entrance_node_id']])) ? $cnIdx[(int) $r['entrance_node_id']] : null,
    ], $b);

    $fp = dp_rows($conn, 'SELECT id, building_id, floor, image_path, north_offset, meters_per_unit_x, meters_per_unit_y FROM floor_plans ORDER BY id');
    $fpIdx = []; $plans = []; $images = [];
    foreach ($fp as $i => $r) {
        if (!isset($bIdx[(int) $r['building_id']])) continue;
        $fpIdx[(int) $r['id']] = count($plans);
        $file = $frontend . $r['image_path'];
        $zipName = null;
        if (is_file($file) && strpos(realpath($file), realpath($frontend . 'assets')) === 0) {
            $zipName = 'images/' . count($plans) . '-' . preg_replace('/[^A-Za-z0-9._-]/', '_', basename($r['image_path']));
            $images[$zipName] = $file;
        }
        $plans[] = ['building' => $bIdx[(int) $r['building_id']], 'floor' => $r['floor'], 'image' => $zipName,
            'north_offset' => dp_num($r['north_offset']), 'meters_per_unit_x' => dp_num($r['meters_per_unit_x']), 'meters_per_unit_y' => dp_num($r['meters_per_unit_y'])];
    }

    $planNodes = []; $pnIdx = [];
    foreach (dp_rows($conn, 'SELECT id, floor_plan_id, x, y, name FROM floor_plan_nodes ORDER BY id') as $r) {
        if (!isset($fpIdx[(int) $r['floor_plan_id']])) continue;
        $pnIdx[(int) $r['id']] = count($planNodes);
        $planNodes[] = ['plan' => $fpIdx[(int) $r['floor_plan_id']], 'x' => (float) $r['x'], 'y' => (float) $r['y'], 'name' => $r['name']];
    }
    $planEdges = [];
    foreach (dp_rows($conn, 'SELECT node_a_id, node_b_id FROM floor_plan_edges ORDER BY id') as $e) {
        if (isset($pnIdx[(int) $e['node_a_id']], $pnIdx[(int) $e['node_b_id']])) $planEdges[] = [$pnIdx[(int) $e['node_a_id']], $pnIdx[(int) $e['node_b_id']]];
    }

    $rooms = [];
    foreach (dp_rows($conn, 'SELECT building_id, room_number, room_name, subtitle, floor, room_type, category, hours, notes, map_x, map_y, path_node_id FROM rooms ORDER BY id') as $r) {
        if (!isset($bIdx[(int) $r['building_id']])) continue;
        $rooms[] = ['building' => $bIdx[(int) $r['building_id']], 'room_number' => $r['room_number'], 'room_name' => $r['room_name'], 'subtitle' => $r['subtitle'],
            'floor' => $r['floor'], 'room_type' => $r['room_type'], 'category' => $r['category'], 'hours' => $r['hours'], 'notes' => $r['notes'],
            'map_x' => dp_num($r['map_x']), 'map_y' => dp_num($r['map_y']),
            'path_node' => ($r['path_node_id'] !== null && isset($pnIdx[(int) $r['path_node_id']])) ? $pnIdx[(int) $r['path_node_id']] : null];
    }

    $doors = [];
    if (dp_has_table($conn, 'building_doors')) {
        foreach (dp_rows($conn, 'SELECT building_id, kind, node_id FROM building_doors') as $d) {
            if (isset($bIdx[(int) $d['building_id']], $pnIdx[(int) $d['node_id']])) $doors[] = ['building' => $bIdx[(int) $d['building_id']], 'kind' => $d['kind'], 'node' => $pnIdx[(int) $d['node_id']]];
        }
    }

    $markers = [];
    if (dp_has_table($conn, 'static_map_markers')) {
        foreach (dp_rows($conn, 'SELECT building_id, kind, marker_type, label, x, y FROM static_map_markers ORDER BY id') as $m) {
            $markers[] = ['building' => ($m['building_id'] !== null && isset($bIdx[(int) $m['building_id']])) ? $bIdx[(int) $m['building_id']] : null,
                'kind' => $m['kind'], 'marker_type' => $m['marker_type'], 'label' => $m['label'], 'x' => (float) $m['x'], 'y' => (float) $m['y']];
        }
    }

    $links = [];
    if (dp_has_table($conn, 'campus_footprints')) {
        foreach (dp_rows($conn, 'SELECT id, building_id FROM campus_footprints WHERE building_id IS NOT NULL') as $f) {
            if (isset($bIdx[(int) $f['building_id']])) $links[] = ['footprint_id' => (int) $f['id'], 'building' => $bIdx[(int) $f['building_id']]];
        }
    }

    $steps = null;
    if (dp_has_table($conn, 'enrollment_steps')) {
        $row = $conn->query('SELECT stops FROM enrollment_steps WHERE id = 1')->fetch_row();
        $steps = $row ? json_decode((string) $row[0], true) : null;
    }
    $institution = null;
    if (dp_has_table($conn, 'institution')) {
        require_once __DIR__ . '/institution.php';
        institution_ensure_proximity($conn);
        $i = dp_rows($conn, 'SELECT name, short_name, tagline, theme, persona, contact_email, contact_phone, center_lat, center_lng, bounds, features, proximity FROM institution WHERE id = 1');
        if ($i) {
            $i = $i[0];
            $institution = ['name' => $i['name'], 'short_name' => $i['short_name'], 'tagline' => $i['tagline'], 'theme' => $i['theme'], 'persona' => $i['persona'],
                'contact_email' => $i['contact_email'], 'contact_phone' => $i['contact_phone'], 'center_lat' => (float) $i['center_lat'], 'center_lng' => (float) $i['center_lng'],
                'bounds' => json_decode((string) $i['bounds'], true), 'features' => json_decode((string) $i['features'], true), 'proximity' => json_decode((string) ($i['proximity'] ?? ''), true) ?: null];
        }
    }

    return ['data' => [
        'app' => 'lampara', 'version' => DATA_PACK_VERSION, 'exported_at' => date('c'), 'institution' => $institution,
        'campus_nodes' => $campusNodes, 'campus_edges' => $campusEdges, 'buildings' => $buildings, 'floor_plans' => $plans,
        'plan_nodes' => $planNodes, 'plan_edges' => $planEdges, 'rooms' => $rooms, 'doors' => $doors,
        'map_markers' => $markers, 'footprint_links' => $links, 'enrollment_steps' => $steps,
    ], 'images' => $images];
}

function data_pack_zip(array $collected, string $path)
{
    if (!class_exists('ZipArchive')) return false;
    $zip = new ZipArchive();
    if ($zip->open($path, ZipArchive::CREATE | ZipArchive::OVERWRITE) !== true) return false;
    $zip->addFromString('data.json', json_encode($collected['data'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
    foreach ($collected['images'] as $name => $file) $zip->addFile($file, $name);
    $zip->close();
    return true;
}

// ---------------------------------------------------------------- reading and checking

// Opens an uploaded pack. Returns ['data' => ..., 'images' => ...] or a string saying why it cannot be used.
function data_pack_read(string $path)
{
    if (!class_exists('ZipArchive')) return 'This server cannot open zip files (the PHP zip extension is off).';
    if (filesize($path) > DATA_PACK_MAX_BYTES) return 'That file is larger than 25 MB.';
    $zip = new ZipArchive();
    if ($zip->open($path) !== true) return 'That is not a readable zip file.';
    $json = $zip->getFromName('data.json');
    if ($json === false) { $zip->close(); return 'This zip has no data.json, so it is not a Lampara data pack.'; }
    if (strlen($json) > 20 * 1024 * 1024) { $zip->close(); return 'data.json is too large.'; }
    $data = json_decode($json, true);
    if (!is_array($data) || ($data['app'] ?? '') !== 'lampara') { $zip->close(); return 'This is not a Lampara data pack.'; }
    if ((int) ($data['version'] ?? 0) !== DATA_PACK_VERSION) { $zip->close(); return 'This pack is version ' . (int) ($data['version'] ?? 0) . ', and this install reads version ' . DATA_PACK_VERSION . '.'; }
    $images = [];
    $total = 0;
    for ($i = 0; $i < $zip->numFiles; $i++) {
        $name = $zip->getNameIndex($i);
        if (strpos($name, 'images/') !== 0 || substr($name, -1) === '/' || strpos($name, '..') !== false) continue;
        $stat = $zip->statIndex($i);
        $total += (int) $stat['size'];
        if ($stat['size'] > 8 * 1024 * 1024 || $total > 60 * 1024 * 1024) { $zip->close(); return 'The pictures in this pack are too large.'; }
        $images[$name] = $zip->getFromIndex($i);
    }
    $zip->close();
    return ['data' => $data, 'images' => $images];
}

function dp_image_type(string $bytes): ?string
{
    $info = @getimagesizefromstring($bytes);
    if ($info === false) return null;
    return [IMAGETYPE_JPEG => 'jpeg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'][$info[2]] ?? null;
}

function data_pack_check(array $pack): array
{
    $d = $pack['data']; $images = $pack['images'];
    $p = [];
    $lists = ['campus_nodes', 'campus_edges', 'buildings', 'floor_plans', 'plan_nodes', 'plan_edges', 'rooms', 'doors', 'map_markers', 'footprint_links'];
    foreach ($lists as $k) if (!isset($d[$k]) || !is_array($d[$k])) $p[] = "The pack has no \"$k\" list.";
    if ($p) return $p;
    $cap = ['buildings' => 500, 'rooms' => 20000, 'floor_plans' => 2000, 'plan_nodes' => 100000, 'campus_nodes' => 20000];
    foreach ($cap as $k => $max) if (count($d[$k]) > $max) $p[] = "Too many $k (at most $max).";
    $nB = count($d['buildings']); $nCN = count($d['campus_nodes']); $nFP = count($d['floor_plans']); $nPN = count($d['plan_nodes']);

    $num = fn($v) => is_int($v) || is_float($v);
    $str = fn($v, $max, $req = false) => ($v === null && !$req) || (is_string($v) && mb_strlen($v, 'UTF-8') <= $max && (!$req || trim($v) !== ''));
    foreach ($d['campus_nodes'] as $i => $n) {
        if (!is_array($n) || !$num($n['lat'] ?? null) || !$num($n['lng'] ?? null) || !in_array($n['node_type'] ?? '', ['junction', 'gate', 'entrance'], true) || !$str($n['name'] ?? null, 40)) $p[] = "Campus point " . ($i + 1) . " is not valid.";
    }
    foreach ($d['campus_edges'] as $i => $e) {
        if (!is_array($e) || count($e) !== 2 || !is_int($e[0]) || !is_int($e[1]) || $e[0] < 0 || $e[1] < 0 || $e[0] >= $nCN || $e[1] >= $nCN || $e[0] === $e[1]) $p[] = "Campus link " . ($i + 1) . " points at a point that does not exist.";
    }
    foreach ($d['buildings'] as $i => $b) {
        $ok = is_array($b) && $str($b['name'] ?? null, 150, true) && $num($b['lat'] ?? null) && $num($b['lng'] ?? null) && abs($b['lat']) <= 90 && abs($b['lng']) <= 180
            && is_int($b['floor_count'] ?? null) && $b['floor_count'] >= 1 && $b['floor_count'] <= 200 && $str($b['building_number'] ?? null, 10) && $str($b['directory'] ?? '', 20000)
            && $str($b['entrance_floor'] ?? null, 50) && (($b['entrance_node'] ?? null) === null || (is_int($b['entrance_node']) && $b['entrance_node'] >= 0 && $b['entrance_node'] < $nCN));
        if (!$ok) $p[] = "Building " . ($i + 1) . " (" . (is_array($b) ? (string) ($b['name'] ?? '?') : '?') . ") is not valid.";
    }
    foreach ($d['floor_plans'] as $i => $f) {
        $ok = is_array($f) && is_int($f['building'] ?? null) && $f['building'] >= 0 && $f['building'] < $nB && $str($f['floor'] ?? null, 50, true);
        if (!$ok) { $p[] = "Floor plan " . ($i + 1) . " is not valid."; continue; }
        $img = $f['image'] ?? null;
        if ($img === null || !isset($images[$img])) $p[] = "Floor plan " . ($i + 1) . " (" . $f['floor'] . ") has no picture in the pack.";
        elseif (dp_image_type($images[$img]) === null) $p[] = "The picture for floor plan " . ($i + 1) . " is not a JPEG, PNG or WebP image.";
    }
    foreach ($d['plan_nodes'] as $i => $n) {
        if (!is_array($n) || !is_int($n['plan'] ?? null) || $n['plan'] < 0 || $n['plan'] >= $nFP || !$num($n['x'] ?? null) || !$num($n['y'] ?? null) || !$str($n['name'] ?? null, 40)) { $p[] = "Path point " . ($i + 1) . " is not valid."; if (count($p) > 40) break; }
    }
    foreach ($d['plan_edges'] as $i => $e) {
        if (!is_array($e) || count($e) !== 2 || !is_int($e[0]) || !is_int($e[1]) || $e[0] < 0 || $e[1] < 0 || $e[0] >= $nPN || $e[1] >= $nPN || $e[0] === $e[1]) { $p[] = "Path link " . ($i + 1) . " points at a point that does not exist."; if (count($p) > 40) break; }
    }
    $planKeys = [];
    foreach ($d['floor_plans'] as $f) {
        if (!is_array($f) || !isset($f['building'], $f['floor'])) continue;
        $k = $f['building'] . '|' . mb_strtolower((string) $f['floor'], 'UTF-8');
        if (isset($planKeys[$k])) $p[] = 'Two floor plans are for the same floor (' . $f['floor'] . ') of one building.';
        $planKeys[$k] = true;
    }
    $seen = [];
    foreach ($d['rooms'] as $i => $r) {
        $ok = is_array($r) && is_int($r['building'] ?? null) && $r['building'] >= 0 && $r['building'] < $nB && $str($r['room_name'] ?? null, 150, true) && $str($r['floor'] ?? null, 50, true)
            && $str($r['room_number'] ?? null, 30) && $str($r['subtitle'] ?? null, 120) && $str($r['hours'] ?? null, 150) && $str($r['notes'] ?? null, 20000)
            && in_array($r['category'] ?? '', ['office', 'classroom', 'cr', 'canteen'], true) && in_array($r['room_type'] ?? '', ['office', 'classroom'], true)
            && (($r['path_node'] ?? null) === null || (is_int($r['path_node']) && $r['path_node'] >= 0 && $r['path_node'] < $nPN))
            && (($r['map_x'] ?? null) === null || $num($r['map_x'])) && (($r['map_y'] ?? null) === null || $num($r['map_y']));
        if (!$ok) { $p[] = "Room " . ($i + 1) . " (" . (is_array($r) ? (string) ($r['room_name'] ?? '?') : '?') . ") is not valid."; if (count($p) > 40) break; continue; }
        if ($r['room_number'] !== null && $r['room_number'] !== '') {
            $key = $r['building'] . '|' . strtoupper(preg_replace('/[\s-]+/', '', $r['room_number']));
            if (isset($seen[$key])) $p[] = "Room number " . $r['room_number'] . " is used twice in the same building.";
            $seen[$key] = true;
        }
    }
    foreach ($d['doors'] as $i => $x) {
        if (!is_array($x) || !is_int($x['building'] ?? null) || $x['building'] < 0 || $x['building'] >= $nB || !in_array($x['kind'] ?? '', ['entry', 'exit'], true) || !is_int($x['node'] ?? null) || $x['node'] < 0 || $x['node'] >= $nPN) $p[] = "Door " . ($i + 1) . " is not valid.";
    }
    foreach ($d['map_markers'] as $i => $m) {
        $ok = is_array($m) && in_array($m['kind'] ?? '', ['2d', '3d'], true) && in_array($m['marker_type'] ?? '', ['entrance', 'gate', 'landmark'], true) && $str($m['label'] ?? null, 100)
            && $num($m['x'] ?? null) && $num($m['y'] ?? null) && (($m['building'] ?? null) === null || (is_int($m['building']) && $m['building'] >= 0 && $m['building'] < $nB));
        if (!$ok) $p[] = "Map pin " . ($i + 1) . " is not valid.";
    }
    if (($d['enrollment_steps'] ?? null) !== null && !is_array($d['enrollment_steps'])) $p[] = 'The enrollment steps are not a list.';
    return array_slice($p, 0, 40);
}

function data_pack_counts(array $d): array
{
    return [
        'buildings' => count($d['buildings'] ?? []), 'rooms' => count($d['rooms'] ?? []), 'floor_plans' => count($d['floor_plans'] ?? []),
        'path_points' => count($d['plan_nodes'] ?? []), 'path_links' => count($d['plan_edges'] ?? []),
        'campus_points' => count($d['campus_nodes'] ?? []), 'doors' => count($d['doors'] ?? []), 'map_pins' => count($d['map_markers'] ?? []),
        'enrollment_stops' => is_array($d['enrollment_steps'] ?? null) ? count($d['enrollment_steps']) : 0,
        'has_settings' => !empty($d['institution']),
    ];
}

// What this install holds now (what a replace would remove).
function data_pack_current_counts(mysqli $conn): array
{
    $c = fn($t) => dp_has_table($conn, $t) ? (int) $conn->query("SELECT COUNT(*) FROM `$t`")->fetch_row()[0] : 0;
    return ['buildings' => $c('buildings'), 'rooms' => $c('rooms'), 'floor_plans' => $c('floor_plans'), 'path_points' => $c('floor_plan_nodes'),
        'campus_points' => $c('campus_nodes'), 'doors' => $c('building_doors'), 'map_pins' => $c('static_map_markers'), 'qr_anchors' => $c('qr_anchors'), 'reports_on_rooms' => $c('outdated_flags')];
}

// ---------------------------------------------------------------- import

function data_pack_import(mysqli $conn, array $pack): array
{
    $d = $pack['data']; $images = $pack['images'];
    $frontend = dirname(__DIR__) . '/Frontend/';
    $plansDir = $frontend . 'assets/floorplans/';
    if (!is_dir($plansDir) && !mkdir($plansDir, 0755, true)) throw new RuntimeException('Could not create the floor plan folder.');

    // Tables are made BEFORE the transaction: creating one would end it.
    if (!dp_has_table($conn, 'enrollment_steps')) $conn->query('CREATE TABLE IF NOT EXISTS enrollment_steps (id TINYINT PRIMARY KEY, stops MEDIUMTEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    require_once __DIR__ . '/institution.php';
    institution_get($conn);
    require_once __DIR__ . '/room_number.php';
    ensure_building_number_text($conn);
    $hasOpen = dp_has_column($conn, 'buildings', 'is_open');
    $hasEF = dp_has_column($conn, 'buildings', 'entrance_floor');
    $hasSub = dp_has_column($conn, 'rooms', 'subtitle');

    $oldImages = array_column(dp_rows($conn, 'SELECT image_path FROM floor_plans'), 'image_path');
    $written = [];
    $conn->begin_transaction();
    try {
        // ---- clear, children first
        foreach (['building_doors', 'floor_plan_edges', 'rooms', 'floor_plan_nodes', 'floor_plans', 'static_map_markers', 'buildings', 'campus_edges', 'campus_nodes'] as $t) {
            if (dp_has_table($conn, $t)) $conn->query("DELETE FROM `$t`");
        }
        // ---- campus walkway
        $cn = [];
        $st = $conn->prepare('INSERT INTO campus_nodes (lat, lng, node_type, name) VALUES (?, ?, ?, ?)');
        foreach ($d['campus_nodes'] as $i => $n) { $name = $n['name'] ?? null; $st->bind_param('ddss', $n['lat'], $n['lng'], $n['node_type'], $name); $st->execute(); $cn[$i] = $st->insert_id; }
        $st->close();
        $st = $conn->prepare('INSERT INTO campus_edges (node_a_id, node_b_id) VALUES (?, ?)');
        foreach ($d['campus_edges'] as $e) { $a = $cn[$e[0]]; $b = $cn[$e[1]]; $st->bind_param('ii', $a, $b); $st->execute(); }
        $st->close();
        // ---- buildings
        $bid = [];
        foreach ($d['buildings'] as $i => $b) {
            $ent = ($b['entrance_node'] ?? null) === null ? null : $cn[$b['entrance_node']];
            $num = $b['building_number'] === '' ? null : $b['building_number'];
            $st = $conn->prepare('INSERT INTO buildings (name, lat, lng, floor_count, building_number, directory, entrance_node_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
            $dir = (string) ($b['directory'] ?? '');
            $st->bind_param('sddissi', $b['name'], $b['lat'], $b['lng'], $b['floor_count'], $num, $dir, $ent); $st->execute(); $bid[$i] = $st->insert_id; $st->close();
            if ($hasOpen && !empty($b['is_open'])) $conn->query('UPDATE buildings SET is_open = 1 WHERE id = ' . (int) $bid[$i]);
            if ($hasEF && ($b['entrance_floor'] ?? null) !== null && $b['entrance_floor'] !== '') { $st = $conn->prepare('UPDATE buildings SET entrance_floor = ? WHERE id = ?'); $st->bind_param('si', $b['entrance_floor'], $bid[$i]); $st->execute(); $st->close(); }
        }
        // ---- floor plans (pictures first, so nothing half-written stays)
        $fp = [];
        foreach ($d['floor_plans'] as $i => $f) {
            $bytes = $images[$f['image']];
            $ext = dp_image_type($bytes);
            $name = $bid[$f['building']] . '-' . preg_replace('/[^a-z0-9]+/', '-', strtolower($f['floor'])) . '-' . time() . $i . '.' . $ext;
            if (file_put_contents($plansDir . $name, $bytes) === false) throw new RuntimeException('Could not save a floor plan picture.');
            $written[] = $plansDir . $name;
            $path = 'assets/floorplans/' . $name; $bidv = $bid[$f['building']];
            $st = $conn->prepare('INSERT INTO floor_plans (building_id, floor, image_path, north_offset, meters_per_unit_x, meters_per_unit_y) VALUES (?, ?, ?, ?, ?, ?)');
            $no = $f['north_offset'] ?? null; $mx = $f['meters_per_unit_x'] ?? null; $my = $f['meters_per_unit_y'] ?? null;
            $st->bind_param('issddd', $bidv, $f['floor'], $path, $no, $mx, $my); $st->execute(); $fp[$i] = $st->insert_id; $st->close();
        }
        $pn = [];
        $st = $conn->prepare('INSERT INTO floor_plan_nodes (floor_plan_id, x, y, name) VALUES (?, ?, ?, ?)');
        foreach ($d['plan_nodes'] as $i => $n) { $pid = $fp[$n['plan']]; $name = $n['name'] ?? null; $st->bind_param('idds', $pid, $n['x'], $n['y'], $name); $st->execute(); $pn[$i] = $st->insert_id; }
        $st->close();
        $st = $conn->prepare('INSERT IGNORE INTO floor_plan_edges (node_a_id, node_b_id) VALUES (?, ?)');
        foreach ($d['plan_edges'] as $e) { $a = $pn[$e[0]]; $b = $pn[$e[1]]; $st->bind_param('ii', $a, $b); $st->execute(); }
        $st->close();
        // ---- rooms
        $sql = $hasSub
            ? 'INSERT INTO rooms (building_id, room_number, room_name, subtitle, floor, room_type, category, hours, notes, map_x, map_y, path_node_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            : 'INSERT INTO rooms (building_id, room_number, room_name, floor, room_type, category, hours, notes, map_x, map_y, path_node_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
        $st = $conn->prepare($sql);
        foreach ($d['rooms'] as $r) {
            $b = $bid[$r['building']]; $num = ($r['room_number'] ?? '') === '' ? null : normalize_room_number($r['room_number']);
            $path = ($r['path_node'] ?? null) === null ? null : $pn[$r['path_node']];
            $hours = $r['hours'] ?? null; $notes = $r['notes'] ?? null; $mx = $r['map_x'] ?? null; $my = $r['map_y'] ?? null; $sub = $r['subtitle'] ?? null;
            if ($hasSub) $st->bind_param('issssssssddi', $b, $num, $r['room_name'], $sub, $r['floor'], $r['room_type'], $r['category'], $hours, $notes, $mx, $my, $path);
            else $st->bind_param('isssssssddi', $b, $num, $r['room_name'], $r['floor'], $r['room_type'], $r['category'], $hours, $notes, $mx, $my, $path);
            $st->execute();
        }
        $st->close();
        // ---- doors, pins, outline links
        if (dp_has_table($conn, 'building_doors')) {
            $st = $conn->prepare('INSERT INTO building_doors (building_id, kind, node_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE node_id = VALUES(node_id)');
            foreach ($d['doors'] as $x) { $b = $bid[$x['building']]; $n = $pn[$x['node']]; $st->bind_param('isi', $b, $x['kind'], $n); $st->execute(); }
            $st->close();
        }
        if (dp_has_table($conn, 'static_map_markers')) {
            $st = $conn->prepare('INSERT INTO static_map_markers (building_id, kind, marker_type, label, x, y) VALUES (?, ?, ?, ?, ?, ?)');
            foreach ($d['map_markers'] as $m) { $b = ($m['building'] ?? null) === null ? null : $bid[$m['building']]; $label = $m['label'] ?? null; $st->bind_param('isssdd', $b, $m['kind'], $m['marker_type'], $label, $m['x'], $m['y']); $st->execute(); }
            $st->close();
        }
        if (dp_has_table($conn, 'campus_footprints')) {
            $st = $conn->prepare('UPDATE campus_footprints SET building_id = ? WHERE id = ?');
            foreach ($d['footprint_links'] as $l) { $b = $bid[$l['building']]; $fid = (int) $l['footprint_id']; $st->bind_param('ii', $b, $fid); $st->execute(); }
            $st->close();
        }
        // ---- enrollment steps and settings
        if (($d['enrollment_steps'] ?? null) !== null) {
            $json = json_encode($d['enrollment_steps'], JSON_UNESCAPED_UNICODE);
            $st = $conn->prepare('INSERT INTO enrollment_steps (id, stops) VALUES (1, ?) ON DUPLICATE KEY UPDATE stops = VALUES(stops)'); $st->bind_param('s', $json); $st->execute(); $st->close();
        } else {
            $conn->query('DELETE FROM enrollment_steps WHERE id = 1');
        }
        if (!empty($d['institution']) && is_array($d['institution'])) {
            $problems = institution_save($conn, $d['institution']);
            if ($problems) throw new RuntimeException('The school settings in the pack are not valid: ' . implode('; ', $problems));
        }
        $conn->commit();
    } catch (Throwable $e) {
        $conn->rollback();
        foreach ($written as $f) @unlink($f);
        throw $e;
    }
    // old pictures go, unless a floor plan still uses the file
    $inUse = array_column(dp_rows($conn, 'SELECT image_path FROM floor_plans'), 'image_path');
    foreach ($oldImages as $old) {
        $f = $frontend . $old;
        if (is_file($f) && strpos($old, 'assets/floorplans/') === 0 && !in_array($old, $inUse, true)) @unlink($f);
    }
    return data_pack_counts($d);
}

// ---------------------------------------------------------------- spreadsheet of rooms (CSV)

// Reads a CSV text into rows keyed by the header. Returns [rows, problems].
function data_pack_csv_rows(string $text): array
{
    $text = preg_replace('/^\xEF\xBB\xBF/', '', $text);
    $fh = fopen('php://temp', 'r+'); fwrite($fh, $text); rewind($fh);
    $head = fgetcsv($fh);
    $need = ['building_name', 'floor', 'room_number', 'room_name', 'category', 'hours', 'notes'];
    if (!$head) return [[], ['The file is empty.']];
    $head = array_map(fn($h) => strtolower(trim((string) $h)), $head);
    $miss = array_diff(['building_name', 'floor', 'room_name'], $head);
    if ($miss) return [[], ['The first row must name the columns. Missing: ' . implode(', ', $miss) . '. Expected: ' . implode(', ', $need) . '.']];
    $rows = [];
    $n = 1;
    while (($r = fgetcsv($fh)) !== false) {
        $n++;
        if (count($r) === 1 && trim((string) $r[0]) === '') continue;
        $row = [];
        foreach ($head as $i => $h) $row[$h] = isset($r[$i]) ? trim((string) $r[$i]) : '';
        $row['_line'] = $n;
        $rows[] = $row;
        if (count($rows) > 5000) return [[], ['More than 5,000 rows: split the file.']];
    }
    fclose($fh);
    return [$rows, []];
}

// Checks each row against the buildings and rooms already there and against each other.
// Returns ['valid' => rows ready to add, 'problems' => [[line, message], ...]].
function data_pack_csv_check(mysqli $conn, array $rows): array
{
    require_once __DIR__ . '/room_number.php';
    $buildings = [];
    foreach (dp_rows($conn, 'SELECT id, name FROM buildings') as $b) $buildings[mb_strtolower(trim($b['name']), 'UTF-8')] = (int) $b['id'];
    $valid = []; $problems = []; $seen = [];
    foreach ($rows as $r) {
        $line = $r['_line']; $bad = [];
        $bkey = mb_strtolower($r['building_name'] ?? '', 'UTF-8');
        $bid = $buildings[$bkey] ?? null;
        if ($bid === null) $bad[] = 'there is no building named "' . ($r['building_name'] ?? '') . '"';
        if (($r['room_name'] ?? '') === '') $bad[] = 'the room name is empty'; elseif (mb_strlen($r['room_name'], 'UTF-8') > 150) $bad[] = 'the room name is too long';
        if (($r['floor'] ?? '') === '') $bad[] = 'the floor is empty'; elseif (mb_strlen($r['floor'], 'UTF-8') > 50) $bad[] = 'the floor is too long';
        $cat = strtolower($r['category'] ?? '');
        if ($cat === '') $cat = 'office';
        if (!in_array($cat, ['office', 'classroom', 'cr', 'canteen'], true)) $bad[] = 'the category "' . $r['category'] . '" is not office, classroom, cr or canteen';
        $num = normalize_room_number($r['room_number'] ?? '');
        if ($num !== null && mb_strlen($num, 'UTF-8') > 30) $bad[] = 'the room number is too long';
        if ($bid !== null && $num !== null) {
            $key = $bid . '|' . compact_room_number($num);
            if (isset($seen[$key])) $bad[] = "room number $num appears twice in this file for the same building (line {$seen[$key]})";
            elseif (room_number_taken($conn, $num, 0, $bid)) $bad[] = "room number $num is already registered in that building";
        }
        if ($bad) { $problems[] = [$line, ucfirst(implode('; ', $bad)) . '.']; continue; }
        if ($num !== null) $seen[$bid . '|' . compact_room_number($num)] = $line;
        $type = in_array($cat, ['office', 'canteen'], true) ? 'office' : 'classroom';
        $valid[] = ['line' => $line, 'building_id' => $bid, 'room_number' => $num, 'room_name' => $r['room_name'], 'floor' => $r['floor'], 'category' => $cat, 'room_type' => $type,
            'hours' => ($type === 'office' && ($r['hours'] ?? '') !== '') ? mb_substr($r['hours'], 0, 150, 'UTF-8') : null, 'notes' => ($r['notes'] ?? '') !== '' ? $r['notes'] : null];
    }
    return ['valid' => $valid, 'problems' => $problems];
}

function data_pack_csv_import(mysqli $conn, array $valid): int
{
    $st = $conn->prepare('INSERT INTO rooms (building_id, room_number, room_name, floor, room_type, category, hours, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    $conn->begin_transaction();
    try {
        foreach ($valid as $v) { $st->bind_param('isssssss', $v['building_id'], $v['room_number'], $v['room_name'], $v['floor'], $v['room_type'], $v['category'], $v['hours'], $v['notes']); $st->execute(); }
        $conn->commit();
    } catch (Throwable $e) { $conn->rollback(); throw $e; }
    $st->close();
    return count($valid);
}
