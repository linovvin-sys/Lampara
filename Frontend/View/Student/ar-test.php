<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no">
<title>AR.js Camera Test</title>
<script src="https://aframe.io/releases/1.4.0/aframe.min.js"></script>
<script src="../../assets/vendor/threex-device-orientation-controls.js"></script>
<script src="../../assets/vendor/aframe-ar.js"></script>
<link rel="stylesheet" href="../../Css/Student/ar-test.css">
</head>
<body style="background:#000;">

<div id="search-box" style="position:fixed; top:12px; left:12px; right:12px; z-index:60; display:flex; gap:8px;">
  <input id="building-search" type="text" placeholder="Search a building…"
         style="flex:1; box-sizing:border-box; padding:10px 14px; border-radius:10px; border:none; font-size:14px;">
  <button id="diagnose-btn" style="padding:10px 14px; border-radius:10px; border:none; font-size:12px; font-weight:bold; background:#22c55e; color:#000;">Diagnose</button>
</div>
<div id="search-results" style="position:fixed; top:60px; left:12px; right:12px; z-index:60;"></div>

<div id="status" style="top:78px;">
  <b>AR.js Camera Test (v11 — manual diagnose button)</b> — camera fix
  confirmed. Search a building above, then tap "Diagnose" for fresh info
  about exactly where it got placed.
</div>

<a-scene embedded
         vr-mode-ui="enabled: false"
         arjs="sourceType: webcam; debugUIEnabled: false;"
         renderer="antialias: true; alpha: true">
  <a-camera gps-new-camera="gpsMinDistance: 2; initialPositionAsOrigin: true;" rotation-reader></a-camera>
</a-scene>

<script src="../../Js/Student/ar-test.js"></script>

</body>
</html>
