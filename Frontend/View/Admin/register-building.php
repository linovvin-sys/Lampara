<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
// Moved to building-edit.php. Kept as a redirect so old bookmarks/links still work.
$qs = $_GET;
unset($qs['tab']);
header('Location: building-edit.php' . ($qs ? '?' . http_build_query($qs) : ''));
exit;
