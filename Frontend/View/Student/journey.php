<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
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
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#161850">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pixelify+Sans:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/theme-vars.css?v=<?= filemtime(__DIR__ . '/../../Css/theme-vars.css') ?>">
<script src="../../../Backend/api/institution.php?format=js"></script>
<script src="../../Js/Include/theme.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/theme.js') ?>"></script>
<link rel="stylesheet" href="../../Css/Student/journey.css?v=<?= $pageCssVer ?>">
</head>
<body>
<div class="jr" id="jr">
  <header class="jr-top">
    <button type="button" class="jr-back jr-act back" id="back" aria-label="Go back"><i data-px="back" aria-hidden="true"></i><span>Back</span></button>
    <div class="jr-title" id="title">Preparing your route&hellip;</div>
    <button type="button" class="jr-act jr-info-btn" id="infoBtn" hidden aria-haspopup="dialog"><span>Room info</span></button>
  </header>

  <!-- About the room you are heading to: shown first, and again whenever "Room info" is tapped -->
  <div class="jr-info" id="info" role="dialog" aria-modal="true" aria-labelledby="infoName" hidden>
    <div class="jr-info-box">
      <img data-mascot class="jr-mascot" alt="" width="64" height="64">
      <div class="jr-info-in">
        <img class="jr-info-photo" id="infoPhoto" alt="" hidden>
        <span class="jr-chip" id="infoType"></span>
        <h2 id="infoName"></h2>
        <p class="jr-info-where" id="infoWhere"></p>
        <ul class="jr-info-facts" id="infoFacts"></ul>
        <button type="button" class="jr-btn" id="infoGo">Show me the way</button>
      </div>
    </div>
  </div>

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
    <button type="button" class="jr-snd" id="snd" aria-pressed="true" aria-label="Music is on. Tap to mute">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path class="on" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="off" d="m16 9.5 5 5m0-5-5 5"/></svg>
    </button>
    <div class="jr-zoom" role="group" aria-label="Zoom the floor plan">
      <button type="button" id="zIn" aria-label="Zoom in">+</button>
      <button type="button" id="zOut" aria-label="Zoom out" disabled>&minus;</button>
      <button type="button" id="zFit" aria-label="Show the whole plan" hidden>Fit</button>
    </div>
    <div class="jr-hud"><span class="jr-pill" id="hudL"></span><span class="jr-pill" id="hudR"></span></div>
    <div class="jr-card" id="card" role="dialog" aria-live="polite">
      <div class="jr-card-box">
        <img data-mascot class="jr-mascot" alt="" width="64" height="64">
        <button type="button" class="jr-min" id="cardMin" aria-expanded="true">Hide</button>
        <div class="jr-card-in">
          <h2 id="cardTitle"></h2>
          <p id="cardSub"></p>
          <button type="button" class="jr-btn" id="cardGo"></button>
        </div>
      </div>
    </div>
  </section>

  <!-- The step-by-step words are kept for screen readers only (the animated plan carries the route for everyone else). -->
  <section class="jr-text jr-sr" id="viewText" aria-labelledby="textTitle">
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
    <button type="button" class="jr-act replay" id="replay"><i data-px="replay" aria-hidden="true"></i><span>Show again</span></button>
    <button type="button" class="jr-act share" id="share" aria-label="Share this route"><i data-px="share" aria-hidden="true"></i><span>Share</span></button>
    <a class="jr-act report" href="report.php" aria-label="Report a problem"><i data-px="flag" aria-hidden="true"></i><span>Report</span></a>
    <a class="jr-act restart" id="startOver" href="where.php"><i data-px="home" aria-hidden="true"></i><span>Start over</span></a>
    <a class="jr-act enroll" id="enrollLink" href="enrollment.php" aria-label="Enrollment steps"><i data-px="flag" aria-hidden="true"></i><span>Enrollment steps</span></a>
  </footer>
</div>

<script src="../../Js/Include/trip.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/trip.js') ?>"></script>
<script src="../../Js/Include/offline-cache.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/offline-cache.js') ?>"></script>
<script src="../../Js/Include/floor-route.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/floor-route.js') ?>"></script>
<script src="../../Js/Include/building-doors.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/building-doors.js') ?>"></script>
<script src="../../Js/Include/enrollment-steps.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/enrollment-steps.js') ?>"></script>
<script src="../../Js/Include/mascots.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/mascots.js') ?>"></script>
<script src="../../Js/Public/guide-audio.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-audio.js') ?>"></script>
<script src="../../Js/Student/journey.js?v=<?= $pageJsVer ?>"></script>
<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
<script src="../../Js/Include/game-feel.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-feel.js') ?>"></script>
<script src="../../Js/Include/read-more.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/read-more.js') ?>"></script>
</body>
</html>
