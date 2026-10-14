<?php

// Session and request safety helpers, shared by every page and API that uses the admin session.
//   lampara_session_start()      starts the session with HttpOnly and SameSite=Lax cookies (Secure too when the site is on HTTPS)
//   lampara_same_origin_or_die() stops a state-changing request that a different website sent from the visitor's browser (CSRF)

if (!function_exists('lampara_session_start')) {
    function lampara_session_start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) return;
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        if (!headers_sent()) {
            session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'httponly' => true, 'samesite' => 'Lax', 'secure' => $https]);
        }
        @session_start();
        // An admin who has been away for 8 hours is signed out (the clock restarts with every request).
        if (!empty($_SESSION['admin_id'])) {
            if (!empty($_SESSION['admin_seen']) && time() - (int) $_SESSION['admin_seen'] > 8 * 3600) { $_SESSION = []; @session_destroy(); return; }
            $_SESSION['admin_seen'] = time();
        }
    }
}

// Roles: 'admin' does everything, including school settings, data packs and the team. A 'psmo' account is staff with limited access:
// an administrator ticks which areas it may use (see lampara_access_areas), so one group of PSMO staff can run buildings and rooms while
// another runs the campus paths. A PSMO account with nothing ticked gets buildings and rooms, as before.
if (!function_exists('lampara_admin_role')) {
    function lampara_admin_role(): string { return ($_SESSION['admin_role'] ?? 'admin') === 'psmo' ? 'psmo' : 'admin'; }

    // The areas an administrator can hand out. pages: admin pages; api: endpoints that need the sign-in.
    function lampara_access_areas(): array
    {
        return [
            'buildings'  => ['label' => 'Buildings and rooms', 'about' => 'Add and edit buildings, rooms, floor plans, entrances and exits, and close them for maintenance.',
                'home' => 'buildings.php',
                'pages' => ['buildings.php', 'building-edit.php', 'room-edit.php', 'doors.php'],
                'api' => ['buildings.php', 'rooms.php', 'floor-plans.php', 'floor-plan-graph.php', 'building-doors.php', 'photos.php', 'qr-anchors.php', 'flags.php', 'lockdown.php']],
            'campus'     => ['label' => 'Campus map and paths', 'about' => 'Draw walking paths, link building outlines, and place pins on the campus map.',
                'home' => 'campus-paths.php',
                'pages' => ['campus-paths.php', 'building-outlines.php', 'campus-map.php'],
                'api' => ['campus-graph.php', 'campus-footprints.php', 'static-maps.php', 'static-map-markers.php']],
            'reports'    => ['label' => 'Visitor reports', 'about' => 'Approve, confirm and clear closed-building and blocked-path reports.',
                'home' => 'hazards.php', 'pages' => ['hazards.php'], 'api' => ['hazards.php']],
            'enrollment' => ['label' => 'Enrollment steps', 'about' => 'Edit the enrollment route students follow.',
                'home' => 'enrollment-steps.php', 'pages' => ['enrollment-steps.php'], 'api' => ['enrollment-steps.php']],
            'assistant'  => ['label' => 'Test the assistant', 'about' => 'Try the question-and-answer assistant as a student would.',
                'home' => 'test-chat.php', 'pages' => ['test-chat.php'], 'api' => []],
        ];
    }
    // What this PSMO account may use. Re-read from the database at most once a minute, so a change (or a disabled account) takes effect quickly.
    function lampara_admin_perms(): array
    {
        if (lampara_admin_role() !== 'psmo') return array_keys(lampara_access_areas());
        $fresh = isset($_SESSION['admin_perms_at']) && time() - (int) $_SESSION['admin_perms_at'] < 60;
        if (!$fresh && !empty($_SESSION['admin_id'])) {
            try {
                require_once __DIR__ . '/config.php';
                $c = (new Database())->connect();
                $r = $c->query('SELECT permissions, disabled FROM admins WHERE id = ' . (int) $_SESSION['admin_id']);
                $row = $r ? $r->fetch_assoc() : null;
                if ($row && (int) $row['disabled'] === 1) { $_SESSION = []; @session_destroy(); return []; }
                if ($row) { $_SESSION['admin_perms'] = $row['permissions'] === null || $row['permissions'] === '' ? ['buildings'] : array_values(array_intersect(explode(',', $row['permissions']), array_keys(lampara_access_areas()))); $_SESSION['admin_perms_at'] = time(); }
            } catch (Throwable $e) { /* keep what the session had */ }
        }
        $p = $_SESSION['admin_perms'] ?? ['buildings'];
        return is_array($p) ? $p : ['buildings'];
    }
    function lampara_admin_can(string $area): bool { return in_array($area, lampara_admin_perms(), true); }
    // Files every signed-in PSMO account needs, whatever it was given.
    function lampara_psmo_allows(string $file): bool
    {
        $f = basename($file);
        if (in_array($f, ['changes.php', 'admin-sync.php', 'ping.php', 'account.php'], true)) return true;
        foreach (lampara_access_areas() as $key => $a) {
            if (in_array($f, array_merge($a['pages'], $a['api']), true) && lampara_admin_can($key)) return true;
        }
        return false;
    }
    // Where a PSMO account lands: the first area it was given.
    function lampara_psmo_home(): string
    {
        $areas = lampara_access_areas();
        foreach (lampara_admin_perms() as $k) if (isset($areas[$k])) return $areas[$k]['home'];
        return 'account.php';
    }
}

if (!function_exists('lampara_same_origin_or_die')) {
    // Browsers attach Origin (or at least Referer) to a cross-site POST/PUT/DELETE. When one is present it must name this host.
    // Requests with neither header (scripts, curl, the CLI) pass: they carry no browser cookie of a logged-in admin to abuse.
    function lampara_same_origin_or_die(): void
    {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) return;
        $from = $_SERVER['HTTP_ORIGIN'] ?? ($_SERVER['HTTP_REFERER'] ?? '');
        if ($from === '' || $from === 'null') {
            if ($from === 'null') { http_response_code(403); header('Content-Type: application/json'); echo json_encode(['success' => false, 'error' => 'Request blocked']); exit; }
            return;
        }
        $host = parse_url($from, PHP_URL_HOST);
        $port = parse_url($from, PHP_URL_PORT);
        $theirs = strtolower((string) $host . ($port ? ':' . $port : ''));
        $mine = strtolower((string) ($_SERVER['HTTP_HOST'] ?? ''));
        // "localhost" and "localhost:80" are the same site
        $strip = fn(string $h) => preg_replace('/:(80|443)$/', '', $h);
        if ($theirs === '' || $strip($theirs) !== $strip($mine)) {
            http_response_code(403);
            header('Content-Type: application/json');
            echo json_encode(['success' => false, 'error' => 'Request blocked: it did not come from this site']);
            exit;
        }
    }
}
