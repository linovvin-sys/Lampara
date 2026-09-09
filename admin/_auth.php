<?php

// Include this at the very top of every admin/*.php page (before any HTML
// output) to require a logged-in admin session. Public student-facing pages
// never touch this file.

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

if (empty($_SESSION['admin_id'])) {
    $next = urlencode($_SERVER['REQUEST_URI'] ?? 'manage-buildings.php');
    header('Location: login.php?next=' . $next);
    exit;
}
