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

// A PSMO account is limited to buildings, rooms, floor plans and what goes with them.
if (lampara_admin_role() === 'psmo' && !lampara_psmo_allows($_SERVER['SCRIPT_NAME'] ?? '')) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'This account can only manage buildings and rooms']);
    exit;
}
