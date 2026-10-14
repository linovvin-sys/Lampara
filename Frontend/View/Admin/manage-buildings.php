<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
// The building workspace is split into buildings.php, building-edit.php and room-edit.php.
// Kept as a redirect so old bookmarks still work.
header('Location: buildings.php');
exit;
