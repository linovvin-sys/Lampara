<?php

// The enrollment guide's steps, editable by an admin (Frontend/View/Admin/enrollment-steps.php).
// GET  /api/enrollment-steps.php -> { stops: [...] | null }   null = nobody has edited them: the app uses its built-in list
// POST /api/enrollment-steps.php -> { stops: [...] } saves the list, or { reset: true } goes back to the built-in list (admin only)
// A stop: key, title, place, what (required); heading (starts a new numbered step), sub, room_id (the room picked from the directory) or, for the built-in list, room (number) or match (name regex), houses (true).

header('Content-Type: application/json');

require_once __DIR__ . '/../config.php';
$conn = (new Database())->connect();

// Created the first time a query finds it missing, like api/fence.php.
function es_run(mysqli $conn, callable $fn)
{
    try {
        return $fn();
    } catch (mysqli_sql_exception $e) {
        if ($e->getCode() !== 1146) throw $e;
        $conn->query("CREATE TABLE IF NOT EXISTS enrollment_steps (id TINYINT PRIMARY KEY, stops MEDIUMTEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        return $fn();
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Cache-Control: no-store');
    require_once __DIR__ . '/_require_admin.php';
    $in = json_decode(file_get_contents('php://input'), true);
    if (!is_array($in)) { http_response_code(400); echo json_encode(['success' => false, 'error' => 'Bad request']); exit; }

    if (!empty($in['reset'])) {
        es_run($conn, fn() => $conn->query('DELETE FROM enrollment_steps WHERE id = 1'));
        require_once __DIR__ . '/../audit_log.php';
        audit_log($conn, 'enrollment_steps', 'reset');
        echo json_encode(['success' => true, 'stops' => null]);
        exit;
    }

    $fail = function (string $m) { http_response_code(400); echo json_encode(['success' => false, 'error' => $m]); exit; };
    if (!isset($in['stops']) || !is_array($in['stops']) || !$in['stops'] || count($in['stops']) > 40) $fail('Add at least one stop (40 at most).');
    $clean = []; $keys = [];
    foreach ($in['stops'] as $i => $s) {
        if (!is_array($s)) $fail('Stop ' . ($i + 1) . ' is not valid.');
        $str = fn($k, $max) => mb_substr(trim((string)($s[$k] ?? '')), 0, $max);
        $c = ['key' => preg_replace('/[^a-z0-9_-]/', '', strtolower($str('key', 40))), 'title' => $str('title', 120), 'place' => $str('place', 120), 'what' => $str('what', 500)];
        foreach (['heading' => 120, 'sub' => 60, 'room' => 20, 'match' => 80] as $k => $max) if ($str($k, $max) !== '') $c[$k] = $str($k, $max);
        if ((int)($s['room_id'] ?? 0) > 0) $c['room_id'] = (int)$s['room_id'];
        if (!empty($s['houses'])) $c['houses'] = true;
        $n = 'Stop ' . ($i + 1);
        if ($c['key'] === '' || $c['title'] === '' || $c['place'] === '' || $c['what'] === '') $fail("$n needs a key, title, place and description.");
        if (isset($keys[$c['key']])) $fail("$n: the key \"{$c['key']}\" is used twice.");
        if (isset($c['match']) && @preg_match('/' . str_replace('/', '\/', $c['match']) . '/i', '') === false) $fail("$n: the name pattern is not valid.");
        $keys[$c['key']] = 1;
        $clean[] = $c;
    }
    $json = json_encode($clean, JSON_UNESCAPED_UNICODE);
    es_run($conn, function () use ($conn, $json) {
        $stmt = $conn->prepare('INSERT INTO enrollment_steps (id, stops) VALUES (1, ?) ON DUPLICATE KEY UPDATE stops = VALUES(stops)');
        $stmt->bind_param('s', $json);
        $stmt->execute();
        $stmt->close();
    });
    require_once __DIR__ . '/../audit_log.php';
    audit_log($conn, 'enrollment_steps', 'saved', count($clean) . ' stops');
    echo json_encode(['success' => true, 'stops' => $clean]);
    exit;
}

$row = es_run($conn, fn() => $conn->query('SELECT stops FROM enrollment_steps WHERE id = 1')->fetch_row());
header('Cache-Control: no-cache');
echo json_encode(['success' => true, 'stops' => $row ? json_decode($row[0], true) : null]);
