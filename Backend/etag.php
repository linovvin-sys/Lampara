<?php

// Send a JSON read with an ETag, and answer 304 (no body) when the visitor already holds exactly this version.
// Cheap for the two biggest reads (rooms, buildings): a phone re-checking the directory costs a few hundred bytes, not tens of KB.
function json_with_etag(array $payload): void
{
    $json = json_encode($payload);
    $tag = '"' . md5($json) . '"';
    header('ETag: ' . $tag);
    header('Cache-Control: no-cache'); // always ask, but a 304 is enough
    if (trim($_SERVER['HTTP_IF_NONE_MATCH'] ?? '') === $tag) {
        http_response_code(304);
        return;
    }
    echo $json;
}
