<?php

// The school's settings (see Backend/institution.php).
// GET  /api/institution.php              -> { success, institution }   what the browser needs (public)
// GET  /api/institution.php?format=js    -> window.LAMPARA_CONFIG = {...};   for a <script src> in the page head (public)
// GET  /api/institution.php?format=full  -> every setting, for the admin Settings page (admin)
// POST /api/institution.php              -> body (JSON) with any of the settings; saves them (admin only, not PSMO)
// POST /api/institution.php?action=logo  -> body (JSON) { logo: "data:image/png;base64,..." | null }   (admin only)

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../institution.php';
require_once __DIR__ . '/../session_boot.php';

lampara_session_start();
$conn = (new Database())->connect();
$method = $_SERVER['REQUEST_METHOD'];
$format = $_GET['format'] ?? '';

if ($method === 'GET') {
    if ($format === 'js') {
        header('Content-Type: application/javascript; charset=utf-8');
        header('Cache-Control: no-cache');
        echo institution_js();
        exit;
    }
    header('Content-Type: application/json');
    if ($format === 'full') {
        require_once __DIR__ . '/_require_admin.php';
        header('Cache-Control: no-store');
        echo json_encode(['success' => true, 'institution' => institution_get($conn)]);
        exit;
    }
    header('Cache-Control: no-cache');
    echo json_encode(['success' => true, 'institution' => institution_public()]);
    exit;
}

header('Content-Type: application/json');
header('Cache-Control: no-store');
if ($method !== 'POST') { http_response_code(405); echo json_encode(['success' => false, 'error' => 'Method not allowed']); exit; }

require_once __DIR__ . '/_require_admin.php';
if (function_exists('lampara_admin_role') && lampara_admin_role() === 'psmo') {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Only an administrator can change the school settings.']);
    exit;
}
require_once __DIR__ . '/../audit_log.php';

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) { http_response_code(400); echo json_encode(['success' => false, 'error' => 'Bad request']); exit; }

if (($_GET['action'] ?? '') === 'logo') {
    require_once __DIR__ . '/../photo_upload.php';
    $old = institution_get($conn)['logo_path'];
    $new = null;
    if (!empty($in['logo'])) $new = photoSave('institution', 1, $in['logo']); // refuses anything that is not a real JPEG, PNG or WebP
    institution_set_logo($conn, $new);
    if ($old) photoDelete($old);
    audit_log($conn, 'institution_saved', 'logo', $new ? 'set' : 'removed');
    echo json_encode(['success' => true, 'logo' => $new]);
    exit;
}

$errors = institution_save($conn, $in);
if ($errors) { http_response_code(400); echo json_encode(['success' => false, 'error' => implode('. ', $errors) . '.']); exit; }
audit_log($conn, 'institution_saved', 'settings', implode(',', array_keys($in)));
echo json_encode(['success' => true, 'institution' => institution_get($conn)]);
