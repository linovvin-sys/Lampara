<?php

// Included only for POST/PUT/DELETE in api/buildings.php and api/rooms.php.
// GET stays open — students need it to read the directory with no login.

require_once __DIR__ . '/../session_boot.php';
lampara_session_start();

// A write that another website sent from an admin's browser is refused (see session_boot.php).
lampara_same_origin_or_die();

if (empty($_SESSION['admin_id'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Admin login required']);
    exit;
}
