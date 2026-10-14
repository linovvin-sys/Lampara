<?php

// Tiny per-visitor throttle, kept in the server's temp folder (no database change). It exists so
// the public Gemini endpoints (scan, chat) cannot be used to run up the API bill, and so the admin
// login cannot be guessed at without limit. The limits are generous on purpose: a whole class on
// one school Wi-Fi shares an IP address.
// An optional $who (for example a device cookie) separates visitors who share one IP address: the same bucket name with a
// different $who is a different counter.

// The visitor's address. Behind a tunnel or reverse proxy on this machine or network (ngrok, a hosting proxy) REMOTE_ADDR is the proxy
// itself, so every visitor would share one limit; then the first address in X-Forwarded-For is used. It is only believed when the
// request really came from a private or loopback address, so a visitor cannot choose their own.
function client_ip(): string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'cli';
    $fwd = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($fwd !== '' && filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
        $first = trim(explode(',', $fwd)[0]);
        if (filter_var($first, FILTER_VALIDATE_IP)) return $first;
    }
    return $ip;
}

function rate_limit_file(string $bucket, string $who = ''): string
{
    $ip = client_ip();
    return rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . 'lampara_rl_' . md5($bucket . '|' . $ip . ($who !== '' ? '|' . $who : '')) . '.json';
}

// Reads the hit times still inside the window.
function rate_limit_recent(string $bucket, int $windowSec, string $who = ''): array
{
    $file = rate_limit_file($bucket, $who);
    $hits = is_file($file) ? (json_decode((string) @file_get_contents($file), true) ?: []) : [];
    $cut = time() - $windowSec;
    return array_values(array_filter($hits, fn($t) => $t > $cut));
}

function rate_limit_record(string $bucket, int $windowSec, string $who = ''): void
{
    $hits = rate_limit_recent($bucket, $windowSec, $who);
    $hits[] = time();
    @file_put_contents(rate_limit_file($bucket, $who), json_encode($hits), LOCK_EX);
}

function rate_limit_clear(string $bucket, string $who = ''): void
{
    @unlink(rate_limit_file($bucket, $who));
}

// Counts this request and stops it with HTTP 429 when the visitor is over $max in $windowSec.
function rate_limit_or_die(string $bucket, int $max, int $windowSec, string $message = 'Too many requests. Please wait a moment and try again.', string $who = ''): void
{
    if (count(rate_limit_recent($bucket, $windowSec, $who)) >= $max) {
        http_response_code(429);
        header('Retry-After: ' . $windowSec);
        echo json_encode(['success' => false, 'error' => $message, 'reply' => $message]);
        exit;
    }
    rate_limit_record($bucket, $windowSec, $who);
}
