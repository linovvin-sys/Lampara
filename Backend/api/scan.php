<?php

// POST /api/scan.php
// body: { image: "data:image/jpeg;base64,...." }
//
// Reads a room number off a photographed door/wall sign using Gemini's
// vision input — the same model/key already powering the chat feature, just
// given an image part instead of only text.

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$secretsPath = __DIR__ . '/../secrets.php';
if (!file_exists($secretsPath)) {
    echo json_encode(['success' => false, 'error' => "(setup needed) Copy Backend/secrets.example.php to Backend/secrets.php and add your Gemini key."]);
    exit;
}
require_once $secretsPath;

if (!defined('GEMINI_API_KEY') || GEMINI_API_KEY === 'PASTE_YOUR_KEY_HERE') {
    echo json_encode(['success' => false, 'error' => "(setup needed) Add your real Gemini key to lampara/Backend/secrets.php."]);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);
$imageDataUrl = $input['image'] ?? '';

if (!preg_match('/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/', $imageDataUrl, $matches)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'A valid base64 image is required']);
    exit;
}
$mimeType = 'image/' . $matches[1];
$base64Data = $matches[2];

$prompt = <<<PROMPT
This is a photo of a door or wall sign in a school building, meant to show a
room number. Read ONLY the room number/code shown on the sign (e.g. "204",
"1201", "A-105"). Respond with ONLY that room number, nothing else — no
punctuation, no extra words. If there is no clearly readable room number
visible in the photo, respond with exactly: NONE
PROMPT;

$url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=' . GEMINI_API_KEY;
$payload = json_encode([
    'contents' => [[
        'role' => 'user',
        'parts' => [
            ['text' => $prompt],
            ['inline_data' => ['mime_type' => $mimeType, 'data' => $base64Data]],
        ],
    ]],
    'generationConfig' => ['temperature' => 0, 'maxOutputTokens' => 500],
]);

$ch = curl_init($url);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 20,
]);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlError = curl_error($ch);
curl_close($ch);

if ($curlError || $httpCode !== 200) {
    echo json_encode(['success' => false, 'error' => "Couldn't reach the AI service right now — try again in a moment. (" . ($curlError ?: "HTTP $httpCode") . ")"]);
    exit;
}

$data = json_decode($response, true);
$text = trim($data['candidates'][0]['content']['parts'][0]['text'] ?? 'NONE');

// Strip anything not part of a plausible room code — the model is instructed
// to reply with just the number, but keep this as a safety net against stray
// punctuation/whitespace before it's used to look up a room.
$roomNumber = trim($text, " \t\n\r\0\x0B.,:;\"'");

if ($roomNumber === '' || strtoupper($roomNumber) === 'NONE') {
    echo json_encode(['success' => true, 'room_number' => null]);
    exit;
}

echo json_encode(['success' => true, 'room_number' => $roomNumber]);
