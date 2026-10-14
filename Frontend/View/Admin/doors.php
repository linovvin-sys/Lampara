<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'doors';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/doors.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/doors.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Doors</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= filemtime(__DIR__ . '/../../Css/skeleton.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/utilities.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/utilities.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/design-pass.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/design-pass.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/doors.css?v=<?= $pageCssVer ?>">
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="adminMain">
    <div class="admin-container dr">

      <header class="page-head">
        <div>
          <h1>Doors</h1>
          <p>Tell the app where each building's door is on its floor plan. Visitors are guided to the exit when they leave a building, and from the entrance when they arrive. Pick a path point you already drew.</p>
        </div>
      </header>

      <section class="card dr-card">
        <label class="dr-label" for="drBuilding">Building</label>
        <select id="drBuilding" class="dr-select"><option value="">Choose a building&hellip;</option></select>
        <p class="dr-note" id="drNote" hidden></p>

        <div class="dr-grid" id="drForm" hidden>
          <div>
            <label class="dr-label" for="drEntry">Entrance: where people come in</label>
            <select id="drEntry" class="dr-select"></select>
          </div>
          <div>
            <label class="dr-label" for="drExit">Exit: where people leave</label>
            <select id="drExit" class="dr-select"></select>
          </div>
        </div>
        <div class="dr-actions" id="drActions" hidden>
          <button type="button" class="btn btn-primary" id="drSave">Save doors</button>
          <button type="button" class="btn btn-secondary" id="drSame">Use the entrance as the exit too</button>
        </div>
        <p class="dr-hint">Not set yet? The app falls back to a point named like an entrance or exit, and then to a guess at the outermost point of the entrance floor. Setting it here removes the guess.</p>
      </section>
    </div>
  </main>
</div>

<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="../../Js/Admin/doors.js?v=<?= $pageJsVer ?>"></script>
</body>
</html>
