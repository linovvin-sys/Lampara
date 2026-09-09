<?php

// POST /api/flags.php   -> "this seems outdated — report it" from the scan-result screen
//      body (JSON): { room_id, note }

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

$db = new Database();
$conn = $db->connect();

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true);
    $roomId = $input['room_id'] ?? null;
    $note = trim($input['note'] ?? '') ?: null;

    if (!$roomId) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'room_id is required']);
        exit;
    }

    $stmt = $conn->prepare("INSERT INTO outdated_flags (room_id, note) VALUES (?, ?)");
    $stmt->bind_param('is', $roomId, $note);

    if ($stmt->execute()) {
        echo json_encode(['success' => true, 'id' => $stmt->insert_id]);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => 'Insert failed']);
    }
    $stmt->close();
    exit;
}

http_response_code(405);
echo json_encode(['success' => false, 'error' => 'Method not allowed']);
