<?php

// Browser security headers for every page (the API files get theirs from config.php). They are sent from PHP, not only from .htaccess,
// because some servers (this MAMP's FastCGI) do not apply .htaccess headers to PHP pages, and nginx ignores .htaccess altogether.
//
// Content-Security-Policy: only this site's own scripts run (every library is served from Frontend/assets/vendor), nothing can frame
// the site or plug it in as an object, and a page may talk only to itself and the two map tile servers. Inline scripts and styles
// are still allowed because the pages use them, and so is eval (the Vue build compiles the page templates in the browser). Removing
// those two gaps means moving every inline script to a file and pre-compiling the templates.
// The sign scanner is the one page that also lets jsDelivr in: its live text box downloads a reader (worker, wasm, English words).

if (PHP_SAPI !== 'cli' && !headers_sent()) {
    $script = basename($_SERVER['SCRIPT_NAME'] ?? '');
    $scanner = $script === 'scan.php';
    $tiles = $scanner ? '' : ' https://*.tile.openstreetmap.org https://server.arcgisonline.com';
    $reader = $scanner ? ' https://cdn.jsdelivr.net' : '';
    $readerConnect = $scanner ? ' https://cdn.jsdelivr.net https://*.projectnaptha.com' : '';
    header("Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'$reader; "
        . "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; "
        . "img-src 'self' data: blob:$tiles; connect-src 'self' https://fonts.googleapis.com https://fonts.gstatic.com$tiles$readerConnect; media-src 'self' blob: data:; worker-src 'self' blob:; "
        . "manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'");
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: camera=(self), geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), microphone=()');
    if ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https')) {
        header('Strict-Transport-Security: max-age=15552000');
    }
}
