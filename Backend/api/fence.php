<?php

// The "you must be on the campus" switch (the check itself is Frontend/Js/Include/geofence.js, using the area in campus-bounds.js).
// GET  /api/fence.php -> { enabled, bypass }   enabled = is the check switched on; bypass = skip it for this visitor (a logged-in admin)
// POST /api/fence.php -> body (JSON) { enabled: true|false }  switches it on or off (admin only)
// The check runs in the visitor's browser, so it keeps honest visitors off-campus; it is not a security boundary.

header('Content-Type: application/json');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../session_boot.php';

lampara_session_start();
$isAdmin = !empty($_SESSION['admin_id']);

$db = new Database();
$conn = $db->connect();

// The settings table is created the first time a query finds it missing, not on every request.
function fence_run(mysqli $conn, callable $fn)
{
    try {
        return $fn();
    } catch (mysqli_sql_exception $e) {
        if ($e->getCode() !== 1146) throw $e;
        $conn->query("CREATE TABLE IF NOT EXISTS app_settings (k VARCHAR(40) PRIMARY KEY, v VARCHAR(255) NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        return $fn();
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    header('Cache-Control: no-store');
    require_once __DIR__ . '/_require_admin.php';
    $in = json_decode(file_get_contents('php://input'), true);
    if (!is_array($in) || !array_key_exists('enabled', $in)) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'enabled (true or false) is required']);
        exit;
    }
    $v = $in['enabled'] ? '1' : '0';
    fence_run($conn, function () use ($conn, $v) {
        $stmt = $conn->prepare("INSERT INTO app_settings (k, v) VALUES ('campus_fence', ?) ON DUPLICATE KEY UPDATE v = VALUES(v)");
        $stmt->bind_param('s', $v);
        $stmt->execute();
        $stmt->close();
    });
    echo json_encode(['success' => true, 'enabled' => $v === '1']);
    exit;
}

$row = fence_run($conn, fn() => $conn->query("SELECT v FROM app_settings WHERE k = 'campus_fence'")->fetch_row());
$enabled = $row ? $row[0] === '1' : true;          // on until an admin switches it off

// Varies per visitor (an admin skips the check), so only the visitor's own browser may keep it, and only briefly.
header('Cache-Control: private, max-age=20');
echo json_encode(['success' => true, 'enabled' => $enabled, 'bypass' => $isAdmin]);
