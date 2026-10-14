<?php

// Run this from your terminal (NOT a browser) to create/reset your own admin
// login. Nobody but you sees what you type — it's never sent anywhere but your
// own database, hashed before it's stored.
//
//   cd path/to/lampara
//   php create-admin.php
//
// (MAMP on macOS: use /Applications/MAMP/bin/php/<version>/bin/php instead of
// plain `php` if it's not on your PATH. XAMPP on Windows: use the php.exe
// inside your XAMPP install folder, e.g. C:\xampp\php\php.exe create-admin.php)

if (php_sapi_name() !== 'cli') {
    die("Run this from the command line, not a browser: php create-admin.php\n");
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../admin_roles.php';
require_once __DIR__ . '/../audit_log.php';

fwrite(STDOUT, "Username: ");
$username = trim(fgets(STDIN));
fwrite(STDOUT, "Role (admin = everything, psmo = manages buildings and rooms only) [admin]: ");
$role = strtolower(trim(fgets(STDIN)));
if ($role === '') $role = 'admin';
if (!in_array($role, ['admin', 'psmo'], true)) die("Role must be admin or psmo.\n");

fwrite(STDOUT, "Password (at least 10 characters): ");
system('stty -echo'); // hide input while typing, like a real login prompt
$password = trim(fgets(STDIN));
system('stty echo');
fwrite(STDOUT, "\n");

if ($username === '' || $password === '') {
    die("Both username and password are required.\n");
}
if (strlen($password) < 10) {
    die("Password must be at least 10 characters.\n");
}
if (strcasecmp($password, $username) === 0 || preg_match('/^(password|12345678|qwertyuiop|lampara|ncst)/i', $password)) {
    die("Choose a password that is not the username or an obvious word.\n");
}

$db = new Database();
$conn = $db->connect();

$hash = password_hash($password, PASSWORD_DEFAULT);

ensure_admin_role_column($conn);
$stmt = $conn->prepare("INSERT INTO admins (username, password_hash, role) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = VALUES(role)");
$stmt->bind_param('sss', $username, $hash, $role);

if ($stmt->execute()) {
    audit_log($conn, 'account_saved', $username, 'role ' . $role, 'cli');
    echo "Account ready for '$username' (role: $role). You can log in at Frontend/View/Admin/login.php now.\n";
} else {
    echo "Failed: " . $stmt->error . "\n";
}
$stmt->close();
