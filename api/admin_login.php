<?php

// POST /api/admin_login.php  body: { username, password }

header('Content-Type: application/json');

if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

require_once __DIR__ . '/../config.php';

$input = json_decode(file_get_contents('php://input'), true);
$username = trim($input['username'] ?? '');
$password = (string) ($input['password'] ?? '');

if ($username === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Username and password are required']);
    exit;
}

$db = new Database();
$conn = $db->connect();

$stmt = $conn->prepare("SELECT id, password_hash FROM admins WHERE username = ?");
$stmt->bind_param('s', $username);
$stmt->execute();
$result = $stmt->get_result();
$admin = $result->fetch_assoc();
$stmt->close();

// Same generic error either way — don't reveal whether the username exists.
if (!$admin || !password_verify($password, $admin['password_hash'])) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Incorrect username or password']);
    exit;
}

session_regenerate_id(true);
$_SESSION['admin_id'] = $admin['id'];
$_SESSION['admin_username'] = $username;

echo json_encode(['success' => true]);
