<?php
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
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=2">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=2">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=2">
<meta name="theme-color" content="#161850">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/Student/where.css?v=<?= $pageCssVer ?>">
<script src="../../Js/Include/trip.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/trip.js') ?>"></script>
<script src="../../Js/Include/campus-bounds.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/campus-bounds.js') ?>"></script>
<script src="../../Js/Include/geofence.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/geofence.js') ?>"></script>
</head>
<body>
<main class="wh">
  <a class="wh-back" href="../Public/index.php" aria-label="Back to the home page">&larr; Home</a>
  <div class="wh-head">
    <img src="../../assets/logo.svg" alt="" width="44" height="44">
    <h1>Where are you right now?</h1>
    <p>Choose the one that fits, so we can show you the right way.</p>
  </div>

  <div class="wh-resume" id="resume" hidden>
    <b>Your trip is still open</b>
    <span id="resumeText"></span>
    <a class="wh-resume-go" id="resumeGo" href="#">Continue my trip</a>
    <button type="button" class="wh-resume-no" id="resumeNo">Start over</button>
  </div>

  <div class="wh-opts">
    <a class="wh-opt" data-where="outside" href="../Public/guide-ar.php<?= htmlspecialchars($qs) ?>">
      <span class="wh-ico" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="5" r="2.2"/><path d="M12 8v6m0 0-3 6m3-6 3 6M7 11l5-3 5 3"/></svg>
      </span>
      <span class="wh-txt"><b>I am outside</b><small>On the campus grounds, walking to a building. We will guide you with your camera.</small></span>
      <span class="wh-go" aria-hidden="true">&rsaquo;</span>
    </a>
    <a class="wh-opt" data-where="inside" href="scan.php<?= htmlspecialchars($qs) ?>">
      <span class="wh-ico" aria-hidden="true">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/><path d="M3 21h18"/></svg>
      </span>
      <span class="wh-txt"><b>I am inside a building</b><small>Find a room or an office. We will show you the way on the floor plan.</small></span>
      <span class="wh-go" aria-hidden="true">&rsaquo;</span>
    </a>
  </div>

  <p class="wh-help"><b>Not sure?</b> If you can see the sky and the walkways around you, choose <b>outside</b>. If you are under a roof, past the doors, choose <b>inside</b>.</p>
  <p class="wh-report"><a href="report.php">Report a closed building or a blocked path</a></p>
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
<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
</body>
</html>
