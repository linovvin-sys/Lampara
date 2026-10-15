<?php

// The signed-in person's own account (every admin and PSMO account), plus read-only lists for admins.
// GET  /api/account.php                    -> { success, username, role, two_step }
// GET  /api/account.php?list=1             -> admin only: every account { username, role, disabled, two_step, created_at }
// GET  /api/account.php?audit=1            -> admin only: the latest 100 security events (sign-ins, report decisions, account changes)
// POST /api/account.php?action=password    body { current, new }      change your password
// POST /api/account.php?action=username   body { username, password }   change your own username (needs your password)
// POST /api/account.php?action=2fa_begin                              start two-step sign-in: returns { secret, uri } to add to an authenticator app
// POST /api/account.php?action=2fa_confirm body { code }              finish it with a code from the app
// POST /api/account.php?action=2fa_off     body { password, code? }   switch it off (needs your password, and a code when it is on)
// Team (administrators only):
// GET  /api/account.php?team=1                        -> { accounts: [{ id, username, role, permissions, disabled, two_step, last_login, created_at, you }], areas: { key: { label, about } } }
// POST /api/account.php?action=team_create  body { username, role, permissions[] }   -> { username, password }  (a temporary password, shown once)
// POST /api/account.php?action=team_update  body { id, role?, permissions?[], disabled? }
// POST /api/account.php?action=team_reset   body { id }  -> { password }  (a new temporary password; two-step is switched off for them)
// POST /api/account.php?action=team_delete  body { id }
// Rules: you cannot lock yourself out (no demoting, disabling or deleting your own account), and one active administrator always remains.

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
    if (isset($_GET['team'])) {
        if (lampara_admin_role() !== 'admin') acc_fail(403, 'Only an administrator can see this');
        $seen = [];
        $lr = $conn->query("SELECT actor, MAX(at) AS t FROM audit_log WHERE action = 'login_ok' GROUP BY actor");
        if ($lr) while ($x = $lr->fetch_assoc()) $seen[$x['actor']] = $x['t'];
        $rows = [];
        $r = $conn->query('SELECT id, username, role, permissions, disabled, totp_secret IS NOT NULL AS two_step, created_at FROM admins ORDER BY role = "admin" DESC, username');
        while ($x = $r->fetch_assoc()) {
            $perms = $x['role'] === 'admin' ? array_keys(lampara_access_areas()) : ($x['permissions'] === null || $x['permissions'] === '' ? ['buildings'] : array_values(array_intersect(explode(',', $x['permissions']), array_keys(lampara_access_areas()))));
            $rows[] = ['id' => (int) $x['id'], 'username' => $x['username'], 'role' => $x['role'], 'permissions' => $perms, 'disabled' => (int) $x['disabled'] === 1,
                'two_step' => (int) $x['two_step'] === 1, 'last_login' => $seen[$x['username']] ?? null, 'created_at' => $x['created_at'], 'you' => (int) $x['id'] === $id];
        }
        $areas = []; foreach (lampara_access_areas() as $k => $a) $areas[$k] = ['label' => $a['label'], 'about' => $a['about']];
        echo json_encode(['success' => true, 'accounts' => $rows, 'areas' => $areas]);
        exit;
    }
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
if ($action === 'username') {
    $u = trim((string) ($in['username'] ?? ''));
    if (!password_verify((string) ($in['password'] ?? ''), $me['password_hash'])) { audit_log($conn, 'username_change_failed', $me['username'], 'wrong password'); acc_fail(403, 'Your password is not right'); }
    if (!preg_match('/^[A-Za-z0-9._-]{3,30}$/', $u)) acc_fail(400, 'Use 3 to 30 letters, numbers, dots, dashes or underscores for the username');
    if ($u === $me['username']) acc_fail(400, 'That is already your username');
    $ex = $conn->prepare('SELECT 1 FROM admins WHERE username = ? AND id <> ?'); $ex->bind_param('si', $u, $id); $ex->execute();
    if ($ex->get_result()->fetch_row()) acc_fail(409, 'That username is already taken');
    $stmt = $conn->prepare('UPDATE admins SET username = ? WHERE id = ?'); $stmt->bind_param('si', $u, $id); $stmt->execute();
    $_SESSION['admin_username'] = $u;
    audit_log($conn, 'username_changed', $u, 'was ' . $me['username']);
    echo json_encode(['success' => true, 'username' => $u]);
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
if (strpos($action, 'team_') === 0) {
    if (lampara_admin_role() !== 'admin') acc_fail(403, 'Only an administrator can manage the team');
    $valid = array_keys(lampara_access_areas());
    $cleanPerms = function ($p) use ($valid) { return array_values(array_intersect($valid, is_array($p) ? $p : [])); };
    $tempPassword = function () { $c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; $o = ''; for ($i = 0; $i < 12; $i++) $o .= $c[random_int(0, strlen($c) - 1)]; return $o; };
    $activeAdmins = function () use ($conn) { return (int) $conn->query("SELECT COUNT(*) FROM admins WHERE role = 'admin' AND disabled = 0")->fetch_row()[0]; };
    $target = null;
    if ($action !== 'team_create') {
        $tid = (int) ($in['id'] ?? 0);
        $st = $conn->prepare('SELECT id, username, role, disabled FROM admins WHERE id = ?'); $st->bind_param('i', $tid); $st->execute();
        $target = $st->get_result()->fetch_assoc(); $st->close();
        if (!$target) acc_fail(404, 'That account no longer exists');
    }
    if ($action === 'team_create') {
        $u = trim((string) ($in['username'] ?? ''));
        if (!preg_match('/^[A-Za-z0-9._-]{3,30}$/', $u)) acc_fail(400, 'Use 3 to 30 letters, numbers, dots, dashes or underscores for the username');
        $role = ($in['role'] ?? 'psmo') === 'admin' ? 'admin' : 'psmo';
        $perms = $role === 'psmo' ? implode(',', $cleanPerms($in['permissions'] ?? ['buildings'])) : null;
        if ($role === 'psmo' && $perms === '') acc_fail(400, 'Give this account at least one area to work in');
        $ex = $conn->prepare('SELECT 1 FROM admins WHERE username = ?'); $ex->bind_param('s', $u); $ex->execute();
        if ($ex->get_result()->fetch_row()) acc_fail(409, 'That username is already taken');
        $pw = $tempPassword(); $hash = password_hash($pw, PASSWORD_DEFAULT);
        $ins = $conn->prepare('INSERT INTO admins (username, password_hash, role, permissions) VALUES (?, ?, ?, ?)'); $ins->bind_param('ssss', $u, $hash, $role, $perms); $ins->execute();
        audit_log($conn, 'team_created', $u, $role . ($perms ? ': ' . $perms : ''));
        echo json_encode(['success' => true, 'username' => $u, 'password' => $pw]);
        exit;
    }
    $isMe = (int) $target['id'] === $id;
    if ($action === 'team_update') {
        $role = isset($in['role']) ? ($in['role'] === 'admin' ? 'admin' : 'psmo') : $target['role'];
        $disabled = isset($in['disabled']) ? ($in['disabled'] ? 1 : 0) : (int) $target['disabled'];
        if ($isMe && ($role !== 'admin' || $disabled)) acc_fail(400, 'You cannot lock yourself out. Ask another administrator to change your own account.');
        if ($target['role'] === 'admin' && ((int) $target['disabled'] === 0) && ($role !== 'admin' || $disabled) && $activeAdmins() <= 1) acc_fail(400, 'There must always be one active administrator');
        $perms = null;
        if ($role === 'psmo') { $perms = implode(',', $cleanPerms($in['permissions'] ?? [])); if ($perms === '') acc_fail(400, 'Give this account at least one area to work in'); }
        $up = $conn->prepare('UPDATE admins SET role = ?, permissions = ?, disabled = ? WHERE id = ?'); $up->bind_param('ssii', $role, $perms, $disabled, $target['id']); $up->execute();
        audit_log($conn, 'team_updated', $target['username'], $role . ($perms ? ': ' . $perms : '') . ($disabled ? ' (disabled)' : ''));
        echo json_encode(['success' => true]);
        exit;
    }
    if ($action === 'team_reset') {
        $pw = $tempPassword(); $hash = password_hash($pw, PASSWORD_DEFAULT);
        $up = $conn->prepare('UPDATE admins SET password_hash = ?, totp_secret = NULL WHERE id = ?'); $up->bind_param('si', $hash, $target['id']); $up->execute();
        audit_log($conn, 'team_password_reset', $target['username']);
        echo json_encode(['success' => true, 'password' => $pw]);
        exit;
    }
    if ($action === 'team_delete') {
        if ($isMe) acc_fail(400, 'You cannot delete your own account');
        if ($target['role'] === 'admin' && (int) $target['disabled'] === 0 && $activeAdmins() <= 1) acc_fail(400, 'There must always be one active administrator');
        $conn->query('DELETE FROM admins WHERE id = ' . (int) $target['id']);
        audit_log($conn, 'team_deleted', $target['username']);
        echo json_encode(['success' => true]);
        exit;
    }
}
acc_fail(400, 'Unknown action');
