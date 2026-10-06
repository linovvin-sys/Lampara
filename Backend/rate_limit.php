<?php

// Tiny per-visitor throttle, kept in the server's temp folder (no database change). It exists so
// the public Gemini endpoints (scan, chat) cannot be used to run up the API bill, and so the admin
// login cannot be guessed at without limit. The limits are generous on purpose: a whole class on
// one school Wi-Fi shares an IP address.

function rate_limit_file(string $bucket): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
    return rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'lampara_rl_' . md5($bucket . '|' . $ip) . '.json';
}

// Reads the hit times still inside the window.
function rate_limit_recent(string $bucket, int $windowSec): array
{
    $file = rate_limit_file($bucket);
    $hits = is_file($file) ? (json_decode((string) @file_get_contents($file), true) ?: []) : [];
    $cut = time() - $windowSec;
    return array_values(array_filter($hits, fn($t) => $t > $cut));
}

function rate_limit_record(string $bucket, int $windowSec): void
{
    $hits = rate_limit_recent($bucket, $windowSec);
    $hits[] = time();
    @file_put_contents(rate_limit_file($bucket), json_encode($hits), LOCK_EX);
}

function rate_limit_clear(string $bucket): void
{
    @unlink(rate_limit_file($bucket));
}

// Counts this request and stops it with HTTP 429 when the visitor is over $max in $windowSec.
function rate_limit_or_die(string $bucket, int $max, int $windowSec, string $message = 'Too many requests. Please wait a moment and try again.'): void
{
    if (count(rate_limit_recent($bucket, $windowSec)) >= $max) {
        http_response_code(429);
        header('Retry-After: ' . $windowSec);
        echo json_encode(['success' => false, 'error' => $message, 'reply' => $message]);
        exit;
    }
    rate_limit_record($bucket, $windowSec);
}
