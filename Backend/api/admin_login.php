<?php

// POST /api/admin_login.php  body: { username, password, code? }
//   -> { success: true, role }            signed in
//   -> { success: false, need_code: true } the password was right and this account uses two-step sign-in: ask for the 6-digit code
//   -> { success: false, error, attempts_left? | retry_after? }
// Wrong passwords and wrong codes both count toward the lock (8 per username and address in 10 minutes). Everything is written to the
// audit log (see audit_log.php). Set ADMIN_ALERT_EMAIL in secrets.php to get an email when an account is locked.

header('Content-Type: application/json');

require_once __DIR__ . '/../session_boot.php';
lampara_session_start();
lampara_same_origin_or_die();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../rate_limit.php';
require_once __DIR__ . '/../admin_roles.php';
require_once __DIR__ . '/../audit_log.php';
require_once __DIR__ . '/../totp.php';

$input = json_decode(file_get_contents('php://input'), true);
$username = trim($input['username'] ?? '');
$password = (string) ($input['password'] ?? '');
$code = trim((string) ($input['code'] ?? ''));

if ($username === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Username and password are required']);
    exit;
}

$db = new Database();
$conn = $db->connect();

// Guessing protection: after 8 wrong attempts at one username from one address, wait 10 minutes. A looser cap on the address as a whole
// stops one machine trying many usernames, without a whole school Wi-Fi being locked out by a few typos.
$who = mb_strtolower($username);
if (count(rate_limit_recent('login_ip', 600)) >= 40) {
    audit_log($conn, 'login_blocked', $username, 'too many attempts from this address', $username);
    http_response_code(429); header('Retry-After: 600');
    echo json_encode(['success' => false, 'error' => 'Too many failed attempts.', 'retry_after' => 600]);
    exit;
}
$recent = rate_limit_recent('login', 600, $who);
if (count($recent) >= 8) {
    // The lock lifts when the oldest counted attempt ages out of the 10-minute window.
    $retry = max(1, min($recent) + 600 - time());
    audit_log($conn, 'login_blocked', $username, 'account is locked', $username);
    http_response_code(429);
    header('Retry-After: ' . $retry);
    echo json_encode(['success' => false, 'error' => 'Too many failed attempts.', 'retry_after' => $retry]);
    exit;
}

ensure_admin_role_column($conn);
$stmt = $conn->prepare("SELECT id, password_hash, role, disabled, totp_secret FROM admins WHERE username = ?");
$stmt->bind_param('s', $username);
$stmt->execute();
$admin = $stmt->get_result()->fetch_assoc();
$stmt->close();

function login_fail($conn, string $username, string $who, array $recent, string $why): void
{
    rate_limit_record('login', 600, $who);
    rate_limit_record('login_ip', 600);
    audit_log($conn, 'login_failed', $username, $why, $username);
    $left = 8 - (count($recent) + 1);
    if ($left <= 0) {      // this attempt locked the account: tell the owner if an address is set
        $secrets = __DIR__ . '/../secrets.php';
        if (is_file($secrets)) { try { require_once $secrets; } catch (Throwable $e) { /* no address */ } }
        if (defined('ADMIN_ALERT_EMAIL') && ADMIN_ALERT_EMAIL) @mail(ADMIN_ALERT_EMAIL, 'Lampara: sign-in locked for ' . $username, "Eight wrong sign-in attempts at '$username' from " . ($_SERVER['REMOTE_ADDR'] ?? 'an unknown address') . ". The account is locked for 10 minutes. Check the audit log on the Account page.");
    }
    http_response_code(401);
    // Same generic error whatever went wrong: do not reveal whether the username exists, is disabled, or which part was wrong.
    echo json_encode(['success' => false, 'error' => 'Incorrect username or password', 'attempts_left' => max(0, $left)]);
    exit;
}

if (!$admin || (int) $admin['disabled'] === 1 || !password_verify($password, $admin['password_hash'])) {
    login_fail($conn, $username, $who, $recent, !$admin ? 'unknown username' : ((int) $admin['disabled'] === 1 ? 'account disabled' : 'wrong password'));
}

// Two-step sign-in, when the account has it switched on.
if (!empty($admin['totp_secret'])) {
    if ($code === '') {
        echo json_encode(['success' => false, 'need_code' => true]);
        exit;
    }
    if (!totp_verify($admin['totp_secret'], $code)) login_fail($conn, $username, $who, $recent, 'wrong two-step code');
}

rate_limit_clear('login', $who);
session_regenerate_id(true);
$_SESSION['admin_id'] = $admin['id'];
$_SESSION['admin_username'] = $username;
$_SESSION['admin_role'] = $admin['role'] === 'psmo' ? 'psmo' : 'admin';
$_SESSION['admin_seen'] = time();
unset($_SESSION['admin_perms_at']);   // read this account's areas fresh
audit_log($conn, 'login_ok', $username, !empty($admin['totp_secret']) ? 'with two-step code' : '');

echo json_encode(['success' => true, 'role' => $_SESSION['admin_role']]);
