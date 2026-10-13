<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/journey.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Student/journey.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Your route</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=2">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=2">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=2">
<meta name="theme-color" content="#161850">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/Student/journey.css?v=<?= $pageCssVer ?>">
</head>
<body>
<div class="jr" id="jr">
  <header class="jr-top">
    <button type="button" class="jr-back" id="back" aria-label="Go back">&larr; Back</button>
    <div class="jr-title" id="title">Preparing your route&hellip;</div>
  </header>

  <ol class="jr-steps" id="steps" hidden></ol>

  <p class="jr-error" id="error" hidden></p>
  <div class="jr-toast" id="toast" role="status" hidden></div>
  <div class="jr-error-links" id="errorLinks" hidden>
    <a class="jr-btn" href="manual-search.php">Search for a room instead</a>
    <a class="jr-btn jr-btn-alt" href="where.php">Start over</a>
  </div>

  <!-- Walking inside a building: the floor plan with the route drawn on it -->
  <section class="jr-plan" id="viewPlan" hidden>
    <div class="jr-tabs" id="tabs"></div>
    <canvas id="cv"></canvas>
    <div class="jr-hud"><span class="jr-pill" id="hudL"></span><span class="jr-pill" id="hudR"></span></div>
    <div class="jr-card" id="card" role="dialog" aria-live="polite">
      <div class="jr-card-in">
        <h2 id="cardTitle"></h2>
        <p id="cardSub"></p>
        <button type="button" class="jr-btn" id="cardGo"></button>
      </div>
    </div>
  </section>

  <section class="jr-text" id="viewText" aria-labelledby="textTitle">
    <h2 id="textTitle">Directions in words</h2>
    <ol id="textSteps"></ol>
  </section>

  <!-- Walking between buildings -->
  <section class="jr-out" id="viewOut" hidden>
    <div class="jr-out-in">
      <div class="jr-out-ico" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><path d="M12 8v6m0 0-3 6m3-6 3 6M7 11l5-3 5 3"/></svg>
      </div>
      <h2 id="outTitle"></h2>
      <p id="outText"></p>
      <p class="jr-out-meta" id="outMeta"></p>
      <p class="jr-out-warn" id="outWarn" hidden></p>
      <a class="jr-btn" id="outOpen" href="#">Open the walking guide</a>
      <button type="button" class="jr-btn jr-btn-alt" id="outDone">I am at the entrance</button>
    </div>
  </section>

  <footer class="jr-bottom" id="bottom" hidden>
    <button type="button" class="jr-chip" id="replay">Show again</button>
    <a class="jr-chip" id="camLink" href="#" hidden>Use my camera instead</a>
    <button type="button" class="jr-chip" id="share">Share this route</button>
    <a class="jr-chip" id="startOver" href="where.php">Start over</a>
    <a class="jr-chip" href="report.php">Report a problem</a>
  </footer>
</div>

<script src="../../Js/Include/trip.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/trip.js') ?>"></script>
<script src="../../Js/Include/offline-cache.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/offline-cache.js') ?>"></script>
<script src="../../Js/Include/floor-route.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/floor-route.js') ?>"></script>
<script src="../../Js/Include/building-doors.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/building-doors.js') ?>"></script>
<script src="../../Js/Student/journey.js?v=<?= $pageJsVer ?>"></script>
<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
</body>
</html>
