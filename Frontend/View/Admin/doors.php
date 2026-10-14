<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
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
<title>Lampara — Admin · Entrance and exit</title>
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

      <header class="page-head flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1>Entrance and exit</h1>
          <p>Mark where people walk in and out of each building, right on its floor plan. Visitors are guided from the entrance when they arrive and to the exit when they leave.</p>
        </div>
      </header>

      <div class="dr-layout grid grid-cols-1 items-start gap-4 min-[1000px]:grid-cols-[17.5rem_minmax(0,1fr)]">
        <details class="dr-list dd-anim dr-dd" id="drDd" open>
          <summary class="dr-dd-sum"><span class="dr-dd-label">Building</span><strong id="drCurrent">Choose a building</strong><span class="dr-dd-prog"><span id="drDone2"></span></span></summary>
          <div class="dr-dd-body">
            <div class="dr-progress">
              <div class="dr-progress-text"><strong id="drDone">&ndash;</strong><span>buildings have both doors set</span></div>
              <div class="dr-meter" aria-hidden="true"><span id="drMeter"></span></div>
            </div>
            <ul id="drBuildings" class="dr-buildings"></ul>
          </div>
        </details>

        <section class="dr-work" id="drWork" aria-live="polite">
          <div class="dr-empty" id="drEmpty">Loading buildings&hellip;</div>
          <div id="drPanel" hidden>
            <div class="dr-head">
              <h2 id="drName"></h2>
              <div class="dr-slots">
                <div class="dr-slot is-entry" id="drSlotEntry"></div>
                <div class="dr-slot is-exit" id="drSlotExit"></div>
              </div>
            </div>
            <div class="dr-bar">
              <div class="dr-floors" id="drFloors" role="tablist" aria-label="Floors"></div>
              <button type="button" class="btn btn-secondary" id="drSuggest">Suggest the door</button>
            </div>
            <p class="dr-note" id="drNote" hidden></p>
            <div class="dr-stage" id="drStage">
              <div class="dr-plan" id="drPlan"></div>
              <div class="dr-pop" id="drPop" role="dialog" aria-label="Set this point as a door" hidden></div>
            </div>
            <ul class="dr-legend" aria-label="Key">
              <li><span class="dr-key is-entry"></span>Entrance</li>
              <li><span class="dr-key is-exit"></span>Exit</li>
              <li><span class="dr-key"></span>Path point (tap one to choose)</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  </main>
</div>

<script src="../../assets/vendor/sweetalert2/sweetalert2-11.26.25.all.min.js"></script>
<script src="../../Js/Include/admin-dropdown.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/admin-dropdown.js') ?>"></script>
<script src="../../Js/Admin/doors.js?v=<?= $pageJsVer ?>"></script>
</body>
</html>
