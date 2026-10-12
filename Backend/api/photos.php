<?php

// POST   /api/photos.php?entity=building|room&id=1   -> set or replace that record's photo (admin)
//        body (JSON): { image: "data:image/jpeg;base64,..." }
// DELETE /api/photos.php?entity=building|room&id=1   -> remove it (admin)
//
// The browser resizes and crops the picture before it is sent (see Js/Include/photo-upload.js). Checking the real
// bytes, saving the file and deleting the one it replaces is the shared photo_upload.php, the same code the
// PUT { photo } path of buildings.php and rooms.php uses, so there is a single set of rules for photos.

header('Content-Type: application/json');
header('Cache-Control: no-store');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../photo_upload.php';
require_once __DIR__ . '/../photo_support.php';
require_once __DIR__ . '/_require_admin.php';

$method = $_SERVER['REQUEST_METHOD'];
if (!in_array($method, ['POST', 'DELETE'], true)) photoFail(405, 'Method not allowed');

$entity = $_GET['entity'] ?? '';
$id = (int) ($_GET['id'] ?? 0);
$table = $entity === 'building' ? 'buildings' : ($entity === 'room' ? 'rooms' : '');
if ($table === '' || $id <= 0) photoFail(400, 'entity (building or room) and id are required');

$db = new Database();
$conn = $db->connect();

if (!photo_column_exists($conn, $table)) {
    photoFail(500, 'Photos are not set up on this database yet. Run: php Backend/scripts/migrate-photos.php');
}

if ($method === 'DELETE') photoPut($conn, $table, $id, null);

$input = json_decode(file_get_contents('php://input'), true);
$dataUrl = is_array($input) ? ($input['image'] ?? null) : null;
photoPut($conn, $table, $id, is_string($dataUrl) ? $dataUrl : '');   // photoPut answers 400 for anything that is not an image
