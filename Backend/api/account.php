<?php

// The signed-in person's own account (every admin and PSMO account), plus read-only lists for admins.
// GET  /api/account.php                    -> { success, username, role, two_step }
// GET  /api/account.php?list=1             -> admin only: every account { username, role, disabled, two_step, created_at }
// GET  /api/account.php?audit=1            -> admin only: the latest 100 security events (sign-ins, report decisions, account changes)
// POST /api/account.php?action=password    body { current, new }      change your password
// POST /api/account.php?action=2fa_begin                              start two-step sign-in: returns { secret, uri } to add to an authenticator app
// POST /api/account.php?action=2fa_confirm body { code }              finish it with a code from the app
// POST /api/account.php?action=2fa_off     body { password, code? }   switch it off (needs your password, and a code when it is on)
// Creating accounts, disabling them and changing roles is done on the server with Backend/scripts/manage-admins.php, never here.

header('Content-Type: application/json');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../admin_roles.php';
require_once __DIR__ . '/../audit_log.php';
require_once __DIR__ . '/../totp.php';
require_once __DIR__ . '/../rate_limit.php';
require_once __DIR__ . '/_require_admin.php';        // 401 without a session, same-origin check, role check

$db = new Database();
$conn = $db->connect();
ensure_admin_role_column($conn);
$id = (int) $_SESSION['admin_id'];
$me = $conn->query('SELECT username, role, password_hash, totp_secret FROM admins WHERE id = ' . $id)->fetch_assoc();
if (!$me) { http_response_code(401); echo json_encode(['success' => false, 'error' => 'Admin login required']); exit; }

function acc_fail(int $code, string $msg): void { http_response_code($code); echo json_encode(['success' => false, 'error' => $msg]); exit; }

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    if (isset($_GET['list']) || isset($_GET['audit'])) {
        if (lampara_admin_role() !== 'admin') acc_fail(403, 'Only an administrator can see this');
        if (isset($_GET['list'])) {
            $rows = [];
            $r = $conn->query('SELECT username, role, disabled, totp_secret IS NOT NULL AS two_step, created_at FROM admins ORDER BY id');
            while ($x = $r->fetch_assoc()) $rows[] = ['username' => $x['username'], 'role' => $x['role'], 'disabled' => (int) $x['disabled'] === 1, 'two_step' => (int) $x['two_step'] === 1, 'created_at' => $x['created_at']];
            echo json_encode(['success' => true, 'accounts' => $rows]);
            exit;
        }
        audit_log($conn, 'audit_viewed', '', '');
        $rows = [];
        $r = $conn->query('SELECT at, actor, role, action, target, detail, ip FROM audit_log ORDER BY id DESC LIMIT 100');
        while ($x = $r->fetch_assoc()) $rows[] = $x;
        echo json_encode(['success' => true, 'events' => $rows]);
        exit;
    }
    echo json_encode(['success' => true, 'username' => $me['username'], 'role' => $me['role'], 'two_step' => !empty($me['totp_secret'])]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') acc_fail(405, 'Method not allowed');
rate_limit_or_die('account_change', 20, 600, 'Too many tries. Please wait a few minutes.');
$in = json_decode(file_get_contents('php://input'), true) ?: [];
$action = $_GET['action'] ?? '';

if ($action === 'password') {
    $new = (string) ($in['new'] ?? '');
    if (!password_verify((string) ($in['current'] ?? ''), $me['password_hash'])) { audit_log($conn, 'password_change_failed', $me['username'], 'wrong current password'); acc_fail(403, 'Your current password is not right'); }
    if (mb_strlen($new) < 10) acc_fail(400, 'The new password must be at least 10 characters');
    if (strcasecmp($new, $me['username']) === 0 || preg_match('/^(password|12345678|qwertyuiop|lampara|ncst)/i', $new)) acc_fail(400, 'Choose a password that is not your username or an obvious word');
    if (hash_equals((string) ($in['current'] ?? ''), $new)) acc_fail(400, 'The new password must be different');
    $hash = password_hash($new, PASSWORD_DEFAULT);
    $stmt = $conn->prepare('UPDATE admins SET password_hash = ? WHERE id = ?');
    $stmt->bind_param('si', $hash, $id);
    $stmt->execute();
    session_regenerate_id(true);
    audit_log($conn, 'password_changed', $me['username']);
    echo json_encode(['success' => true]);
    exit;
}
if ($action === '2fa_begin') {
    if (!empty($me['totp_secret'])) acc_fail(400, 'Two-step sign-in is already on');
    $secret = totp_new_secret();
    $_SESSION['totp_pending'] = $secret;
    echo json_encode(['success' => true, 'secret' => $secret, 'uri' => totp_uri($secret, $me['username'])]);
    exit;
}
if ($action === '2fa_confirm') {
    $secret = $_SESSION['totp_pending'] ?? '';
    if ($secret === '' || !totp_verify($secret, (string) ($in['code'] ?? ''))) { audit_log($conn, 'two_step_setup_failed', $me['username']); acc_fail(400, 'That code is not right. Check the time on your phone and try the next code.'); }
    $stmt = $conn->prepare('UPDATE admins SET totp_secret = ? WHERE id = ?');
    $stmt->bind_param('si', $secret, $id);
    $stmt->execute();
    unset($_SESSION['totp_pending']);
    audit_log($conn, 'two_step_on', $me['username']);
    echo json_encode(['success' => true]);
    exit;
}
if ($action === '2fa_off') {
    if (empty($me['totp_secret'])) acc_fail(400, 'Two-step sign-in is already off');
    if (!password_verify((string) ($in['password'] ?? ''), $me['password_hash']) || !totp_verify($me['totp_secret'], (string) ($in['code'] ?? ''))) { audit_log($conn, 'two_step_off_failed', $me['username']); acc_fail(403, 'Your password or code is not right'); }
    $conn->query('UPDATE admins SET totp_secret = NULL WHERE id = ' . $id);
    audit_log($conn, 'two_step_off', $me['username']);
    echo json_encode(['success' => true]);
    exit;
}
acc_fail(400, 'Unknown action');
