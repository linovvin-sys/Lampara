<?php

// Live hazard reports: a visitor photographs a closed building or a blocked path, and everyone using the app (and every admin)
// is told.
// A new report starts as 'pending': only admins see it until one approves it (then it is 'active' and shown to everyone).
// An URGENT report (a danger, not an inconvenience) is shown to everyone at once, labelled "not yet checked by staff", until
// an admin verifies it.
// GET    /api/hazards.php                 -> reports that are active (public). They fade out after 12 hours.
//        ?status=pending|active|resolved|all -> admin only. 'pending' is everything that still needs a look: waiting reports and
//                                              urgent ones nobody has verified yet. Also lifts the 12-hour limit.
// POST   /api/hazards.php                 -> a new report (public, throttled); an admin's own report is approved at once
//        body (JSON): { kind: 'restricted'|'blocked', urgent?, building_id?, lat?, lng?, note?, image?: data URL }
// POST   /api/hazards.php?id=1&action=flag -> "this photo should not be here" from a visitor; three of them hide the report again
// PUT    /api/hazards.php?id=1&action=approve|verify|resolve|reopen -> show it to everyone, confirm an urgent one, clear it,
//                                                                      or bring a cleared one back (admin)
// DELETE /api/hazards.php?id=1            -> remove a report and its photo (admin)
// Against trolling: an urgent report only goes live at once with a photo, a location, and the phone actually near the place it reports;
// otherwise it waits for an admin like any other. One phone can send few reports a day, cannot repeat the same one, and loses the
// urgent fast lane (then the ability to report) after admins reject its reports. A "photo should not be here" notice counts once per
// phone, and cannot take down a report an admin has already confirmed.
// Photos: nobody but admins sees a photo until an admin has confirmed the report (so a troll's picture is never shown to the public), and
// every photo is also checked by the AI first when a Gemini key is set: an explicit or inappropriate one is refused, never saved, and
// counts as a strike against the phone. If the check cannot run, the report simply waits for an admin (no urgent fast lane).
// Set HAZARD_ALERT_EMAIL in Backend/secrets.php to also get an email for every new report.

header('Content-Type: application/json');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(0);

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../photo_upload.php';
require_once __DIR__ . '/../rate_limit.php';
require_once __DIR__ . '/../session_boot.php';

lampara_session_start();
$isAdmin = !empty($_SESSION['admin_id']) && lampara_admin_role() === 'admin';   // a PSMO account sees reports as a visitor does
$method = $_SERVER['REQUEST_METHOD'];
$action = $_GET['action'] ?? '';

if (in_array($method, ['PUT', 'DELETE'], true)) {
    require_once __DIR__ . '/_require_admin.php';
} else {
    lampara_same_origin_or_die();
}

$db = new Database();
$conn = $db->connect();

// ---- storage. The table is created (and an older one brought up to date) the first time a query finds it missing, not on every request.
function hz_migrate(mysqli $conn): void
{
    $conn->query(
        "CREATE TABLE IF NOT EXISTS hazard_reports (
            id INT AUTO_INCREMENT PRIMARY KEY,
            kind VARCHAR(12) NOT NULL,
            building_id INT NULL,
            lat DOUBLE NULL,
            lng DOUBLE NULL,
            note VARCHAR(255) NULL,
            photo_path VARCHAR(255) NULL,
            status VARCHAR(10) NOT NULL DEFAULT 'pending',
            urgent TINYINT(1) NOT NULL DEFAULT 0,
            verified TINYINT(1) NOT NULL DEFAULT 1,
            flags INT NOT NULL DEFAULT 0,
            device VARCHAR(16) NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved_at TIMESTAMP NULL,
            resolved_by VARCHAR(60) NULL,
            KEY idx_status_created (status, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );
    $conn->query('CREATE TABLE IF NOT EXISTS hazard_flags (report_id INT NOT NULL, device VARCHAR(16) NOT NULL, PRIMARY KEY (report_id, device)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $conn->query('CREATE TABLE IF NOT EXISTS hazard_strikes (id INT AUTO_INCREMENT PRIMARY KEY, device VARCHAR(16) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, KEY idx_device (device, created_at)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');
    $have = [];
    $r = $conn->query('SHOW COLUMNS FROM hazard_reports');
    while ($c = $r->fetch_assoc()) $have[$c['Field']] = true;
    $add = ['urgent' => 'TINYINT(1) NOT NULL DEFAULT 0', 'verified' => 'TINYINT(1) NOT NULL DEFAULT 1', 'flags' => 'INT NOT NULL DEFAULT 0', 'device' => 'VARCHAR(16) NULL'];
    foreach ($add as $col => $def) {
        if (empty($have[$col])) $conn->query("ALTER TABLE hazard_reports ADD COLUMN $col $def");
    }
}
// Runs $fn; if the table or a column is missing (MySQL errors 1146 and 1054), sets it up once and runs $fn again.
function hz(mysqli $conn, callable $fn)
{
    try {
        return $fn();
    } catch (mysqli_sql_exception $e) {
        if (!in_array($e->getCode(), [1146, 1054], true)) throw $e;
        hz_migrate($conn);
        return $fn();
    }
}

function hz_row(array $r): array
{
    return [
        'id' => (int) $r['id'],
        'kind' => $r['kind'],
        'building_id' => $r['building_id'] !== null ? (int) $r['building_id'] : null,
        'building_name' => $r['building_name'],
        'lat' => $r['lat'] !== null ? (float) $r['lat'] : null,
        'lng' => $r['lng'] !== null ? (float) $r['lng'] : null,
        'note' => $r['note'],
        'photo_path' => ($GLOBALS['hz_show_photo'] ?? false) || (int) $r['verified'] === 1 ? $r['photo_path'] : null,
        'status' => $r['status'],
        'urgent' => (int) $r['urgent'] === 1,
        'verified' => (int) $r['verified'] === 1,
        'created_at' => $r['created_at'],
        'age_min' => (int) $r['age_min'],
    ];
}

// A JPEG from a phone can carry the place and time it was taken (Exif) and other tags. The browser already redraws the photo, which
// drops them, but a hand-made upload would not: remove them here too. Everything up to the image data is rewritten, the image
// data itself is copied as is.
function hz_strip_jpeg(string $b): string
{
    if (strlen($b) < 4 || $b[0] !== "\xFF" || $b[1] !== "\xD8") return $b;
    $out = "\xFF\xD8";
    $i = 2; $n = strlen($b);
    while ($i + 3 < $n) {
        if ($b[$i] !== "\xFF") break;
        $m = ord($b[$i + 1]);
        if ($m === 0xFF) { $i++; continue; }
        if ($m === 0xDA) { return $out . substr($b, $i); }            // start of scan: the rest is image data
        if (($m >= 0xD0 && $m <= 0xD7) || $m === 0x01 || $m === 0xD8) { $out .= substr($b, $i, 2); $i += 2; continue; }
        $len = (ord($b[$i + 2]) << 8) | ord($b[$i + 3]);
        if ($len < 2 || $i + 2 + $len > $n) return $b;                 // not a well-formed file: leave it for the image check to judge
        $drop = ($m === 0xE1) || ($m >= 0xE3 && $m <= 0xEF && $m !== 0xEE) || $m === 0xFE;   // Exif/XMP, vendor tags, comments
        if (!$drop) $out .= substr($b, $i, 2 + $len);
        $i += 2 + $len;
    }
    return $out . substr($b, $i);
}

function hz_dist(float $la1, float $lo1, float $la2, float $lo2): float
{
    $r = M_PI / 180; $dLat = ($la2 - $la1) * $r; $dLng = ($lo2 - $lo1) * $r;
    $h = sin($dLat / 2) ** 2 + cos($la1 * $r) * cos($la2 * $r) * sin($dLng / 2) ** 2;
    return 2 * 6371008.8 * asin(min(1, sqrt($h)));
}
function hz_count(mysqli $conn, string $sql, string $types, ...$args): int
{
    $stmt = $conn->prepare($sql);
    $stmt->bind_param($types, ...$args);
    $stmt->execute();
    $n = (int) $stmt->get_result()->fetch_row()[0];
    $stmt->close();
    return $n;
}

// Asks the AI whether a photo is fit to keep: 'ok', 'bad' (explicit, violent, or plainly not a photo of a place) or 'unknown' (no key, no answer). Never decides alone beyond refusing: an admin still looks at what is kept.
function hz_screen(string $jpegBinary): string
{
    $secrets = __DIR__ . '/../secrets.php';
    if (is_file($secrets)) { try { require_once $secrets; } catch (Throwable $e) { /* no key */ } }
    if (!defined('GEMINI_API_KEY') || in_array(GEMINI_API_KEY, ['PASTE_YOUR_KEY_HERE', 'paste-your-real-key-here', ''], true)) return 'unknown';
    $prompt = 'You check photos sent to a school campus app as a report of a closed building or a blocked path. Answer allowed=false only if the photo '
        . 'contains nudity or sexual content, gore or violence, hate symbols, or is plainly not a photo of a place (a selfie or portrait filling the '
        . 'frame, a meme, a screenshot, a drawing, an object held up to the camera). Answer allowed=true for any photo of a place: paths, doors, gates, '
        . 'buildings, rooms, floors, signs, barriers, water, fallen trees, crowds or students walking by. People who are just in the scene are fine.';
    $payload = json_encode([
        'contents' => [['role' => 'user', 'parts' => [['text' => $prompt], ['inline_data' => ['mime_type' => 'image/jpeg', 'data' => base64_encode($jpegBinary)]]]]],
        'generationConfig' => [
            'temperature' => 0, 'maxOutputTokens' => 100, 'responseMimeType' => 'application/json',
            'responseSchema' => ['type' => 'OBJECT', 'properties' => ['allowed' => ['type' => 'BOOLEAN']], 'required' => ['allowed']],
        ],
    ]);
    foreach (['gemini-3.1-flash-lite', 'gemini-3.5-flash'] as $model) {
        $ch = curl_init('https://generativelanguage.googleapis.com/v1beta/models/' . $model . ':generateContent');
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload, CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'x-goog-api-key: ' . GEMINI_API_KEY], CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15]);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!$res || $code !== 200) continue;
        $d = json_decode($res, true);
        // the AI's own safety filter refusing to look at the picture is as good as a "no"
        if (!empty($d['promptFeedback']['blockReason']) || ($d['candidates'][0]['finishReason'] ?? '') === 'SAFETY' || ($d['candidates'][0]['finishReason'] ?? '') === 'PROHIBITED_CONTENT') return 'bad';
        $a = json_decode($d['candidates'][0]['content']['parts'][0]['text'] ?? '', true);
        if (is_array($a) && isset($a['allowed'])) return $a['allowed'] ? 'ok' : 'bad';
    }
    return 'unknown';
}
function hz_strike(mysqli $conn, string $dev): void
{
    hz($conn, function () use ($conn, $dev) {
        $stmt = $conn->prepare('INSERT INTO hazard_strikes (device) VALUES (?)');
        $stmt->bind_param('s', $dev);
        $stmt->execute();
        $stmt->close();
    });
}

function hz_purge(mysqli $conn): void
{
    // cleared or unreviewed reports are not kept for ever, and neither are their photos
    $res = $conn->query("SELECT id, photo_path FROM hazard_reports WHERE (status = 'resolved' AND resolved_at < NOW() - INTERVAL 30 DAY) OR (status = 'pending' AND created_at < NOW() - INTERVAL 30 DAY)");
    while ($r = $res->fetch_assoc()) {
        photoDelete($r['photo_path']);
        $conn->query('DELETE FROM hazard_reports WHERE id = ' . (int) $r['id']);
    }
}

function hz_alert(string $kind, string $where, bool $urgent, ?string $note): void
{
    $secrets = __DIR__ . '/../secrets.php';
    if (is_file($secrets)) { try { require_once $secrets; } catch (Throwable $e) { /* no alert address */ } }
    if (!defined('HAZARD_ALERT_EMAIL') || !HAZARD_ALERT_EMAIL) return;
    $subject = ($urgent ? '[URGENT] ' : '') . 'Lampara report: ' . ($kind === 'restricted' ? 'closed building' : 'blocked path') . ' ' . $where;
    $body = "A visitor sent a report.\n\nWhere: $where\nUrgent: " . ($urgent ? 'yes' : 'no') . "\nNote: " . ($note ?: '(none)') . "\n\nReview it in the admin panel: Reports.";
    @mail(HAZARD_ALERT_EMAIL, $subject, $body);
}

// ---- GET
if ($method === 'GET') {
    $status = $_GET['status'] ?? '';
    $GLOBALS['hz_show_photo'] = $isAdmin;      // an unconfirmed report's photo is for admins only
    $sql = "SELECT h.id, h.kind, h.building_id, b.name AS building_name, h.lat, h.lng, h.note, h.photo_path, h.status, h.urgent, h.verified, h.created_at,
                   TIMESTAMPDIFF(MINUTE, h.created_at, NOW()) AS age_min
            FROM hazard_reports h LEFT JOIN buildings b ON b.id = h.building_id";
    if ($status !== '') {
        if (!$isAdmin) { http_response_code(401); echo json_encode(['success' => false, 'error' => 'Admin login required']); exit; }
        header('Cache-Control: no-store');
        if ($status === 'pending') $sql .= " WHERE (h.status = 'pending' OR (h.status = 'active' AND h.verified = 0))";
        elseif ($status !== 'all') $sql .= " WHERE h.status = '" . ($status === 'resolved' ? 'resolved' : 'active') . "'";
        $sql .= ' ORDER BY h.id DESC LIMIT 200';
    } else {
        header('Cache-Control: public, max-age=15');      // every open page asks every 30 seconds; a short cache spares the database
        $sql .= " WHERE h.status = 'active' AND h.created_at > NOW() - INTERVAL 12 HOUR ORDER BY h.id DESC LIMIT 50";
    }
    $out = hz($conn, function () use ($conn, $sql) {
        $res = $conn->query($sql);
        $rows = [];
        while ($r = $res->fetch_assoc()) $rows[] = hz_row($r);
        return $rows;
    });
    echo json_encode(['success' => true, 'reports' => $out]);
    exit;
}

header('Cache-Control: no-store');

// ---- POST
if ($method === 'POST') {
    // One device cookie tells visitors on the same school Wi-Fi apart, so one person's reports do not use up everyone's allowance.
    // The per-address limit is the backstop for someone who keeps clearing the cookie.
    $dev = $_COOKIE['lampara_dev'] ?? '';
    if (!preg_match('/^[a-f0-9]{16}$/', $dev)) {
        $dev = bin2hex(random_bytes(8));
        setcookie('lampara_dev', $dev, ['expires' => time() + 31536000, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax']);
    }

    if ($action === 'flag') {
        rate_limit_or_die('hazard_flag', 10, 600, 'Thank you. You have already sent several notices just now.', $dev);
        $id = (int) ($_GET['id'] ?? 0);
        if ($id <= 0) photoFail(400, 'id is required');
        hz($conn, function () use ($conn, $id, $dev) {
            // one notice per phone per report, and a report an admin has confirmed cannot be taken down this way
            $stmt = $conn->prepare("INSERT IGNORE INTO hazard_flags (report_id, device) SELECT id, ? FROM hazard_reports WHERE id = ? AND status = 'active' AND verified = 0");
            $stmt->bind_param('si', $dev, $id);
            $stmt->execute();
            $fresh = $stmt->affected_rows > 0;
            $stmt->close();
            if (!$fresh) return;
            $stmt = $conn->prepare('UPDATE hazard_reports SET flags = flags + 1 WHERE id = ?');
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $stmt->close();
            // three different phones put the report back in the admins' queue and take it off everyone's screen
            $stmt = $conn->prepare("UPDATE hazard_reports SET status = 'pending', verified = 0 WHERE id = ? AND status = 'active' AND verified = 0 AND flags >= 3");
            $stmt->bind_param('i', $id);
            $stmt->execute();
            $stmt->close();
        });
        echo json_encode(['success' => true]);
        exit;
    }

    rate_limit_or_die('hazard_report', 5, 600, 'You have sent several reports just now. Please wait a few minutes before sending another.', $dev);
    rate_limit_or_die('hazard_report_ip_day', 150, 86400, 'Too many reports were sent from this network today. Please try again tomorrow, or tell the school office.');
    rate_limit_or_die('hazard_report_ip', 60, 600, 'Too many reports were sent from this network just now. Please try again in a few minutes.');
    $in = json_decode(file_get_contents('php://input'), true);
    if (!is_array($in)) photoFail(400, 'Invalid request');

    $kind = $in['kind'] ?? '';
    if (!in_array($kind, ['restricted', 'blocked'], true)) photoFail(400, 'Say whether a building is closed or a path is blocked');
    $urgent = !empty($in['urgent']) ? 1 : 0;

    $buildingId = isset($in['building_id']) && $in['building_id'] !== '' ? (int) $in['building_id'] : null;
    $buildingName = null;
    if ($buildingId !== null) {
        $stmt = $conn->prepare('SELECT name FROM buildings WHERE id = ?');
        $stmt->bind_param('i', $buildingId);
        $stmt->execute();
        $row = $stmt->get_result()->fetch_row();
        $stmt->close();
        if ($row) $buildingName = $row[0]; else $buildingId = null;
    }
    $lat = isset($in['lat']) && is_numeric($in['lat']) ? (float) $in['lat'] : null;
    $lng = isset($in['lng']) && is_numeric($in['lng']) ? (float) $in['lng'] : null;
    if ($lat !== null && ($lat < -90 || $lat > 90)) $lat = null;
    if ($lng !== null && ($lng < -180 || $lng > 180)) $lng = null;
    if ($lat === null || $lng === null) { $lat = null; $lng = null; }

    $note = trim((string) ($in['note'] ?? ''));
    if (function_exists('mb_substr')) $note = mb_substr($note, 0, 255); else $note = substr($note, 0, 255);
    $note = $note === '' ? null : $note;
    $image = $in['image'] ?? null;
    if ($image === null && $buildingId === null && $lat === null) photoFail(400, 'Add a photo or say where this is');

    $downgraded = false;
    $jpeg = null;
    if (is_string($image) && $image !== '') {
        // the report page always sends a JPEG it has redrawn itself; other formats can carry hidden data this server cannot clean
        if (!preg_match('/^data:image\/jpe?g;base64,(.+)$/s', $image, $m)) photoFail(400, 'Please send the photo as a JPEG');
        $jpeg = base64_decode($m[1], true);
        if ($jpeg === false || @getimagesizefromstring($jpeg) === false) photoFail(400, 'Could not read that photo');
        if (!$isAdmin) {
            $verdict = hz_screen($jpeg);
            if ($verdict === 'bad') {
                hz_strike($conn, $dev);
                photoFail(400, 'That photo cannot be used. A report needs a photo of the place or path itself. Repeated photos like this pause reporting from your phone.');
            }
            if ($verdict === 'unknown') { $urgent = 0; $downgraded = true; }
        }
    }
    if (!$isAdmin) {
        // this phone's record: reports admins rejected in the last 30 days, what it sent today, and whether it just sent this one
        [$strikes, $today, $urgentToday, $repeat] = hz($conn, function () use ($conn, $dev, $kind, $buildingId) {
            return [
                hz_count($conn, 'SELECT COUNT(*) FROM hazard_strikes WHERE device = ? AND created_at > NOW() - INTERVAL 30 DAY', 's', $dev),
                hz_count($conn, 'SELECT COUNT(*) FROM hazard_reports WHERE device = ? AND created_at > NOW() - INTERVAL 1 DAY', 's', $dev),
                hz_count($conn, 'SELECT COUNT(*) FROM hazard_reports WHERE device = ? AND urgent = 1 AND created_at > NOW() - INTERVAL 1 DAY', 's', $dev),
                hz_count($conn, 'SELECT COUNT(*) FROM hazard_reports WHERE device = ? AND kind = ? AND building_id <=> ? AND created_at > NOW() - INTERVAL 30 MINUTE', 'ssi', $dev, $kind, $buildingId),
            ];
        });
        if ($strikes >= 5) photoFail(403, 'Reports from this phone are paused because several were not confirmed. Please tell the school office in person.');
        if ($today >= 10) photoFail(429, 'You have sent many reports today. Please try again tomorrow, or tell the school office.');
        if ($repeat > 0) photoFail(429, 'You already reported this a little while ago. The staff have it.');
        // the urgent fast lane (shown to everyone before an admin looks) needs a photo, your location, and you being at the place
        if ($urgent) {
            $ok = $jpeg !== null && $lat !== null && $strikes < 2 && $urgentToday < 2;
            if ($ok) {
                $near = false;
                require_once __DIR__ . '/../institution.php';
                $reportM = (float) (institution_get($conn)['proximity']['report_m'] ?? 250);   // School settings > Proximity
                $res = $conn->query('SELECT id, lat, lng FROM buildings WHERE lat IS NOT NULL AND lng IS NOT NULL');
                while ($b = $res->fetch_assoc()) {
                    $d = hz_dist($lat, $lng, (float) $b['lat'], (float) $b['lng']);
                    if ($buildingId !== null ? ((int) $b['id'] === $buildingId && $d <= $reportM) : $d <= $reportM + 50) { $near = true; break; }
                }
                $ok = $near;
            }
            if (!$ok) { $urgent = 0; $downgraded = true; }
        }
    }

    // an admin's own report is trusted; an urgent one goes live at once but is marked as not yet checked
    $status = ($isAdmin || $urgent) ? 'active' : 'pending';
    $verified = $isAdmin ? 1 : 0;
    $devId = $isAdmin ? null : $dev;
    $id = hz($conn, function () use ($conn, $kind, $buildingId, $lat, $lng, $note, $status, $urgent, $verified, $devId) {
        $stmt = $conn->prepare('INSERT INTO hazard_reports (kind, building_id, lat, lng, note, status, urgent, verified, device) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->bind_param('siddssiis', $kind, $buildingId, $lat, $lng, $note, $status, $urgent, $verified, $devId);
        $stmt->execute();
        $newId = $conn->insert_id;
        $stmt->close();
        return $newId;
    });

    if ($jpeg !== null) {
        $image = 'data:image/jpeg;base64,' . base64_encode(hz_strip_jpeg($jpeg));
        $path = photoSave('hazards', $id, $image);        // checks the real bytes; answers 400 for anything that is not a photo
        $stmt = $conn->prepare('UPDATE hazard_reports SET photo_path = ? WHERE id = ?');
        $stmt->bind_param('si', $path, $id);
        $stmt->execute();
        $stmt->close();
    }

    if (!$isAdmin) hz_alert($kind, $buildingName ?: 'on the campus grounds', (bool) $urgent, $note);
    if (random_int(1, 40) === 1) { try { hz_purge($conn); } catch (Throwable $e) { /* housekeeping must never fail a report */ } }

    echo json_encode(['success' => true, 'id' => $id, 'pending' => !$isAdmin && !$urgent, 'urgent' => (bool) $urgent, 'downgraded' => $downgraded]);
    exit;
}

// ---- PUT / DELETE (admin)
$id = (int) ($_GET['id'] ?? 0);
if ($id <= 0) photoFail(400, 'id is required');

if ($method === 'PUT') {
    $act = $action ?: 'resolve';
    $who = $_SESSION['admin_username'] ?? 'admin';
    require_once __DIR__ . '/../audit_log.php';
    audit_log($conn, 'report_' . preg_replace('/[^a-z]/', '', $act), 'report ' . $id);
    hz($conn, function () use ($conn, $act, $id, $who) {
        if ($act === 'approve') {
            $stmt = $conn->prepare("UPDATE hazard_reports SET status = 'active', verified = 1, flags = 0, created_at = NOW() WHERE id = ? AND status = 'pending'");
            $stmt->bind_param('i', $id);
        } elseif ($act === 'verify') {
            $stmt = $conn->prepare("UPDATE hazard_reports SET verified = 1, flags = 0 WHERE id = ? AND status = 'active'");
            $stmt->bind_param('i', $id);
        } elseif ($act === 'reopen') {
            $stmt = $conn->prepare("UPDATE hazard_reports SET status = 'active', verified = 1, resolved_at = NULL, resolved_by = NULL WHERE id = ?");
            $stmt->bind_param('i', $id);
        } else {
            $stmt = $conn->prepare("UPDATE hazard_reports SET status = 'resolved', resolved_at = NOW(), resolved_by = ? WHERE id = ?");
            $stmt->bind_param('si', $who, $id);
        }
        $stmt->execute();
        $stmt->close();
    });
    echo json_encode(['success' => true]);
    exit;
}

if ($method === 'DELETE') {
    require_once __DIR__ . '/../audit_log.php';
    audit_log($conn, 'report_deleted', 'report ' . $id);
    $stmt = $conn->prepare('SELECT photo_path, verified, status, device FROM hazard_reports WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    $row = $stmt->get_result()->fetch_assoc();
    $stmt->close();
    if (!$row) photoFail(404, 'Not found');
    // throwing out a report nobody confirmed counts against the phone that sent it (see the checks on POST)
    if ((int) $row['verified'] === 0 && !empty($row['device'])) {
        hz($conn, function () use ($conn, $row) {
            $stmt = $conn->prepare('INSERT INTO hazard_strikes (device) VALUES (?)');
            $stmt->bind_param('s', $row['device']);
            $stmt->execute();
            $stmt->close();
        });
    }
    photoDelete($row['photo_path']);
    $stmt = $conn->prepare('DELETE FROM hazard_reports WHERE id = ?');
    $stmt->bind_param('i', $id);
    $stmt->execute();
    echo json_encode(['success' => true]);
    exit;
}

photoFail(405, 'Method not allowed');
