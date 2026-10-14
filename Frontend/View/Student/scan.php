<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$cssVer = filemtime(__DIR__ . '/../../assets/css/tailwind.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/scan.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Student/scan.js');
$cacheJsVer = filemtime(__DIR__ . '/../../Js/Include/offline-cache.js');
$routeJsVer = filemtime(__DIR__ . '/../../Js/Include/floor-route.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Scan Signage</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#09090b">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/theme-vars.css?v=<?= filemtime(__DIR__ . '/../../Css/theme-vars.css') ?>">
<script src="../../Js/Include/theme.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/theme.js') ?>"></script>
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= filemtime(__DIR__ . '/../../Css/skeleton.css') ?>">
<link rel="stylesheet" href="../../Css/brand-ar.css?v=<?= filemtime(__DIR__ . '/../../Css/brand-ar.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../assets/css/tailwind.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Student/scan.css?v=<?= $pageCssVer ?>">
<link href="https://fonts.googleapis.com/css2?family=Pixelify+Sans:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/pixel-scene.css?v=<?= filemtime(__DIR__ . '/../../Css/pixel-scene.css') ?>">
<link rel="stylesheet" href="../../Css/Student/scan-pixel.css?v=<?= filemtime(__DIR__ . '/../../Css/Student/scan-pixel.css') ?>">
<script src="../../assets/vendor/vue.global.prod.js"></script>
<script src="../../assets/vendor/tesseract/tesseract-5.1.1.min.js" defer></script>
<script src="../../Js/Include/campus-bounds.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/campus-bounds.js') ?>"></script>
<script src="../../Js/Include/geofence.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/geofence.js') ?>"></script>
</head>
<body style="background:#09090b;">
<script>LamparaSkeleton.show('guide')</script>

<!-- overflow:hidden is only actually needed for Stage 1's fullscreen fixed
     camera view — Stage 2 (result screen) is real scrollable content that
     can legitimately grow past one viewport (e.g. a long destination-search
     list), and inheriting "hidden" from here made it permanently stuck with
     no way to reach anything below the fold. -->
<div id="app" v-cloak :style="{ position: 'relative', width: '100vw', height: '100vh', color: '#fff', overflow: stage === 'result' ? 'auto' : 'hidden' }">

  <!-- ===== STAGE 1: camera + scan, in the same look as the outdoor guide (navy glass, yellow actions) ===== -->
  <template v-if="stage === 'scan'">
    <video id="camera-feed" ref="video" autoplay playsinline muted></video>
    <div class="sc-shade"></div>

    <!-- Stage 1 of signage reading: a local text detector (Tesseract.js) runs periodically on the live frame and
         boxes whatever text it finds - only a visual aid to help you aim. Stage 2, the accurate read, happens on tap (Gemini). -->
    <div v-if="liveBox" class="absolute z-10 pointer-events-none rounded-lg transition-all duration-200"
         :style="{ left: liveBox.left + 'px', top: liveBox.top + 'px', width: liveBox.width + 'px', height: liveBox.height + 'px', border: '2px solid #ffd100', boxShadow: '0 0 0 2px rgba(255,209,0,0.25)' }">
      <span class="sc-detected">TEXT FOUND</span>
    </div>

    <!-- top: back, and what this screen is for -->
    <div class="sc-top">
      <a href="../Public/guide-ar.php" class="round-btn" aria-label="Back to the guide">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
      </a>
      <div class="sc-title">
        <strong>Scan a room sign</strong>
        <span>Find where you are inside a building</span>
      </div>
    </div>

    <!-- the frame to aim with -->
    <div class="sc-frame" aria-hidden="true">
      <span class="c tl"></span><span class="c tr"></span><span class="c bl"></span><span class="c br"></span>
    </div>
    <p class="sc-aim" role="status">
      <template v-if="cameraFailed">The camera is not available. Type the room number below.</template>
      <template v-else-if="scanning">Reading the sign&hellip;</template>
      <template v-else>Fit the sign next to the door inside the frame</template>
    </p>

    <!-- bottom: the one action, plus the type-it fallback -->
    <section class="sc-panel" aria-label="Scan or type a room number">
      <p v-if="onCampus === false && !manualNumber" class="sc-warn">Scanning with AI works on campus grounds only. Type the room number instead.</p>
      <label class="sc-type">
        <span class="sc-type-label">Or type the number on the sign</span>
        <span class="sc-type-box">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/></svg>
          <input v-model="manualNumber" @keyup.enter="performScan" type="text" inputmode="text" maxlength="16" autocomplete="off" autocapitalize="characters" placeholder="e.g. 1101 or 1001" aria-label="Room number">
        </span>
      </label>
      <button type="button" class="sc-go" @click="performScan" :disabled="scanning">
        <span v-if="scanning" class="start-spinner" aria-hidden="true"></span>
        <svg v-else-if="manualNumber.trim()" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><circle cx="12" cy="12" r="2.5"/></svg>
        {{ scanning ? 'Reading the sign…' : (manualNumber.trim() ? 'Find room ' + manualNumber.trim() : 'Scan the sign') }}
      </button>
      <a href="manual-search.php" class="sc-link">No sign nearby? Search the directory</a>
    </section>
  </template>

  <!-- ===== STAGE 2: result (full white/green card redesign) ===== -->
  <template v-else-if="stage === 'result'">
    <div class="ps rs-bg" aria-hidden="true" v-html="sceneHtml"></div>
    <div class="result-shell">
      <div v-if="hasMusic" class="hr-top">
        <button type="button" class="hr-snd" :aria-pressed="musicOn" :aria-label="musicOn ? 'Music is on. Tap to mute' : 'Music is off. Tap to turn on'" @click="toggleMusic">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/><path v-if="musicOn" d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/><path v-else d="m16 9.5 5 5m0-5-5 5"/></svg>
        </button>
      </div>
      <!-- Entered from Manual Search: the room the visitor tapped is the
           DESTINATION, not "where they are" — there was no scan to establish
           that, so asking "where are you now?" comes first instead of the
           scanned flow's "You're at X" framing. -->
      <!-- The same number is in more than one building and we could not tell which: ask -->
      <div v-if="pickRooms.length" class="bp" role="group" aria-labelledby="bpTitle">
        <img data-mascot class="bp-mascot" alt="" width="64" height="64">
        <div class="bp-in">
          <h1 id="bpTitle">Room {{ pickRooms[0].room_number }} is in {{ pickRooms.length }} buildings</h1>
          <p>Which building are you in?</p>
          <button v-for="r in pickRooms" :key="r.id" type="button" class="bp-btn" @click="chooseBuilding(r)">
            <img v-if="r.photo_path" :src="'../../' + r.photo_path" alt="" class="bp-photo" @error="$event.target.hidden = true">
            <span><b>{{ buildingLabel(r) }}</b><small>{{ r.room_name }} &middot; {{ r.floor }}</small></span>
          </button>
        </div>
      </div>
      <div v-else-if="planningMode && destination && !room" class="wy">
        <a href="manual-search.php" class="wy-back" aria-label="Back to the directory">
          <span class="wy-back-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></span>
          Directory
        </a>

        <!-- 1. where you are going: fixed, shown first so the question below makes sense -->
        <section class="wy-dest" aria-label="Your destination">
          <img v-if="destination.photo_path" :key="destination.id" :src="'../../' + destination.photo_path" :alt="'Photo of ' + destination.room_name" class="wy-photo" @error="$event.target.hidden = true">
          <div class="wy-dest-body">
            <span class="wy-eyebrow">Going to</span>
            <h1>{{ destination.room_name }}</h1>
            <p class="wy-dest-meta">{{ [destination.room_number ? 'Room ' + destination.room_number : '', destination.floor, destination.building_name].filter(Boolean).join(' \u00b7 ') }}</p>
            <p v-if="destination.hours || destination.category" class="wy-chips">
              <span v-if="({ office: 'Office', classroom: 'Classroom / Lab', cr: 'Comfort room', canteen: 'Canteen' })[destination.category]" class="wy-chip">{{ ({ office: 'Office', classroom: 'Classroom / Lab', cr: 'Comfort room', canteen: 'Canteen' })[destination.category] }}</span>
              <span v-if="destination.hours" class="wy-chip">{{ destination.hours }}</span>
            </p>
            <p v-if="destination.notes" class="wy-note">{{ destination.notes }}</p>
          </div>
        </section>

        <!-- 2. the one question: which room are you at -->
        <section class="wy-ask" aria-labelledby="wyTitle">
          <h2 id="wyTitle">Where are you now?</h2>
          <p>Pick the room you are standing at and we will show the way, floor by floor.</p>
          <div class="wy-opts">
            <a class="wy-opt wy-opt-card" :href="'../Public/guide-ar.php?to=' + destination.building_id + '&room=' + destination.id">
              <span class="wy-opt-main">I am outside</span>
              <span class="wy-opt-sub">Follow the path on your camera to {{ destination.building_name }}, then straight into the floor plan to the room</span>
            </a>
            <a v-if="canRoute(destination)" class="wy-opt wy-opt-card" :href="'journey.php?arrived=1&to=' + destination.id">
              <span class="wy-opt-main">I am at the door of {{ destination.building_name }}</span>
              <span class="wy-opt-sub">Show me the way to the room on the floor plan</span>
            </a>
            <p v-else class="wy-note" role="status">There is no floor plan for {{ destination.building_name }} yet, so the way inside can't be drawn. {{ destination.room_name }} is on the {{ destination.floor }}.<template v-if="destination.notes"> {{ destination.notes }}.</template></p>
          </div>
          <label class="wy-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.5-4.5"/></svg>
            <input v-model="originQuery" @input="searchOrigin" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search your current room" placeholder="Room name or number">
            <button v-if="originQuery" type="button" class="wy-clear" aria-label="Clear" @click="originQuery = ''; originResults = []">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </label>

          <p v-if="!originQuery && nearbyRooms.length" class="wy-label">{{ nearbyTitle }} {{ nearbyLabel }}</p>
          <ul v-if="originResults.length || (!originQuery && nearbyRooms.length)" class="wy-list">
            <li v-for="r in (originQuery ? originResults : nearbyRooms)" :key="r.id">
              <button type="button" class="wy-opt" @click="pickOrigin(r)">
                <span class="wy-opt-main">{{ r.room_number ? r.room_number + ' \u2014 ' : '' }}{{ r.room_name }}</span>
                <span class="wy-opt-sub">{{ r.subtitle ? r.subtitle + ' \u00b7 ' : '' }}{{ r.floor }} &middot; {{ r.building_name }}</span>
                <svg class="wy-go" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </li>
          </ul>
          <p v-if="originQuery && !originResults.length" class="wy-none">No room matches &ldquo;{{ originQuery }}&rdquo;. Try its number, or fewer words.</p>
        </section>

        <!-- 3. other ways to say where you are -->
        <div class="wy-alt">
          <a href="scan.php" class="wy-alt-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/></svg>
            Scan a room sign instead
          </a>
          <a href="manual-search.php" class="wy-alt-link">Pick a different destination</a>
        </div>
      </div>

      <!-- The destination itself couldn't be found — bad link, or truly
           offline with a directory that's never been cached on this device. -->
      <div v-else-if="planningMode && !destination" class="not-found">
        <p class="primary">Couldn't find that room.</p>
        <p class="secondary">It may not be registered, or you're offline and it hasn't loaded here before.</p>
        <a href="manual-search.php" class="link-btn">Back to the directory &rarr;</a>
      </div>

      <div v-else-if="room" style="padding-top:1.25rem;">
        <!-- Deliberately NOT a headline. Scanning exists to let the SYSTEM
             confirm which room you're at (there's no indoor GPS — this is
             the only way it can anchor itself) — a human standing in front
             of the sign already knows that. Leading with "You're at Room
             X!" as the big moment was redundant and buried the actually
             useful next step underneath it. This is now a quiet, compact
             confirmation; "where do you want to go" (below) is the headline.
             Skipped entirely in planning mode — nothing was actually scanned. -->
        <section v-if="!planningMode" class="wy-dest hr" aria-label="Where you are now">
          <div class="wy-dest-body">
            <img data-mascot class="hr-mascot" alt="" width="60" height="60">
            <span class="wy-eyebrow hr-eyebrow">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg>
              You are here
            </span>
            <h1>{{ room.room_number ? room.room_number + ' \u2014 ' : '' }}{{ room.room_name }}</h1>
            <p class="wy-dest-meta">{{ buildingLabel(room) }}<template v-if="room.notes"> &middot; {{ room.notes }}</template></p>
            <button v-if="altRooms.length" type="button" class="bp-switch" @click="notThisBuilding">Not this building?</button>
            <div class="hr-row">
              <span class="hr-tags">
                <span class="wy-chip">{{ room.floor }}</span>
                <span class="wy-chip">{{ room.room_type === 'office' ? (room.hours ? 'Open ' + room.hours : 'Office') : 'Classroom / Lab' }}</span>
              </span>
              <button type="button" class="hr-wrong" :disabled="reported" aria-label="Report wrong info about this room" @click="reportOutdated">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3.5 22 20.5H2L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r="0.9" fill="currentColor"/></svg>
                {{ reported ? 'Reported' : 'Report' }}
              </button>
            </div>
          </div>
        </section>

        <!-- Destination picker — THIS is the actual headline now. Gives a
             relative hint (same floor/building vs a different one), not
             real turn-by-turn steps — no corridor/floor-plan data exists
             to generate an actual route, that's the thesis's pathfinding
             scope, not this feature's. -->
        <div v-if="!planningMode" class="hr-ask">
          <h2>Where to?</h2>
          <p>Tap a room to start your route from here.</p>
        </div>
        <!-- Planning mode: both ends are picked, so show them as a route (from -> to), not a prompt. -->
        <section v-else class="rt-sum" aria-label="Your route">
          <a href="manual-search.php" class="wy-back" aria-label="Back to the directory">
            <span class="wy-back-ico"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></span>
            Directory
          </a>
          <ol class="rt-stops">
            <li class="rt-stop is-from">
              <span class="rt-pin" aria-hidden="true"></span>
              <div class="rt-stop-text">
                <small>From</small>
                <strong>{{ room.room_number ? room.room_number + ' \u2014 ' : '' }}{{ room.room_name }}</strong>
                <span>{{ room.floor }} &middot; {{ room.building_name }}</span>
              </div>
              <button type="button" class="rt-change" @click="changeOrigin">Change</button>
            </li>
            <li class="rt-stop is-to">
              <span class="rt-pin" aria-hidden="true"></span>
              <div class="rt-stop-text">
                <small>To</small>
                <strong>{{ destination.room_number ? destination.room_number + ' \u2014 ' : '' }}{{ destination.room_name }}</strong>
                <span>{{ destination.floor }} &middot; {{ destination.building_name }}</span>
              </div>
            </li>
          </ol>
        </section>

        <a v-if="!planningMode" class="enroll-banner" href="enrollment.php"><b>Enrolling?</b> <span>Follow the enrollment steps, office by office</span> <i aria-hidden="true">&rsaquo;</i></a>
        <section v-if="!planningMode" class="wy-ask hr-find" aria-label="Choose a destination">
          <label class="wy-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.5-4.5"/></svg>
            <input v-model="destQuery" @input="searchDestinations" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search for a room, office or lab" placeholder="Room name or number">
            <button v-if="destQuery" type="button" class="wy-clear" aria-label="Clear" @click="destQuery = ''; destResults = []">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
            </button>
          </label>
          <ul v-if="destResults.length" class="wy-list">
            <li v-for="d in destResults" :key="d.id">
              <button type="button" class="wy-opt" @click="pickDestination(d)">
                <span class="wy-opt-main">{{ d.room_number ? d.room_number + ' \u2014 ' : '' }}{{ d.room_name }}</span>
                <span class="wy-opt-sub">{{ d.subtitle ? d.subtitle + ' \u00b7 ' : '' }}{{ d.floor }} &middot; {{ d.building_name }}</span>
                <svg class="wy-go" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </button>
            </li>
          </ul>
          <p v-if="destResultsTruncated" class="wy-none">More rooms match. Keep typing to narrow it down.</p>
          <p v-if="destQuery && !destResults.length" class="wy-none">No room matches &ldquo;{{ destQuery }}&rdquo;. Try its number, or fewer words.</p>

          <template v-if="!destQuery && !destination">
            <template v-for="g in quickGroups" :key="g.title">
              <p class="wy-label hr-label"><span class="hr-dot" :class="{ here: g.here }" aria-hidden="true"></span>{{ g.title }}</p>
              <ul class="hr-chips">
                <li v-for="r in g.rooms" :key="r.id">
                  <button type="button" class="hr-chip" @click="pickDestination(r)">
                    <b v-if="r.room_number">{{ r.room_number }}</b><span class="hr-chip-name">{{ r.room_name }}</span>
                  </button>
                </li>
              </ul>
            </template>
          </template>
        </section>

        <div v-if="destination" class="info-card" :style="{ marginTop: planningMode ? '0.25rem' : '1rem' }">
          <!-- keyed per room, so a photo that failed to load for one room is not hidden for the next -->
          <img v-if="destination.photo_path" :key="destination.id" :src="'../../' + destination.photo_path" :alt="'Photo of ' + destination.room_name" class="dest-photo" @load="$event.target.classList.toggle('is-portrait', $event.target.naturalHeight > $event.target.naturalWidth)" @error="$event.target.hidden = true">
          <p v-if="!planningMode" style="font-weight:800; font-size:0.9375rem; color:var(--ink); margin:0 0 0.2rem;">
            {{ destination.room_number ? destination.room_number + ' — ' : '' }}{{ destination.room_name }}
          </p>
          <p v-if="!planningMode && (destination.category || destination.hours)" class="dest-meta">
            {{ [({ office: 'Office', classroom: 'Classroom / Lab', cr: 'Comfort room', canteen: 'Canteen' })[destination.category], destination.hours].filter(Boolean).join(' · ') }}
          </p>
          <p class="rt-hint">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8-8-2Z"/></svg>
            <span>{{ directionHint }}</span>
          </p>
          <!-- The admin's own notes on THIS room are the real "how to find it"
               info (e.g. "up the stairs, end of the hall") — more specific
               than the generic same-floor/different-building hint above, so
               show it whenever it exists instead of leaving it unread. -->
          <p v-if="destination.notes" class="notes-pill" style="margin-top:0.5rem; display:inline-flex;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg>
            {{ destination.notes }}
          </p>

          <!-- Visual map — only when both rooms sit on a floor with an
               uploaded plan and a placed marker; directionHint above
               always covers the gap otherwise, so this never blocks. -->
          <p v-if="loadingFloorPlan" style="font-size:0.75rem; color:var(--muted); margin-top:0.6rem;">Loading floor plan…</p>

          <div v-if="mapMode === 'same-floor'" class="zoom-view" style="margin-top:0.75rem; position:relative; border-radius:0.75rem; overflow:hidden; border:1px solid var(--line);">
            <div class="zoom-inner">
            <img :src="floorPlans.room.imageDataUrl || ('../../' + floorPlans.room.image_path)" alt="" style="width:100%; display:block;">
            <!-- Every other registered room on this floor — small, muted,
                 non-interactive dots for orientation, so the destination
                 isn't the only landmark on an otherwise-blank plan. -->
            <div v-for="r in roomsOnFloor(room.floor)" :key="r.id"
                 :style="{ position: 'absolute', left: r.map_x + '%', top: r.map_y + '%', transform: 'translate(-50%, -100%)' }">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#9a9ab0" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
              <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.375rem; font-weight:600; background:#9a9ab0; color:#fff; padding:0.03rem 0.2rem; border-radius:0.15rem; white-space:nowrap; line-height:1.4;">{{ r.room_number || r.room_name }}</span>
            </div>
            <!-- Actual walkable route, drawn from the walkable-path graph
                 (Register Building) — quietly absent whenever either room
                 isn't linked to a junction or the graph doesn't connect
                 them; the two pins below always work on their own regardless. -->
            <svg v-if="routePath" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%;">
              <polyline :points="routePath.map(p => p.x + ',' + p.y).join(' ')" fill="none" stroke="#16a34a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3,2" vector-effect="non-scaling-stroke" />
            </svg>
            <div :style="{ position: 'absolute', left: room.map_x + '%', top: room.map_y + '%', transform: 'translate(-50%, -100%)' }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#0d0e33" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
              <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.4375rem; font-weight:700; background:#0d0e33; color:#fff; padding:0.05rem 0.25rem; border-radius:0.2rem; white-space:nowrap; line-height:1.4;">{{ planningMode ? 'Start' : 'You' }}</span>
            </div>
            <div :style="{ position: 'absolute', left: destination.map_x + '%', top: destination.map_y + '%', transform: 'translate(-50%, -100%)' }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#16a34a" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
              <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.4375rem; font-weight:700; background:#16a34a; color:#fff; padding:0.05rem 0.25rem; border-radius:0.2rem; white-space:nowrap; line-height:1.4;">{{ destination.room_number || 'Here' }}</span>
            </div>
            </div>
            <div class="zoom-ctl" role="group" aria-label="Zoom the floor plan">
                <button type="button" data-z="in" aria-label="Zoom in">+</button>
                <button type="button" data-z="out" aria-label="Zoom out">&minus;</button>
                <button type="button" data-z="reset" aria-label="Reset the zoom">&#8634;</button>
              </div>
          </div>

          <!-- Multi-floor route: one floor's plan + its own sub-route at a
               time, paged with Next/Previous — a route spanning floors
               can't be one continuous line across two separate images, so
               each page is its own floor plan with a "take the stairs"
               marker at the page break instead. -->
          <div v-else-if="mapMode === 'multi-floor'" style="margin-top:0.75rem;">
            <div class="rt-floorbar">
              <strong>{{ segmentFloorLabel(currentSegment) }}</strong>
              <span>Step {{ currentSegmentIndex + 1 }} of {{ routeSegments.length }}</span>
            </div>

            <div v-if="segmentImage(currentSegment)" class="zoom-view" style="position:relative; border-radius:0.75rem; overflow:hidden; border:1px solid var(--line);">
              <div class="zoom-inner">
              <img :src="segmentImage(currentSegment)" alt="" style="width:100%; display:block;">
              <div v-for="r in roomsOnFloor(segmentFloorLabel(currentSegment))" :key="r.id"
                   :style="{ position: 'absolute', left: r.map_x + '%', top: r.map_y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#9a9ab0" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.375rem; font-weight:600; background:#9a9ab0; color:#fff; padding:0.03rem 0.2rem; border-radius:0.15rem; white-space:nowrap; line-height:1.4;">{{ r.room_number || r.room_name }}</span>
              </div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%;">
                <polyline :points="currentSegment.points.map(p => p.x + ',' + p.y).join(' ')" fill="none" stroke="#16a34a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3,2" vector-effect="non-scaling-stroke" />
              </svg>
              <!-- Start pin — only on the first page, at the room's own dot -->
              <div v-if="currentSegmentIndex === 0" :style="{ position: 'absolute', left: currentSegment.points[0].x + '%', top: currentSegment.points[0].y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#0d0e33" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.4375rem; font-weight:700; background:#0d0e33; color:#fff; padding:0.05rem 0.25rem; border-radius:0.2rem; white-space:nowrap; line-height:1.4;">{{ planningMode ? 'Start' : 'You' }}</span>
              </div>
              <!-- Destination pin — only on the last page -->
              <div v-if="currentSegmentIndex === routeSegments.length - 1" :style="{ position: 'absolute', left: currentSegment.points[currentSegment.points.length - 1].x + '%', top: currentSegment.points[currentSegment.points.length - 1].y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#16a34a" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.4375rem; font-weight:700; background:#16a34a; color:#fff; padding:0.05rem 0.25rem; border-radius:0.2rem; white-space:nowrap; line-height:1.4;">{{ destination.room_number || 'Here' }}</span>
              </div>
              <!-- Stairs marker where this page's route continues onto the next floor -->
              <div v-if="currentSegmentIndex < routeSegments.length - 1" :style="{ position: 'absolute', left: currentSegment.points[currentSegment.points.length - 1].x + '%', top: currentSegment.points[currentSegment.points.length - 1].y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" fill="#0369a1" stroke="#fff" stroke-width="1.5"/><path d="M8 15l4-8 4 8" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <!-- Stairs marker where this page's route arrived FROM the previous floor -->
              <div v-if="currentSegmentIndex > 0" :style="{ position: 'absolute', left: currentSegment.points[0].x + '%', top: currentSegment.points[0].y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" fill="#0369a1" stroke="#fff" stroke-width="1.5"/><path d="M8 9l4 8 4-8" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              </div>
              <div class="zoom-ctl" role="group" aria-label="Zoom the floor plan">
                <button type="button" data-z="in" aria-label="Zoom in">+</button>
                <button type="button" data-z="out" aria-label="Zoom out">&minus;</button>
                <button type="button" data-z="reset" aria-label="Reset the zoom">&#8634;</button>
              </div>
            </div>
            <p v-else style="font-size:0.75rem; color:var(--muted); margin:0.5rem 0;">Loading this floor's plan…</p>

            <div class="rt-pager">
              <button type="button" @click="currentSegmentIndex--" :disabled="currentSegmentIndex === 0">&larr; Previous floor</button>
              <button type="button" class="is-next" @click="currentSegmentIndex++" :disabled="currentSegmentIndex === routeSegments.length - 1">Next floor &rarr;</button>
            </div>
          </div>
        </div>

        <!-- Only offered once every floor on the route has been calibrated by an
             admin (Floor Calibration) — otherwise there's no way to turn plan
             coordinates into real walking distance and direction. -->
        <!-- The animated floor-plan route (Student/journey.php): this room to the destination, or leave this building, walk outside, then find the room. -->
        <a v-if="journeyUrl" :href="journeyUrl" class="rt-cta">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          {{ room.building_id === destination.building_id ? 'Watch the route to ' + destination.room_name : 'Show me the way to ' + destination.building_name }}
        </a>

        <!-- Secondary: details about the CURRENT room — still useful, just
             no longer competing with "where do you want to go" for top billing. -->
        <button v-if="planningMode" @click="reportOutdated" :disabled="reported" class="report-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3.5 22 20.5H2L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none"/></svg>
          {{ reported ? 'Thanks. Reported to the campus admin' : 'Something here looks wrong? Report it' }}
        </button>
        <nav v-if="!planningMode" class="hr-bar" aria-label="Other options">
          <button type="button" class="hr-bar-btn primary" @click="reset">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2"/><path d="M8 12h8"/></svg>
            Scan another sign
          </button>
          <a href="../Public/guide-ar.php" class="hr-bar-btn">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
            Outside guide
          </a>
        </nav>
        <template v-else>
          <a href="manual-search.php" class="back-link">Pick a different destination</a>
        </template>
        <a v-if="planningMode" href="../Public/guide-ar.php" class="back-link">Back to the outside guide</a>
      </div>

      <div v-else class="not-found">
        <p v-if="aiReadFailed" class="primary">Couldn't read a clear room number from that sign.</p>
        <p v-else-if="detectedNumber" class="primary">Read "<span style="font-family:'JetBrains Mono',monospace; font-weight:600; color:var(--ink);">{{ detectedNumber }}</span>" — no room registered with that number yet.</p>
        <p v-else class="primary">No room registered with that number yet.</p>
        <p class="secondary">Try repositioning the camera, or type the number manually.</p>
        <button @click="reset" class="link-btn">Try again &rarr;</button>
        <a href="manual-search.php" class="link-btn">Browse the directory instead &rarr;</a>
      </div>
    </div>
  </template>

</div>

<script src="../../Js/Include/offline-cache.js?v=<?= $cacheJsVer ?>"></script>
<script src="../../Js/Include/student-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Include/floor-route.js?v=<?= $routeJsVer ?>"></script>
<script src="../../Js/Include/room-number.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/room-number.js') ?>"></script>
<script src="../../Js/Include/plan-zoom.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/plan-zoom.js') ?>"></script>
<script src="../../Js/Include/pixel-scene.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/pixel-scene.js') ?>"></script>
<script src="../../Js/Include/mascots.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/mascots.js') ?>"></script>
<script src="../../Js/Public/guide-audio.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/guide-audio.js') ?>"></script>
<script src="../../Js/Student/scan.js?v=<?= $pageJsVer ?>"></script>

<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
<script src="../../Js/Include/game-feel.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/game-feel.js') ?>"></script>
</body>
</html>
