<?php

// Who did what, and when, for the things that matter for security: sign-ins (good, bad, locked), sign-outs, password and
// two-step changes, account changes, and what staff did with visitor reports. Room and building edits have their own history
// (change_log.php). Kept 180 days. Never put a password or a code in $detail.

function audit_log($conn, string $action, string $target = '', string $detail = '', ?string $actor = null): void
{
    try {
        $conn->query("CREATE TABLE IF NOT EXISTS audit_log (
            id INT AUTO_INCREMENT PRIMARY KEY,
            at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            actor VARCHAR(60) NULL,
            role VARCHAR(10) NULL,
            action VARCHAR(40) NOT NULL,
            target VARCHAR(120) NULL,
            detail VARCHAR(255) NULL,
            ip VARCHAR(45) NULL,
            KEY idx_at (at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $actor = $actor ?? ($_SESSION['admin_username'] ?? null);
        $role = $_SESSION['admin_role'] ?? null;
        $ip = PHP_SAPI === 'cli' ? 'cli' : substr(function_exists('client_ip') ? client_ip() : (string) ($_SERVER['REMOTE_ADDR'] ?? ''), 0, 45);
        $target = mb_substr($target, 0, 120); $detail = mb_substr($detail, 0, 255);
        $stmt = $conn->prepare('INSERT INTO audit_log (actor, role, action, target, detail, ip) VALUES (?, ?, ?, ?, ?, ?)');
        $stmt->bind_param('ssssss', $actor, $role, $action, $target, $detail, $ip);
        $stmt->execute();
        $stmt->close();
        if (random_int(1, 50) === 1) $conn->query('DELETE FROM audit_log WHERE at < NOW() - INTERVAL 180 DAY');
    } catch (Throwable $e) { /* the log must never break what it is logging */ }
}
