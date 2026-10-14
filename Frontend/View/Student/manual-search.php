<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/manual-search.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Student/manual-search.js');
$cacheJsVer = filemtime(__DIR__ . '/../../Js/Include/offline-cache.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Manual Search</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/theme-vars.css?v=<?= filemtime(__DIR__ . '/../../Css/theme-vars.css') ?>">
<script src="../../Js/Include/theme.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/theme.js') ?>"></script>
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= filemtime(__DIR__ . '/../../Css/skeleton.css') ?>">
<link rel="stylesheet" href="../../Css/brand-ar.css?v=<?= filemtime(__DIR__ . '/../../Css/brand-ar.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../Css/Student/manual-search.css?v=<?= $pageCssVer ?>">
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/pixel-scene.css?v=<?= filemtime(__DIR__ . '/../../Css/pixel-scene.css') ?>">
<link rel="stylesheet" href="../../Css/game-hud.css?v=<?= filemtime(__DIR__ . '/../../Css/game-hud.css') ?>">
<link rel="stylesheet" href="../../Css/Student/manual-search-pixel.css?v=<?= filemtime(__DIR__ . '/../../Css/Student/manual-search-pixel.css') ?>">
<script src="../../assets/vendor/vue.global.prod.js"></script>
</head>
<body>
<script>LamparaSkeleton.show('public')</script>

<div class="ps ms-bg" id="msBg" aria-hidden="true"></div>
<div id="app" v-cloak class="shell">
  <header class="topbar">
    <a href="../Public/guide-ar.php" class="back-btn" aria-label="Back to the guide">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
    </a>
    <div class="top-title">
      <h1>Find a room</h1>
      <p class="top-sub" :class="{ 'is-offline': isOffline }" role="status">
        <span class="dot" aria-hidden="true"></span>
        <template v-if="isOffline">Offline{{ cachedAt ? ' - directory from ' + cachedAt : '' }}</template>
        <template v-else-if="cachedAt">Directory synced {{ cachedAt }}</template>
        <template v-else>Loading directory&hellip;</template>
      </p>
    </div>
  </header>

  <main class="body">
    <div class="ms-buddy" v-html="hudBuddy"></div>
    <div class="ms-hud" v-html="hudStrip"></div>
    <div class="search-box">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.5-4.5"/></svg>
      <input ref="box" v-model="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search rooms and offices" placeholder="Room, office, building or number">
      <button v-if="q" type="button" class="search-clear" @click="clearSearch" aria-label="Clear the search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
    </div>

    <div class="filter-row" role="group" aria-label="Kind of room">
      <button v-for="k in kinds" :key="k[0]" type="button" @click="filterType = k[0]" class="filter-pill" :class="{ 'is-active': filterType === k[0] }" :aria-pressed="filterType === k[0] ? 'true' : 'false'">{{ k[1] }}</button>
    </div>

    <div class="here-card">
      <div class="here-row">
        <span class="here-label">You are on</span>
        <button type="button" class="here-pick" @click="picking = !picking" :aria-expanded="picking ? 'true' : 'false'">
          <template v-if="me">{{ me.floor }} &middot; {{ me.building_name }}</template>
          <template v-else>Choose your floor</template>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </button>
      </div>
      <div v-if="picking" class="here-list" role="listbox">
        <button v-for="c in floorChoices" :key="c.key" type="button" role="option" class="here-opt" :class="{ on: c.key === meKey }" @click="chooseFloor(c)">
          <span>{{ c.floor }}</span><small>{{ c.building_name }}</small>
        </button>
        <button v-if="me" type="button" class="here-opt clear" @click="clearFloor">I am not sure</button>
      </div>
      <p v-if="!me && !picking" class="here-hint">Optional: tell us your floor and each room shows whether to go up, down or stay. Scanning a sign sets it for you.</p>
    </div>

    <div v-if="loading" class="empty-state">Loading&hellip;</div>
    <div v-else-if="filtered.length === 0 && gateMatches.length === 0" class="empty-state">
      <strong>No rooms match<template v-if="q"> &ldquo;{{ q }}&rdquo;</template></strong>
      <span>Try fewer words, a room number, a building name, or "gate" or "exit".</span>
      <button v-if="q || filterType !== 'all'" type="button" class="reset-btn" @click="q = ''; filterType = 'all'">Show all rooms</button>
    </div>

    <p v-if="!loading && searching && filtered.length" class="result-count" role="status">{{ filtered.length }} result{{ filtered.length === 1 ? '' : 's' }}</p>

    <!-- campus gates: the ways in and out of the campus, for people on foot and for vehicles -->
    <template v-if="gateMatches.length">
      <h2 class="group-head"><span>Entrances and exits</span><small class="count">{{ gateMatches.length }}</small></h2>
      <ul class="room-list">
        <li v-for="g in gateMatches" :key="g.nodeId" class="room-card gate-card">
          <div class="room-top">
            <div class="room-icon kind-gate" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21V8M20 21V8M4 8l8-4 8 4M8 21v-7h8v7M8 14h8"/></svg>
            </div>
            <div class="room-info">
              <div class="room-name">{{ g.name }}</div>
              <div class="room-meta">Entrance and exit<template v-if="g.kind !== 'any'"> &middot; <span class="gate-kind" :class="'is-' + g.kind">{{ g.kindLabel }}</span></template></div>
            </div>
          </div>
          <div class="room-actions">
            <a :href="'../Public/guide-ar.php?gate=' + g.nodeId" class="act act-inside">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>
              Walk to this gate
            </a>
          </div>
        </li>
      </ul>
    </template>

    <!-- one card per room; a search shows a ranked list, browsing groups rooms by building -->
    <template v-for="g in sections" :key="g.id">
      <h2 v-if="g.name" class="group-head"><span>{{ g.name }}</span><small v-if="g.here" class="here-tag">You are here</small><small v-if="!g.recent" class="count">{{ g.rooms.length }}</small></h2>
      <ul class="room-list">
        <li v-for="r in g.rooms" :key="g.id + '-' + r.id" class="room-card">
          <div class="room-top">
            <img v-if="r.photo_path" class="room-thumb" :src="'../../' + r.photo_path" alt="" loading="lazy" @error="$event.target.hidden = true">
            <div v-else class="room-icon" :class="'kind-' + (r.category || r.room_type)" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/></svg>
            </div>
            <div class="room-info">
              <div class="room-name"><template v-for="(part, i) in hl(r.room_name)" :key="i"><mark v-if="part.hit">{{ part.t }}</mark><template v-else>{{ part.t }}</template></template></div>
              <div v-if="r.subtitle" class="room-sub"><template v-for="(part, i) in hl(r.subtitle)" :key="i"><mark v-if="part.hit">{{ part.t }}</mark><template v-else>{{ part.t }}</template></template></div>
              <div class="room-meta">{{ r.room_number ? 'Room ' + r.room_number : 'No number' }} &middot; {{ r.floor }}<template v-if="searching || (floorHint(r) && floorHint(r).kind === 'other')"> &middot; {{ r.building_name }}</template></div>
            </div>
            <span v-if="floorHint(r)" class="floor-hint" :class="'is-' + floorHint(r).kind">
              <svg v-if="floorHint(r).kind === 'up'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
              <svg v-else-if="floorHint(r).kind === 'down'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
              <svg v-else-if="floorHint(r).kind === 'same'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/></svg>
              <span>{{ floorHint(r).text }}</span>
            </span>
          </div>
          <div class="room-actions">
            <a :href="'scan.php?room=' + r.id" class="act act-inside" @click="remember(r)">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2Z"/></svg>
              Find inside
            </a>
            <a :href="'../Public/map.php?room=' + r.id" class="act act-map" :aria-label="'Show ' + r.room_name + ' on the campus map'" title="Show on campus map">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z"/><path d="M9 4v13M15 7v13"/></svg>
            </a>
          </div>
        </li>
      </ul>
    </template>
    <button v-if="shownCards < totalCards" type="button" class="more-btn" @click="cap += 40">Show {{ Math.min(40, totalCards - shownCards) }} more of {{ totalCards - shownCards }} rooms</button>
  </main>

  <p v-if="helpRoom" class="help-line">Still cannot find it? Ask at the <a :href="'scan.php?room=' + helpRoom.id">{{ helpRoom.room_name }}</a><template v-if="helpRoom.hours"> ({{ helpRoom.hours }})</template>.</p>

  <div class="offline-note">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 8v.01"/></svg>
    <p>Signage scanning needs a connection — reconnect to use it. Browsing the directory and getting directions to a room you've visited here before both work offline once loaded at least once.</p>
  </div>
</div>

<script src="../../Js/Include/offline-cache.js?v=<?= $cacheJsVer ?>"></script>
<script src="../../Js/Include/student-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Include/room-number.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/room-number.js') ?>"></script>
<script src="../../Js/Include/access-points.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/access-points.js') ?>"></script>
<script src="../../Js/Include/mascots.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/mascots.js') ?>"></script>
<script src="../../Js/Include/game-hud.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-hud.js') ?>"></script>
<script src="../../Js/Include/pixel-scene.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/pixel-scene.js') ?>"></script>
<script>LamparaPixelScene.mount(document.getElementById('msBg'), { seed: 33, moon: false, stars: 40 });</script>
<script src="../../Js/Include/room-search.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/room-search.js') ?>"></script>
<script src="../../Js/Student/manual-search.js?v=<?= $pageJsVer ?>"></script>

<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
<script src="../../Js/Public/guide-audio.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-audio.js') ?>"></script>
<script src="../../Js/Include/game-feel.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-feel.js') ?>"></script>
</body>
</html>
