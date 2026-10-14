<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
require_once __DIR__ . '/../../../Backend/institution.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$cssVer = filemtime(__DIR__ . '/../../Css/Public/index.css');
$jsVer = filemtime(__DIR__ . '/../../Js/Public/index.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Campus Guide</title>
<meta name="description" content="Pick a building, follow the path on your phone's camera and read turn-by-turn directions on the <?= inst_h('short_name') ?> campus.">
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<link rel="manifest" href="manifest.json">   <!-- installable as a home-screen shortcut that opens in the browser (display: browser), so links never jump into a separate app window -->
<link rel="apple-touch-icon" href="../../assets/apple-touch-icon.png?v=3">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/theme-vars.css?v=<?= filemtime(__DIR__ . '/../../Css/theme-vars.css') ?>">
<script src="../../../Backend/api/institution.php?format=js"></script>
<script src="../../Js/Include/theme.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/theme.js') ?>"></script>
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= filemtime(__DIR__ . '/../../Css/skeleton.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../Css/Public/index.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Public/index-pixel.css?v=<?= filemtime(__DIR__ . '/../../Css/Public/index-pixel.css') ?>">
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/pixel-scene.css?v=<?= filemtime(__DIR__ . '/../../Css/pixel-scene.css') ?>">
<link rel="stylesheet" href="../../Css/game-hud.css?v=<?= filemtime(__DIR__ . '/../../Css/game-hud.css') ?>">
</head>
<body>
<script>LamparaSkeleton.show('public')</script>

<a class="skip" href="#main">Skip to content</a>

<header class="top">
  <div class="top-inner">
    <a href="#top" class="brand" aria-label="Lampara, back to the top">
      <span class="brand-mark"><img src="<?= inst_h('logo_path') ? '../../' . inst_h('logo_path') : '../../assets/logo.svg' ?>" alt="" width="20" height="20"></span>
      <span>Lampara</span>
    </a>
    <nav class="top-nav" aria-label="Sections">
      <a href="#how">How it works</a>
      <a href="#features">Features</a>
      <a href="#buildings">Buildings</a>
    </nav>
    <a href="../Admin/login.php" class="top-admin" aria-label="Admin login">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>
      <span>Admin</span>
    </a>
    <a href="../Student/where.php" class="btn btn-primary btn-sm">Start navigating</a>
  </div>
</header>

<main id="main">

  <!-- ===== Hero: get going ===== -->
  <section class="hero" id="top" aria-labelledby="hero-h">
    <div class="ps" id="heroScene" aria-hidden="true"></div>
    <div class="wrap hero-grid">
      <div class="hero-copy">
        <p class="locus"><span class="locus-dot" aria-hidden="true"></span><?= inst_h('short_name') ?> Campus &middot; Live AR</p>
        <div class="hero-buddy" data-game-buddy data-lines="Hi! Where to today?|Pick a building and I will lead the way.|Earn points every time you arrive.|Tap me for another tip!"></div>
        <h1 id="hero-h"><?= inst_h('tagline') ?></h1>
        <p class="lede">Pick a building, follow the path laid on your phone&rsquo;s camera, and read each turn in plain words. No map reading, no wrong turns.</p>

        <!-- Enrolling is a different journey from "find a building": it gets its own clear way in, right under the first sentence -->
        <a class="enroll-cta" href="../Student/enrollment.php">
          <span class="enroll-cta-ico" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9"/></svg></span>
          <span class="enroll-cta-txt"><b>Enrolling at <?= inst_h('short_name') ?>?</b><small>Follow the enrollment steps, office by office</small></span>
          <span class="enroll-cta-go" aria-hidden="true">&rsaquo;</span>
        </a>

        <div class="hero-hud" data-game-hud data-href="guide-ar.php?shop=1"></div>

        <form class="quick" id="quick" autocomplete="off" aria-label="Choose a destination">
          <label class="quick-label" for="q">Where are you going?</label>
          <div class="quick-field">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.9"/><path d="M20 20l-4.5-4.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
            <input id="q" type="search" placeholder="Search a building" aria-describedby="quick-hint">
          </div>
          <ul class="chips" id="chips" aria-label="Buildings"></ul>
          <p class="quick-hint" id="quick-hint" role="status">Choose one to start straight to it, or start and search inside the guide.</p>
          <div class="hero-actions">
            <a href="../Student/where.php" class="btn btn-primary btn-lg" id="go">Start navigating</a>
            <a href="map.php" class="btn btn-ghost btn-lg">Open the campus map</a>
            <a href="../Student/enrollment.php" class="btn btn-ghost btn-lg">Enrollment guide</a>
          </div>
        </form>

        <ul class="trust" aria-label="Good to know">
          <li>Works on your phone&rsquo;s browser, nothing to install</li>
          <li>Directions in text, with optional voice</li>
          <li>Search still works with a weak signal</li>
        </ul>
      </div>

      <div class="hero-art" aria-hidden="true">
        <!-- A drawing of the guide: camera view, the path on the ground and the direction card -->
        <div class="phone-float"><svg viewBox="0 0 300 600" class="phone" role="img" aria-label="The Lampara guide on a phone: a yellow path on the ground and the direction Turn left in 24 metres">
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9dc0ff"/><stop offset="1" stop-color="#e4edf9"/></linearGradient>
            <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d8b99"/><stop offset="1" stop-color="#3b4654"/></linearGradient>
            <clipPath id="screen"><rect x="14" y="14" width="272" height="572" rx="30"/></clipPath>
          </defs>
          <rect x="2" y="2" width="296" height="596" rx="42" fill="#15173f"/>
          <g clip-path="url(#screen)">
            <rect x="14" y="14" width="272" height="290" fill="url(#sky)"/>
            <rect x="14" y="290" width="272" height="296" fill="url(#ground)"/>
            <g fill="#8fa3bb"><rect x="30" y="236" width="56" height="58"/><rect x="92" y="214" width="46" height="80"/><rect x="204" y="226" width="62" height="68"/><rect x="146" y="248" width="40" height="46" fill="#a7b8cc"/></g>
            <g fill="#5f7390"><rect x="38" y="246" width="10" height="10"/><rect x="58" y="246" width="10" height="10"/><rect x="100" y="226" width="9" height="9"/><rect x="118" y="226" width="9" height="9"/><rect x="214" y="238" width="10" height="10"/><rect x="236" y="238" width="10" height="10"/></g>
            <path d="M138 294 L162 294 L292 590 L8 590 Z" fill="#fff" opacity=".16"/>
            <g stroke="#15173f" stroke-width="3" stroke-linejoin="round" fill="#ffd100">
              <path d="M150 458 L220 500 L220 520 L150 478 L80 520 L80 500 Z"/>
              <path d="M150 396 L206 430 L206 446 L150 412 L94 446 L94 430 Z"/>
              <path d="M150 346 L194 372 L194 384 L150 358 L106 384 L106 372 Z"/>
              <path d="M150 312 L184 332 L184 340 L150 320 L116 340 L116 332 Z" stroke-width="2.5"/>
              <path d="M150 288 L176 303 L176 309 L150 294 L124 309 L124 303 Z" stroke-width="2"/>
            </g>
            <ellipse cx="150" cy="290" rx="9" ry="3" fill="#ffd100" opacity=".9"/>
            <rect x="141" y="236" width="18" height="52" fill="#ffd100" opacity=".28"/>
          </g>
          <rect x="30" y="34" width="240" height="30" rx="15" fill="#15173f" opacity=".82"/>
          <circle cx="50" cy="49" r="5.5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2"/>
          <text x="64" y="54" fill="#fff" fill-opacity=".7" font-size="13" font-family="Outfit, system-ui, sans-serif">Where to?</text>
          <rect x="30" y="74" width="240" height="92" rx="20" fill="#15173f" opacity=".92"/>
          <rect x="42" y="88" width="46" height="46" rx="13" fill="#ffd100"/>
          <path d="M65 99 L77 111 L70.5 111 L70.5 123 L59.5 123 L59.5 111 L53 111 Z" fill="#15173f" transform="rotate(-90 65 111)"/>
          <text x="100" y="106" fill="#fff" font-size="18" font-weight="800" font-family="Outfit, system-ui, sans-serif">Turn left</text>
          <text x="100" y="128" fill="#ffd100" font-size="22" font-weight="800" font-family="Outfit, system-ui, sans-serif">in 24 m</text>
          <text x="42" y="154" fill="#fff" fill-opacity=".72" font-size="12" font-family="Outfit, system-ui, sans-serif">at Point E &#183; then 7 m to Point F</text>
          <rect x="88" y="536" width="124" height="38" rx="19" fill="#ffd100"/>
          <text x="150" y="560" fill="#15173f" font-size="14" font-weight="800" text-anchor="middle" font-family="Outfit, system-ui, sans-serif">Ask Lampara</text>
        </svg></div>
      </div>
    </div>
  </section>

  <!-- ===== Three ways in, as a signage strip over the photo ===== -->
  <div class="ways-wrap">
    <ul class="wrap ways" data-stagger aria-label="Ways to use Lampara">
      <li><a href="guide-ar.php">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z"/></svg>
        <span><b>Walking guide (outside)</b><small>Follow the path on your camera</small></span></a></li>
      <li><a href="../Student/manual-search.php">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
        <span><b>Find a room (inside)</b><small>Scan a sign or search any office or classroom</small></span></a></li>
      <li><a href="../Student/enrollment.php">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h9"/></svg>
        <span><b>Enrollment guide</b><small>Seven steps, office by office</small></span></a></li>
      <li><a href="ask.php">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.8a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/></svg>
        <span><b>Ask Lampara AI</b><small>Answers from campus records</small></span></a></li>
    </ul>
  </div>

  <!-- ===== How it works ===== -->
  <section class="block" id="how" aria-labelledby="how-h">
    <div class="wrap">
      <p class="eyebrow" data-reveal>How it works</p>
      <h2 id="how-h" data-reveal style="--d:1">Three steps from where you stand to the door.</h2>
      <ol class="steps" data-stagger>
        <li>
          <span class="step-n">1</span>
          <h3>Pick a place</h3>
          <p>Search a building or choose it from the list. Tap Start and allow the camera, location and compass so the guide knows where you are and which way you face.</p>
        </li>
        <li>
          <span class="step-n">2</span>
          <h3>Follow the path and the words</h3>
          <p>A yellow path lies on the ground in your camera view, one stretch at a time. A card tells you what to do next, like &ldquo;Turn left in 24 m&rdquo;, so you never depend on the picture alone.</p>
        </li>
        <li>
          <span class="step-n">3</span>
          <h3>Arrive, then ask</h3>
          <p>Inside, scan a room sign or search the directory for the floor, hours and notes. Ask Lampara anything about the building you are at.</p>
        </li>
      </ol>
    </div>
  </section>

  <!-- ===== Features ===== -->
  <section class="block alt" id="features" aria-labelledby="feat-h">
    <div class="wrap">
      <p class="eyebrow" data-reveal>What you get</p>
      <h2 id="feat-h" data-reveal>Everything for getting around, in one place.</h2>
      <ul class="features" data-stagger>
        <li>
          <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.2"/></svg></span>
          <h3>Walking path (outside)</h3>
          <p>Chevrons on the ground that follow the real walkways, with a marker on your destination.</p>
        </li>
        <li>
          <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 10h6M15 10h6M9 3v7M15 3v7M9 14v7M15 14v4"/><path d="M12 12l3 3-3 3" stroke-dasharray="2 2"/></svg></span>
          <h3>Floor plan navigation (inside)</h3>
          <p>Inside a building, an animated route on the real floor plan walks you from the door to your room, floor by floor, even across stairs.</p>
        </li>
        <li>
          <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg></span>
          <h3>Text and voice directions</h3>
          <p>Distances and turns written out, a full step list, and optional spoken directions with a buzz at a turn.</p>
        </li>
        <li>
          <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg></span>
          <h3>Room scan and search</h3>
          <p>Scan a sign or search for any office, classroom or lab, with its floor, hours and a photo of the door.</p>
        </li>
        <li>
          <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z"/><path d="M9 4v13M15 7v13"/></svg></span>
          <h3>Campus map and 3D map</h3>
          <p>See the whole campus, tap a building for its rooms and photo, and jump straight to directions.</p>
        </li>
        <li>
          <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-8.4 8.4 8.3 8.3 0 0 1-3.8-.9L3 21l1.9-5.8a8.3 8.3 0 0 1-.9-3.8A8.4 8.4 0 0 1 12.5 3 8.4 8.4 0 0 1 21 11.5Z"/></svg></span>
          <h3>Ask Lampara</h3>
          <p>Ask in plain words. Answers come only from the registered building and room records.</p>
        </li>
        <li>
          <span class="ico" aria-hidden="true"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.2" r="1"/><path d="M3 3l18 18"/></svg></span>
          <h3>Works with a weak signal</h3>
          <p>Once opened, the directory and your recent places are kept on your phone for when the signal drops.</p>
        </li>
      </ul>
    </div>
  </section>

  <!-- ===== Buildings ===== -->
  <section class="block" id="buildings" aria-labelledby="bld-h">
    <div class="wrap">
      <p class="eyebrow">Campus</p>
      <div class="bld-head" data-reveal>
        <h2 id="bld-h">Go straight to a building.</h2>
        <a href="map.php" class="btn btn-ghost">Open the campus map</a>
      </div>
      <ul class="bld-grid" id="bld" aria-live="polite">
        <li class="bld-skel" aria-hidden="true"></li><li class="bld-skel" aria-hidden="true"></li><li class="bld-skel" aria-hidden="true"></li>
      </ul>
      <p class="bld-empty" id="bld-empty" hidden>The building list could not be loaded. Open the guide and search for a building there.</p>
      <div class="room-find" data-reveal>
        <div>
          <h3>Looking for a room instead?</h3>
          <p>Search every office, classroom and lab, or scan the sign on the door.</p>
        </div>
        <a href="../Student/manual-search.php" class="btn btn-primary">Search rooms</a>
      </div>
    </div>
  </section>

  <!-- ===== Closing ===== -->
  <section class="closing" aria-labelledby="end-h">
    <div class="ps" id="closeScene" aria-hidden="true"></div>
    <div class="wrap closing-in" data-reveal>
      <h2 id="end-h">Ready to find your way?</h2>
      <p>Open the guide on your phone, outside, with your location on.</p>
      <a href="../Student/where.php" class="btn btn-primary btn-lg">Start navigating</a>
    </div>
  </section>

</main>

<footer class="foot">
  <div class="wrap foot-in">
    <div class="foot-brand"><span class="brand-mark"><img src="<?= inst_h('logo_path') ? '../../' . inst_h('logo_path') : '../../assets/logo.svg' ?>" alt="" width="18" height="18"></span><span>Lampara</span></div>
    <p>Find your way around the <?= inst_h('short_name') ?> campus. Directions come from the walkways and rooms the school has registered, kept up to date by its administrators.</p>
    <nav class="foot-links" aria-label="Links">
      <a href="guide-ar.php">Walking guide</a>
      <a href="../Student/enrollment.php">Enrollment guide</a>
      <a href="ask.php">Ask Lampara</a>
      <a href="map.php">Campus map</a>
      <a href="../Student/manual-search.php">Search rooms</a>
      <a href="guide-ar.php?tutorial=1">Replay tutorial</a>
      <a href="../Student/privacy.php">Privacy</a>
      <a href="../Student/terms.php">Terms</a>
    </nav>
  </div>
</footer>

<script src="../../Js/Include/offline-cache.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/offline-cache.js') ?>"></script>
<script src="../../Js/Include/student-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Include/mascots.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/mascots.js') ?>"></script>
<script src="../../Js/Include/pixel-scene.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/pixel-scene.js') ?>"></script>
<script>LamparaPixelScene.mount(document.getElementById('heroScene'), { seed: 7 }); LamparaPixelScene.mount(document.getElementById('closeScene'), { seed: 21, walker: false, moon: false, stars: 30 });</script>
<script src="../../Js/Include/game-hud.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-hud.js') ?>"></script>
<script src="../../Js/Public/index.js?v=<?= $jsVer ?>"></script>

<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
<script src="../../Js/Include/privacy-notice.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/privacy-notice.js') ?>"></script>
<script src="../../Js/Public/guide-audio.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-audio.js') ?>"></script>
<script src="../../Js/Include/game-feel.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-feel.js') ?>"></script>
<script src="../../Js/Include/read-more.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/read-more.js') ?>"></script>
<script src="../../Js/Include/enroll-fab.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/enroll-fab.js') ?>"></script>
</body>
</html>
