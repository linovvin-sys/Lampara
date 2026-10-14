<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
require_once __DIR__ . '/../../../Backend/session_boot.php';
lampara_session_start();
// A logout link on another website must not sign an admin out: a click from elsewhere is sent back to the admin pages instead.
$from = parse_url($_SERVER['HTTP_REFERER'] ?? '', PHP_URL_HOST);
if ($from && strcasecmp($from, parse_url('//' . ($_SERVER['HTTP_HOST'] ?? ''), PHP_URL_HOST) ?: '') !== 0) {
    header('Location: dashboard.php');
    exit;
}
if (!empty($_SESSION['admin_id'])) { require_once __DIR__ . '/../../../Backend/config.php'; require_once __DIR__ . '/../../../Backend/audit_log.php'; $d = new Database(); audit_log($d->connect(), 'logout', (string) ($_SESSION['admin_username'] ?? '')); }
$_SESSION = [];
if (ini_get('session.use_cookies')) { $c = session_get_cookie_params(); setcookie(session_name(), '', time() - 42000, $c['path'], $c['domain'], $c['secure'], $c['httponly']); }
session_destroy();
header('Location: login.php');
exit;
