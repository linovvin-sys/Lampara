<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/where.css');
// Keep whatever the visitor already picked (?to=building&room=id from a link) when sending them on.
$qs = !empty($_SERVER['QUERY_STRING']) ? '?' . $_SERVER['QUERY_STRING'] : '';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Where are you?</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#161850">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/theme-vars.css?v=<?= filemtime(__DIR__ . '/../../Css/theme-vars.css') ?>">
<script src="../../Js/Include/theme.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/theme.js') ?>"></script>
<link rel="stylesheet" href="../../Css/Student/where.css?v=<?= $pageCssVer ?>">
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/pixel-scene.css?v=<?= filemtime(__DIR__ . '/../../Css/pixel-scene.css') ?>">
<link rel="stylesheet" href="../../Css/game-hud.css?v=<?= filemtime(__DIR__ . '/../../Css/game-hud.css') ?>">
<script src="../../Js/Include/trip.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/trip.js') ?>"></script>
</head>
<body>
<div class="wh-bg ps" id="whBg" aria-hidden="true"></div>
<main class="wh">
  <a class="wh-back" href="../Public/index.php" aria-label="Back to the home page">&larr; Home</a>
  <button type="button" class="wh-snd" id="whSnd" aria-pressed="true" aria-label="Music is on. Tap to mute" hidden>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path class="on" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path class="off" d="m16 9.5 5 5m0-5-5 5"/></svg>
  </button>
  <div class="wh-head">
    <div class="wh-buddy" data-game-buddy data-lines="Quick question before we go!|Under a roof? Choose inside.|Under the sky? Choose outside.|Every arrival earns points."></div>
    <img class="wh-logo" src="../../assets/logo.svg" alt="" width="44" height="44">
    <h1>Where are you right now?</h1>
    <p>Choose the one that fits, so we can show you the right way.</p>
  </div>

  <div class="wh-hud" data-game-hud data-href="../Public/guide-ar.php?shop=1"></div>

  <div class="wh-resume" id="resume" hidden>
    <b>Your trip is still open</b>
    <span id="resumeText"></span>
    <a class="wh-resume-go" id="resumeGo" href="#">Continue my trip</a>
    <button type="button" class="wh-resume-no" id="resumeNo">Start over</button>
  </div>

  <div class="wh-opts">
    <a class="wh-opt" data-where="outside" href="../Public/guide-ar.php<?= htmlspecialchars($qs) ?>">
      <span class="wh-ico" aria-hidden="true" data-px-icon="tree" data-px-size="40">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><path d="M12 8v6m0 0-3 6m3-6 3 6M7 11l5-3 5 3"/></svg>
      </span>
      <span class="wh-txt"><b>I am outside</b><small>On the campus grounds, walking to a building. We will guide you with your camera.</small></span>
      <span class="wh-go" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="wh-opt" data-where="inside" href="scan.php<?= htmlspecialchars($qs) ?>">
      <span class="wh-ico" aria-hidden="true" data-px-icon="building" data-px-size="40">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/><path d="M3 21h18"/></svg>
      </span>
      <span class="wh-txt"><b>I am inside a building</b><small>Find a room or an office. We will show you the way on the floor plan.</small></span>
      <span class="wh-go" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="wh-opt wh-opt-enroll" data-where="enroll" href="enrollment.php">
      <span class="wh-ico" aria-hidden="true" data-px-icon="flag" data-px-size="40">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9"/></svg>
      </span>
      <span class="wh-txt"><b>I am enrolling</b><small>Follow the seven enrollment steps, office by office, with the way to each one.</small></span>
      <span class="wh-go" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>

  <p class="wh-help"><b>Not sure?</b> If you can see the sky and the walkways around you, choose <b>outside</b>. If you are under a roof, past the doors, choose <b>inside</b>.</p>
  <p class="wh-report"><a href="report.php">Report a closed building or a blocked path</a> &middot; <a href="privacy.php">Privacy</a> &middot; <a href="terms.php">Terms</a></p>
</main>
<script>
// Remember the answer for this visit (so later screens do not ask again) and offer to continue an open trip.
document.querySelectorAll('[data-where]').forEach(function (a) {
  a.addEventListener('click', function () { try { sessionStorage.setItem('lampara_where', a.dataset.where); } catch (e) { /* not remembered */ } });
});
(function () {
  var t = LamparaTrip.get();
  if (!t) return;
  document.getElementById('resumeText').textContent = t.label ? 'Going to ' + t.label + '.' : 'You have a route in progress.';
  document.getElementById('resumeGo').href = LamparaTrip.url(t);
  document.getElementById('resume').hidden = false;
  document.getElementById('resumeNo').onclick = function () { LamparaTrip.clear(); document.getElementById('resume').hidden = true; };
})();
</script>
<script src="../../Js/Include/mascots.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/mascots.js') ?>"></script>
<script src="../../Js/Include/game-hud.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-hud.js') ?>"></script>
<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
<script src="../../Js/Include/privacy-notice.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/privacy-notice.js') ?>"></script>
<script src="../../Js/Public/guide-audio.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-audio.js') ?>"></script>
<script src="../../Js/Include/game-feel.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-feel.js') ?>"></script>
<script src="../../Js/Include/pixel-scene.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/pixel-scene.js') ?>"></script>
<script>LamparaPixelScene.mount(document.getElementById('whBg'));</script>
<script>
// Background music on this screen (a short original tune; Web Audio, so it works offline). Phones keep sound back until the first tap.
(function () {
  var A = window.LamparaAudio, btn = document.getElementById('whSnd');
  if (!A || !btn) return;
  btn.hidden = false;
  var on = A.enabled();
  function paint() { btn.setAttribute('aria-pressed', String(on)); btn.setAttribute('aria-label', on ? 'Music is on. Tap to mute' : 'Music is off. Tap to turn on'); }
  function apply() { A.mute(!on); if (on && !document.hidden) A.play('where'); else A.stop(); }
  btn.addEventListener('click', function () { on = !on; A.setEnabled(on); paint(); apply(); });
  document.addEventListener('pointerdown', function () { if (on) A.play('where'); }, { once: true, capture: true });
  document.addEventListener('visibilitychange', apply);
  window.addEventListener('pagehide', function () { A.stop(); });
  paint(); apply();
})();
</script>
</body>
</html>
