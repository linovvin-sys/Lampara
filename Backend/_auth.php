<?php

// Include this at the very top of every admin/*.php page (before any HTML
// output) to require a logged-in admin session. Public student-facing pages
// never touch this file.

require_once __DIR__ . '/session_boot.php';
lampara_session_start();

if (empty($_SESSION['admin_id'])) {
    $next = urlencode($_SERVER['REQUEST_URI'] ?? 'dashboard.php');
    header('Location: login.php?next=' . $next);
    exit;
}

// A PSMO account sees only the building and room pages.
if (lampara_admin_role() === 'psmo' && !lampara_psmo_allows($_SERVER['SCRIPT_NAME'] ?? '')) {
    header('Location: ' . lampara_psmo_home());
    exit;
}
