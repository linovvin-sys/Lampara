<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$cssVer = filemtime(__DIR__ . '/../../Css/Public/map.css');
// one version for map.js and the 3D viewer it imports, so a change to either reaches phones together
$jsVer = max(filemtime(__DIR__ . '/../../Js/Public/map.js'), filemtime(__DIR__ . '/../../Js/Public/map-3d.js'));
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Lampara — Campus Map</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=2">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=2">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=2">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="../../assets/apple-touch-icon.png?v=2">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= filemtime(__DIR__ . '/../../Css/skeleton.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../assets/vendor/leaflet/leaflet.css">
<link rel="stylesheet" href="../../Css/Public/map.css?v=<?= $cssVer ?>">
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
} }
</script>
</head>
<body>
<script>LamparaSkeleton.show('map', { manual: true })</script>

<div class="map-app" id="mapApp">

  <header class="map-top">
    <a href="index.php" class="back" aria-label="Back to home">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>
    </a>
    <div class="titles">
      <h1>Campus Map</h1>
      <p id="caption">NCST campus</p>
    </div>
    <div class="seg" role="tablist" aria-label="Map type">
      <button type="button" role="tab" id="tab-2d" data-kind="2d" aria-selected="true">2D</button>
      <button type="button" role="tab" id="tab-3d" data-kind="3d" aria-selected="false">3D</button>
      <button type="button" role="tab" id="tab-street" aria-selected="false" title="The campus from above">Satellite</button>
    </div>
  </header>

  <nav class="key-places" id="keyPlaces" aria-label="Key places" hidden></nav>

  <main class="stage" id="stage">
    <div class="viewport" id="viewport" aria-label="Campus map. Drag to move, pinch or scroll to zoom." tabindex="0">
      <div class="canvas" id="mapCanvas" hidden>
        <img id="mapImg" alt="" draggable="false">
        <div class="mk-layer" id="mkLayer"></div>
      </div>
    </div>
    <div class="viewport3d" id="viewport3d" aria-label="3D campus model. Drag to rotate, pinch or scroll to zoom." hidden></div>

    <div class="pager" id="pager" hidden>
      <button type="button" id="pagePrev" aria-label="Previous page">&lsaquo;</button>
      <span id="pageNum">1 / 1</span>
      <button type="button" id="pageNext" aria-label="Next page">&rsaquo;</button>
    </div>

    <div class="state" id="loading">
      <span class="spinner"></span><span id="loadingText">Loading map…</span>
    </div>

    <div class="state" id="empty" hidden>
      <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z"/><path d="M9 4v13M15 7v13"/></svg>
      <strong id="emptyTitle">No map yet</strong>
      <span id="emptyText">The campus map hasn't been uploaded yet. Please check back soon.</span>
    </div>

    <div class="mk-card" id="mkCard" hidden>
      <span class="mk-card-icon" id="mkCardIcon"></span>
      <div class="mk-card-text">
        <strong id="mkCardName"></strong>
        <span id="mkCardType"></span>
      </div>
      <button type="button" id="mkCardClose" aria-label="Close">&times;</button>
    </div>

    <div class="pins-sheet" id="pinsSheet" hidden>
      <div class="pins-head"><strong>Entrances &amp; gates</strong><button type="button" id="pinsClose" aria-label="Close">&times;</button></div>
      <ul id="pinsList"></ul>
    </div>

    <section class="pins-sheet bld-sheet" id="bldSheet" aria-labelledby="bldName" hidden>
      <img class="bld-photo" id="bldPhoto" alt="" hidden>
      <div class="pins-head">
        <div class="bld-head-text"><strong id="bldName"></strong><span id="bldMeta"></span></div>
        <button type="button" id="bldClose" aria-label="Close building details">&times;</button>
      </div>
      <a class="bld-walk" id="bldWalk" href="guide-ar.php" hidden>Walk there (outdoor AR guide)</a>
      <p class="bld-dir" id="bldDir" hidden></p>
      <ul id="bldRooms" aria-label="Rooms in this building"></ul>
    </section>

    <dialog class="room-dlg" id="roomDialog" aria-labelledby="roomDlgTitle">
      <div class="room-dlg-photo" id="roomDlgPhoto"></div>
      <div class="room-dlg-body">
        <h2 id="roomDlgTitle"></h2>
        <p class="room-dlg-meta" id="roomDlgMeta"></p>
        <p class="room-dlg-line" id="roomDlgHours" hidden></p>
        <p class="room-dlg-line" id="roomDlgNotes" hidden></p>
        <div class="room-dlg-actions">
          <a class="room-dlg-go" id="roomDlgFind" href="../Student/scan.php">Find inside</a>
          <a class="room-dlg-go alt" id="roomDlgWalk" href="guide-ar.php">Walk there</a>
          <button type="button" class="room-dlg-close" id="roomDlgClose">Close</button>
        </div>
      </div>
    </dialog>

    <div class="controls" id="controls" hidden>
      <button type="button" id="pinsBtn" aria-label="Entrances and gates" hidden>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.4"/></svg>
      </button>
      <button type="button" id="zoomIn" aria-label="Zoom in">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
      </button>
      <button type="button" id="zoomOut" aria-label="Zoom out">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>
      </button>
      <button type="button" id="zoomReset" aria-label="Fit to screen" title="Fit to screen">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v4M12 17v4M3 12h4M17 12h4"/></svg>
      </button>
      <button type="button" id="fullscreen" aria-label="Full screen">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
      </button>
    </div>

    <!-- Satellite view: the campus from above, nothing drawn on it (js/map-street.js). Covers the 2D and 3D views while open. -->
    <section class="street" id="streetView" aria-label="Street map of the campus" hidden>
      <div class="street-map" id="streetMap"></div>
    </section>

    <p class="hint" id="hint" hidden>Drag to move &middot; pinch or scroll to zoom &middot; double-tap to zoom in</p>
  </main>

</div>

<script src="../../Js/Include/offline-cache.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/offline-cache.js') ?>"></script>
<script src="../../Js/Include/student-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Public/map.js?v=<?= $jsVer ?>"></script>
<script src="../../assets/vendor/leaflet/leaflet.js"></script>
<script src="../../Js/Include/campus-bounds.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/campus-bounds.js') ?>"></script>
<script src="../../Js/Public/map-street.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/map-street.js') ?>"></script>
<script src="../../Js/Include/hazard-feed.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/hazard-feed.js') ?>"></script>
</body>
</html>
