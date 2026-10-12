<?php

// Building and room photos — one upload flow for both, shown in the 3D campus map and on a room's page.
// Images are checked by their real bytes (getimagesizefromstring), the way static-maps.php does it, not just by the
// data-URL prefix: a renamed PDF or script must never end up served as a "photo".
//
// photoPut($conn, 'buildings'|'rooms', $id, $photo)   handles PUT ?id=  with body { photo }; echoes JSON and exits.
//     $photo = "data:image/jpeg;base64,..." sets the photo, null removes it.
// photoDelete($path)                                  removes a stored photo file (nothing outside assets/photos/).

const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
const PHOTO_TABLES = ['buildings', 'rooms'];

function photoFail($code, $message) {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

// Writes the image under Frontend/assets/photos/<table>/ and returns its public path (relative to Frontend/).
function photoSave($table, $id, $dataUrl) {
    if (!is_string($dataUrl) || !preg_match('/^data:image\/(jpeg|jpg|png|webp);base64,(.+)$/s', $dataUrl, $m)) {
        photoFail(400, 'Choose a JPEG, PNG or WebP photo');
    }
    $ext = $m[1] === 'jpg' ? 'jpeg' : $m[1];
    $binary = base64_decode($m[2], true);
    if ($binary === false) photoFail(400, 'Could not read that photo');
    if (strlen($binary) > PHOTO_MAX_BYTES) photoFail(400, 'Photo is too large (max 8 MB)');
    $types = ['jpeg' => IMAGETYPE_JPEG, 'png' => IMAGETYPE_PNG, 'webp' => IMAGETYPE_WEBP];
    $info = @getimagesizefromstring($binary);
    if ($info === false || $info[2] !== $types[$ext]) photoFail(400, 'That file is not a readable ' . strtoupper($ext) . ' image');

    $dir = __DIR__ . '/../Frontend/assets/photos/' . $table;
    if (!is_dir($dir) && !mkdir($dir, 0755, true)) photoFail(500, 'Could not create the photo folder');
    $name = (int) $id . '-' . time() . '-' . bin2hex(random_bytes(3)) . '.' . $ext;
    if (file_put_contents($dir . '/' . $name, $binary) === false) photoFail(500, 'Could not save the photo');
    return 'assets/photos/' . $table . '/' . $name;
}

function photoDelete($path) {
    if (!$path || strpos($path, 'assets/photos/') !== 0 || strpos($path, '..') !== false) return;
    $file = __DIR__ . '/../Frontend/' . $path;
    if (is_file($file)) @unlink($file);
}

function photoPut($conn, $table, $id, $photo) {
    if (!in_array($table, PHOTO_TABLES, true)) photoFail(400, 'Unknown photo kind');
    if (!$id) photoFail(400, 'id is required');
    $stmt = $conn->prepare("SELECT photo_path FROM $table WHERE id = ?");
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) photoFail(404, 'Not found');

    $old = $row['photo_path'];
    $new = $photo === null ? null : photoSave($table, $id, $photo);
    $stmt = $conn->prepare("UPDATE $table SET photo_path = ? WHERE id = ?");
    $stmt->bind_param('si', $new, $id);
    if (!$stmt->execute()) {
        if ($new) photoDelete($new);              // the record still points at the old photo, so keep that one
        photoFail(500, 'Could not save the photo');
    }
    $stmt->close();
    if ($old && $old !== $new) photoDelete($old); // only once the record no longer points at it
    echo json_encode(['success' => true, 'photo_path' => $new]);
    exit;
}
