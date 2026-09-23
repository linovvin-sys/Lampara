<?php

// Included only for POST/PUT/DELETE in api/buildings.php and api/rooms.php.
// GET stays open — students need it to read the directory with no login.

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

if (empty($_SESSION['admin_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Admin login required']);
    exit;
}
