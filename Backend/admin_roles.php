<?php

// Extra account columns, added the first time they are needed (safe to call every time):
//   role         'admin' (everything) or 'psmo' (manages buildings and rooms)
//   disabled     1 = this account cannot sign in
//   totp_secret  set = signing in also needs a 6-digit code from an authenticator app (two-step login)
function ensure_admin_role_column($conn): bool
{
    static $ok = null;
    if ($ok !== null) return $ok;
    $have = [];
    $r = $conn->query('SHOW COLUMNS FROM admins');
    while ($c = $r->fetch_assoc()) $have[$c['Field']] = true;
    $want = [
        'role' => "VARCHAR(10) NOT NULL DEFAULT 'admin'",
        'disabled' => 'TINYINT(1) NOT NULL DEFAULT 0',
        'totp_secret' => 'VARCHAR(64) NULL',
    ];
    $ok = true;
    foreach ($want as $col => $def) {
        if (!empty($have[$col])) continue;
        try { $conn->query("ALTER TABLE admins ADD COLUMN $col $def"); } catch (Throwable $e) { $ok = false; }
    }
    return $ok;
}
