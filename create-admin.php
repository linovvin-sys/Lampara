<?php

// Run this from your terminal (NOT a browser) to create/reset your own admin
// login. Nobody but you sees what you type — it's never sent anywhere but your
// own database, hashed before it's stored.
//
//   cd /Applications/MAMP/htdocs/lampara
//   /Applications/MAMP/bin/php/php8.3.30/bin/php create-admin.php

if (php_sapi_name() !== 'cli') {
    die("Run this from the command line, not a browser: php create-admin.php\n");
}

require_once __DIR__ . '/config.php';

fwrite(STDOUT, "Admin username: ");
$username = trim(fgets(STDIN));

fwrite(STDOUT, "Admin password: ");
system('stty -echo'); // hide input while typing, like a real login prompt
$password = trim(fgets(STDIN));
system('stty echo');
fwrite(STDOUT, "\n");

if ($username === '' || $password === '') {
    die("Both username and password are required.\n");
}
if (strlen($password) < 8) {
    die("Password must be at least 8 characters.\n");
}

$db = new Database();
$conn = $db->connect();

$hash = password_hash($password, PASSWORD_DEFAULT);

$stmt = $conn->prepare("INSERT INTO admins (username, password_hash) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)");
$stmt->bind_param('ss', $username, $hash);

if ($stmt->execute()) {
    echo "Admin account ready for '$username'. You can log in at admin/login.php now.\n";
} else {
    echo "Failed: " . $stmt->error . "\n";
}
$stmt->close();
