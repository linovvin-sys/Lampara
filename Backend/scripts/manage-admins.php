<?php

// Staff accounts, from the server's command line (never from a web page).
//   php Backend/scripts/manage-admins.php list
//   php Backend/scripts/manage-admins.php disable <username>      cannot sign in any more (nothing is deleted)
//   php Backend/scripts/manage-admins.php enable <username>
//   php Backend/scripts/manage-admins.php role <username> admin|psmo
//   php Backend/scripts/manage-admins.php reset-2fa <username>    for someone who lost their phone
//   php Backend/scripts/manage-admins.php delete <username>
// New accounts and password resets: Backend/scripts/create-admin.php

if (PHP_SAPI !== 'cli') { http_response_code(403); exit("Run this from the command line.\n"); }

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../admin_roles.php';
require_once __DIR__ . '/../audit_log.php';

$conn = (new Database())->connect();
ensure_admin_role_column($conn);
[$self, $cmd, $user, $arg] = array_pad($argv, 4, null);

function say(string $m): void { fwrite(STDOUT, $m . "\n"); }
function need($conn, ?string $user): void
{
    if (!$user) exit("Say which username.\n");
    $s = $conn->prepare('SELECT 1 FROM admins WHERE username = ?'); $s->bind_param('s', $user); $s->execute();
    if (!$s->get_result()->fetch_row()) exit("No account named '$user'.\n");
}

switch ($cmd) {
    case 'list':
        $r = $conn->query('SELECT username, role, disabled, totp_secret IS NOT NULL AS two_step, created_at FROM admins ORDER BY id');
        printf("%-24s %-6s %-9s %-9s %s\n", 'USERNAME', 'ROLE', 'STATUS', 'TWO-STEP', 'CREATED');
        while ($x = $r->fetch_assoc()) printf("%-24s %-6s %-9s %-9s %s\n", $x['username'], $x['role'], $x['disabled'] ? 'disabled' : 'active', $x['two_step'] ? 'on' : 'off', $x['created_at']);
        break;
    case 'disable': case 'enable':
        need($conn, $user);
        $d = $cmd === 'disable' ? 1 : 0;
        $s = $conn->prepare('UPDATE admins SET disabled = ? WHERE username = ?'); $s->bind_param('is', $d, $user); $s->execute();
        audit_log($conn, 'account_' . $cmd . 'd', $user, '', 'cli');
        say("$user: $cmd" . 'd.');
        break;
    case 'role':
        need($conn, $user);
        if (!in_array($arg, ['admin', 'psmo'], true)) exit("Role must be admin or psmo.\n");
        $s = $conn->prepare('UPDATE admins SET role = ? WHERE username = ?'); $s->bind_param('ss', $arg, $user); $s->execute();
        audit_log($conn, 'account_role', $user, $arg, 'cli');
        say("$user is now $arg. They must sign in again.");
        break;
    case 'reset-2fa':
        need($conn, $user);
        $s = $conn->prepare('UPDATE admins SET totp_secret = NULL WHERE username = ?'); $s->bind_param('s', $user); $s->execute();
        audit_log($conn, 'two_step_reset', $user, '', 'cli');
        say("$user: two-step sign-in is off. They can switch it on again on the Account page.");
        break;
    case 'delete':
        need($conn, $user);
        $s = $conn->prepare('DELETE FROM admins WHERE username = ?'); $s->bind_param('s', $user); $s->execute();
        audit_log($conn, 'account_deleted', $user, '', 'cli');
        say("$user: deleted.");
        break;
    default:
        say("Usage: php manage-admins.php list | disable <user> | enable <user> | role <user> admin|psmo | reset-2fa <user> | delete <user>");
}
