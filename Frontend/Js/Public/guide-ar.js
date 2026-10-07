const { createApp } = Vue;

// Shown on the start screen and in AR debug, so you can tell at a glance whether the phone is
// running this version or an old cached copy. Change it with each AR fix.
const AR_BUILD = 'AR build: v12 (steps)';

// Movement comes from your STEPS, not raw GPS: GPS jumps 5-20 m on its own (worst near walls
// and indoors), which moved you even while standing still. Each detected step moves you this
// far in the direction you face, kept on the drawn path; standing still = not moving.
const STEP_LENGTH_M = 0.7;
const STEP_SNAP_M = 8;            // after a step, stay on a drawn path if one is this close
// GPS is then only a safety net for big drift: ignored while it agrees within this distance...
const GPS_TRUST_MIN_M = 10;
const GPS_PULL = 0.2;             // ...otherwise you are pulled this fraction of the way toward it per fix

// How far below the phone the ground is, in meters (phone held up in front of you while
// walking ~1.4). The path is laid exactly this far below the camera. If it looks like it
// floats or sinks, tune it without editing code: add ?h=1.3 (or 1.5 ...) to the page URL.
const EYE_HEIGHT_M = (() => {
  try { const v = parseFloat(new URLSearchParams(location.search).get('h')); if (v > 0.5 && v < 2.5) return v; } catch (e) { /* default */ }
  return 1.4;
})();
// Entity Y for a ribbon so its surface sits EYE_HEIGHT_M below the camera. The ribbon's own
// geometry is already raised by ArRibbon.GROUND_Y, so that is subtracted here (it used to be
// counted twice, leaving the path ~0.2 m above the real ground).
function ribbonEntityY(camY) { return camY - EYE_HEIGHT_M - ArRibbon.GROUND_Y; }

// Top-down mini-map (north up) — lets you check, anywhere, that the drawn paths and your
// position/heading are what the AR scene is using. Tap it to zoom out/in.
const MINIMAP_RADII_M = [40, 120];

// The 3D camera must see the same slice of the world as the phone camera, or the paths slide
// against the video when you turn (A-Frame's default is 80 deg; phone cameras see less).
// This is the phone camera's view across its LONG side, in degrees — ~65-70 on most phones.
// Tune per phone without editing code by adding ?fov=NN to the page URL.
const CAMERA_LONG_FOV_DEG = (() => {
  try { const v = parseFloat(new URLSearchParams(location.search).get('fov')); if (v > 20 && v < 120) return v; } catch (e) { /* default */ }
  return 67;
})();

// Genuine extruded 3D text needs a loaded font mesh (three.js TextGeometry +
// a font file) — heavier than this needs. This is the standard lightweight
// fake: stack several copies of the same text slightly behind each other in
// depth, each darker than the last, so it reads as solid extruded letters
// instead of one flat plane. The whole stack moves as a rigid group (one
// look-at on the parent) so the layers never drift out of alignment.
const LABEL_DEPTH_LAYERS = 4;
const LABEL_LAYER_STEP = 0.02;

function darkenHex(hex, amount) {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, Math.round(((n >> 16) & 255) * (1 - amount)));
  const g = Math.max(0, Math.round(((n >> 8) & 255) * (1 - amount)));
  const b = Math.max(0, Math.round((n & 255) * (1 - amount)));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function createLabelGroup(text) {
  const group = document.createElement('a-entity');
  group.setAttribute('look-at', '[gps-new-camera]');
  const layers = [];
  // Built back-to-front: layers[0] is the furthest-back copy, the last one
  // pushed (i=0, z=0) is the front-most, brightest, actually-readable copy.
  for (let i = LABEL_DEPTH_LAYERS; i >= 0; i--) {
    const t = document.createElement('a-text');
    t.setAttribute('value', text);
    t.setAttribute('align', 'center');
    // wrap-count (not width — width scales the base font size itself) is
    // what actually controls when text wraps to a new line.
    t.setAttribute('wrap-count', '30');
    t.setAttribute('position', `0 0 ${-i * LABEL_LAYER_STEP}`);
    t.classList.add('ar-clickable');
    group.appendChild(t);
    layers.push(t);
  }
  return { group, layers };
}
function setLabelValue(entry, value) {
  entry.labelLayers.forEach((t) => t.setAttribute('value', value));
}
function setLabelColor(entry, frontColor, opacity) {
  const layers = entry.labelLayers;
  const frontIdx = layers.length - 1;
  layers.forEach((t, idx) => {
    const depthFromFront = frontIdx - idx;
    const color = depthFromFront === 0 ? frontColor : darkenHex(frontColor, Math.min(0.75, depthFromFront * 0.22));
    t.setAttribute('color', color);
    t.setAttribute('material', `opacity: ${opacity}; transparent: true`);
  });
}

// Ground ribbon rendering lives in Include/ar-ribbon.js (shared with the indoor
// guide); these are just the outdoor page's own route thresholds.
const RIBBON_VISIBLE_METERS = 300;   // the whole route in practice; only a very long walk is cut (and then fades out)
const ARRIVED_METERS = 8;
const FAR_BOOST_FROM = 100;        // from here the destination marker is enlarged...
const FAR_BOOST_TO = 300;          // ...reaching its largest at this distance
const FAR_BOOST_MAX = 1.9;         // ...which is this many times the normal size
const OFF_PATH_METERS = 60;        // farther from any walkway than this -> no ribbon
// Raw phone GPS while walking is typically only accurate to 3-10m, worse
// near buildings, and jitters between fixes — this can't be eliminated
// (it's the hardware's real accuracy, not a bug), only smoothed so the
// ribbon/arrow don't visibly jump with every noisy fix. Doesn't touch
// AR.js's own separate internal camera GPS tracking.
const GPS_MAX_ACCURACY_M = 30;    // a fix worse than this is dropped outright, keeping the last good position
const GPS_SMOOTH_ALPHA = 0.35;    // how much each new fix moves the smoothed position (0-1, lower = calmer but slower to follow real movement)

// AR.js's default projection is spherical Web Mercator, whose "meters" are stretched by
// 1/cos(latitude) — at this campus (~14.3 N) every distance in the scene was ~3% too long
// (a 200 m walk drawn as ~206 m), and the ribbon/buildings looked farther than they are.
// Swapped in for a true local metric projection (same flat-earth maths campus-route.js uses).
const PROJ_M_PER_DEG = 111320;
const DEFAULT_CAMPUS_LAT = 14.3283;
// The building's own pin is usually mid-building, tens of meters past the door. The ribbon
// stops at the entrance; it is only carried on to the marker when that is this close.
const MARKER_EXTEND_MAX_M = 12;
// Automatic heading alignment (see autoAlignHeading): how far you must walk along a drawn
// path before that movement is trusted as a compass reference, and how loosely the samples
// must agree before one is applied.
const ALIGN_MIN_WALK_M = 6;
const ALIGN_MAX_WINDOW_MS = 25000;
const ALIGN_SAMPLES_NEEDED = 3;
const ALIGN_MAX_SPREAD_DEG = 25;
const ALIGN_STEP = 0.35;         // fraction of the remaining error corrected per accepted sample
const ALIGN_DEADBAND_DEG = 2;
// Scanning the anchor QR (inside the AR view, so the AR camera's own heading is known at that
// exact moment): any successful read counts; heading samples are taken for up to ANCHOR_MAX_WAIT_MS.
const ANCHOR_HFOV_DEG = 55;       // typical portrait back-camera horizontal field of view
const ANCHOR_HITS_NEEDED = 2;
const ANCHOR_MAX_WAIT_MS = 1200;  // after the first read, finish within this even with fewer heading samples
// Students walk on the walkways, so your position is pinned onto the nearest drawn path when
// it is this close (removes GPS's sideways error, the "path runs beside the road" effect).
const SNAP_TO_PATH_M = 15;
const CAM_FOLLOW_MS = 600;        // how quickly the camera glides to a new position (no teleporting)
function makeLocalProjection(lat0) {
  const kx = PROJ_M_PER_DEG * Math.cos(lat0 * Math.PI / 180);
  return {
    project: (lon, lat) => [lon * kx, lat * PROJ_M_PER_DEG],
    unproject: (p) => [p[0] / kx, p[1] / PROJ_M_PER_DEG],
    getID: () => 'local-metric'
  };
}

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
// Same compass math as the stable guide.php — used ONLY for the "turn left/
// right" off-screen indicator below, completely independent of AR.js's own
// internal compass (which keeps driving the actual 3D scene, unaffected).
// The 3D arrow only exists in real 3D space — if the building is behind you
// or off to the side, it's simply not rendered at all (outside the camera's
// view), with no hint to turn. This closes that gap with a real 2D fallback.
function bearingDeg(a, b) {
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
// Signed angular difference in [-180, 180]: positive = target is clockwise (right) of current heading.
function relativeAngle(fromDeg, toDeg) {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

createApp({
  data() {
    return {
      arBuild: AR_BUILD,
      started: false,
      checking: true,
      quickStart: false,
      statusText: '',
      statusOk: false,
      headingInit: false, // set true once AR.js's own gps-new-camera reports a heading-driven update
      // Independent compass reading (same technique guide.php uses), for
      // the "turn left/right" off-screen indicator only — not connected to
      // AR.js's own internal compass driving the 3D scene.
      compassHeading: 0,
      compassReady: false,
      // Partial toggles, disclosed as such in the UI copy — see the overlay
      // markup for why these can't be full stop/start like guide.php's.
      cameraOn: true,
      locationOn: true,
      gpsWatchId: null,
      buildings: [],
      // Outdoor walkway graph (Campus Paths admin page) — the ground ribbon
      // routes over this. Empty graph = no ribbon, the arrow marker still works.
      campusGraph: { nodes: [], edges: [] },
      // Banner state for the route: null | { status: 'ok'|'arrived'|'off-path', dir, turnDistance, remaining }
      routeInfo: null,
      myPos: null,
      searchQuery: '',
      showAllBuildings: false, // toggled by the dropdown-browse button, independent of searchQuery
      target: null,
      chatOpenFor: null,
      chatMessages: [],
      chatInput: '',
      chatLoading: false,
      arEntities: {}, // building.id -> {wrapper, label, arrow}
      // The campus's one registered AR anchor (Campus Paths admin page), or
      // null if none is set — gates whether starting requires scanning it
      // first. Mirrors indoor-ar.js's floor anchor, same idea: fix the real
      // starting position from a known point instead of trusting GPS's
      // first fix alone, which can be a few meters off near buildings.
      campusAnchor: null,
      scanningAnchor: false,
      anchorScanned: false,
      anchorScanError: '',
      anchorScanHint: '',
      anchorNote: '',   // short confirmation after the scan: what the QR fixed
      headingLocked: false, // true once walking along a drawn path has auto-corrected the compass heading
      anchorPos: null, // lat/lng of the scanned anchor — what the GPS-error correction is measured against
      // Right after a successful scan (not a skip), the WHOLE walkway graph
      // shows in AR at the registered anchor — not just a single destination
      // route — until a building is searched and picked, at which point
      // this disappears in favor of the normal single-route ribbon.
      showAllPaths: false
    };
  },
  computed: {
    searchMatches() {
      const q = this.searchQuery.trim().toLowerCase();
      if (q.length < 2) return [];
      return this.buildings.filter(b => b.name.toLowerCase().includes(q));
    },
    // What the dropdown actually shows: filtered matches while typing, or
    // every registered building when browsing via the toggle button with
    // nothing typed — two entry points into the same list UI.
    dropdownList() {
      if (this.searchQuery.trim().length >= 2) return this.searchMatches;
      return this.showAllBuildings ? this.buildings : [];
    },
    // null while facing the target closely enough that it should already be
    // visible in the 3D scene; 'left'/'right' once it's far enough outside
    // a reasonable phone camera field of view (~35° either side) that it's
    // genuinely not on screen, telling you which way to turn to find it.
    offTargetDirection() {
      if (!this.target || !this.myPos || !this.compassReady) return null;
      const rel = relativeAngle(this.compassHeading, bearingDeg(this.myPos, this.target));
      if (rel > 35) return 'right';
      if (rel < -35) return 'left';
      return null;
    }
  },
  watch: {
    // Typing never auto-selects anymore, even down to exactly one match —
    // a short, distinctive name (like "Test AR") used to lock in as the
    // target the instant it became unique, before you'd necessarily
    // finished typing or meant to select it yet. Always requires an
    // explicit tap from the dropdown below. This only clears the current
    // target if it's no longer among the matches (e.g. you changed the
    // search text away from it) — it doesn't set one on its own.
    searchMatches(matches) {
      if (this.target && !matches.some(b => b.id === this.target.id)) {
        this.setTarget(null);
      }
    }
  },
  async mounted() {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'camera' });
        if (status.state === 'granted') {
          this.quickStart = true;
          this.checking = false;
          return;
        }
      }
    } catch (e) { /* Permissions API unsupported for 'camera' — fall back to the full gate */ }
    this.checking = false;
  },
  methods: {
    async start() {
      this.checking = true;
      this.quickStart = false;
      // iPhone only grants step counting (motion) from inside the tap that started this.
      try {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          DeviceMotionEvent.requestPermission().catch(() => {});
        }
      } catch (e) { /* not available: GPS-only movement */ }

      if (!navigator.geolocation) {
        this.statusText = 'Geolocation not supported.';
        this.checking = false;
        return;
      }

      // Network first, last-known snapshot when offline (see offline-cache.js) —
      // the arrow marker and the ground ribbon both keep working with no signal
      // once this device has loaded them once.
      this.buildings = await LamparaCache.loadBuildings('../../../Backend/api/buildings.php');
      this.campusGraph = await LamparaCache.loadCampusGraph('../../../Backend/api/campus-graph.php');
      try {
        const res = await fetch('../../../Backend/api/qr-anchors.php?campus=1');
        const data = await res.json();
        this.campusAnchor = (data.success && data.anchors.length) ? data.anchors[0] : null;
      } catch (e) { this.campusAnchor = null; }

      this.checking = false;
      this.proceedToAr();
    },
    // Scanning the campus's one registered AR anchor fixes where you stand AND which way you
    // face. It happens inside the AR view (frames are read from AR.js's own camera video) so the
    // AR camera's heading is known at the instant the code is seen:
    //   position  -> ensureAnchorShift(): the anchor's real spot vs where GPS put the camera
    //   direction -> the anchor's stored scan_heading (the bearing you face toward the sign, set
    //                from the map in Campus Paths) minus how far off-center the code is in view,
    //                compared with where the AR camera thinks it points. The difference is the
    //                compass error, applied at once — no walking, no manual aligning.
    startAnchorScan() {
      if (this.scanningAnchor) return;
      this.scanningAnchor = true;
      this.anchorScanError = '';
      this.anchorScanHint = 'Point the camera at the QR code.';
      this._anchorHits = [];
      this._anchorInfo = null;
      this._scanStartedAt = Date.now();
      this._firstReadAt = 0;
      this._anchorScanLoop();
    },
    stopAnchorScan() {
      this.scanningAnchor = false;
    },
    async _anchorScanLoop() {
      if (!this._anchorCanvas) this._anchorCanvas = document.createElement('canvas');
      const canvas = this._anchorCanvas;
      while (this.scanningAnchor) {
        // AR.js owns the camera; its <video> is what we read (a second getUserMedia would fight it).
        const video = document.querySelector('#arjs-video') || document.querySelector('video');
        if (video && video.readyState >= 2 && video.videoWidth && typeof jsQR !== 'undefined') {
          const scale = Math.min(1, 640 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(frame.data, frame.width, frame.height);
          if (result && result.data) {
            const done = await this.onAnchorHit(result, canvas.width);
            if (done) return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    },
    async onAnchorHit(result, frameW) {
      const loc = result.location;
      const cx = (loc.topLeftCorner.x + loc.topRightCorner.x + loc.bottomLeftCorner.x + loc.bottomRightCorner.x) / 4;
      const qrW = Math.hypot(loc.topRightCorner.x - loc.topLeftCorner.x, loc.topRightCorner.y - loc.topLeftCorner.y);

      if (!this._anchorInfo || this._anchorInfo.raw !== result.data) {
        let code = result.data;
        try { const u = new URL(result.data); code = u.searchParams.get('qr') || result.data; } catch (e) { /* plain code, not a URL */ }
        let data = null;
        try {
          const res = await fetch('../../../Backend/api/qr-anchors.php?code=' + encodeURIComponent(code));
          data = await res.json();
        } catch (e) { this.anchorScanError = 'Could not look up that QR code.'; }
        if (data && (!data.success || data.kind !== 'outdoor')) { this.anchorScanError = "That's not the campus anchor QR."; data = null; }
        this._anchorInfo = { raw: result.data, data };
      }
      const info = this._anchorInfo.data;
      if (!info) return false;
      this.anchorScanError = '';

      // Any successful read counts — no centering, distance or "hold upright" requirements.
      // Heading samples are collected for a moment if the camera direction is usable (works
      // even with the phone tilted down at a screen); then the scan finishes regardless.
      if (!this._firstReadAt) this._firstReadAt = Date.now();
      this.anchorScanHint = 'Got it — hold still…';
      const cam = this.cameraHeadingDeg(0.05);
      if (cam !== null && info.scan_heading != null) {
        // Angle between the camera's forward direction and the code (+ = code is right of center).
        const f = (frameW / 2) / Math.tan(ANCHOR_HFOV_DEG * Math.PI / 360);
        const alpha = Math.max(-25, Math.min(25, Math.atan((cx - frameW / 2) / f) * 180 / Math.PI));
        const trueHeading = (info.scan_heading - alpha + 360) % 360;
        this._anchorHits.push(relativeAngle(trueHeading, cam)); // camera heading minus true heading
      }
      const waited = Date.now() - this._firstReadAt;
      if (this._anchorHits.length < ANCHOR_HITS_NEEDED && waited < ANCHOR_MAX_WAIT_MS) return false;

      this.stopAnchorScan();
      this.anchorPos = { lat: info.lat, lng: info.lng };
      this.myPos = { lat: info.lat, lng: info.lng };
      this.statusOk = true;
      this.anchorScanned = true;
      this.showAllPaths = true;
      if (info.scan_heading != null && this._anchorHits.length) {
        const hits = this._anchorHits.slice().sort((a, b) => a - b);
        this._alignOffsetDeg = hits[Math.floor(hits.length / 2)];
        this.headingLocked = true;
        this._headingSamples = [];
        this.anchorNote = 'Position and direction set from the QR';
      } else if (info.scan_heading != null) {
        this.anchorNote = 'Position set. Direction will line up after a few steps along the path.';
      } else {
        this.anchorNote = 'Position set. This QR has no direction yet (Admin → Campus Paths).';
      }
      setTimeout(() => { this.anchorNote = ''; }, 6000);
      this._shiftDone = false;
      this.ensureAnchorShift();
      this.applyWorldTransform();
      if (this.showAllPaths) { this._forceRebuildPaths = true; this.renderAllPaths(); }
      return true;
    },
    skipAnchorScan() {
      this.stopAnchorScan();
      this.anchorScanned = true;
    },
    proceedToAr() {
      // AR.js requests the camera itself once <a-scene> mounts, right after
      // the original tap — not before the user knows why.
      this.started = true;
      this.startLocationWatch();
      this.startCompassWatch();
      this.startMiniMap();
      this.startSteps();

      // Defined immediately, before anything that could throw and silently
      // stop the rest of this setup — the button that calls this should
      // never just do nothing with no visible error either way.
      window.__arDebug = () => {
        try {
          const scene2 = this.$refs.arScene || document.querySelector('a-scene');
          if (!scene2) { alert('No <a-scene> found in the DOM at all.'); return; }
          const camEl = scene2.querySelector('[gps-new-camera]');
          const camComp = camEl && camEl.components && camEl.components['gps-new-camera'];
          const vid = document.querySelector('#arjs-video');
          let report = AR_BUILD + '\nmovement: ' + (this._stepsActive ? 'steps (' + (this.stepCount || 0) + ' so far)' : 'GPS only (no motion sensor)') + '\nground ' + EYE_HEIGHT_M + ' m below phone (?h=)' + '\ncamera fov=' + (scene2.camera ? scene2.camera.fov.toFixed(1) : '?') + ' (long-side ' + CAMERA_LONG_FOV_DEG + ', video ' + (vid ? vid.videoWidth + 'x' + vid.videoHeight : 'none') + ')' + '\ngps-new-camera found: ' + !!camComp;
          if (camComp) {
            // originCoords/currentCoords belong to AR.js's OLDER gps-camera
            // component — gps-new-camera (what we actually use) never has
            // those properties at all, so checking them always silently
            // read undefined and reported "null" regardless of real state.
            // The real state lives in initialPosition (set once, only if
            // initialPositionAsOrigin:true was passed — see the <a-camera>
            // tag) and _currentPosition (updated on every GPS fix).
            report += '\ninitialPositionAsOrigin option=' + camComp.data.initialPositionAsOrigin;
            // setWorldOrigin() lives on the inner threeLoc (H.LocationBased)
            // object, not on the component itself — it sets
            // threeLoc.initialPosition, so that's what actually needs
            // checking, not camComp.initialPosition (always undefined).
            const originVal = camComp.threeLoc && camComp.threeLoc.initialPosition;
            report += '\norigin established (threeLoc.initialPosition)=' + !!originVal + (originVal ? ' [' + originVal.join(', ') + ']' : '');
            report += '\norigin override attempted and succeeded (_originOverrideDone)=' + !!this._originOverrideDone;
            report += '\n_currentPosition=' + (camComp._currentPosition ? JSON.stringify(camComp._currentPosition) : 'null (no GPS fix accurate enough yet)');
            // AR.js's OWN internal GPS watch silently discards any fix with
            // accuracy worse than 100m before it updates _currentPosition or
            // sets the origin — separate from our own distance-tracking
            // watch below, which has no such filter and will keep updating
            // regardless. Showing the live accuracy number here is the only
            // way to tell whether you're actually close to clearing AR.js's
            // threshold or not.
          }
          // What the camera's own Y actually is (gps-new-camera never sets
          // altitude — if this isn't ~1.6, the ribbon's ground-tracking
          // (setGroundY = ribbonEntityY(camY)) should be compensating for it).
          if (camEl && camEl.object3D) {
            const cp = camEl.object3D.position;
            report += '\n\nCamera scene position: x=' + cp.x.toFixed(2) + ' y=' + cp.y.toFixed(2) + ' z=' + cp.z.toFixed(2);
          }
          if (this._ribbon && this._ribbon.active) {
            report += '\nSingle-route ribbon entity Y offset=' + this._ribbon.getGroundY();
          }
          if (this._allPathRibbons && this._allPathRibbons.length) {
            report += '\nAll-paths ribbons built: ' + this._allPathRibbons.length + ' segment(s), first entity Y offset=' + this._allPathRibbons[0].getGroundY();
          } else {
            report += '\nAll-paths ribbons built: 0 (either no edges loaded, or latLonToWorld is still failing — see campusGraph line below)';
          }
          report += '\nheading auto-aligned=' + this.headingLocked + ' offset=' + (this._alignOffsetDeg || 0).toFixed(1) + ' deg';
          report += '\nprojection swapped to true-metric=' + !!this._projInstalled + ' GPS correction=' + (this._gpsCorr ? Math.round(haversineMeters({ lat: 0, lng: 0 }, this._gpsCorr)) + ' m' : 'none') + ' snapped to path=' + (this._snapDist != null ? this._snapDist.toFixed(1) + ' m away' : 'no');
          report += '\ncampusGraph loaded: ' + this.campusGraph.nodes.length + ' node(s), ' + this.campusGraph.edges.length + ' edge(s)';
          report += '\nshowAllPaths=' + this.showAllPaths + ' anchorScanned=' + this.anchorScanned;
          if (this.target && this.arEntities[this.target.id]) {
            const entry = this.arEntities[this.target.id];
            const pos = entry.wrapper.object3D.position;
            report += '\n\nTarget (' + this.target.name + ') entity position: x=' + pos.x.toFixed(1) + ' y=' + pos.y.toFixed(1) + ' z=' + pos.z.toFixed(1);
            report += '\nvisible=' + entry.wrapper.object3D.visible + ' has arrow=' + !!entry.arrow;
          } else {
            report += '\n\nNo target selected yet — search a building first, then tap this button again.';
          }
          navigator.geolocation.getCurrentPosition(
            (p) => {
              report += '\n\nRaw GPS right now: accuracy=' + Math.round(p.coords.accuracy) + 'm (AR.js needs ≤100m to lock on)';
              alert(report);
            },
            (err) => { report += '\n\nRaw GPS error: ' + err.message; alert(report); },
            { enableHighAccuracy: true }
          );
        } catch (e) {
          alert('AR debug threw an error: ' + e.message);
        }
      };

      this.$nextTick(() => {
        const scene = this.$refs.arScene;
        if (!scene) return;

        // Wins the race against AR.js's own GPS watch: gps-new-camera only
        // sets its origin from a real fix if initialPosition is still null
        // at that point (see aframe-ar.js's _gpsReceived). A single
        // synchronous attempt at scene-ready time turned out to be
        // unreliable — threeLoc isn't guaranteed to exist that exact
        // instant — so this polls every 150ms until it actually succeeds
        // (or AR.js's own GPS beats us to it, in which case initialPosition
        // is already set and we correctly back off instead of clobbering
        // it). Setting this means the scanned QR's precise lat/lng becomes
        // the scene's actual coordinate origin — not just a separate
        // variable (myPos) used only for our own route math, which never
        // touched what AR.js uses to place anything in 3D space. THIS is
        // what was actually causing the path to render tens of meters off.
        // Polls until AR.js's location object exists (it isn't guaranteed to at scene-ready),
        // then (1) swaps in the true-metric projection and (2) if a QR was scanned, wins the race
        // against AR.js's own GPS watch to make the QR's lat/lng the scene origin (gps-new-camera
        // only takes a real fix as origin while initialPosition is still null — if its GPS beat
        // us, we back off and the shift in ensureAnchorShift() covers it instead).
        if (!this._originOverrideDone) {
          let tries = 0;
          const tryInit = () => {
            tries++;
            try {
              const camEl0 = scene.querySelector('[gps-new-camera]');
              const camComp0 = camEl0 && camEl0.components && camEl0.components['gps-new-camera'];
              if (camComp0 && camComp0.threeLoc) {
                this.installLocalProjection(camComp0);
                if (this.anchorScanned && this.anchorPos && !camComp0.threeLoc.initialPosition) {
                  camComp0.threeLoc.setWorldOrigin(this.anchorPos.lng, this.anchorPos.lat);
                }
                this._originOverrideDone = true;
                return;
              }
            } catch (e) { /* threeLoc not fully ready yet — retry */ }
            if (tries < 40) setTimeout(tryInit, 150); // ~6s ceiling
          };
          tryInit();
        }

        // Everything GPS-placed (buildings, ribbons) hangs off this one group instead of the
        // scene directly, so the anchor shift and the automatic compass correction
        // (applyWorldTransform) move and turn all of it together.
        if (!this._worldGroup) {
          const group = document.createElement('a-entity');
          scene.appendChild(group);
          this._worldGroup = group;
        }

        const onSceneReady = () => {
          this.forceArSize();
          this.buildAllEntities();
          this.setupTapSelection(scene);
          if (this.campusAnchor && !this.anchorScanned) this.startAnchorScan();
        };
        if (scene.hasLoaded) {
          onSceneReady();
        } else {
          scene.addEventListener('loaded', onSceneReady, { once: true });
        }
        window.addEventListener('resize', this.forceArSize);
        window.addEventListener('arjs-video-loaded', () => setTimeout(this.forceArSize, 50));
        setTimeout(this.forceArSize, 800);
        setTimeout(this.forceArSize, 2000);

        // Bypasses AR.js's own internal render sizing every frame — the
        // confirmed fix from ar-test.php's per-frame reassertion test.
        AFRAME.registerComponent('force-ar-size-every-frame', { tick: () => this.forceArSize() });
        scene.setAttribute('force-ar-size-every-frame', '');

        // Pins the camera to OUR position (corrected + snapped to the walkway), gliding to each
        // new one, instead of AR.js's raw-GPS placement. Runs every frame, so AR.js's own
        // writes on its GPS fixes never show.
        const app = this;
        if (!AFRAME.components['lampara-cam-pin']) {
          AFRAME.registerComponent('lampara-cam-pin', {
            tick(time, dt) {
              const cur = app._camPos, tgt = app._camTarget;
              if (!cur || !tgt) return;
              const k = Math.min(1, (dt || 16) / CAM_FOLLOW_MS);
              cur.x += (tgt.x - cur.x) * k;
              cur.z += (tgt.z - cur.z) * k;
              const camEl2 = this.el.querySelector('[gps-new-camera]');
              if (camEl2 && camEl2.object3D) { camEl2.object3D.position.x = cur.x; camEl2.object3D.position.z = cur.z; }
            }
          });
        }
        scene.setAttribute('lampara-cam-pin', '');

        // A rough proxy for "compass is working": AR.js's rotation-reader
        // starts updating the camera's own rotation once device orientation
        // events arrive — poll for a nonzero rotation as a simple signal.
        const camEl = scene.querySelector('[gps-new-camera]');
        const checkHeading = setInterval(() => {
          if (camEl && camEl.object3D && (camEl.object3D.rotation.y !== 0 || this.headingInit)) {
            this.headingInit = true;
            clearInterval(checkHeading);
          }
        }, 500);
        setTimeout(() => clearInterval(checkHeading), 15000);
      });
    },
    installLocalProjection(camComp) {
      const loc = camComp.threeLoc;
      if (this._projInstalled || !loc || !loc._proj) return;
      const lats = this.buildings.map((b) => b.lat).filter((v) => typeof v === 'number');
      const nodeLat = this.campusGraph.nodes.length ? this.campusGraph.nodes[0].lat : null;
      const refLat = lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : (nodeLat || DEFAULT_CAMPUS_LAT);
      const proj = makeLocalProjection(refLat);
      // If AR.js already took an origin / placed the camera under Mercator, redo both
      // in the new projection so nothing is left in the old units.
      if (loc.initialPosition) {
        const ll = loc._proj.unproject(loc.initialPosition);
        loc.initialPosition = proj.project(ll[0], ll[1]);
      }
      loc.setProjection(proj);
      this._proj = proj;
      this._projInstalled = true;
      if (loc._lastCoords) loc.setWorldPosition(loc._camera, loc._lastCoords.longitude, loc._lastCoords.latitude);
      Object.values(this.arEntities).forEach((entry) => {
        const comp = entry.wrapper.components['gps-new-entity-place'];
        if (comp) comp.update();
      });
    },
    // Raw GPS is typically 5-20 m off. The QR tells us where you REALLY are (the anchor), so
    // (raw fix at the sign - anchor) is the GPS error; it is subtracted from every later fix.
    ensureAnchorShift() {
      if (this._shiftDone || !this.anchorPos || !this._lastRaw) return;
      if (Date.now() - this._lastRaw.t > 15000) return; // stale fix — wait for a fresh one at the sign
      this._gpsCorr = { lat: this._lastRaw.lat - this.anchorPos.lat, lng: this._lastRaw.lng - this.anchorPos.lng };
      this._shiftDone = true;
      this.myPos = { lat: this.anchorPos.lat, lng: this.anchorPos.lng };
      this.refreshCamera(true);
    },
    // The heading correction turns the whole GPS world group about the scene origin. The camera
    // is placed by us (refreshCamera) with the same rotation, so every bearing from you to the
    // path and buildings is corrected by exactly that amount.
    applyWorldTransform() {
      const g = this._worldGroup;
      if (!g) return;
      g.object3D.rotation.y = -(this._alignOffsetDeg || 0) * Math.PI / 180;
      g.object3D.position.set(0, 0, 0);
      this.refreshCamera(true);
    },
    // Where you are drawn: the corrected GPS position, pinned onto the nearest drawn walkway when
    // you are close to one.
    displayPos() {
      if (!this.myPos) return null;
      if (this.campusGraph.edges.length) {
        const snap = CampusRoute.snapToGraph(this.myPos, this.campusGraph.nodes, this.campusGraph.edges);
        if (snap && snap.dist <= SNAP_TO_PATH_M) { this._snapDist = snap.dist; return { lat: snap.lat, lng: snap.lng }; }
      }
      this._snapDist = null;
      return this.myPos;
    },
    // We place the camera ourselves instead of letting AR.js put it at raw GPS. A tick component
    // (see proceedToAr) glides it to _camTarget every frame, overriding AR.js's own writes.
    refreshCamera(jump) {
      const scene = this.$refs.arScene;
      const camEl = scene && scene.querySelector('[gps-new-camera]');
      const camComp = camEl && camEl.components && camEl.components['gps-new-camera'];
      const pos = this.displayPos();
      if (!camComp || !camComp.threeLoc || !pos || !this._projInstalled) return;
      // No accurate AR.js fix yet (common near buildings)? Our own position is good enough as origin.
      if (!camComp.threeLoc.initialPosition) {
        camComp.threeLoc.setWorldOrigin(pos.lng, pos.lat);
        // Buildings placed before an origin existed are stuck at 0,0 — place them now.
        Object.values(this.arEntities).forEach((entry) => {
          const comp = entry.wrapper.components['gps-new-entity-place'];
          if (comp) comp.update();
        });
        this._forceRebuildPaths = true;
        if (this.showAllPaths) setTimeout(() => this.renderAllPaths(), 0);
      }
      let x, z;
      try { [x, z] = camComp.latLonToWorld(pos.lat, pos.lng); } catch (e) { return; }
      const th = -(this._alignOffsetDeg || 0) * Math.PI / 180;
      const cos = Math.cos(th), sin = Math.sin(th);
      this._camTarget = { x: x * cos + z * sin, z: -x * sin + z * cos };
      if (jump || !this._camPos) this._camPos = { ...this._camTarget };
    },
    // Where the AR camera believes it is facing (compass degrees), or null when the phone is
    // pointed too far up/down for the heading to mean anything.
    cameraHeadingDeg(minHorizontal = 0.5) {
      const scene = this.$refs.arScene;
      if (!scene || !scene.camera) return null;
      const THREE = window.AFRAME.THREE;
      const dir = new THREE.Vector3();
      scene.camera.getWorldDirection(dir);
      if (dir.x * dir.x + dir.z * dir.z < minHorizontal * minHorizontal) return null;
      return (Math.atan2(dir.x, -dir.z) * 180 / Math.PI + 360) % 360;
    },
    // Automatic compass correction — no user input. The compass the AR scene is built on is
    // off by an amount that differs by phone, place and moment. A drawn walkway has a known
    // true bearing, though. When you walk a few meters along one with the phone held up, your
    // direction of travel IS that path's bearing, so (camera heading - path bearing) is the
    // compass error. Samples are medianed so glancing sideways doesn't skew it, and applied in
    // small steps so the world never snaps.
    autoAlignHeading() {
      const track = this._track;
      if (!track || track.length < 2 || !this.campusGraph.edges.length) return;
      const cur = track[track.length - 1];
      let ref = null;
      for (let i = track.length - 2; i >= 0; i--) {
        if (cur.t - track[i].t > ALIGN_MAX_WINDOW_MS) break;
        if (haversineMeters(track[i], cur) >= ALIGN_MIN_WALK_M) { ref = track[i]; break; }
      }
      if (!ref) return;
      this._track = [cur]; // each sample comes from fresh movement
      const course = bearingDeg(ref, cur);
      const mid = { lat: (ref.lat + cur.lat) / 2, lng: (ref.lng + cur.lng) / 2 };
      const snap = CampusRoute.snapToGraph(mid, this.campusGraph.nodes, this.campusGraph.edges);
      if (!snap || snap.dist > 25) return; // not on a drawn walkway: no trustworthy reference
      const fwd = bearingDeg(snap.nodeA, snap.nodeB), back = (fwd + 180) % 360;
      let pathBearing;
      if (Math.abs(relativeAngle(course, fwd)) <= 40) pathBearing = fwd;
      else if (Math.abs(relativeAngle(course, back)) <= 40) pathBearing = back;
      else return; // cut a corner / wandered: movement doesn't match the path
      const cam = this.cameraHeadingDeg();
      if (cam === null) return; // phone not held up
      const samples = this._headingSamples = (this._headingSamples || []).concat(relativeAngle(pathBearing, cam)).slice(-7);
      if (samples.length < ALIGN_SAMPLES_NEEDED) return;
      // Circular median: express everything relative to the first sample, take the median, add back.
      const base = samples[0];
      const rel = samples.map((v) => relativeAngle(base, v)).sort((a, b) => a - b);
      const med = rel[Math.floor(rel.length / 2)];
      const spread = rel.map((v) => Math.abs(v - med)).sort((a, b) => a - b)[Math.floor(rel.length / 2)];
      if (spread > ALIGN_MAX_SPREAD_DEG) return; // user looking around: samples disagree
      const target = base + med;
      const current = this._alignOffsetDeg || 0;
      const err = relativeAngle(current, target);
      if (this.headingLocked && Math.abs(err) < ALIGN_DEADBAND_DEG) return;
      const next = this.headingLocked ? current + err * ALIGN_STEP : target;
      this._alignOffsetDeg = ((next + 540) % 360) - 180;
      this.headingLocked = true;
      this.applyWorldTransform();
    },
    // Camera position in the world group's own frame (what route/ribbon points are expressed in).
    camLocal() {
      const scene = this.$refs.arScene;
      const camEl = scene && scene.querySelector('[gps-new-camera]');
      if (!camEl || !camEl.object3D) return null;
      const c = camEl.object3D.position;
      const th = -(this._alignOffsetDeg || 0) * Math.PI / 180;
      const cos = Math.cos(th), sin = Math.sin(th);
      return { x: c.x * cos - c.z * sin, y: c.y, z: c.x * sin + c.z * cos };
    },
    forceArSize() {
      const scene = this.$refs.arScene;
      if (!scene || !scene.renderer) return;
      const vv = window.visualViewport;
      const w = vv ? vv.width : window.innerWidth;
      const h = vv ? vv.height : window.innerHeight;
      scene.renderer.setSize(w, h, true);
      if (scene.camera) {
        const fov = this.matchedFov(w, h);
        if (scene.camera.aspect !== w / h || (fov && Math.abs(scene.camera.fov - fov) > 0.05)) {
          scene.camera.aspect = w / h;
          if (fov) scene.camera.fov = fov;
          scene.camera.updateProjectionMatrix();
        }
      }
    },
    // Vertical field of view of what is actually on screen: the camera video is shown with
    // object-fit: cover, so part of it is cropped off. Returns null until the video is ready.
    matchedFov(sw, sh) {
      const video = document.querySelector('#arjs-video');
      if (!video || !video.videoWidth || !video.videoHeight) return null;
      const vw = video.videoWidth, vh = video.videoHeight;
      const t = Math.tan(CAMERA_LONG_FOV_DEG * Math.PI / 360);
      // tan(half-angle) of the video's own vertical extent; the long side gets CAMERA_LONG_FOV_DEG.
      const tanV = vh >= vw ? t : t * vh / vw;
      const scale = Math.max(sw / vw, sh / vh);   // cover
      const visible = sh / (vh * scale);           // fraction of the video's height left on screen
      return 2 * Math.atan(tanV * visible) * 180 / Math.PI;
    },
    // A-Frame's cursor="rayOrigin: mouse" component (used on the <a-camera>
    // tag) is built for actual mouse/gaze input — on mobile it depends on
    // the browser translating a touch into a synthetic mouse event on the
    // canvas, which AR.js's own touch handling frequently swallows before
    // it gets there. Doing the raycast ourselves, directly off the real
    // touchend/click event, sidesteps that unreliable translation entirely.
    setupTapSelection(scene) {
      if (this._tapSelectionBound) return;
      const canvas = scene.canvas;
      if (!canvas) { setTimeout(() => this.setupTapSelection(scene), 200); return; }
      this._tapSelectionBound = true;

      const THREE = window.AFRAME.THREE;
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();

      const handleTap = (clientX, clientY) => {
        const rect = canvas.getBoundingClientRect();
        pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
        if (!scene.camera) return;
        raycaster.setFromCamera(pointer, scene.camera);

        const meshToBuilding = new Map();
        const meshes = [];
        this.buildings.forEach((b) => {
          const entry = this.arEntities[b.id];
          if (!entry) return;
          const roots = [entry.label, entry.arrow].filter(Boolean);
          roots.forEach((root) => {
            root.object3D.traverse((node) => {
              if (node.isMesh) { meshes.push(node); meshToBuilding.set(node, b); }
            });
          });
        });

        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length) {
          const building = meshToBuilding.get(hits[0].object);
          if (building) {
            this.selectBuilding(building);
            this.openChat(building);
          }
        }
      };

      canvas.addEventListener('click', (e) => handleTap(e.clientX, e.clientY));
      // touchend fires even where the browser doesn't bother synthesizing a
      // click on canvas elements — the actual reliable path on mobile.
      canvas.addEventListener('touchend', (e) => {
        const t = e.changedTouches && e.changedTouches[0];
        if (t) handleTap(t.clientX, t.clientY);
      });
    },
    buildAllEntities() {
      const scene = this.$refs.arScene;
      if (!scene || !this.buildings.length) return;

      // gps-new-entity-place computes its 3D position exactly ONCE, the
      // instant the entity is created — using whatever origin (or lack of
      // one) exists at that exact moment. If that happens before AR.js's
      // own GPS watch has received its first accurate fix (extremely likely
      // — entities get built as soon as the scene loads, origin arrives
      // whenever GPS catches up), every entity is permanently stuck at
      // (0,0,0), right on top of the camera, and NEVER recomputed again —
      // AR.js fires "gps-camera-update-position" on every later fix, but
      // gps-new-entity-place only uses that event to update its `distance`
      // property, not to reposition itself. Forcing update() ourselves on
      // every fix is what actually re-anchors it once the origin is ready.
      const camEl = scene.querySelector('[gps-new-camera]');
      if (camEl && !camEl.__lamparaRepositionBound) {
        camEl.__lamparaRepositionBound = true;
        camEl.addEventListener('gps-camera-update-position', () => {
          Object.values(this.arEntities).forEach((entry) => {
            const comp = entry.wrapper.components['gps-new-entity-place'];
            if (comp) comp.update();
          });
          // Camera just moved in the scene — the ribbon starts at its feet.
          this.updateRoute(true);
          if (this.showAllPaths) this.renderAllPaths();
        });
      }

      this.buildings.forEach(b => {
        const wrapper = document.createElement('a-entity');
        wrapper.setAttribute('gps-new-entity-place', `latitude: ${b.lat}; longitude: ${b.lng};`);

        const { group: label, layers: labelLayers } = createLabelGroup(b.name);
        label.setAttribute('scale', '1 1 1');
        // Sits above the arrow (which points down at the building from
        // below it) — like a map-pin balloon with its pointer tip below.
        label.setAttribute('position', '0 2.1 0');
        wrapper.appendChild(label);

        // Tap-to-select: the camera's cursor+raycaster (see the <a-camera>
        // tag) raycasts from wherever you tap and fires 'click' on whatever
        // .ar-clickable mesh it hits — bubbles up to this wrapper via normal
        // DOM event bubbling (A-Frame entities are real DOM elements).
        // Lets you tap ANY visible building (not just your current search
        // target) to pull up its info directly, not just the searched one.
        wrapper.addEventListener('click', () => {
          this.selectBuilding(b);
          this.openChat(b);
        });

        (this._worldGroup || scene).appendChild(wrapper);
        this.arEntities[b.id] = { wrapper, label, labelLayers, arrow: null };
        setLabelColor(this.arEntities[b.id], '#ffffff', 0.55);
      });
    },
    setTarget(building) {
      if (this.target && this.arEntities[this.target.id]) {
        const prev = this.arEntities[this.target.id];
        setLabelValue(prev, this.target.name);
        setLabelColor(prev, '#ffffff', 0.55);
        if (prev.arrow) { prev.wrapper.removeChild(prev.arrow); prev.arrow = null; }
      }
      this.target = building ? { ...building } : null;
      if (this.target && this.showAllPaths) {
        this.showAllPaths = false;
        this.removeAllPathsRibbons();
      }
      if (!this.target) { this.clearRoute(); return; }

      const entry = this.arEntities[this.target.id];
      this.updateTargetDistance();
      this.updateRoute(true);
      if (!entry) return;

      setLabelColor(entry, '#10b981', 1);

      // A genuine 3D arrow (cylinder shaft + cone head), not a flat
      // billboard — has real depth/volume so it reads as an actual arrow
      // from any viewing angle, the way a real navigation arrow would.
      // Low segment count (6) gives it a deliberate faceted/low-poly look
      // (matches modern AR wayfinding UI conventions, and is lighter on
      // mobile GPUs than a smooth-shaded high-poly mesh) instead of looking
      // like a generic default-settings primitive.
      // Sits below the label now (map-pin layout: name balloon on top,
      // pointer tip below it aiming down at the building). Its own rotation
      // stays free for the continuous Y-spin below — the downward-pointing
      // flip is baked into the head's own LOCAL rotation instead (see head,
      // further down), so the two animations don't fight each other.
      const arrow = document.createElement('a-entity');
      arrow.setAttribute('position', '0 0.4 0');
      // Slower + a gentler ease (was 650ms, snappy enough to feel like a
      // twitch) reads as a soft, floaty bob instead of a rigid back-and-forth.
      // No bobbing: a marker moving up and down reads as an unstable position.
      arrow.setAttribute('animation__spin', 'property: rotation; dur: 4000; easing: linear; loop: true; to: 0 360 0');

      const shaft = document.createElement('a-cylinder');
      shaft.setAttribute('radius', '0.08');
      shaft.setAttribute('height', '0.55');
      shaft.setAttribute('radius-segments', '6');
      // Now on top, connecting up toward the label above it.
      shaft.setAttribute('position', '0 0.32 0');
      // Emissive glow ties it into the same "lamp-glow" green look used
      // everywhere else in the app (the CTA buttons, the gate screen icon)
      // instead of a flat, lifeless material.
      shaft.setAttribute('material', 'color: #0d9668; emissive: #0d9668; emissiveIntensity: 0.35; shader: standard; metalness: 0.1; roughness: 0.4');
      shaft.classList.add('ar-clickable');
      arrow.appendChild(shaft);

      const head = document.createElement('a-cone');
      head.setAttribute('radius-bottom', '0.26');
      head.setAttribute('radius-top', '0');
      head.setAttribute('height', '0.55');
      head.setAttribute('segments-radial', '6');
      // Cone points up by default (radius-top: 0 = apex at top) — flipped
      // via its own LOCAL rotation (not the parent's) so it points down at
      // the building, without fighting the parent's Y-spin animation.
      head.setAttribute('rotation', '180 0 0');
      head.setAttribute('position', '0 -0.22 0');
      head.setAttribute('material', 'color: #10b981; emissive: #10b981; emissiveIntensity: 0.5; shader: standard; metalness: 0.1; roughness: 0.3');
      head.classList.add('ar-clickable');
      arrow.appendChild(head);

      entry.wrapper.appendChild(arrow);
      entry.arrow = arrow;
      this.applyTargetScale();
    },
    // gps-new-entity-place positions entities in real-world METERS, so a
    // fixed native size reads as either invisible (too far) or gigantic
    // (too close). Size both proportionally to distance instead — tuned
    // down hard from an earlier pass that used a 30x/15x floor, which was
    // still enormous at anything under ~25m (a label filling most of the
    // screen, a cone towering over the actual target at 21m away).
    applyTargetScale() {
      if (!this.target) return;
      const entry = this.arEntities[this.target.id];
      if (!entry) return;
      const d = this.target.distance || 10;
      // Size grows in step with distance so the marker looks the same size at any range, and
      // between FAR_BOOST_FROM and FAR_BOOST_TO meters it is boosted up to FAR_BOOST_MAX times
      // more, so at 300 m it is still clearly readable instead of a speck. Past 300 m the
      // boost stays at its maximum.
      const boost = 1 + (FAR_BOOST_MAX - 1) * Math.max(0, Math.min(1, (d - FAR_BOOST_FROM) / (FAR_BOOST_TO - FAR_BOOST_FROM)));
      const labelScale = Math.max(5, Math.round(d * 0.05 * boost * 10) / 10);
      entry.label.setAttribute('scale', `${labelScale} ${labelScale} ${labelScale}`);
      if (entry.arrow) {
        const arrowScale = Math.max(1.2, Math.round(d * 0.1 * boost * 10) / 10);
        entry.arrow.setAttribute('scale', `${arrowScale} ${arrowScale} ${arrowScale}`);
      }
    },
    updateTargetDistance() {
      if (!this.target || !this.myPos) return;
      this.target = { ...this.target, distance: Math.round(haversineMeters(this.myPos, this.target)) };
      this.applyTargetScale();
      this.updateRoute();
    },
    // Routes from where you're standing to the target building's entrance along
    // the drawn walkways, then draws the ground ribbon + fills the turn banner.
    // Throttled (GPS fixes can arrive faster than the geometry is worth rebuilding).
    updateRoute(force) {
      const now = Date.now();
      if (!force && now - (this._lastRouteAt || 0) < 800) return;
      this._lastRouteAt = now;

      if (!this.target || !this.myPos || !this.target.entrance_node_id || !this.campusGraph.edges.length) {
        this.clearRoute();
        return;
      }
      const route = CampusRoute.findRoute(this.campusGraph, this.myPos, this.target.entrance_node_id);
      if (!route) { this.clearRoute(); return; }

      if (route.snapDist > OFF_PATH_METERS) {
        this.removeRibbon();
        this.routeInfo = { status: 'off-path', remaining: Math.round(route.snapDist) };
        return;
      }
      if (route.length <= ARRIVED_METERS) {
        this.removeRibbon();
        this.routeInfo = { status: 'arrived' };
        return;
      }

      const turn = CampusRoute.nextTurn(route.points);
      this.routeInfo = {
        status: 'ok',
        dir: turn.dir,
        turnDistance: Math.round(turn.distance),
        remaining: Math.round(route.length + route.snapDist)
      };
      this._routePts = route.points;
      this.renderRibbon(route);
    },
    startMiniMap() {
      if (this._miniMapTimer) return;
      this._miniMapZoom = 0;
      this._miniMapTimer = setInterval(() => this.drawMiniMap(), 200);
    },
    toggleMiniMapZoom() {
      this._miniMapZoom = (this._miniMapZoom + 1) % MINIMAP_RADII_M.length;
      this.drawMiniMap();
    },
    // North-up map centred on where the AR scene thinks you are. Same data the AR uses:
    // drawn walkways (white), the current route (green), the campus anchor O (yellow ring),
    // buildings (blue squares), you (blue dot) and the direction you face (arrow).
    drawMiniMap() {
      const cv = this.$refs.miniMap;
      if (!cv || !cv.offsetWidth) return;
      const dpr = window.devicePixelRatio || 1, S = cv.offsetWidth;
      if (cv.width !== Math.round(S * dpr)) { cv.width = Math.round(S * dpr); cv.height = Math.round(S * dpr); }
      const ctx = cv.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(S / 2, S / 2, S / 2 - 1, 0, Math.PI * 2); ctx.clip();

      const me = this.displayPos ? this.displayPos() : this.myPos;
      const radius = MINIMAP_RADII_M[this._miniMapZoom || 0];
      if (me) {
        const k = (S / 2) / radius;
        const kx = PROJ_M_PER_DEG * Math.cos(me.lat * Math.PI / 180);
        const P = (p) => ({ x: S / 2 + (p.lng - me.lng) * kx * k, y: S / 2 - (p.lat - me.lat) * PROJ_M_PER_DEG * k });
        const byId = new Map(this.campusGraph.nodes.map((n) => [String(n.id), n]));
        ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 2;
        this.campusGraph.edges.forEach((e) => {
          const a = byId.get(String(e.node_a_id)), b = byId.get(String(e.node_b_id));
          if (!a || !b) return;
          const A = P(a), B = P(b);
          ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
        });
        if (this.target && this._routePts && this._routePts.length > 1) {
          ctx.strokeStyle = '#10b981'; ctx.lineWidth = 4;
          ctx.beginPath();
          this._routePts.forEach((p, i) => { const Q = P(p); if (i) ctx.lineTo(Q.x, Q.y); else ctx.moveTo(Q.x, Q.y); });
          ctx.stroke();
        }
        ctx.fillStyle = '#60a5fa';
        this.buildings.forEach((b) => { const Q = P(b); ctx.fillRect(Q.x - 3, Q.y - 3, 6, 6); });
        const anchorNode = this.campusAnchor && byId.get(String(this.campusAnchor.campus_node_id));
        if (anchorNode) {
          const Q = P(anchorNode);
          ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(Q.x, Q.y, 5, 0, Math.PI * 2); ctx.stroke();
        }
        // You + the direction you face in the real world (AR camera heading minus the correction).
        const cam = this.cameraHeadingDeg(0.05);
        if (cam !== null) {
          const h = (cam - (this._alignOffsetDeg || 0)) * Math.PI / 180;
          ctx.fillStyle = 'rgba(96,165,250,0.35)';
          ctx.beginPath(); ctx.moveTo(S / 2, S / 2);
          ctx.arc(S / 2, S / 2, S * 0.3, h - Math.PI / 2 - 0.45, h - Math.PI / 2 + 0.45); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(S / 2, S / 2, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('N', S / 2, 11);
      ctx.font = '9px sans-serif'; ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(radius + ' m', S / 2, S - 5);
    },
    clearRoute() {
      this._routePts = null;
      this.removeRibbon();
      this.routeInfo = null;
    },
    removeRibbon() {
      if (this._ribbon) this._ribbon.remove();
    },
    // Shows the WHOLE walkway graph in AR right after a successful anchor
    // scan — every edge, not just a route to a destination — since no
    // destination is known yet at that point. Disappears the moment a
    // building is picked (see setTarget), replaced by the normal single
    // route. Built once (edges don't move); retried on each GPS fix only
    // until AR.js's origin is established, same pattern as renderRibbon.
    // Heading correction is applied by rotating the whole world group around the camera
    // (applyWorldTransform), so points are handed through unrotated here — buildings, the
    // all-paths network and the route ribbon all turn together.
    rotateAroundCamera(x, z) {
      return { x, z };
    },
    renderAllPaths() {
      if (!this._allPathRibbons) this._allPathRibbons = [];
      const scene = this.$refs.arScene;
      const camEl = scene && scene.querySelector('[gps-new-camera]');
      const camComp = camEl && camEl.components && camEl.components['gps-new-camera'];
      if (!camComp || !camEl.object3D) return;
      const camPos = this.camLocal();
      if (!camPos) return;
      if (this._allPathRibbons.length && !this._forceRebuildPaths) {
        // Already built — just keep tracking the camera's real height,
        // since gps-new-camera's Y can still settle/shift after the
        // first fix.
        const y = ribbonEntityY(camPos.y);
        this._allPathRibbons.forEach((r) => r.setGroundY(y));
        return;
      }
      this.removeAllPathsRibbons();
      this._forceRebuildPaths = false;
      if (!this.campusGraph.edges.length) return;

      const nodeById = new Map(this.campusGraph.nodes.map((n) => [String(n.id), n]));
      this.campusGraph.edges.forEach((edge) => {
        const a = nodeById.get(String(edge.node_a_id));
        const b = nodeById.get(String(edge.node_b_id));
        if (!a || !b) return;
        try {
          let [ax, az] = camComp.latLonToWorld(a.lat, a.lng);
          let [bx, bz] = camComp.latLonToWorld(b.lat, b.lng);
          ({ x: ax, z: az } = this.rotateAroundCamera(ax, az, camPos.x, camPos.z));
          ({ x: bx, z: bz } = this.rotateAroundCamera(bx, bz, camPos.x, camPos.z));
          const ribbon = ArRibbon.create(this._worldGroup || scene);
          // Solid, not fading — this is the whole network, not a route
          // leading somewhere specific yet.
          ribbon.update([{ x: ax, y: az }, { x: bx, y: bz }], { fadeEnd: false });
          // See renderRibbon's comment: gps-new-camera never sets altitude.
          ribbon.setGroundY(ribbonEntityY(camPos.y));
          this._allPathRibbons.push(ribbon);
        } catch (e) { /* no origin yet — retried on the next GPS fix */ }
      });
    },
    removeAllPathsRibbons() {
      if (this._allPathRibbons) this._allPathRibbons.forEach((r) => r.remove());
      this._allPathRibbons = [];
    },
    renderRibbon(route) {
      const scene = this.$refs.arScene;
      const camEl = scene && scene.querySelector('[gps-new-camera]');
      const camComp = camEl && camEl.components && camEl.components['gps-new-camera'];
      if (!camComp || !camEl.object3D) return;
      const camPos0 = this.camLocal();
      if (!camPos0) return;

      // GPS -> scene coordinates (x east, z south). Throws until AR.js has
      // established its origin from the first accurate fix — just retry next fix.
      let world;
      try {
        world = route.points.map((p) => {
          let [x, z] = camComp.latLonToWorld(p.lat, p.lng);
          ({ x, z } = this.rotateAroundCamera(x, z, camPos0.x, camPos0.z));
          return { x, y: z };
        });
      } catch (e) { return; }

      // The route ends at the building's entrance point, but the arrow and name you see in AR
      // hang at the building's own location. Carry the ribbon on to that marker so the path
      // visibly connects to it instead of stopping short.
      const t = this.target;
      if (t && typeof t.lat === 'number' && typeof t.lng === 'number') {
        try {
          let [ax, az] = camComp.latLonToWorld(t.lat, t.lng);
          ({ x: ax, z: az } = this.rotateAroundCamera(ax, az, camPos0.x, camPos0.z));
          const last = world[world.length - 1];
          const gap = last ? Math.hypot(ax - last.x, az - last.y) : Infinity;
          if (gap > 1.5 && gap <= MARKER_EXTEND_MAX_M) world.push({ x: ax, y: az });
        } catch (e) { /* no origin yet: the ribbon still draws to the entrance */ }
      }

      // Starts at the camera's own scene position (your feet), so the ribbon is
      // attached to you even when GPS says the walkway is a few meters away.
      const cam = this.camLocal();
      let pts = [{ x: cam.x, y: cam.z }, ...world];
      pts = CampusRoute.smooth(pts);
      let length = 0;
      for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      const reachesMarker = length <= RIBBON_VISIBLE_METERS;
      pts = CampusRoute.truncate(pts, RIBBON_VISIBLE_METERS);
      if (pts.length < 2) return;

      if (!this._ribbon) this._ribbon = ArRibbon.create(this._worldGroup || scene);
      // Solid right up to the marker; only a route too long to show in full fades out at its far end.
      this._ribbon.update(pts, { fadeEnd: !reachesMarker });
      // gps-new-camera never sets altitude — cam.y isn't the assumed 1.6 the
      // ribbon's baked-in height expects, so track wherever it actually is.
      this._ribbon.setGroundY(ribbonEntityY(cam.y));
    },
    selectBuilding(building) { this.setTarget(building); },
    // Shared by start() and by toggleLocation() re-enabling.
    startLocationWatch() {
      this.gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const acc = pos.coords.accuracy;
          if (acc == null || acc <= GPS_MAX_ACCURACY_M) this._lastRaw = { lat: pos.coords.latitude, lng: pos.coords.longitude, t: Date.now() };
          this.ensureAnchorShift();
          const corr = this._gpsCorr || { lat: 0, lng: 0 };
          const fix = { lat: pos.coords.latitude - corr.lat, lng: pos.coords.longitude - corr.lng };
          // A fix GPS itself isn't confident in is worse than no update at
          // all — keep the last good (or scanned) position instead of
          // snapping to it.
          if (acc != null && acc > GPS_MAX_ACCURACY_M && this.myPos) return;
          if (!this.myPos) {
            this.myPos = fix;
          } else if (this._stepsActive) {
            // Steps move you; GPS only pulls you back when it disagrees by more than its own
            // noise, so standing still never drifts.
            const off = haversineMeters(this.myPos, fix);
            if (off > Math.max(GPS_TRUST_MIN_M, acc || 0)) {
              this.myPos = {
                lat: this.myPos.lat + (fix.lat - this.myPos.lat) * GPS_PULL,
                lng: this.myPos.lng + (fix.lng - this.myPos.lng) * GPS_PULL,
              };
            }
          } else {
            // Ease toward the new fix instead of jumping straight to it, so
            // normal jitter between consecutive noisy fixes doesn't visibly
            // teleport the ribbon/arrow. If the scanned anchor seeded myPos,
            // this is also what keeps that correction from being wiped out
            // the instant the next raw fix arrives.
            this.myPos = {
              lat: this.myPos.lat + (fix.lat - this.myPos.lat) * GPS_SMOOTH_ALPHA,
              lng: this.myPos.lng + (fix.lng - this.myPos.lng) * GPS_SMOOTH_ALPHA,
            };
          }
          this.statusOk = true;
          if (!this._stepsActive) this.afterMove();
          else { this.refreshCamera(false); this.updateTargetDistance(); }
        },
        (err) => { this.statusText = 'GPS error: ' + err.message; },
        { enableHighAccuracy: true }
      );
    },
    // Shared tail of every position change (a step, or a GPS fix when there is no step counter).
    afterMove() {
      const track = this._track = this._track || [];
      track.push({ lat: this.myPos.lat, lng: this.myPos.lng, t: Date.now() });
      if (track.length > 60) track.shift();
      this.autoAlignHeading();
      this.refreshCamera(false);
      this.updateTargetDistance();
    },
    startSteps() {
      if (this._steps || typeof IndoorNav === 'undefined') return;
      this._steps = new IndoorNav.StepDetector(() => this.onStep());
      // Switch to step-based movement once the phone actually delivers motion readings.
      this._motionProbe = (e) => {
        const a = e.accelerationIncludingGravity;
        if (a && a.x !== null) { this._stepsActive = true; window.removeEventListener('devicemotion', this._motionProbe); }
      };
      window.addEventListener('devicemotion', this._motionProbe);
      this._steps.start();
    },
    onStep() {
      if (!this.myPos) return;
      const cam = this.cameraHeadingDeg(0.05);
      if (cam !== null) this._walkHeading = cam - (this._alignOffsetDeg || 0);
      if (this._walkHeading == null) return;
      const h = this._walkHeading * Math.PI / 180;
      const kx = PROJ_M_PER_DEG * Math.cos(this.myPos.lat * Math.PI / 180);
      let next = {
        lat: this.myPos.lat + STEP_LENGTH_M * Math.cos(h) / PROJ_M_PER_DEG,
        lng: this.myPos.lng + STEP_LENGTH_M * Math.sin(h) / kx,
      };
      if (this.campusGraph.edges.length) {
        const snap = CampusRoute.snapToGraph(next, this.campusGraph.nodes, this.campusGraph.edges);
        if (snap && snap.dist <= STEP_SNAP_M) next = { lat: snap.lat, lng: snap.lng };
      }
      this.myPos = next;
      this.stepCount = (this.stepCount || 0) + 1;
      this.afterMove();
    },
    // Independent compass watch (same technique as guide.php's own) purely
    // for the "turn left/right" off-screen indicator — deliberately NOT
    // wired into AR.js's own internal compass, which keeps driving the 3D
    // scene exactly as before, unaffected by this.
    startCompassWatch() {
      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().catch(() => {});
      }
      const primaryEvent = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
      window.addEventListener(primaryEvent, this.onCompassOrientation, true);
      // Same fallback as guide.php: some Android OEM browsers claim to
      // support the "absolute" event but never actually dispatch it.
      setTimeout(() => {
        if (!this.compassReady && primaryEvent === 'deviceorientationabsolute') {
          window.removeEventListener('deviceorientationabsolute', this.onCompassOrientation, true);
          window.addEventListener('deviceorientation', this.onCompassOrientation, true);
        }
      }, 2500);
    },
    onCompassOrientation(e) {
      const raw = e.webkitCompassHeading != null ? e.webkitCompassHeading : (360 - e.alpha) % 360;
      if (!this.compassReady) {
        this.compassHeading = raw;
        this.compassReady = true;
      } else {
        const delta = relativeAngle(this.compassHeading, raw);
        this.compassHeading = (this.compassHeading + delta * 0.15 + 360) % 360;
      }
    },
    // Visual-only — see the overlay markup for why this can't fully stop
    // AR.js's own internal camera stream the way guide.php's toggle does.
    toggleCamera() {
      this.cameraOn = !this.cameraOn;
    },
    // Manually twists everything GPS-placed (buildings, ribbons) to
    // counteract compass drift — tap until it visually lines up with the
    // real street. Simpler and more reliable than deriving a correction
    // from the same sensor that's drifting in the first place.
    rotateWorld(deg) {
      this._alignOffsetDeg = (this._alignOffsetDeg || 0) + deg;
      this.applyWorldTransform();
    },
    // Pauses only OUR OWN distance-tracking GPS watch (used for the 2D
    // card). AR.js's own internal gps-new-camera tracking for the 3D
    // entities keeps running regardless — disclosed in the UI, not silently
    // pretended to be a full location toggle.
    toggleLocation() {
      if (this.locationOn) {
        if (this.gpsWatchId !== null) navigator.geolocation.clearWatch(this.gpsWatchId);
        this.gpsWatchId = null;
        this.locationOn = false;
      } else {
        this.locationOn = true;
        this.startLocationWatch();
      }
    },
    runArDebug() {
      if (typeof window.__arDebug === 'function') {
        window.__arDebug();
      } else {
        alert('AR debug isn\'t set up yet — try tapping again in a moment, or make sure you tapped through the start screen first.');
      }
    },
    openChat(building) {
      const isSameBuilding = this.chatOpenFor && this.chatOpenFor.id === building.id;
      this.chatOpenFor = building;
      if (!isSameBuilding || this.chatMessages.length === 0) {
        this.chatMessages = [{ role: 'assistant', text: `Ask me anything about ${building.name} — I'll only answer from what's registered.` }];
      }
    },
    async sendChat() {
      if (!this.chatInput.trim() || this.chatLoading) return;
      const userText = this.chatInput;
      const history = this.chatMessages.map(m => ({ role: m.role, text: m.text }));
      this.chatMessages.push({ role: 'user', text: userText });
      this.chatInput = '';
      this.chatLoading = true;
      try {
        const res = await fetch('../../../Backend/api/chat.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ building_id: this.chatOpenFor.id, message: userText, history })
        });
        const data = await res.json();
        this.chatMessages.push({ role: 'assistant', text: data.reply || "I don't have that information." });
      } catch (e) {
        this.chatMessages.push({ role: 'assistant', text: "Couldn't reach the server — try again once you're back online." });
      } finally {
        this.chatLoading = false;
      }
    },
    formatMessage(text) {
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const bolded = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return bolded.split(/\n\s*\n/).map(block => {
        const lines = block.split('\n').filter(l => l.trim() !== '');
        if (lines.length === 0) return '';
        const isList = lines.every(l => /^[-*]\s+/.test(l.trim()));
        if (isList) {
          const items = lines.map(l => '<li>' + l.trim().replace(/^[-*]\s+/, '') + '</li>').join('');
          return '<ul class="list-disc pl-4 space-y-0.5 my-1">' + items + '</ul>';
        }
        return '<p class="mb-1.5 last:mb-0">' + lines.join('<br>') + '</p>';
      }).join('');
    }
  }
}).mount('#app');
