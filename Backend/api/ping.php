<?php

// GET /api/ping.php -> { success: true, admin: bool }
//
// Two callers use this:
//   * the admin offline layer: is the server actually reachable (navigator.onLine can
//     say "online" on a dead connection), and is the admin session still valid (so a
//     sync won't be rejected halfway)?
//   * the student pages: just "is the server reachable?" before refreshing saved data.
//
// Never cached — a stale answer here would defeat the point. A session is only opened
// when the visitor already has a session cookie, so ordinary students (who never log in)
// aren't handed one just for pinging.

header('Content-Type: application/json');
header('Cache-Control: no-store');

$admin = false;
if (isset($_COOKIE[session_name()])) {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    $admin = !empty($_SESSION['admin_id']);
}

echo json_encode(['success' => true, 'admin' => $admin]);
