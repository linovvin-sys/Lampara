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
$history = is_array($input['history'] ?? null) ? $input['history'] : [];

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

$systemPrompt = <<<PROMPT
You are Lampara, a warm and knowledgeable campus guide assistant for {$building['name']}.
Answer ONLY using the facts below — never guess or invent anything not stated there.
If the answer isn't in these facts, say exactly: "I don't have that information —
you may want to confirm with the office directly." Also refuse (politely) anything
not about this building or campus navigation, even if you personally know the
answer — stay strictly on topic.

Within those limits, be genuinely helpful and complete, not just minimal. The facts
below may be either a structured list of specific rooms, or plain descriptive text
about the building in general (or both) — either is a completely valid, fully
answerable source. Summarizing or paraphrasing what the facts say is NOT guessing;
only stating something the facts never mention at all counts as guessing.
- If specific details are present (room numbers, hours, floor, notes), mention all
  relevant ones together in one answer rather than making the student ask separately,
  and wrap them in **bold** so they stand out.
- When listing 2 or more items (multiple rooms, multiple facts), use an actual
  markdown bullet list — each item on its own line starting with "- " — instead
  of cramming them into one long comma-separated sentence. Lists are far easier
  for a student to scan than a run-on sentence.
- If the facts are general/descriptive rather than room-by-room, just answer in
  your own words using that description — don't refuse just because there's no
  room number to cite.
- If the question is about one room but a nearby/related room is clearly useful
  context (e.g. they asked for the Registrar and the Treasury is on the same
  floor), you may mention it briefly — but only using facts actually listed below.
- Keep it conversational and concise — a helpful answer, not a wall of text or
  padded filler sentences.
- The conversation may reference earlier turns (e.g. "where is it near") — use
  that history to understand what the student means, still grounded only in
  the facts below.
- If asked how many rooms there are, to list all the rooms, or whether that's
  "all" of them — you CAN answer this directly by counting/listing what's in
  the room list below; that is not guessing, it's reading the list you were
  given. Just add a brief honest note that this reflects what's been
  registered so far, not necessarily every room that physically exists.

FACTS:
{$groundingFacts}
PROMPT;

// Conversation history lets the model resolve things like "where is it near"
// referring to a building/room mentioned a turn or two earlier — without it,
// every question was answered with zero memory of what was just discussed.
$contents = [];
$recentHistory = array_slice($history, -12);
foreach ($recentHistory as $turn) {
    $text = trim($turn['text'] ?? '');
    if ($text === '') continue;
    $role = ($turn['role'] ?? '') === 'user' ? 'user' : 'model';
    $contents[] = ['role' => $role, 'parts' => [['text' => $text]]];
}
$contents[] = ['role' => 'user', 'parts' => [['text' => $message]]];

// flash-lite: much higher free-tier daily quota than the full flash model
// (which caps at just 20 requests/day free) — and the "-latest" alias tracks
// Google's newest Lite model automatically instead of pinning a version that
// eventually gets retired (like gemini-2.0-flash did).
$url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=' . GEMINI_API_KEY;
$payload = json_encode([
    'systemInstruction' => ['parts' => [['text' => $systemPrompt]]],
    'contents' => $contents,
    // This model spends some of maxOutputTokens on internal reasoning before
    // writing the visible reply — budget generously so a short grounded
    // answer doesn't get cut off before it's actually written.
    'generationConfig' => ['temperature' => 0.2, 'maxOutputTokens' => 1024],
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
