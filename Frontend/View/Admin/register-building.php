<?php
// Merged into buildings.php (Add / Edit Building tab). Kept as a redirect
// so old bookmarks/links (including ?edit=<id>) still work.
$qs = $_GET;
$qs['tab'] = 'add-building';
header('Location: buildings.php?' . http_build_query($qs));
exit;
