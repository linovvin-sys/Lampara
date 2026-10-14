<?php

// The two static campus maps (an overhead 2D map and a 3D render) that students open from the landing page.
//
// GET    /api/static-maps.php             -> { success, maps: { "2d": {...}|null, "3d": {...}|null } }   (public)
// POST   /api/static-maps.php             -> upload or replace one map (admin)
//        body (JSON): { kind: "2d"|"3d", format: "png"|"jpeg"|"webp"|"svg"|"pdf"|"obj", image: "data:...;base64,...", title?: "..." }
//        2D accepts png / jpeg / webp / svg / pdf.  3D accepts png / jpeg / webp / obj.
// PUT    /api/static-maps.php?kind=2d     -> change a map's caption without re-uploading (admin)
//        body (JSON): { title }
// DELETE /api/static-maps.php?kind=2d     -> remove a map (admin)

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

require_once __DIR__ . '/../config.php';

// Reading is open (students need it, no login); every change needs an admin session.
if (in_array($_SERVER['REQUEST_METHOD'], ['POST', 'PUT', 'DELETE'])) {
    require_once __DIR__ . '/_require_admin.php';
}

$db = new Database();
$conn = $db->connect();

$uploadDir = __DIR__ . '/../../Frontend/assets/maps';
$publicPathPrefix = 'assets/maps/';
const MAP_KINDS = ['2d', '3d'];
// What each kind may be, and the biggest file (bytes) allowed for each format.
const MAP_FORMATS = [
    '2d' => ['png', 'jpeg', 'webp', 'svg', 'pdf'],
    '3d' => ['png', 'jpeg', 'webp', 'obj'],
];
const MAP_MAX = ['png' => 12 * 1048576, 'jpeg' => 12 * 1048576, 'webp' => 12 * 1048576, 'svg' => 8 * 1048576, 'pdf' => 20 * 1048576, 'obj' => 25 * 1048576];

function fail($code, $message) {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message]);
    exit;
}

function deleteMapFile($relativePath) {
    // Only ever touch files inside our own maps folder.
    if (!$relativePath || strpos($relativePath, 'assets/maps/') !== 0) return;
    $file = __DIR__ . '/../../Frontend/' . $relativePath;
    if (is_file($file)) @unlink($file);
}

// SVG files are drawn through an <img> (scripts can't run there), but the file is also reachable by its own URL,
// so strip anything active before it is stored: scripts, embedded pages, event handlers, javascript: links.
function sanitizeSvg($xml) {
    if (preg_match('/<!ENTITY/i', $xml)) return null;                 // entity tricks
    $previous = libxml_use_internal_errors(true);
    $doc = new DOMDocument();
    $ok = $doc->loadXML($xml, LIBXML_NONET | LIBXML_NOBLANKS);
    libxml_clear_errors();
    libxml_use_internal_errors($previous);
    if (!$ok || !$doc->documentElement || strtolower($doc->documentElement->localName) !== 'svg') return null;

    $bad = ['script', 'foreignobject', 'iframe', 'embed', 'object', 'audio', 'video', 'canvas', 'applet', 'link', 'meta'];
    $xpath = new DOMXPath($doc);
    foreach (iterator_to_array($xpath->query('//*')) as $el) {
        if (!$el->parentNode) continue;
        $tag = strtolower($el->localName);
        if (in_array($tag, $bad, true)) { $el->parentNode->removeChild($el); continue; }
        if ($tag === 'style' && preg_match('/@import|url\s*\(\s*[\'"]?\s*(https?:|\/\/|javascript:|data:text)/i', $el->textContent)) { $el->parentNode->removeChild($el); continue; }
        if ($tag === 'use') { $h = trim((string) ($el->getAttribute('href') ?: $el->getAttribute('xlink:href'))); if ($h !== '' && $h[0] !== '#') { $el->parentNode->removeChild($el); continue; } }
        if (in_array($tag, ['animate', 'set', 'animatetransform', 'animatemotion'], true) && preg_match('/^(xlink:)?href$/i', (string) $el->getAttribute('attributeName'))) { $el->parentNode->removeChild($el); continue; }
        foreach (iterator_to_array($el->attributes) as $attr) {
            $name = strtolower($attr->nodeName);
            $value = strtolower(trim($attr->nodeValue));
            if (strpos($name, 'on') === 0) { $el->removeAttributeNode($attr); continue; }
            if (($name === 'href' || $name === 'xlink:href' || $name === 'src') && (strpos($value, 'javascript:') === 0 || strpos($value, 'data:text/html') === 0)) {
                $el->removeAttributeNode($attr);
            }
        }
    }
    // Give the drawing a real size so it isn't shown as a 300x150 thumbnail when the file only has a viewBox.
    $root = $doc->documentElement;
    $num = fn($v) => preg_match('/^\s*([0-9.]+)\s*(px)?\s*$/i', (string) $v, $mm) ? (float) $mm[1] : null;
    if ($num($root->getAttribute('width')) === null || $num($root->getAttribute('height')) === null) {
        $vb = preg_split('/[\s,]+/', trim($root->getAttribute('viewBox')));
        if (count($vb) === 4 && (float) $vb[2] > 0 && (float) $vb[3] > 0) {
            $k = 2400 / max((float) $vb[2], (float) $vb[3]);
            $root->setAttribute('width', (string) round((float) $vb[2] * $k));
            $root->setAttribute('height', (string) round((float) $vb[3] * $k));
        }
    }
    return $doc->saveXML($root);
}

function mapFormat($path) {
    $ext = strtolower(pathinfo((string) $path, PATHINFO_EXTENSION));
    return $ext === 'jpg' ? 'jpeg' : $ext;
}

// The picture's own width and height. Pins are stored as percent of the picture, so turning them into real positions
// (the 3D map places the 2D map's gates and landmarks) needs its true shape. PDFs: the page box pdf.js draws
// (CropBox, else MediaBox); pictures: their pixel size. Null when it can't be read (an SVG, a missing file).
// ponytail: reads the first page box in the file, which is page 1 for the single-page maps admins upload.
function mapPageSize($imagePath) {
    $file = __DIR__ . '/../../Frontend/' . $imagePath;
    if (!is_file($file)) return null;
    if (strtolower(pathinfo($file, PATHINFO_EXTENSION)) === 'pdf') {
        $data = file_get_contents($file);
        $num = '([\d.\-]+)';
        if (!preg_match("/\/CropBox\s*\[\s*$num\s+$num\s+$num\s+$num\s*\]/", $data, $m)
            && !preg_match("/\/MediaBox\s*\[\s*$num\s+$num\s+$num\s+$num\s*\]/", $data, $m)) return null;
        $w = abs((float) $m[3] - (float) $m[1]);
        $h = abs((float) $m[4] - (float) $m[2]);
        if (preg_match('/\/Rotate\s+(90|270)\b/', $data)) [$w, $h] = [$h, $w];
        return $w > 0 && $h > 0 ? ['width' => round($w, 2), 'height' => round($h, 2)] : null;
    }
    $size = @getimagesize($file);
    return $size ? ['width' => $size[0], 'height' => $size[1]] : null;
}

function mapRow($row) {
    return $row ? [
        'kind' => $row['kind'],
        'image_path' => $row['image_path'],
        'format' => mapFormat($row['image_path']),
        'title' => $row['title'],
        'updated_at' => $row['updated_at'],
        'page' => $row['kind'] === '2d' ? mapPageSize($row['image_path']) : null,
    ] : null;
}

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $maps = ['2d' => null, '3d' => null];
    $result = $conn->query("SELECT kind, image_path, title, updated_at FROM static_maps");
    while ($row = $result->fetch_assoc()) $maps[$row['kind']] = mapRow($row);
    echo json_encode(['success' => true, 'maps' => $maps]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $kind = $input['kind'] ?? '';
    $title = isset($input['title']) ? trim($input['title']) : null;
    if ($title !== null) $title = mb_substr($title, 0, 100, 'UTF-8');
    if (!in_array($kind, MAP_KINDS, true)) fail(400, 'kind must be "2d" or "3d"');

    $format = strtolower(trim($input['format'] ?? ''));
    if ($format === 'jpg') $format = 'jpeg';
    $dataUrl = $input['image'] ?? '';
    if (!preg_match('/^data:[^;,]*;base64,(.+)$/s', $dataUrl, $m)) fail(400, 'A base64 file is required');
    if ($format === '') {                                   // older callers sent images only: read the type from the data URL
        if (preg_match('/^data:image\/(jpeg|jpg|png|webp)/', $dataUrl, $t)) $format = $t[1] === 'jpg' ? 'jpeg' : $t[1];
    }
    if (!in_array($format, MAP_FORMATS[$kind], true)) {
        fail(400, 'A ' . strtoupper($kind) . ' map can be: ' . strtoupper(implode(', ', MAP_FORMATS[$kind])));
    }
    $binary = base64_decode($m[1], true);
    if ($binary === false) fail(400, 'Could not decode the file data');
    if (strlen($binary) > MAP_MAX[$format]) fail(400, 'That file is too large (max ' . round(MAP_MAX[$format] / 1048576) . 'MB for ' . strtoupper($format) . ')');

    // Check the bytes really are what the name says.
    if (in_array($format, ['png', 'jpeg', 'webp'], true)) {
        $info = @getimagesizefromstring($binary);
        $types = ['png' => IMAGETYPE_PNG, 'jpeg' => IMAGETYPE_JPEG, 'webp' => IMAGETYPE_WEBP];
        if ($info === false || $info[2] !== $types[$format]) fail(400, 'That file is not a readable ' . strtoupper($format) . ' image');
    } elseif ($format === 'svg') {
        $clean = sanitizeSvg($binary);
        if ($clean === null) fail(400, 'That file is not a valid SVG');
        $binary = $clean;
    } elseif ($format === 'pdf') {
        if (strncmp($binary, '%PDF-', 5) !== 0) fail(400, 'That file is not a valid PDF');
    } elseif ($format === 'obj') {
        // Wavefront OBJ is plain text: vertices ("v x y z") and faces ("f ...").
        if (strpos($binary, "\0") !== false) fail(400, 'That file is not a text OBJ model');
        if (!preg_match('/^v\s+-?[0-9.eE+-]+\s+-?[0-9.eE+-]+\s+-?[0-9.eE+-]+/m', $binary) || !preg_match('/^f\s+\S+/m', $binary)) {
            fail(400, 'That OBJ has no vertices or faces');
        }
    }

    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true)) fail(500, 'Could not create the maps folder');
    $filename = 'map-' . $kind . '-' . time() . '.' . $format;
    if (file_put_contents($uploadDir . '/' . $filename, $binary) === false) fail(500, 'Could not save image to disk');
    $path = $publicPathPrefix . $filename;

    $stmt = $conn->prepare("SELECT image_path FROM static_maps WHERE kind = ?");
    $stmt->bind_param('s', $kind);
    $stmt->execute();
    $old = $stmt->get_result()->fetch_assoc();
    $stmt->close();

    $stmt = $conn->prepare("INSERT INTO static_maps (kind, image_path, title) VALUES (?, ?, ?)
                            ON DUPLICATE KEY UPDATE image_path = VALUES(image_path), title = COALESCE(VALUES(title), title)");
    $stmt->bind_param('sss', $kind, $path, $title);
    $stmt->execute();
    $stmt->close();

    if ($old && $old['image_path'] !== $path) deleteMapFile($old['image_path']);   // the new one is safely saved first

    $stmt = $conn->prepare("SELECT kind, image_path, title, updated_at FROM static_maps WHERE kind = ?");
    $stmt->bind_param('s', $kind);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    echo json_encode(['success' => true, 'map' => mapRow($row)]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'PUT') {
    $kind = $_GET['kind'] ?? '';
    if (!in_array($kind, MAP_KINDS, true)) fail(400, 'kind must be "2d" or "3d"');
    $input = json_decode(file_get_contents('php://input'), true) ?? [];
    $title = trim($input['title'] ?? '');
    $title = $title === '' ? null : mb_substr($title, 0, 100, 'UTF-8');
    $stmt = $conn->prepare("UPDATE static_maps SET title = ? WHERE kind = ?");
    $stmt->bind_param('ss', $title, $kind);
    $stmt->execute();
    $stmt->close();
    echo json_encode(['success' => true]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] === 'DELETE') {
    $kind = $_GET['kind'] ?? '';
    if (!in_array($kind, MAP_KINDS, true)) fail(400, 'kind must be "2d" or "3d"');
    $stmt = $conn->prepare("SELECT image_path FROM static_maps WHERE kind = ?");
    $stmt->bind_param('s', $kind);
    $stmt->execute();
    $old = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    $stmt = $conn->prepare("DELETE FROM static_maps WHERE kind = ?");
    $stmt->bind_param('s', $kind);
    $stmt->execute();
    $stmt->close();
    if ($old) deleteMapFile($old['image_path']);
    echo json_encode(['success' => true]);
    exit;
}

fail(405, 'Method not allowed');
