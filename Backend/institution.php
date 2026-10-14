<?php

// The one place that says which school this install is for: name, tagline, logo, colour theme, AI persona, contacts, campus area,
// and which features are switched on. Everything school-specific that used to be written into pages and scripts lives here.
//
//   institution_get()          the settings (defaults merged with the saved row); never throws, falls back to the defaults
//   inst('short_name')         one setting, for use inside a view (escape it with htmlspecialchars)
//   inst_feature('enrollment') true when that feature is switched on
//   institution_save($conn, $input)   validates and saves (returns [] on success, or a list of problems)
//   institution_js()           "window.LAMPARA_CONFIG = {...};" for the browser (api/institution.php?format=js)
//
// One row (id = 1) in the `institution` table, created the first time it is needed, like the other optional tables.
// The defaults below are the NCST values the app shipped with, so a fresh install looks exactly as before.

const INSTITUTION_THEMES = ['default', 'halloween', 'christmas', 'newyear', 'valentine'];
const INSTITUTION_FEATURES = ['enrollment', 'game', 'hazards', 'chat'];

function institution_defaults(): array
{
    return [
        'name' => 'National College of Science and Technology',
        'short_name' => 'NCST',
        'tagline' => 'Find your way around campus.',
        'logo_path' => null,
        'theme' => 'default',
        'persona' => 'You are Lampara, the friendly campus guide of {short_name} (a school campus).',
        'contact_email' => '',
        'contact_phone' => '',
        'center_lat' => 14.3283,
        'center_lng' => 120.9408,
        'bounds' => [[14.32685, 120.93987], [14.32880, 120.94248]],
        'features' => ['enrollment' => true, 'game' => true, 'hazards' => true, 'chat' => true],
    ];
}

// Runs a query; if the table is missing it is created once and the query is tried again.
function institution_run(mysqli $conn, callable $fn)
{
    try {
        return $fn();
    } catch (mysqli_sql_exception $e) {
        if ($e->getCode() !== 1146) throw $e;
        $conn->query("CREATE TABLE IF NOT EXISTS institution (
            id TINYINT PRIMARY KEY,
            name VARCHAR(120) NOT NULL, short_name VARCHAR(30) NOT NULL, tagline VARCHAR(160) NOT NULL DEFAULT '',
            logo_path VARCHAR(255) NULL, theme VARCHAR(20) NOT NULL DEFAULT 'default', persona TEXT NOT NULL,
            contact_email VARCHAR(120) NOT NULL DEFAULT '', contact_phone VARCHAR(40) NOT NULL DEFAULT '',
            center_lat DOUBLE NOT NULL, center_lng DOUBLE NOT NULL, bounds TEXT NOT NULL, features TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        return $fn();
    }
}

function institution_get(?mysqli $conn = null): array
{
    static $cache = null;
    if ($cache !== null && $conn === null) return $cache;
    $out = institution_defaults();
    try {
        if ($conn === null) {
            require_once __DIR__ . '/config.php';
            $conn = (new Database())->connect();
        }
        $row = institution_run($conn, fn() => $conn->query('SELECT * FROM institution WHERE id = 1')->fetch_assoc());
        if ($row) {
            foreach (['name', 'short_name', 'tagline', 'theme', 'persona', 'contact_email', 'contact_phone'] as $k) {
                if (isset($row[$k]) && $row[$k] !== '') $out[$k] = $row[$k];
            }
            $out['contact_email'] = $row['contact_email'] ?? '';
            $out['contact_phone'] = $row['contact_phone'] ?? '';
            $out['logo_path'] = $row['logo_path'] ?: null;
            $out['center_lat'] = (float) $row['center_lat'];
            $out['center_lng'] = (float) $row['center_lng'];
            $b = json_decode((string) $row['bounds'], true);
            if (is_array($b) && count($b) === 2) $out['bounds'] = $b;
            $f = json_decode((string) $row['features'], true);
            if (is_array($f)) foreach (INSTITUTION_FEATURES as $k) if (array_key_exists($k, $f)) $out['features'][$k] = (bool) $f[$k];
        }
    } catch (Throwable $e) { /* no database or table yet: the defaults are the shipped look */ }
    return $cache = $out;
}

function inst(string $key)
{
    return institution_get()[$key] ?? '';
}

// One setting, already escaped for HTML.
function inst_h(string $key): string
{
    return htmlspecialchars((string) inst($key), ENT_QUOTES, 'UTF-8');
}

function inst_feature(string $name): bool
{
    return !empty(institution_get()['features'][$name]);
}

// Public path of the logo for <img src>, relative to Frontend/View/<Folder>/ (the same depth for every page).
function inst_logo(): string
{
    $p = inst('logo_path');
    return $p ? '../../' . $p : '../../assets/logo.svg';
}

// The AI intro sentence with the school's short name filled in.
function inst_persona(): string
{
    return str_replace('{short_name}', inst('short_name'), (string) inst('persona'));
}

// What the browser needs (no contact details, no persona text).
function institution_public(): array
{
    $i = institution_get();
    return [
        'name' => $i['name'], 'shortName' => $i['short_name'], 'tagline' => $i['tagline'], 'theme' => $i['theme'],
        'logo' => $i['logo_path'], 'center' => [$i['center_lat'], $i['center_lng']], 'bounds' => $i['bounds'], 'features' => $i['features'],
    ];
}

function institution_js(): string
{
    return 'window.LAMPARA_CONFIG = ' . json_encode(institution_public(), JSON_UNESCAPED_SLASHES) . ';';
}

// Checks the input and saves it. Returns a list of problems (empty when saved). Fields that are absent are left as they are.
function institution_save(mysqli $conn, array $in): array
{
    $cur = institution_get($conn);
    $errors = [];
    $str = function ($k, $max, $required = false) use ($in, $cur, &$errors) {
        if (!array_key_exists($k, $in)) return $cur[$k];
        $v = trim(preg_replace('/\s+/u', ' ', (string) $in[$k]));
        if ($required && $v === '') $errors[] = "$k cannot be empty";
        if (mb_strlen($v, 'UTF-8') > $max) $errors[] = "$k is too long (at most $max characters)";
        return $v;
    };
    $name = $str('name', 120, true);
    $short = $str('short_name', 30, true);
    $tagline = $str('tagline', 160);
    $phone = $str('contact_phone', 40);
    $email = $str('contact_email', 120);
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) $errors[] = 'contact_email is not a valid email address';

    $persona = $cur['persona'];
    if (array_key_exists('persona', $in)) {
        $persona = trim((string) $in['persona']);
        if ($persona === '') $errors[] = 'persona cannot be empty';
        if (mb_strlen($persona, 'UTF-8') > 2000) $errors[] = 'persona is too long (at most 2000 characters)';
    }
    $theme = $in['theme'] ?? $cur['theme'];
    if (!in_array($theme, INSTITUTION_THEMES, true)) $errors[] = 'theme is not one of: ' . implode(', ', INSTITUTION_THEMES);

    $lat = array_key_exists('center_lat', $in) ? (float) $in['center_lat'] : $cur['center_lat'];
    $lng = array_key_exists('center_lng', $in) ? (float) $in['center_lng'] : $cur['center_lng'];
    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) $errors[] = 'the map centre is not a real place';

    $bounds = $cur['bounds'];
    if (array_key_exists('bounds', $in)) {
        $b = $in['bounds'];
        $ok = is_array($b) && count($b) === 2 && is_array($b[0] ?? null) && is_array($b[1] ?? null) && count($b[0]) === 2 && count($b[1]) === 2
            && is_numeric($b[0][0]) && is_numeric($b[0][1]) && is_numeric($b[1][0]) && is_numeric($b[1][1]);
        if (!$ok) $errors[] = 'the campus area needs a south-west and a north-east corner';
        else {
            $bounds = [[(float) $b[0][0], (float) $b[0][1]], [(float) $b[1][0], (float) $b[1][1]]];
            if ($bounds[0][0] >= $bounds[1][0] || $bounds[0][1] >= $bounds[1][1]) $errors[] = 'the south-west corner must be south and west of the north-east corner';
            elseif (($bounds[1][0] - $bounds[0][0]) > 0.2 || ($bounds[1][1] - $bounds[0][1]) > 0.2) $errors[] = 'the campus area is far too large (more than about 20 km)';
            elseif (abs($bounds[0][0]) > 90 || abs($bounds[1][0]) > 90 || abs($bounds[0][1]) > 180 || abs($bounds[1][1]) > 180) $errors[] = 'the campus area is not a real place';
        }
    }
    $features = $cur['features'];
    if (array_key_exists('features', $in) && is_array($in['features'])) {
        foreach (INSTITUTION_FEATURES as $k) if (array_key_exists($k, $in['features'])) $features[$k] = (bool) $in['features'][$k];
    }
    if ($errors) return $errors;

    $bj = json_encode($bounds);
    $fj = json_encode($features);
    $logo = $cur['logo_path'];
    $stmt = $conn->prepare('INSERT INTO institution (id, name, short_name, tagline, logo_path, theme, persona, contact_email, contact_phone, center_lat, center_lng, bounds, features)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE name = VALUES(name), short_name = VALUES(short_name), tagline = VALUES(tagline), logo_path = VALUES(logo_path), theme = VALUES(theme),
            persona = VALUES(persona), contact_email = VALUES(contact_email), contact_phone = VALUES(contact_phone), center_lat = VALUES(center_lat),
            center_lng = VALUES(center_lng), bounds = VALUES(bounds), features = VALUES(features)');
    $stmt->bind_param('ssssssssddss', $name, $short, $tagline, $logo, $theme, $persona, $email, $phone, $lat, $lng, $bj, $fj);
    institution_run($conn, function () use ($stmt) { $stmt->execute(); });
    $stmt->close();
    return [];
}

function institution_set_logo(mysqli $conn, ?string $path): void
{
    institution_save($conn, []); // creates the table and the row (with the defaults) if there is none
    $stmt = $conn->prepare('UPDATE institution SET logo_path = ? WHERE id = 1');
    $stmt->bind_param('s', $path);
    $stmt->execute();
    $stmt->close();
}
