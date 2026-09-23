// Directly drive Three.js's renderer/camera to match the real device
// viewport — bypassing AR.js's own internal sizing, which is what caused
// the pillarboxing last time. Run once on load and again on any resize.
function forceArSize() {
  const scene = document.querySelector('a-scene');
  if (!scene || !scene.renderer) return;
  // visualViewport tracks the REAL currently-visible viewport (the JS
  // counterpart to CSS's dvh/dvw) — window.innerWidth/innerHeight can
  // disagree with what 100vh/100vw resolves to, which is exactly the
  // mismatch the diagnostic caught (CSS box 784 tall vs innerHeight 728).
  const vv = window.visualViewport;
  const w = vv ? vv.width : window.innerWidth;
  const h = vv ? vv.height : window.innerHeight;
  scene.renderer.setSize(w, h, true);
  if (scene.camera) {
    scene.camera.aspect = w / h;
    scene.camera.updateProjectionMatrix();
  }
}
// TEST: does AR.js re-assert its own internal viewport every frame, undoing
// a one-time fix immediately? A tick-based component runs forceArSize() on
// every single rendered frame — if THIS clears the bar where one-time calls
// didn't, that confirms AR.js is fighting us continuously, not just once at
// load. This registers a new component and attaches it to the scene — a
// normal, supported way to add behavior to an entity after the fact.
AFRAME.registerComponent('force-ar-size-every-frame', {
  tick: function () { forceArSize(); }
});

const sceneEl = document.querySelector('a-scene');
sceneEl.setAttribute('force-ar-size-every-frame', '');
sceneEl.addEventListener('loaded', forceArSize);
window.addEventListener('arjs-video-loaded', () => setTimeout(forceArSize, 50));
window.addEventListener('resize', forceArSize);
setTimeout(forceArSize, 800);
setTimeout(forceArSize, 2000);

// Search any real registered building instead of one hardcoded test case —
// also lets us confirm whether "too small at distance" was really the issue
// by comparing a nearby vs. a farther building.
let allBuildings = [];
let currentLabel = null;
let myPos = null;

fetch('../../../Backend/api/buildings.php').then((r) => r.json()).then((data) => {
  if (data.success) allBuildings = data.buildings;
});
navigator.geolocation.watchPosition(
  (p) => { myPos = { lat: p.coords.latitude, lng: p.coords.longitude }; },
  () => {},
  { enableHighAccuracy: true }
);

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function placeLabel(building) {
  if (currentLabel) { currentLabel.remove(); currentLabel = null; }

  const distance = myPos ? haversineMeters(myPos, building) : 500;
  // gps-new-entity-place positions things in real-world METERS — a fixed
  // small scale (like the original 24) is a barely-visible speck once
  // you're any real distance away. Scale up proportionally to distance so
  // it stays a reasonable size regardless of how far the building is.
  const scale = Math.max(30, Math.round(distance * 0.15));

  const wrapper = document.createElement('a-entity');
  wrapper.setAttribute('gps-new-entity-place', `latitude: ${building.lat}; longitude: ${building.lng};`);

  const label = document.createElement('a-text');
  label.setAttribute('value', building.name + '\n' + Math.round(distance) + 'm away');
  label.setAttribute('look-at', '[gps-new-camera]');
  label.setAttribute('align', 'center');
  label.setAttribute('scale', `${scale} ${scale} ${scale}`);
  label.setAttribute('color', '#22c55e');
  wrapper.appendChild(label);

  sceneEl.appendChild(wrapper);
  currentLabel = wrapper;
  document.getElementById('status').innerHTML =
    '<b>Targeting:</b> ' + building.name + ' — ' + Math.round(distance) + 'm away, label scale ' + scale;
}

// gps-new-entity-place computes its 3D position exactly ONCE, the instant
// the entity is created — using whatever origin exists at that moment.
// Entities almost always get built before AR.js's GPS watch has its first
// accurate fix, so they're permanently stuck at (0,0,0) unless re-computed
// once the origin is actually ready. AR.js fires "gps-camera-update-position"
// on every later fix but never repositions existing entities itself — force
// it here.
const camElForReposition = document.querySelector('[gps-new-camera]');
if (camElForReposition) {
  camElForReposition.addEventListener('gps-camera-update-position', () => {
    if (!currentLabel) return;
    const comp = currentLabel.components['gps-new-entity-place'];
    if (comp) comp.update();
  });
}

const searchInput = document.getElementById('building-search');
const resultsEl = document.getElementById('search-results');
searchInput.addEventListener('input', () => {
  const q = searchInput.value.trim().toLowerCase();
  resultsEl.innerHTML = '';
  if (q.length < 1) return;
  const matches = allBuildings.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 5);
  matches.forEach((b) => {
    const item = document.createElement('div');
    item.textContent = b.name;
    item.style.cssText = 'background:rgba(0,0,0,0.85); color:#fff; padding:10px 14px; border-radius:8px; margin-top:4px; font-size:13px;';
    item.addEventListener('click', () => {
      // Same lesson as before: entities placed before the camera component
      // has initialized silently fail forever — guard against a very fast
      // search happening before the scene's "loaded" event fires.
      if (sceneEl.hasLoaded) {
        placeLabel(b);
      } else {
        sceneEl.addEventListener('loaded', () => placeLabel(b), { once: true });
      }
      searchInput.value = b.name;
      resultsEl.innerHTML = '';
    });
    resultsEl.appendChild(item);
  });
});

// Camera rendering is confirmed fixed — this diagnostic now checks the
// LABEL instead: has the camera actually received a GPS fix yet (entities
// can't be positioned without one), does the label entity exist, and where
// is it actually placed in 3D space relative to the camera.
function runLabelDiagnostic() {
  const statusEl = document.getElementById('status');
  let report = '<b>LABEL DIAGNOSTIC</b><br>';

  const camEl = document.querySelector('[gps-new-camera]');
  const camComp = camEl && camEl.components['gps-new-camera'];
  if (!camComp) {
    report += 'gps-new-camera component: NOT FOUND on camera element<br>';
  } else {
    // originCoords/currentCoords belong to AR.js's OLDER gps-camera
    // component — gps-new-camera never has those properties, so this
    // always silently read undefined and reported "null" regardless of
    // real state. Real state: initialPosition (set once, only if
    // initialPositionAsOrigin:true was passed on the <a-camera> tag) and
    // _currentPosition (updated on every GPS fix).
    report += 'gps-new-camera: initialPositionAsOrigin option=' + camComp.data.initialPositionAsOrigin + '<br>';
    // setWorldOrigin() lives on the inner threeLoc (H.LocationBased) object,
    // not on the component itself — it sets threeLoc.initialPosition, not
    // camComp.initialPosition (always undefined).
    report += 'gps-new-camera: origin established (threeLoc.initialPosition)=' + !!(camComp.threeLoc && camComp.threeLoc.initialPosition) + '<br>';
    report += 'gps-new-camera: _currentPosition=' +
      (camComp._currentPosition ? JSON.stringify(camComp._currentPosition) : 'null (no GPS fix received yet)') + '<br>';
  }

  const wrapper = document.querySelector('[gps-new-entity-place]');
  if (!wrapper) {
    report += 'label entity: NOT FOUND in DOM at all<br>';
  } else {
    const pos = wrapper.object3D.position;
    report += 'label entity: found, gps-new-entity-place="' + wrapper.getAttribute('gps-new-entity-place') + '"<br>';
    report += 'label object3D.position: x=' + pos.x.toFixed(1) + ' y=' + pos.y.toFixed(1) + ' z=' + pos.z.toFixed(1) + '<br>';
    report += 'label visible: ' + wrapper.object3D.visible + '<br>';
    if (camEl) {
      const camPos = camEl.object3D.position;
      const dist = camPos.distanceTo(pos);
      report += 'distance from camera: ' + dist.toFixed(1) + ' world units<br>';
    }
  }

  navigator.geolocation.getCurrentPosition(
    (p) => {
      report += 'navigator.geolocation right now: ' + p.coords.latitude.toFixed(6) + ', ' + p.coords.longitude.toFixed(6) +
        ' (accuracy ' + Math.round(p.coords.accuracy) + 'm)<br>';
      statusEl.innerHTML = report;
    },
    (err) => {
      report += 'navigator.geolocation error: ' + err.message + '<br>';
      statusEl.innerHTML = report;
    },
    { enableHighAccuracy: true }
  );
  statusEl.innerHTML = report + 'getting current position…';
}
// No longer auto-runs on a timer — that raced against the search UI and
// overwrote its "Targeting: ..." status with a stale "not found" report.
// Exposed on window so you can still run it manually from the browser
// console after selecting a building, if needed: runLabelDiagnostic()
window.runLabelDiagnostic = runLabelDiagnostic;
document.getElementById('diagnose-btn').addEventListener('click', runLabelDiagnostic);
