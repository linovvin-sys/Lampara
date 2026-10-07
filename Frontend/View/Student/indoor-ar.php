<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/indoor-ar.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Student/indoor-ar.js');
$cacheJsVer = filemtime(__DIR__ . '/../../Js/Include/offline-cache.js');
$floorRouteJsVer = filemtime(__DIR__ . '/../../Js/Include/floor-route.js');
$navJsVer = filemtime(__DIR__ . '/../../Js/Include/indoor-nav.js');
$ribbonJsVer = filemtime(__DIR__ . '/../../Js/Include/ar-ribbon.js');
$geomJsVer = filemtime(__DIR__ . '/../../Js/Public/campus-route.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no">
<title>Lampara — Indoor AR Guide</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#000000">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://aframe.io/releases/1.4.0/aframe.min.js"></script>
<script src="../../assets/vendor/threex-device-orientation-controls.js"></script>
<script src="../../assets/vendor/aframe-ar.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js"></script>
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/Student/indoor-ar.css?v=<?= $pageCssVer ?>">
</head>
<body>

<div id="app" class="ia-root">

  <!-- AR scene: live camera + compass-aligned view. No GPS indoors — the camera
       is moved along the route by step counting (see indoor-ar.js). Only mounted
       after the tap so camera/motion permission prompts follow a user gesture. -->
  <a-scene v-if="stage === 'nav'" ref="arScene" embedded
           vr-mode-ui="enabled: false"
           arjs="sourceType: webcam; debugUIEnabled: false;"
           renderer="antialias: true; alpha: true">
    <a-camera id="ia-cam" position="0 1.6 0"></a-camera>
  </a-scene>

  <!-- Loading / error / gate -->
  <div v-if="stage !== 'nav'" class="ia-screen">
    <div v-if="stage === 'loading'" class="ia-center">
      <div class="ia-logo"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg></div>
      <p class="ia-muted">Preparing your route…</p>
    </div>

    <div v-else-if="stage === 'error'" class="ia-center ia-card-dark">
      <h1>Can't start the AR guide</h1>
      <p class="ia-muted">{{ error }}</p>
      <ul v-if="errorDetail.length" class="ia-detail"><li v-for="d in errorDetail" :key="d">{{ d }}</li></ul>
      <button class="ia-btn ia-btn-light" @click="goBack">Back to the map</button>
    </div>

    <div v-else-if="scanningAnchor" class="ia-center ia-card-dark">
      <h1>Scan this floor's QR</h1>
      <p class="ia-muted">Point the camera at the QR code posted on {{ segFloors[0] }} — this sets your exact starting spot.</p>
      <div style="position:relative; width:100%; max-width:22rem; border-radius:1rem; overflow:hidden; margin:0.5rem 0;">
        <video ref="anchorVideo" autoplay playsinline muted style="width:100%; display:block;"></video>
      </div>
      <p v-if="anchorScanError" class="ia-muted" style="color:#fca5a5;">{{ anchorScanError }}</p>
      <button class="ia-link" @click="stopAnchorScan">Cancel</button>
      <button class="ia-link" @click="skipAnchorScan">Skip — start without scanning</button>
    </div>

    <div v-else class="ia-center ia-card-dark">
      <div class="ia-logo"><svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 3.5 L19.5 16 L12 12.7 L4.5 16 Z" fill="#fff"/></svg></div>
      <h1>Walk to {{ toRoom.room_name }}</h1>
      <p class="ia-muted">
        From {{ fromRoom.room_number ? 'Room ' + fromRoom.room_number : fromRoom.room_name }}
        &middot; {{ segFloors.length > 1 ? segFloors.length + ' floors' : segFloors[0] }}
        &middot; about {{ totalMeters }} m
      </p>
      <p v-if="floorAnchor && !anchorScanned" class="ia-note">This floor has a posted QR code — scanning it sets your exact starting spot instead of guessing from the camera.</p>
      <p v-else class="ia-note">Stand at the sign you scanned, hold the phone up, and walk. The green path shows the way.</p>
      <button class="ia-btn ia-btn-green" @click="begin">{{ floorAnchor && !anchorScanned ? 'Scan QR to begin' : 'Start AR guide' }}</button>
      <button class="ia-link" @click="goBack">Cancel</button>
    </div>
  </div>

  <!-- HUD -->
  <template v-if="stage === 'nav'">
    <div class="ia-top">
      <button class="ia-chip" @click="goBack">&larr; Exit</button>
      <span class="ia-chip ia-chip-static">
        <span class="ia-dot" :class="motionOk ? 'on' : ''"></span>
        {{ motionOk ? 'Counting steps' : 'Manual steps' }}
      </span>
      <span class="ia-chip ia-chip-static">{{ currentFloor }}</span>
    </div>

    <div v-if="hud" class="ia-banner-wrap">
      <div class="ia-banner">
        <svg v-if="hud.kind === 'turn' || hud.kind === 'straight'" width="28" height="28" viewBox="0 0 24 24" fill="none"
             :style="{ transform: 'rotate(' + (hud.dir === 'left' ? -90 : hud.dir === 'right' ? 90 : 0) + 'deg)' }">
          <path d="M12 3.5 L19.5 16 L12 12.7 L4.5 16 Z" fill="#059669"/>
        </svg>
        <svg v-else-if="hud.kind === 'stairs'" width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 20h4v-4h4v-4h4V8h4" stroke="#059669" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <svg v-else width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="#059669" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <div class="ia-banner-text">
          <div class="ia-banner-title">
            <template v-if="hud.kind === 'turn'">Turn {{ hud.dir }} in {{ hud.distance }} m</template>
            <template v-else-if="hud.kind === 'straight'">Continue straight</template>
            <template v-else-if="hud.kind === 'stairs'">Take the stairs to {{ hud.nextFloor }}</template>
            <template v-else>You've arrived</template>
          </div>
          <div class="ia-banner-sub">
            <template v-if="hud.kind === 'arrived'">{{ toRoom.room_name }}<span v-if="toRoom.room_number"> &middot; Room {{ toRoom.room_number }}</span></template>
            <template v-else-if="hud.kind === 'stairs'">Then tap the button below once you're there</template>
            <template v-else>{{ hud.remaining }} m to {{ toRoom.room_name }}</template>
          </div>
        </div>
      </div>
    </div>

    <div v-if="lookHint" class="ia-look" role="status">
      <svg v-if="lookHint === 'left'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      <span>Turn {{ lookHint }} to see the path</span>
      <svg v-if="lookHint === 'right'" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    </div>
    <div v-if="alignNote" class="ia-note-pill" role="status">{{ alignNote }}</div>

    <canvas ref="minimap" class="ia-minimap" width="240" height="240"></canvas>

    <div class="ia-bottom">
      <button v-if="hud && hud.kind === 'stairs'" class="ia-btn ia-btn-green" @click="confirmFloor">I'm on {{ hud.nextFloor }}</button>
      <div class="ia-adjust">
        <span class="ia-adjust-label">Position off? Adjust</span>
        <button class="ia-chip" @click="nudge(-2)">&minus;2 m</button>
        <button class="ia-chip" @click="nudge(2)">+2 m</button>
        <button class="ia-chip" @click="nextCorner">At next corner</button>
        <button class="ia-chip ia-chip-accent" @click="alignToPath" title="Face along the hallway, then tap">Align to path</button>
      </div>
    </div>
  </template>

</div>

<script src="../../Js/Include/offline-cache.js?v=<?= $cacheJsVer ?>"></script>
<script src="../../Js/Include/student-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Include/floor-route.js?v=<?= $floorRouteJsVer ?>"></script>
<script src="../../Js/Include/ar-ribbon.js?v=<?= $ribbonJsVer ?>"></script>
<script src="../../Js/Public/campus-route.js?v=<?= $geomJsVer ?>"></script>
<script src="../../Js/Include/indoor-nav.js?v=<?= $navJsVer ?>"></script>
<script src="../../Js/Student/indoor-ar.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
