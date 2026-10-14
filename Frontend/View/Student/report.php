<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
require_once __DIR__ . '/../../../Backend/institution.php';
if (!inst_feature('hazards')) { header('Location: ../Public/index.php'); exit; }   // this school switched the feature off (Admin > School settings)
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/report.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Student/report.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Report a problem</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#161850">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/Student/report.css?v=<?= $pageCssVer ?>">
<script src="../../../Backend/api/institution.php?format=js"></script>
<script src="../../Js/Include/campus-bounds.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/campus-bounds.js') ?>"></script>
<script src="../../Js/Include/geofence.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/geofence.js') ?>"></script>
</head>
<body>
<main class="rp">
  <button type="button" class="rp-back" id="back">&larr; Back</button>

  <!-- 1. what is wrong -->
  <section id="s1">
    <h1>What do you want to report?</h1>
    <p class="rp-sub">The school staff will check your report, and then everyone using Lampara will see the warning.</p>
    <button type="button" class="rp-big" data-kind="restricted">
      <b>A building is closed or off-limits</b>
      <small>Locked, under repair, or people are not allowed in</small>
    </button>
    <button type="button" class="rp-big" data-kind="blocked">
      <b>A path is blocked</b>
      <small>A flood, construction, a fallen tree, or something in the way</small>
    </button>
  </section>

  <!-- 2. photo of the scene -->
  <section id="s2" hidden>
    <h1>Take a photo of it</h1>
    <p class="rp-sub">Point the camera at the building or the path. Please keep people's faces out of the photo.</p>
    <div class="rp-cam">
      <video id="video" autoplay playsinline muted></video>
      <img id="shot" alt="Your photo" hidden>
      <div class="rp-nocam" id="nocam" hidden>The camera could not be opened. You can choose a photo instead, or send the report without one.</div>
    </div>
    <button type="button" class="rp-btn" id="snap">Take photo</button>
    <button type="button" class="rp-btn rp-alt" id="retake" hidden>Take it again</button>
    <label class="rp-btn rp-alt rp-file">Choose a photo from this phone<input type="file" id="file" accept="image/*" capture="environment"></label>
    <button type="button" class="rp-btn rp-ok" id="toDetails" hidden>Next</button>
    <button type="button" class="rp-link" id="skipPhoto">Continue without a photo</button>
  </section>

  <!-- 3. where, then send -->
  <section id="s3" hidden>
    <h1>Where is it?</h1>
    <p class="rp-loc" id="loc">Finding where you are&hellip;</p>
    <label class="rp-label" for="bld">Which building is it near?</label>
    <select id="bld"><option value="">Not at a building (on the walkway)</option></select>
    <label class="rp-label" for="note">Anything we should know? (optional)</label>
    <textarea id="note" maxlength="255" rows="3" placeholder="For example: the gate is locked"></textarea>
    <label class="rp-urgent" for="urgent"><input type="checkbox" id="urgent"><span><b>This is dangerous or urgent</b><small>It shows to everyone straight away, marked "not yet checked by staff", when it has a photo and you are at the place. Please use it only for real danger.</small></span></label>
    <p class="rp-err" id="err" hidden></p>
    <button type="button" class="rp-btn rp-ok" id="send">Send report</button>
  </section>

  <!-- done -->
  <section id="s4" hidden class="rp-done">
    <div class="rp-check" aria-hidden="true">&#10003;</div>
    <h1>Thank you</h1>
    <p class="rp-sub">Your report was sent to the school staff. As soon as they confirm it, everyone using Lampara will see the warning.</p>
    <a class="rp-btn" href="where.php">Back to the start</a>
    <p class="rp-small"><a href="privacy.php">How reports and photos are handled</a> &middot; <a href="terms.php">Rules for reports</a></p>
  </section>
</main>

<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
<script src="../../Js/Student/report.js?v=<?= $pageJsVer ?>"></script>
<script src="../../Js/Include/privacy-notice.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/privacy-notice.js') ?>"></script>
<script src="../../Js/Public/guide-audio.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-audio.js') ?>"></script>
<script src="../../Js/Include/game-feel.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-feel.js') ?>"></script>
</body>
</html>
