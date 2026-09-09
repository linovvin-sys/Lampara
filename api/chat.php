<?php

// POST /api/chat.php
// body: { building_id, message }
//
// Retrieval-grounded chat: the AI answers ONLY from the building's directory
// notes and each registered room's structured facts. It's explicitly told to
// refuse ("I don't have that information") rather than guess, and to refuse
// anything off-topic (not about this building/campus).

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

$secretsPath = __DIR__ . '/../secrets.php';
if (!file_exists($secretsPath)) {
    echo json_encode(['success' => false, 'reply' => "(setup needed) Copy secrets.example.php to secrets.php and add your Gemini key — see the Lampara README."]);
    exit;
}
require_once $secretsPath;

$input = json_decode(file_get_contents('php://input'), true);
$buildingId = $input['building_id'] ?? null;
$message = trim($input['message'] ?? '');

if (!$buildingId || $message === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'building_id and message are required']);
    exit;
}

$db = new Database();
$conn = $db->connect();

$stmt = $conn->prepare("SELECT name, directory FROM buildings WHERE id = ?");
$stmt->bind_param('i', $buildingId);
$stmt->execute();
$building = $stmt->get_result()->fetch_assoc();
$stmt->close();

if (!$building) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Building not found']);
    exit;
}

// Pull the structured room facts for this building — this is the real
// grounding data, not the old free-text blob alone.
$stmt = $conn->prepare("SELECT room_number, room_name, floor, room_type, hours, notes FROM rooms WHERE building_id = ? ORDER BY floor, room_number");
$stmt->bind_param('i', $buildingId);
$stmt->execute();
$result = $stmt->get_result();
$roomLines = [];
while ($r = $result->fetch_assoc()) {
    $line = "Room {$r['room_number']} — {$r['room_name']}, {$r['floor']}";
    if ($r['room_type'] === 'office') {
        $line .= $r['hours'] ? ", hours: {$r['hours']}" : ", hours not set";
    } else {
        $line .= " (classroom/lab — no fixed hours)";
    }
    if ($r['notes']) $line .= " — note: {$r['notes']}";
    $roomLines[] = $line;
}
$stmt->close();

$groundingFacts = trim(
    ($building['directory'] ? $building['directory'] . "\n\n" : '') .
    "Rooms in this building:\n" . implode("\n", $roomLines)
);

if (!defined('GEMINI_API_KEY') || GEMINI_API_KEY === 'PASTE_YOUR_KEY_HERE') {
    echo json_encode(['success' => true, 'reply' => "(setup needed) Add your real Gemini key to lampara/secrets.php — see the README."]);
    exit;
}

$prompt = <<<PROMPT
You are Lampara, a campus guide assistant for {$building['name']}. Answer ONLY using
the facts below. If the answer isn't in these facts, say exactly: "I don't have that
information — you may want to confirm with the office directly." Never guess or
invent details. Also refuse (politely) anything not about this building or campus
navigation, even if you personally know the answer — stay strictly on topic.

FACTS:
{$groundingFacts}

QUESTION: {$message}
PROMPT;

$url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' . GEMINI_API_KEY;
$payload = json_encode([
    'contents' => [['parts' => [['text' => $prompt]]]],
    'generationConfig' => ['temperature' => 0.2, 'maxOutputTokens' => 300],
]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 15,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError || $httpCode !== 200) {
    echo json_encode(['success' => false, 'reply' => "Couldn't reach the AI service right now — try again in a moment. (" . ($curlError ?: "HTTP $httpCode") . ")"]);
    exit;
}

$data = json_decode($response, true);
$reply = $data['candidates'][0]['content']['parts'][0]['text'] ?? "I don't have that information — you may want to confirm with the office directly.";

echo json_encode(['success' => true, 'reply' => trim($reply)]);
