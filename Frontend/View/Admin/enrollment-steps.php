<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'enrollment-steps';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/enrollment-steps.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/enrollment-steps.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Enrollment steps</title>
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
<link rel="stylesheet" href="../../Css/Admin/enrollment-steps.css?v=<?= $pageCssVer ?>">
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="adminMain">
    <div class="admin-container es">

      <header class="page-head flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1>Enrollment steps</h1>
          <p>Build the route new students follow. Pick each office from the directory and the rest fills in for you. Drag stops to reorder, then save.</p>
        </div>
        <div class="page-actions grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button type="button" class="btn btn-secondary" id="esLink" hidden>Link my steps to the directory</button>
          <button type="button" class="btn btn-primary" id="esAdd"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> Add stops</button>
        </div>
      </header>

      <div class="es-status" role="status">
        <strong id="esCount">Loading…</strong>
        <span class="es-issue" id="esIssue" hidden></span>
        <span class="es-dirty" id="esDirty" hidden><span class="dirty-dot"></span>Unsaved changes</span>
      </div>

      <section class="card es-picker" id="esPicker" hidden aria-label="Add stops from the directory">
        <div class="es-picker-head">
          <h2>Add stops from the directory</h2>
          <button type="button" class="es-btn alt sm" id="esPickClose" aria-label="Close">Close</button>
        </div>
        <p class="es-picker-sub">Tick the offices students visit. Each one becomes a stop with its title, place and wording filled in.</p>
        <div class="es-picker-tools">
          <select id="esPickBuilding" aria-label="Building"></select>
          <input type="search" id="esPickSearch" placeholder="Search offices" aria-label="Search offices">
        </div>
        <div class="es-pick-list" id="esPickList"></div>
        <div class="es-picker-foot">
          <button type="button" class="btn btn-primary" id="esPickAdd" disabled>Add stops</button>
          <button type="button" class="btn btn-secondary" id="esBlank">Or start a blank stop</button>
        </div>
      </section>

      <p class="es-msg" id="esMsg" hidden></p>
      <ol class="es-list" id="esList"></ol>
      <div class="es-bar">
        <button type="button" class="es-btn" id="esSave" disabled>Save steps</button>
        <button type="button" class="es-btn danger" id="esReset">Go back to the built-in steps</button>
      </div>
    </div>
  </main>
</div>

<script src="../../assets/vendor/sweetalert2/sweetalert2-11.26.25.all.min.js"></script>
<script src="../../Js/Include/enrollment-steps.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/enrollment-steps.js') ?>"></script>
<script src="../../Js/Admin/enrollment-steps.js?v=<?= $pageJsVer ?>"></script>
</body>
</html>
