<?php

// Two-step login codes (RFC 6238: the 6-digit codes of Google Authenticator, Microsoft Authenticator, Authy and the like).

const TOTP_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function totp_new_secret(): string
{
    $bytes = random_bytes(20); $bits = ''; $out = '';
    foreach (str_split($bytes) as $b) $bits .= str_pad(decbin(ord($b)), 8, '0', STR_PAD_LEFT);
    foreach (str_split($bits, 5) as $chunk) $out .= TOTP_ALPHABET[bindec(str_pad($chunk, 5, '0'))];
    return $out;
}
function totp_decode(string $secret): string
{
    $bits = '';
    foreach (str_split(strtoupper(preg_replace('/[^A-Za-z2-7]/', '', $secret))) as $ch) { $i = strpos(TOTP_ALPHABET, $ch); if ($i !== false) $bits .= str_pad(decbin($i), 5, '0', STR_PAD_LEFT); }
    $out = '';
    foreach (str_split($bits, 8) as $byte) if (strlen($byte) === 8) $out .= chr(bindec($byte));
    return $out;
}
function totp_code(string $secret, int $step): string
{
    $hash = hash_hmac('sha1', pack('N*', 0, $step), totp_decode($secret), true);
    $o = ord($hash[19]) & 0xF;
    $n = ((ord($hash[$o]) & 0x7F) << 24) | ((ord($hash[$o + 1]) & 0xFF) << 16) | ((ord($hash[$o + 2]) & 0xFF) << 8) | (ord($hash[$o + 3]) & 0xFF);
    return str_pad((string) ($n % 1000000), 6, '0', STR_PAD_LEFT);
}
// A code from this 30 second step, or one step either side (phone clocks drift a little).
function totp_verify(string $secret, string $code): bool
{
    $code = preg_replace('/\D/', '', $code);
    if (strlen($code) !== 6) return false;
    $now = intdiv(time(), 30);
    foreach ([0, -1, 1] as $d) if (hash_equals(totp_code($secret, $now + $d), $code)) return true;
    return false;
}
function totp_uri(string $secret, string $account): string
{
    return 'otpauth://totp/' . rawurlencode('Lampara:' . $account) . '?secret=' . $secret . '&issuer=Lampara';
}
