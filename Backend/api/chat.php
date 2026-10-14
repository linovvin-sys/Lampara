<?php

// POST /api/chat.php
// body: { message, building_id?, history? }
//   building_id given -> the bot focuses on that building (the walking guide's "Ask Lampara")
//   building_id left out -> the bot knows the whole campus (the Ask page)
// -> { success, reply, rooms:[...], buildings:[...], gates:[...], followups:[...], source }
//
// Retrieval-grounded chat: the AI answers ONLY from the registered buildings, rooms, gates and current visitor reports
// (see chat_lib.php for exactly what it is given and told). It answers in JSON with the IDs of the rooms it used; the server keeps
// only IDs that exist, so the app can show real room cards. Repeated questions are answered from a short-lived cache.

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

$secretsPath = __DIR__ . '/../secrets.php';
if (!file_exists($secretsPath)) {
    echo json_encode(['success' => false, 'reply' => "(setup needed) Copy Backend/secrets.example.php to Backend/secrets.php and add your Gemini key — see the Lampara README."]);
    exit;
}
require_once $secretsPath;
require_once __DIR__ . '/../rate_limit.php';
require_once __DIR__ . '/../chat_lib.php';
rate_limit_or_die('chat', 90, 60);   // per visitor per minute; keeps the Gemini bill bounded

$input = json_decode(file_get_contents('php://input'), true);
$input = is_array($input) ? $input : [];
$buildingId = isset($input['building_id']) && $input['building_id'] !== '' && $input['building_id'] !== null ? (int) $input['building_id'] : null;
$message = chat_clean((string) ($input['message'] ?? ''), 500);
$history = chat_history(is_array($input['history'] ?? null) ? $input['history'] : []);

if ($message === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'message is required']);
    exit;
}

$db = new Database();
$conn = $db->connect();

$g = chat_grounding($conn, $buildingId);
if ($g['text'] === '') {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Building not found']);
    exit;
}

if (!defined('GEMINI_API_KEY') || in_array(GEMINI_API_KEY, ['PASTE_YOUR_KEY_HERE', 'paste-your-real-key-here', ''], true)) {
    echo json_encode(['success' => true, 'reply' => "(setup needed) Add your real Gemini key to lampara/Backend/secrets.php — see the README."]);
    exit;
}

// A first question that was asked recently (and the facts have not changed since) is answered from the cache: faster, and it keeps
// the free daily quota for new questions. Follow-up questions depend on the conversation, so they always go to the model.
$cacheFile = null;
if (!$history) {
    $dir = sys_get_temp_dir() . '/lampara-chat';
    $key = sha1('v2|' . ($buildingId ?? 'campus') . '|' . sha1($g['text']) . '|' . mb_strtolower(preg_replace('/\s+/', ' ', $message)));
    $cacheFile = $dir . '/' . $key . '.json';
    if (is_file($cacheFile) && time() - filemtime($cacheFile) < 900) {
        $cached = json_decode((string) file_get_contents($cacheFile), true);
        if (is_array($cached)) { echo json_encode(['success' => true, 'source' => 'cache'] + $cached); exit; }
    }
}

$contents = [];
foreach ($history as $turn) $contents[] = ['role' => $turn['role'], 'parts' => [['text' => $turn['text']]]];
$contents[] = ['role' => 'user', 'parts' => [['text' => $message]]];

// Models are tried in order until one answers: the "-latest" aliases stop answering when Google rotates models (the old alias hung
// forever here), so name real versions. Set GEMINI_MODEL in secrets.php to put your own first. 3.5 Flash answered fastest when
// this was tested; the Lite model is the backup (and a good first choice if the free daily quota runs short).
$models = array_values(array_unique(array_filter([defined('GEMINI_MODEL') ? GEMINI_MODEL : null, 'gemini-3.5-flash', 'gemini-3.1-flash-lite'])));
$base = [
    'systemInstruction' => ['parts' => [['text' => chat_system_prompt($g)]]],
    'contents' => $contents,
    // Room for the model's own thinking plus the answer, so a grounded reply is never cut off. Low temperature = stick to the facts;
    // low thinking = quick answers for simple lookups.
    'generationConfig' => ['temperature' => 0.2, 'maxOutputTokens' => 3000, 'responseMimeType' => 'application/json',
        'responseSchema' => chat_response_schema(), 'thinkingConfig' => ['thinkingLevel' => 'low']],
];
$response = null; $httpCode = 0; $curlError = '';
foreach ($models as $i => $model) {
    $url = 'https://generativelanguage.googleapis.com/v1beta/models/' . $model . ':generateContent?key=' . GEMINI_API_KEY;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_POST => true, CURLOPT_POSTFIELDS => json_encode($base), CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 5, CURLOPT_TIMEOUT => 25,
    ]);
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError = curl_error($ch);
    curl_close($ch);
    if (!$curlError && $httpCode === 200) break;
}

if ($curlError || $httpCode !== 200) {
    // 'fallback' tells the app to answer from the directory on the phone instead
    echo json_encode(['success' => false, 'fallback' => true, 'reply' => "I couldn't reach the AI service just now."]);
    exit;
}

$data = json_decode($response, true);
$raw = (string) ($data['candidates'][0]['content']['parts'][0]['text'] ?? '');
$out = chat_finish($raw, $g);

if ($cacheFile && $raw !== '') {
    if (!is_dir(dirname($cacheFile))) @mkdir(dirname($cacheFile), 0700, true);
    @file_put_contents($cacheFile, json_encode($out), LOCK_EX);
}
echo json_encode(['success' => true, 'source' => 'ai'] + $out);
