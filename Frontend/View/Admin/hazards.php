<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'hazards';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/hazards.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/hazards.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Reports</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=2">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=2">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=2">
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
<link rel="stylesheet" href="../../Css/Admin/hazards.css?v=<?= $pageCssVer ?>">
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="adminMain">
    <div class="admin-container hz">

      <header class="page-head">
        <div>
          <h1>Reports from visitors</h1>
          <p>Closed buildings and blocked paths that people photographed on campus. A new report is only seen by admins until you approve it; then everyone using the app sees it.</p>
        </div>
      </header>

      <div class="hz-tabs" role="tablist">
        <button type="button" role="tab" class="hz-tab is-on" data-status="pending">Waiting for approval <span id="hzPending"></span></button>
        <button type="button" role="tab" class="hz-tab" data-status="active">Showing to everyone <span id="hzCount"></span></button>
        <button type="button" role="tab" class="hz-tab" data-status="resolved">Cleared</button>
      </div>

      <p class="hz-empty" id="hzEmpty" hidden></p>
      <div class="hz-list" id="hzList"></div>
    </div>
  </main>
</div>

<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="../../Js/Admin/hazards.js?v=<?= $pageJsVer ?>"></script>
</body>
</html>
