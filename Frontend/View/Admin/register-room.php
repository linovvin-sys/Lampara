<?php
// Merged into buildings.php (Add / Edit Room tab). Kept as a redirect so
// old bookmarks/links still work.
$qs = $_GET;
$qs['tab'] = 'add-room';
header('Location: buildings.php?' . http_build_query($qs));
exit;
