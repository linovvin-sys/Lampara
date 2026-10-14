<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'settings';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/settings.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/settings.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · School settings</title>
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
<link rel="stylesheet" href="../../Css/Admin/settings.css?v=<?= $pageCssVer ?>">
<link rel="stylesheet" href="../../assets/vendor/leaflet/leaflet.css">
<script src="../../assets/vendor/leaflet/leaflet.js"></script>
<script src="../../assets/vendor/sweetalert2/sweetalert2-11.26.25.all.min.js"></script>
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="adminMain">
    <div class="admin-container st">

      <header class="page-head flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1>School settings</h1>
          <p>Everything that makes this install yours: name, look, assistant voice, campus area and which features students see.</p>
        </div>
        <div class="page-actions grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <button type="button" class="btn btn-primary" id="stSave" disabled>Save settings</button>
        </div>
      </header>

      <p class="st-msg" id="stMsg" role="status" hidden></p>

      <section class="st-card" aria-labelledby="stSchoolH">
        <h2 id="stSchoolH">School</h2>
        <div class="st-grid grid grid-cols-1 gap-x-4 gap-y-3.5 min-[720px]:grid-cols-2">
          <label>School name<input id="f-name" type="text" maxlength="120" autocomplete="off"></label>
          <label>Short name <small>(shown on pages and used by the assistant)</small><input id="f-short_name" type="text" maxlength="30" autocomplete="off"></label>
          <label class="wide">Headline on the home page<input id="f-tagline" type="text" maxlength="160" autocomplete="off"></label>
        </div>
        <div class="st-logo">
          <div class="st-logo-box" id="stLogoBox"><img id="stLogoImg" alt="" width="64" height="64"></div>
          <div class="st-logo-side">
            <strong>Logo</strong>
            <small>PNG, JPG or WebP, shown in the page headers. Without one the Lampara lamp is used.</small>
            <div class="st-logo-actions">
              <button type="button" class="btn btn-secondary" id="stLogoPick">Upload a logo</button>
              <button type="button" class="btn-link" id="stLogoClear" hidden>Remove</button>
              <input type="file" id="stLogoFile" accept="image/png,image/jpeg,image/webp" hidden>
            </div>
          </div>
        </div>
      </section>

      <section class="st-card" aria-labelledby="stLookH">
        <h2 id="stLookH">Look</h2>
        <label>Default colour theme <small>(students can still pick their own)</small>
          <select id="f-theme">
            <option value="default">Standard</option>
            <option value="halloween">Halloween</option>
            <option value="christmas">Christmas</option>
            <option value="newyear">New Year</option>
            <option value="valentine">Valentine</option>
          </select>
        </label>
      </section>

      <section class="st-card" aria-labelledby="stAiH">
        <h2 id="stAiH">Assistant</h2>
        <label>How the assistant introduces itself <small>(use {short_name} where the school's short name should go)</small>
          <textarea id="f-persona" rows="3" maxlength="2000"></textarea>
        </label>
        <p class="st-hint">It still only answers from the registered rooms, offices and gates. This only changes who it says it is.</p>
      </section>

      <section class="st-card" aria-labelledby="stContactH">
        <h2 id="stContactH">Contact</h2>
        <div class="st-grid grid grid-cols-1 gap-x-4 gap-y-3.5 min-[720px]:grid-cols-2">
          <label>Email<input id="f-contact_email" type="email" maxlength="120" autocomplete="off"></label>
          <label>Phone<input id="f-contact_phone" type="text" maxlength="40" autocomplete="off"></label>
        </div>
      </section>

      <section class="st-card" aria-labelledby="stAreaH">
        <h2 id="stAreaH">Campus area</h2>
        <p class="st-hint">Visitors must be inside this area to use the live guides. Drag the four corner handles so the box covers your campus, or pan and zoom and press the button.</p>
        <div id="stMap" class="st-map" role="application" aria-label="Map of the campus area"></div>
        <div class="st-area-actions">
          <button type="button" class="btn btn-secondary" id="stUseView">Use the current map view as the campus area</button>
          <span class="st-hint" id="stAreaText"></span>
        </div>
      </section>

      <section class="st-card" aria-labelledby="stProxH">
        <h2 id="stProxH">Proximity</h2>
        <p class="st-hint">How close counts as close, in metres. The defaults suit most campuses; change one only after testing on a phone.</p>
        <div class="st-grid st-prox grid grid-cols-1 gap-x-4 gap-y-3.5 min-[720px]:grid-cols-2">
          <label>You have arrived within <small>(3 to 30)</small><input id="px-arrived_m" type="range" min="3" max="30" step="1"><output class="px-out" for="px-arrived_m"></output></label>
          <label>The turn is announced within <small>(15 to 100)</small><input id="px-turn_near_m" type="range" min="15" max="100" step="1"><output class="px-out" for="px-turn_near_m"></output></label>
          <label>"Now" is shown only within <small>(2 to 15)</small><input id="px-now_m" type="range" min="2" max="15" step="1"><output class="px-out" for="px-now_m"></output></label>
          <label>"Head to the path" when farther than <small>(20 to 300)</small><input id="px-off_path_m" type="range" min="20" max="300" step="5"><output class="px-out" for="px-off_path_m"></output></label>
          <label>Urgent report must be within <small>(100 to 1000)</small><input id="px-report_m" type="range" min="100" max="1000" step="10"><output class="px-out" for="px-report_m"></output></label>
          <label>Room allowed beyond the campus edge <small>(0 to 300)</small><input id="px-edge_m" type="range" min="0" max="300" step="5"><output class="px-out" for="px-edge_m"></output></label>
        </div>
        <p class="st-hint">With a weak GPS signal (worse than about 12 m) the guide shows approximate distances such as &ldquo;in about 20 m&rdquo; and never &ldquo;now&rdquo;, whatever these say.</p>
      </section>

      <section class="st-card" aria-labelledby="stFeatH">
        <h2 id="stFeatH">Features</h2>
        <label class="st-switch"><input type="checkbox" id="ft-enrollment"><span class="st-track" aria-hidden="true"></span><span><b>Enrollment guide</b><small>The step-by-step enrollment route and its buttons.</small></span></label>
        <label class="st-switch"><input type="checkbox" id="ft-game"><span class="st-track" aria-hidden="true"></span><span><b>Points and quests</b><small>The points, streak and mascot rewards on student pages.</small></span></label>
        <label class="st-switch"><input type="checkbox" id="ft-hazards"><span class="st-track" aria-hidden="true"></span><span><b>Problem reports</b><small>Visitors can report closed doors and blocked paths with a photo.</small></span></label>
        <label class="st-switch"><input type="checkbox" id="ft-chat"><span class="st-track" aria-hidden="true"></span><span><b>Ask Lampara</b><small>The question-and-answer assistant.</small></span></label>
      </section>

    </div>
  </main>
</div>

<script src="../../Js/Admin/settings.js?v=<?= $pageJsVer ?>"></script>
</body>
</html>
