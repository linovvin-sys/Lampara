<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'building-outlines';
$v = fn($f) => filemtime(__DIR__ . '/../../' . $f);
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara - Admin · Building Outlines</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=2">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= $v('Css/skeleton.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= $v('Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $v('Css/Admin/admin.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/utilities.css?v=<?= $v('Css/Admin/utilities.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/design-pass.css?v=<?= $v('Css/Admin/design-pass.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/campus-paths.css?v=<?= $v('Css/Admin/campus-paths.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/building-outlines.css?v=<?= $v('Css/Admin/building-outlines.css') ?>">
<link rel="stylesheet" href="../../assets/vendor/leaflet/leaflet.css">
<script src="../../assets/vendor/leaflet/leaflet.js"></script>
<script src="../../Js/Include/campus-bounds.js?v=<?= $v('Js/Include/campus-bounds.js') ?>"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="adminMain">
    <div class="admin-container">

      <div class="page-head">
        <div>
          <h1>Building Outlines</h1>
          <p id="summary">Loading outlines…</p>
        </div>
        <a class="btn btn-secondary" href="../Public/map.php" target="_blank" rel="noopener">Preview 3D map</a>
      </div>

      <div class="paths-layout">
        <div class="card map-card">
          <p class="hint">Each shape is a building outline from the campus map. Tap one, then choose which registered building it belongs to. Only linked outlines are coloured and tappable on the 3D map. A building made of several blocks can share one building.</p>
          <div class="paths-map" id="map" role="application" aria-label="Campus building outlines"></div>
        </div>

        <aside class="side-col">
          <div class="card" id="panel">
            <p class="side-title">Selected outline</p>
            <p class="side-empty" id="empty">Tap an outline on the map.</p>
            <div id="form" hidden>
              <p class="mono" id="oid"></p>
              <label class="ol-label" for="bsel">Belongs to</label>
              <select id="bsel"></select>
              <div class="side-actions">
                <button type="button" class="btn btn-primary" id="save">Save</button>
                <button type="button" class="btn btn-secondary" id="unlink">Unlink</button>
              </div>
            </div>
          </div>
          <div class="card">
            <p class="side-title">Key</p>
            <ul class="ol-key">
              <li><i class="sw sw-none"></i>Not linked to a building</li>
              <li><i class="sw sw-on"></i>Linked (colour per building)</li>
              <li><i class="sw sw-sel"></i>Selected</li>
            </ul>
            <p class="hint" id="unlinked-note" hidden></p>
          </div>
        </aside>
      </div>

    </div>
  </main>
</div>

<script src="../../Js/Admin/building-outlines.js?v=<?= $v('Js/Admin/building-outlines.js') ?>"></script>
</body>
</html>
