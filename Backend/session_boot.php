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
