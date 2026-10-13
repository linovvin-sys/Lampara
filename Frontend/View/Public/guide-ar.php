<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$cssVer = filemtime(__DIR__ . '/../../assets/css/tailwind.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Public/guide-ar.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Public/guide-ar.js');
$routeJsVer = filemtime(__DIR__ . '/../../Js/Public/campus-route.js');
$engineJsVer = filemtime(__DIR__ . '/../../Js/Public/locar-engine.js');
$cacheJsVer = filemtime(__DIR__ . '/../../Js/Include/offline-cache.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no">
<title>Lampara — Walking Guide</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=2">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=2">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pixelify+Sans:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= filemtime(__DIR__ . '/../../Css/skeleton.css') ?>">
<link rel="stylesheet" href="../../Css/brand-ar.css?v=<?= filemtime(__DIR__ . '/../../Css/brand-ar.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../assets/css/tailwind.css?v=<?= $cssVer ?>">
<script src="../../assets/vendor/vue.global.prod.js"></script>
<script type="importmap">{ "imports": { "three": "https://cdn.jsdelivr.net/npm/three@0.181.0/build/three.module.js" } }</script>
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
<link rel="stylesheet" href="../../Css/Public/guide-ar.css?v=<?= $pageCssVer ?>">
<link rel="stylesheet" href="../../Css/Public/guide-tutorial.css?v=<?= filemtime(__DIR__ . '/../../Css/Public/guide-tutorial.css') ?>">
<script src="../../Js/Include/campus-bounds.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/campus-bounds.js') ?>"></script>
<script src="../../Js/Include/geofence.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/geofence.js') ?>"></script>
</head>
<!-- No opaque body background: LocAR puts the camera <video> behind the page (z-index -100), and a body background would paint over it. The black is on <html> (guide-ar.css). -->
<body>
<script>LamparaSkeleton.show('guide')</script>

<div id="app" v-cloak class="w-screen select-none overflow-hidden">

  <!-- The AR view itself (camera video + 3D canvas) is created by LocAR (Js/Public/locar-engine.js) only after the
       start tap, so permission prompts happen right after the tap, not before the user knows why. -->
  <div v-if="started" class="fade-bg"></div>

  <!-- Camera turned off mid-session. LocAR manages its camera feed internally with no clean public "stop" API, so this
       is a visual-only toggle: it covers the feed while the camera and GPS tracking keep running underneath.
       Disclosed in the copy below, not just in code comments. -->
  <div v-if="started && !cameraOn" class="absolute inset-0 z-[15] bg-zinc-950 flex flex-col items-center justify-center gap-4 px-8 text-center">
    <div class="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.2" stroke="#fff" stroke-width="1.6"/><path d="M3 3l18 18" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>
    </div>
    <div>
      <p class="font-semibold text-sm">Camera view hidden</p>
      <p class="text-white/50 text-xs mt-1 max-w-[240px]">The AR camera feed can't be fully stopped without a page reload — this just hides it from view.</p>
    </div>
    <button @click="toggleCamera" class="press bg-emerald-500 text-zinc-900 text-xs font-semibold rounded-full px-5 py-2.5">Show camera</button>
  </div>

  <!-- Anchor scan, on top of the live AR view (the rest of the AR screen is hidden while it shows): the posted campus QR fixes where you stand and
       which way you face, so the paths line up the moment it is read. -->
  <div v-if="started && scanningAnchor" class="absolute inset-0 z-30 flex flex-col items-center justify-between py-10 px-6 pointer-events-none" style="background: linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0) 30%, rgba(0,0,0,0) 65%, rgba(0,0,0,0.65));">
    <div class="text-center">
      <h1 class="text-white text-lg font-bold mb-1">Scan the campus QR</h1>
      <p class="text-white/80 text-sm">{{ anchorScanHint }}</p>
      <p v-if="anchorScanError" class="text-red-300 text-xs mt-2">{{ anchorScanError }}</p>
    </div>
    <div class="w-56 h-56 rounded-3xl border-4 border-emerald-400/90"></div>
    <button @click="skipAnchorScan" class="pointer-events-auto press text-white/70 text-xs underline">Skip — start without scanning</button>
  </div>

  <!-- Mini-map (north up): drawn paths, route, anchor O, buildings, you + facing direction. Tap to zoom. -->
  <canvas v-show="started && !scanningAnchor && !clearActive && miniMapOn" ref="miniMap" class="mini-map" @click="toggleMiniMapZoom" aria-label="Mini-map. Tap to zoom."></canvas>

  <div v-if="started && anchorNote" class="absolute inset-x-0 z-20 flex justify-center px-6 pointer-events-none" style="top: 45%;">
    <div class="bg-emerald-600 text-white text-xs font-semibold rounded-full px-4 py-2 shadow-xl text-center">{{ anchorNote }}</div>
  </div>

  <!-- Always-visible build label: tells at a glance whether the phone runs the latest code. -->
  <div v-show="started && !clearActive && debugUi" class="fixed bottom-1 left-2 z-40 text-[10px] text-white/50 pointer-events-none select-none" style="text-shadow:0 1px 2px rgba(0,0,0,.8);">{{ arBuild }}</div>

  <!-- Pre-app overlay: silent permission check, then (if needed) the gate screen. -->
  <transition name="gate-transition">
    <div v-if="!started" class="start">
      <div class="start-inner">
        <header class="start-brand">
          <span class="start-logo"><img src="../../assets/logo.svg" alt="" width="26" height="26"></span>
          <span>Lampara</span>
        </header>

        <!-- checking what the phone already allows -->
        <div v-if="checking && !gateStage" class="start-wait" role="status"><span class="start-spinner" aria-hidden="true"></span>Checking your phone&hellip;</div>

        <!-- getting ready: one line per thing the app is doing, so it never looks frozen -->
        <div v-else-if="checking" class="start-progress" role="status" aria-live="polite">
          <h1>Getting ready&hellip;</h1>
          <p class="start-sub">{{ pendingTarget ? 'Navigating to ' + pendingTarget.name : 'You can pick a destination once it is ready.' }}</p>
          <ol class="start-steps">
            <li :class="stageClass('map')"><span class="start-dot" aria-hidden="true"></span>Loading the campus map</li>
            <li :class="stageClass('camera')"><span class="start-dot" aria-hidden="true"></span>Starting the camera and compass</li>
            <li :class="stageClass('gps')"><span class="start-dot" aria-hidden="true"></span>Finding where you are<span v-if="gateAcc !== null" class="start-acc">&plusmn;{{ gateAcc }} m</span></li>
          </ol>
          <p class="start-hint">Hold your phone upright. A clear view of the sky gives the best location.</p>
        </div>

        <!-- the start form -->
        <div v-else>
          <h1>Where are you going?</h1>
          <p class="start-sub">Pick a building now, or start and search later. You will get turn-by-turn directions in text as well as the path on the ground.</p>

          <label class="start-search">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.8"/><path d="M20 20l-4.5-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>
            <span class="sr-only">Search a building, office or room</span>
            <input v-model="gateQuery" type="search" placeholder="Building, office or room" autocomplete="off">
          </label>
          <ul class="start-list" aria-label="Buildings">
            <li v-for="b in gateList" :key="b.id">
              <button type="button" class="start-item" :class="{ on: pendingTarget && pendingTarget.id === b.id }" :aria-pressed="!!(pendingTarget && pendingTarget.id === b.id)" @click="pickDestination(b)">
                <span class="start-pin" aria-hidden="true"></span>
                <span class="start-item-name">{{ b.name }}<small v-if="b.room_count === 0" class="start-tag">Outside route only</small></span>
                <svg class="start-check" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </li>
          </ul>
          <template v-if="gateRooms.length">
            <h2 class="start-group">Offices and rooms</h2>
            <ul class="start-list" aria-label="Offices and rooms">
              <li v-for="r in gateRooms" :key="'r' + r.id">
                <button type="button" class="start-item" :class="{ on: pendingRoom && pendingRoom.id === r.id }" :aria-pressed="!!(pendingRoom && pendingRoom.id === r.id)" @click="pickRoomGate(r)">
                  <span class="start-pin" aria-hidden="true"></span>
                  <span class="start-item-name">{{ roomLabel(r) }}<small class="start-tag">{{ r.floor }} &middot; {{ r.building_name }}</small></span>
                  <svg class="start-check" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
              </li>
            </ul>
          </template>
          <p v-if="pendingRoom && pendingTarget" class="start-sub" style="margin-top:.7rem">You will walk to {{ pendingTarget.name }}, then the Find inside button takes you to {{ pendingRoom.room_name }}.</p>
          <p v-if="!gateList.length && !gateRooms.length" class="start-empty">{{ buildings.length ? 'No building matches \u201c' + gateQuery + '\u201d.' : 'The building list is not loaded yet. You can still start and search later.' }}</p>

          <button v-if="!gateQuery.trim() && buildings.length > 4" type="button" class="start-more" @click="gateAll = !gateAll">{{ gateAll ? 'Show fewer' : 'Show all ' + buildings.length + ' buildings' }}</button>
          <div class="start-actions">
            <button type="button" class="start-btn" @click="start">{{ pendingTarget ? 'Start navigation to ' + pendingTarget.name : (quickStart ? 'Continue' : 'Start navigation') }}</button>
            <p v-if="statusText && !statusOk" class="start-err" role="alert">{{ statusText }} <button type="button" class="start-link" @click="start">Try again</button></p>

          </div>

          <section class="start-perms" aria-label="What Lampara will ask for">
            <h2>Your phone will ask for</h2>
            <ul>
              <li><span class="start-perm-ico" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.2" stroke="currentColor" stroke-width="1.7"/></svg></span><div><strong>Camera</strong><span>to show the path on the ground in front of you</span></div></li>
              <li><span class="start-perm-ico" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2" stroke="currentColor" stroke-width="1.7"/></svg></span><div><strong>Location</strong><span>to know where you are on campus</span></div></li>
              <li><span class="start-perm-ico" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></span><div><strong>Motion and compass</strong><span>to know which way you are facing</span></div></li>
            </ul>
          </section>
          <p class="start-foot"><a href="../Student/manual-search.php">No signal? Search manually</a><template v-if="debugUi"><span aria-hidden="true"> &middot; </span><span>{{ arBuild }}</span></template></p>
        </div>
      </div>
    </div>
  </transition>

  <!-- top status row + search (identical to the main guide) -->
  <!-- pointer-events-none on the outer overlay: its own empty flex-gap space
       must NOT swallow taps meant for the 3D scene underneath (that's what
       was intercepting arrow taps — this row's real content is short, but
       the container itself still spans a wide invisible hit-box). Each
       actual control below re-enables pointer-events-auto individually. -->
  <div v-if="menuOpen && started && !clearActive" class="menu-back" @click="menuOpen = false"></div>
  <div v-if="started && !scanningAnchor" class="top-ui main-fade-in">
    <div class="top-row">
      <div class="search-pill">
        <svg class="sp-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.9"/><path d="M20 20l-4.5-4.5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>
        <input v-model="searchQuery" type="text" placeholder="Building or room" aria-label="Search a building, office or room to get directions" autocomplete="off" @focus="searchOpen = true" @blur="closeSearchSoon" @keydown.esc="searchOpen = false; showAllBuildings = false">
        <button v-if="searchQuery" type="button" class="sp-btn" aria-label="Clear the search" @click="searchQuery = ''"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>
        <!-- Clear navigation: while a building is chosen, hides everything except this search bar, the directions, Ask Lampara and the path. -->
        <button v-if="target" type="button" class="sp-btn" :class="{ on: clearNav }" :aria-pressed="clearNav" :aria-label="clearNav ? 'Show all controls' : 'Hide the controls and keep only the directions'" @click="toggleClearNav">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path v-if="clearNav" d="M4 4l16 16"/></svg>
        </button>
        <button type="button" class="sp-btn" data-tut="browse" :aria-expanded="showAllBuildings" aria-label="Browse all buildings" @click="showAllBuildings = !showAllBuildings">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" :style="{ transform: showAllBuildings ? 'rotate(180deg)' : 'none' }" style="transition: transform 160ms ease-out;" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>
      <!-- For when the chevrons drift off the walkway or seem to float: recaptures your location and lays the path again. -->
      <button v-show="!clearActive" type="button" class="round-btn" data-tut="refresh" :disabled="refreshing" :aria-label="refreshing ? (refreshNote || 'Refreshing') : 'Refresh path'" @click="refreshPath">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" :class="refreshing ? 'ar-spin' : ''" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>
      </button>
      <button v-show="!clearActive" type="button" class="round-btn" data-tut="more" :class="{ on: menuOpen }" aria-haspopup="true" :aria-expanded="menuOpen" aria-label="More options" @click="menuOpen = !menuOpen">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>
        <span class="round-dot" :class="(statusOk && headingInit && locationOn) ? 'ok' : ''" aria-hidden="true"></span>
      </button>
    </div>
    <p v-if="refreshing" class="top-note" role="status">{{ refreshNote || 'Refreshing…' }}</p>

    <!-- The rest of the controls, out of the way until needed. -->
    <div v-if="menuOpen && !clearActive" class="menu-pop" role="menu">
      <div class="menu-status" role="status"><span class="menu-dot" :class="(statusOk && headingInit && locationOn) ? 'ok' : ''" aria-hidden="true"></span>{{ !locationOn ? 'Distance readout is off' : (!statusOk ? 'Waiting for GPS…' : (headingInit ? 'GPS and compass ready' : 'GPS ready, compass starting…')) }}</div>
      <button type="button" role="menuitem" class="menu-item" data-tut="m-camera" @click="toggleCamera(); menuOpen = false"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z"/><circle cx="12" cy="12.5" r="3.2"/></svg>Camera</span><em>{{ cameraOn ? 'On' : 'Off' }}</em></button>
      <button type="button" role="menuitem" class="menu-item" data-tut="m-location" @click="toggleLocation(); menuOpen = false"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2"/></svg>Distance readout</span><em>{{ locationOn ? 'On' : 'Off' }}</em></button>
      <button type="button" role="menuitem" class="menu-item" data-tut="menu-minimap" @click="toggleMiniMap(); menuOpen = false"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/></svg>Mini-map</span><em>{{ miniMapOn ? 'Shown' : 'Hidden' }}</em></button>
      <button v-if="target" type="button" role="menuitem" class="menu-item" data-tut="m-clear" @click="clearNavigation()"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>Clear navigation (remove the path)</span></button>
      <button v-if="target" type="button" role="menuitem" class="menu-item" data-tut="m-hide" @click="toggleClearNav(); menuOpen = false"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>Hide the controls</span><em>{{ clearNav ? 'On' : 'Off' }}</em></button>
      <a role="menuitem" class="menu-item" href="../Student/report.php"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4M12 17v.01"/></svg>Report a closed building or blocked path</span></a>
      <a role="menuitem" class="menu-item" data-tut="m-scan" href="../Student/scan.php"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/></svg>Find a room (inside)</span></a>
      <a role="menuitem" class="menu-item" data-tut="m-manual" href="../Student/manual-search.php"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.5-4.5"/></svg>No signal? Search manually</span></a>
      <a role="menuitem" class="menu-item" data-tut="m-map" href="map.php"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14"/></svg>Campus map</span></a>
      <button type="button" role="menuitem" class="menu-item" data-tut="m-replay" @click="replayTutorial()"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/></svg>Replay tutorial</span></button>
      <button type="button" role="menuitem" class="menu-item" @click="menuOpen = false; openMascots()"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4h8v5a4 4 0 0 1-8 0V4ZM8 6H5v2a3 3 0 0 0 3 3M16 6h3v2a3 3 0 0 1-3 3M12 13v4M8 20h8M10 17h4"/></svg>Mascots and achievements</span></button>
      <button type="button" role="menuitem" class="menu-item" @click="runArDebug(); menuOpen = false"><span class="mi-label"><svg class="mi-ico" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 8l-4 4 4 4M16 8l4 4-4 4M13 6l-2 12"/></svg>AR debug</span></button>
    </div>

    <transition name="dropdown">
      <div v-if="dropdownList.length > 0 || ddRooms.length > 0" class="dd-panel" role="listbox" aria-label="Buildings">
        <div class="dd-head">{{ target ? 'Switch destination' : (searchQuery.trim().length >= 2 ? (dropdownList.length > 1 ? 'Did you mean…' : 'Tap to select') : 'All buildings') }}</div>
        <button v-for="b in dropdownList" :key="b.id" type="button" role="option" class="dd-item" :class="{ cur: target && target.id === b.id }" :aria-selected="!!(target && target.id === b.id)" @mousedown.prevent @click="pickFromList(b)">
          <span class="dd-name">{{ b.name }}</span>
          <span v-if="target && target.id === b.id" class="dd-cur">Current</span>
          <span v-else class="dd-dist">{{ distLabel(b) }}</span>
        </button>
        <div v-if="ddRooms.length" class="dd-head">Offices and rooms</div>
        <button v-for="r in ddRooms" :key="'r' + r.id" type="button" role="option" class="dd-item" @mousedown.prevent @click="pickRoomHud(r)">
          <span class="dd-name">{{ roomLabel(r) }}</span>
          <span class="dd-dist">{{ r.building_name }}</span>
        </button>
      </div>
    </transition>

    <!-- Text directions: what to do right now, in words, so you never depend on the path on the ground alone. -->
    <div v-if="target && guidance" class="nav-wrap">
      <div v-if="guidance.facing" class="nav-face" role="status">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" :style="{ transform: 'rotate(' + (guidance.facing.side === 'left' ? -90 : guidance.facing.side === 'right' ? 90 : 180) + 'deg)' }"><path d="M12 3.5 19 12h-4.2v8.5H9.2V12H5L12 3.5Z" fill="currentColor"/></svg>
        {{ guidance.facing.text }}
      </div>
      <section class="nav-card" aria-live="polite" aria-label="Directions">
        <div class="nav-main">
          <div class="nav-ico" :class="'is-' + guidance.icon" aria-hidden="true">
            <svg v-if="guidance.icon === 'arrive'" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg v-else-if="guidance.icon === 'warn'" viewBox="0 0 24 24" fill="none"><path d="M12 7v6m0 3.5v.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>
            <svg v-else-if="guidance.icon === 'gate'" viewBox="0 0 24 24" fill="none"><path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V20M3 20h18M9.5 20v-6.5h5V20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <svg v-else viewBox="0 0 24 24" fill="none" :style="{ transform: 'rotate(' + iconDeg(guidance.icon) + 'deg)' }"><path d="M12 3.5 19 12h-4.2v8.5H9.2V12H5L12 3.5Z" fill="currentColor"/></svg>
          </div>
          <div class="nav-text">
            <div class="nav-line"><span class="nav-title">{{ guidance.title }}</span><span v-if="guidance.dist" class="nav-dist">{{ guidance.dist }}</span></div>
            <div class="nav-detail">{{ guidance.detail }}</div>
          </div>
          <div class="nav-actions">
            <button type="button" class="nav-btn" data-tut="voice" :class="{ on: voiceOn }" :aria-pressed="voiceOn" :aria-label="voiceOn ? 'Turn voice directions off' : 'Turn voice directions on'" @click="toggleVoice">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path v-if="voiceOn" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path v-else d="m16 9.5 5 5m0-5-5 5"/></svg>
            </button>
            <button type="button" class="nav-btn" data-tut="dirs" aria-label="Show all directions" @click="directionsOpen = true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>
            </button>
          </div>
        </div>
        <a v-if="arrivedAtTarget" :href="doorHref" class="nav-inside">
          <span class="nav-inside-main">Go inside</span>
          <span class="nav-inside-sub">{{ doorSub }}</span>
        </a>
        <div class="nav-foot">
          <span v-if="guidance.badge" class="nav-badge">{{ guidance.badge }}</span>
          <span class="nav-dest-name">{{ target.name }}</span>
          <span class="nav-dest-meta">{{ guidance.totalM }} m &middot; {{ guidance.etaMin }} min</span>
          <button type="button" class="nav-clear" aria-label="Clear navigation and remove the path" @click="clearNavigation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>Clear
          </button>
        </div>
      </section>
    </div>
  </div>

  <!-- Location turned off mid-session: hides the 2D distance readout and pauses distance/route updates. The AR view
       itself always keeps using GPS to place the path, so this is disclosed as a partial toggle, not a full one. -->
  <div v-if="started && !locationOn && !scanningAnchor && !clearActive" class="absolute top-[30%] inset-x-0 z-10 flex justify-center px-8">
    <button @click="toggleLocation" class="press flex items-center gap-2 bg-black/60 text-white text-xs font-medium rounded-full px-4 py-2.5">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2" stroke="#fff" stroke-width="1.6"/></svg>
      Distance display off — tap to turn back on
    </button>
  </div>

  <!-- bottom: scan a room sign (indoor) and Ask Lampara; the other links are in the menu -->
  <div v-if="started && !scanningAnchor" class="bottom-bar">
    <a v-if="!clearActive && !arrivedAtTarget" :href="insideHref" class="scan-btn" aria-label="I am inside a building: say which room I am in">
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 21V8l9-5 9 5v13"/><path d="M9 21v-6h6v6"/><path d="M3 21h18"/></svg>
      <span class="scan-label">{{ insideLabel }}</span>
    </a>
    <button v-if="target" type="button" class="ask-btn" @click="openChat(target)">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 12c0 4.418-4.03 8-9 8-1.06 0-2.078-.163-3.024-.463L3 21l1.5-4.5C3.55 15.06 3 13.57 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Ask Lampara
    </button>
  </div>

  <!-- Every instruction on the way, in order, with where you are now. -->
  <transition name="sheet">
    <div v-if="directionsOpen && target" class="dir-back" @click.self="directionsOpen = false">
      <section class="dir-sheet" role="dialog" aria-modal="true" aria-label="Step-by-step directions">
        <header class="dir-head">
          <div>
            <h2>Directions to {{ target.name }}</h2>
            <p v-if="guidance">{{ guidance.totalM }} m &middot; about {{ guidance.etaMin }} min</p>
          </div>
          <button type="button" class="dir-close" aria-label="Close directions" @click="directionsOpen = false">&times;</button>
        </header>
        <ol class="dir-list">
          <li v-for="(st, i) in stepList" :key="i" :class="{ now: guidance && i === guidance.step, done: guidance && guidance.step > i }">
            <span class="dir-ico" aria-hidden="true">
              <svg v-if="st.icon === 'gate'" viewBox="0 0 24 24" fill="none"><path d="M5 20V5.5A1.5 1.5 0 0 1 6.5 4h11A1.5 1.5 0 0 1 19 5.5V20M3 20h18M9.5 20v-6.5h5V20" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" :style="{ transform: 'rotate(' + iconDeg(st.icon) + 'deg)' }"><path d="M12 3.5 19 12h-4.2v8.5H9.2V12H5L12 3.5Z" fill="currentColor"/></svg>
            </span>
            <div class="dir-text"><strong>{{ st.title }}</strong><span>{{ st.detail }}</span></div>
            <em>{{ st.meters }} m</em>
          </li>
          <li v-if="!stepList.length" class="dir-empty">Directions appear as soon as your route is ready.</li>
        </ol>
      </section>
    </div>
  </transition>

  <!-- chat panel (identical to the main guide) -->
  <transition name="sheet">
    <div v-if="chatOpenFor" class="absolute inset-0 z-40 bg-zinc-950/60" @click.self="chatOpenFor = null">
      <div class="chat-panel bg-white text-zinc-900 w-full h-full flex flex-col">
        <div class="flex justify-between items-center px-5 pt-5 pb-3 border-b border-zinc-100">
          <h2 class="font-bold">Ask Lampara</h2>
          <button @click="chatOpenFor = null" data-tut="chat-close" aria-label="Close chat" class="press text-zinc-400 text-2xl leading-none">&times;</button>
        </div>
        <div class="px-5 pt-3">
          <div class="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-[11px] font-medium rounded-xl px-3 py-2">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
            Grounded on {{ chatOpenFor.name }}'s registered directory only
          </div>
        </div>
        <transition-group tag="div" name="msg" class="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm" ref="chatLog">
          <div v-for="(m, i) in chatMessages" :key="i" class="flex items-end gap-2" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
            <div v-if="m.role !== 'user'" class="rounded-full bg-white flex items-center justify-center flex-shrink-0" style="width:34px;height:34px">
              <img data-mascot alt="" width="30" height="30" style="display:block;image-rendering:pixelated">
            </div>
            <div class="inline-block px-3.5 py-2.5 rounded-2xl max-w-[75%] text-left" :class="m.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800'" v-html="formatMessage(m.text)"></div>
          </div>
          <div v-if="chatLoading" key="typing" class="flex items-end gap-2 justify-start">
            <div class="rounded-full bg-white flex items-center justify-center flex-shrink-0" style="width:34px;height:34px">
              <img data-mascot alt="" width="30" height="30" style="display:block;image-rendering:pixelated">
            </div>
            <span class="inline-flex items-center gap-1 bg-zinc-100 rounded-2xl px-4 py-3.5">
              <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
            </span>
          </div>
        </transition-group>
        <form @submit.prevent="sendChat" class="flex gap-2 p-4 pb-6 border-t border-zinc-100">
          <input v-model="chatInput" type="text" placeholder="Ask about this building…" :disabled="chatLoading"
                 class="flex-1 bg-zinc-100 rounded-full px-4 py-3 text-sm focus:outline-none disabled:opacity-60">
          <button class="press w-11 h-11 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 disabled:opacity-60" :disabled="chatLoading">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 20 4l-4.5 16-4-6.5L4 12.5Z" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/></svg>
          </button>
        </form>
      </div>
    </div>
  </transition>

</div>

<script src="../../Js/Include/offline-cache.js?v=<?= $cacheJsVer ?>"></script>
<script src="../../Js/Include/student-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Public/campus-route.js?v=<?= $routeJsVer ?>"></script>
<script type="module" src="../../Js/Public/locar-engine.js?v=<?= $engineJsVer ?>"></script>
<script src="../../Js/Include/mascots.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/mascots.js') ?>"></script>
<script src="../../Js/Public/guide-ar.js?v=<?= $pageJsVer ?>"></script>
<script src="../../Js/Public/guide-audio.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-audio.js') ?>"></script>
<script src="../../Js/Public/guide-mascot-shop.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-mascot-shop.js') ?>"></script>
<script src="../../Js/Public/guide-tutorial.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-tutorial.js') ?>"></script>

<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
</body>
</html>
