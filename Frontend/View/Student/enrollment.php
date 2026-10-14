<?php require_once __DIR__ . '/../../../Backend/security_headers.php';
require_once __DIR__ . '/../../../Backend/institution.php';
if (!inst_feature('enrollment')) { header('Location: ../Public/index.php'); exit; }   // this school switched the feature off (Admin > School settings)
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/enrollment.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Enrollment guide</title>
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
<link rel="stylesheet" href="../../Css/pixel-scene.css?v=<?= filemtime(__DIR__ . '/../../Css/pixel-scene.css') ?>">
<link rel="stylesheet" href="../../Css/game-hud.css?v=<?= filemtime(__DIR__ . '/../../Css/game-hud.css') ?>">
<link rel="stylesheet" href="../../Css/Student/enrollment.css?v=<?= $pageCssVer ?>">
</head>
<body>
<div class="en-bg ps" id="enBg" aria-hidden="true"></div>
<main class="en">
  <a class="en-back" href="../Public/index.php" aria-label="Back to the home page">&larr; Home</a>
  <header class="en-head">
    <div class="en-buddy" data-game-buddy data-lines="Enrolling? I will walk you through it.|One office at a time.|Tap Show me the way at each stop.|Seven steps and you are in!"></div>
    <h1>Enrollment guide</h1>
    <p><span id="enCount">Step by step</span>, one office after another. Tap <b>Show me the way</b> at each stop and Lampara guides you there on the floor plan.</p>
  </header>

  <section class="en-progress" aria-label="Your progress">
    <div class="en-bar" role="progressbar" aria-label="Enrollment progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="enBar"><span id="enFill"></span></div>
    <p id="enCount">Loading&hellip;</p>
  </section>

  <p class="en-error" id="enError" role="alert" hidden></p>
  <ol class="en-steps" id="enSteps" aria-label="Enrollment steps"></ol>

  <div class="en-foot">
    <p>Office hours are in each room's details.</p>
    <button type="button" class="en-reset" id="enReset">Start over</button>
  </div>
</main>
<script src="../../Js/Include/room-number.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/room-number.js') ?>"></script>
<script src="../../Js/Include/offline-cache.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/offline-cache.js') ?>"></script>
<script src="../../Js/Include/enrollment-steps.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/enrollment-steps.js') ?>"></script>
<script src="../../Js/Include/mascots.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/mascots.js') ?>"></script>
<script src="../../Js/Include/game-hud.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-hud.js') ?>"></script>
<script src="../../Js/Public/guide-audio.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-audio.js') ?>"></script>
<script src="../../Js/Include/game-feel.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-feel.js') ?>"></script>
<script src="../../Js/Include/read-more.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/read-more.js') ?>"></script>
<script src="../../Js/Include/pixel-scene.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/pixel-scene.js') ?>"></script>
<script>LamparaPixelScene.mount(document.getElementById('enBg'));</script>
<script src="../../Js/Include/student-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Student/enrollment.js?v=<?= filemtime(__DIR__ . '/../../Js/Student/enrollment.js') ?>"></script>
</body>
</html>
