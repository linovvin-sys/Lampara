<?php

// Move a whole school's directory between installs, and load rooms from a spreadsheet. Administrators only (not PSMO).
//   GET  ?action=export        -> the data pack (a zip) as a download
//   POST ?action=preview       multipart field "pack"  -> what is in the pack, what is wrong with it, and what an import would remove
//   POST ?action=import        multipart "pack" + "confirm=REPLACE"  -> replaces the school's content with the pack (one transaction)
//   POST ?action=csv-preview   multipart "csv" -> which rows would be added, and the problem with each row that would not
//   POST ?action=csv-import    multipart "csv" -> adds the valid rows (invalid rows are skipped)
// Before a replace, the current content is written to backups/pre-import-<time>.zip (that folder is not reachable from the web).

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/_require_admin.php';
require_once __DIR__ . '/../rate_limit.php';
require_once __DIR__ . '/../audit_log.php';
require_once __DIR__ . '/../data_pack.php';

$conn = (new Database())->connect();
$action = $_GET['action'] ?? '';

function dp_fail(int $code, string $msg, array $extra = []): void
{
    http_response_code($code);
    header('Content-Type: application/json');
    echo json_encode(['success' => false, 'error' => $msg] + $extra);
    exit;
}

if (lampara_admin_role() === 'psmo') dp_fail(403, 'Only an administrator can use data packs.');
rate_limit_or_die('data_pack', 20, 300, 'Too many data pack requests. Wait a few minutes.');

// The uploaded file from a multipart field, or a failure.
function dp_upload(string $field): string
{
    $f = $_FILES[$field] ?? null;
    if (!$f || $f['error'] === UPLOAD_ERR_NO_FILE) dp_fail(400, 'Choose a file first.');
    if ($f['error'] === UPLOAD_ERR_INI_SIZE || $f['error'] === UPLOAD_ERR_FORM_SIZE) dp_fail(413, 'That file is bigger than this server accepts (upload_max_filesize ' . ini_get('upload_max_filesize') . ').');
    if ($f['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($f['tmp_name'])) dp_fail(400, 'The upload did not finish. Try again.');
    if ($f['size'] > DATA_PACK_MAX_BYTES) dp_fail(413, 'That file is larger than 25 MB.');
    return $f['tmp_name'];
}

if ($action === 'export') {
    if ($_SERVER['REQUEST_METHOD'] !== 'GET') dp_fail(405, 'Use GET.');
    if (!class_exists('ZipArchive')) dp_fail(500, 'This server cannot make zip files (the PHP zip extension is off).');
    $tmp = tempnam(sys_get_temp_dir(), 'lpk');
    if (!data_pack_zip(data_pack_collect($conn), $tmp)) { @unlink($tmp); dp_fail(500, 'Could not build the data pack.'); }
    audit_log($conn, 'data_pack_export', 'zip', filesize($tmp) . ' bytes');
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="lampara-pack-' . date('Ymd-Hi') . '.zip"');
    header('Content-Length: ' . filesize($tmp));
    header('Cache-Control: no-store');
    readfile($tmp);
    @unlink($tmp);
    exit;
}

header('Content-Type: application/json');
header('Cache-Control: no-store');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') dp_fail(405, 'Use POST.');

if ($action === 'preview' || $action === 'import') {
    $pack = data_pack_read(dp_upload('pack'));
    if (is_string($pack)) dp_fail(400, $pack);
    $problems = data_pack_check($pack);
    $counts = data_pack_counts($pack['data']);
    $now = data_pack_current_counts($conn);
    if ($action === 'preview') {
        $warn = [];
        if ($now['qr_anchors'] > 0) $warn[] = $now['qr_anchors'] . ' QR anchor(s) on current path points will be removed.';
        if ($now['reports_on_rooms'] > 0) $warn[] = $now['reports_on_rooms'] . ' outdated-info report(s) on current rooms will be removed.';
        $warn[] = 'Building and room photos are not part of a pack: the photos on the current rooms and buildings will no longer be linked.';
        echo json_encode(['success' => true, 'importable' => !$problems, 'problems' => $problems, 'pack' => $counts, 'current' => $now, 'warnings' => $warn, 'exported_at' => $pack['data']['exported_at'] ?? null]);
        exit;
    }
    // import
    if (($_POST['confirm'] ?? '') !== 'REPLACE') dp_fail(400, 'Type REPLACE to confirm. This removes the current buildings, rooms and paths.');
    if ($problems) dp_fail(400, 'The pack has problems, so nothing was changed.', ['problems' => $problems]);
    // a safety copy of what is there now
    $dir = dirname(__DIR__, 2) . '/backups';
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    $snap = $dir . '/pre-import-' . date('Ymd-His') . '.zip';
    if (!data_pack_zip(data_pack_collect($conn), $snap)) dp_fail(500, 'Could not save a safety copy first, so nothing was changed.');
    try {
        $done = data_pack_import($conn, $pack);
    } catch (Throwable $e) {
        error_log('Lampara data pack import failed: ' . $e->getMessage());
        dp_fail(500, 'The import failed and nothing was changed: ' . $e->getMessage());
    }
    audit_log($conn, 'data_pack_import', 'replace', $done['buildings'] . ' buildings, ' . $done['rooms'] . ' rooms');
    echo json_encode(['success' => true, 'imported' => $done, 'safety_copy' => basename($snap)]);
    exit;
}

if ($action === 'csv-preview' || $action === 'csv-import') {
    $text = file_get_contents(dp_upload('csv'));
    if (!mb_check_encoding($text, 'UTF-8')) $text = mb_convert_encoding($text, 'UTF-8', 'Windows-1252');
    [$rows, $fileProblems] = data_pack_csv_rows($text);
    if ($fileProblems) dp_fail(400, $fileProblems[0]);
    $check = data_pack_csv_check($conn, $rows);
    if ($action === 'csv-preview') {
        echo json_encode(['success' => true, 'rows' => count($rows), 'valid' => count($check['valid']), 'problems' => array_slice($check['problems'], 0, 200),
            'sample' => array_map(fn($v) => ['line' => $v['line'], 'room_number' => $v['room_number'], 'room_name' => $v['room_name'], 'floor' => $v['floor'], 'category' => $v['category']], array_slice($check['valid'], 0, 8))]);
        exit;
    }
    if (!$check['valid']) dp_fail(400, 'No valid rows to add.', ['problems' => array_slice($check['problems'], 0, 200)]);
    try { $n = data_pack_csv_import($conn, $check['valid']); }
    catch (Throwable $e) { error_log('Lampara CSV import failed: ' . $e->getMessage()); dp_fail(500, 'The import failed and nothing was added: ' . $e->getMessage()); }
    audit_log($conn, 'csv_rooms_import', 'rooms', $n . ' added, ' . count($check['problems']) . ' skipped');
    echo json_encode(['success' => true, 'added' => $n, 'skipped' => count($check['problems'])]);
    exit;
}

dp_fail(400, 'Unknown action.');
