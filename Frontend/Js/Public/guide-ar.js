const { createApp } = Vue;

// Shown on the start screen and in AR debug, so you can tell at a glance whether the phone is
// running this version or an old cached copy. Change it with each AR fix.
const AR_BUILD = 'AR build: v29 (clear navigation + switch destination)';

// How far below the phone the ground is, in meters (phone held up in front of you while
// walking ~1.4; default set a little lower, 1.6, so it never looks like it floats). The path is laid exactly this far below the camera. If it looks like it
// floats or sinks, tune it without editing code: add ?h=1.3 (or 1.5 ...) to the page URL.
const EYE_HEIGHT_M = (() => {
  try { const v = parseFloat(new URLSearchParams(location.search).get('h')); if (v > 0.5 && v < 2.5) return v; } catch (e) { /* default */ }
  return 1.6;
})();

// Top-down mini-map (north up) — lets you check, anywhere, that the drawn paths and your
// position/heading are what the AR scene is using. Tap it to zoom out/in.
const MINIMAP_RADII_M = [40, 120, 300];
const OSM_TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';   // the mini-map's base: OpenStreetMap
const OSM_MIN_ZOOM = 14, OSM_MAX_ZOOM = 19;
const OSM_CACHE_MAX = 150;        // tiles kept in memory
const MINIMAP_EASE = 0.6;        // fraction of the gap the drawn dot closes each redraw (smooth gliding)

// The 3D camera must see the same slice of the world as the phone camera, or the paths slide
// against the video when you turn. This is the phone camera's view across its LONG side, in
// degrees — ~65-70 on most phones. Tune per phone without editing code by adding ?fov=NN to the page URL.
const CAMERA_LONG_FOV_DEG = (() => {
  try { const v = parseFloat(new URLSearchParams(location.search).get('fov')); if (v > 20 && v < 120) return v; } catch (e) { /* default */ }
  return 67;
})();

const ARRIVED_METERS = 8;
const OFF_PATH_METERS = 60;        // farther from any walkway than this: the banner says to head to the nearest one
const ROUTE_MAX_M = 1500;
// Leaving the campus and coming back: you count as OUTSIDE once you are more than OUTSIDE_M beyond the campus edge, and as
// inside again within OUTSIDE_BACK_M of it (the gap stops it flipping back and forth right at the fence).
// Which buildings are outside the gates, which point is the main way in and which gate is a vehicle gate: see CampusRoute
// (Js/Public/campus-route.js), shared with the Campus Paths admin page.
// ---- text directions ("Turn left in 23 m") ----
const NAV_REACH_M = 3;             // a turn / gate counts as reached when you are this close to it (the route is also rebuilt from where you stand every second or two, which drops a corner you have passed)
const NAV_TURN_NEAR_M = 30;        // from this close the instruction becomes "Turn left in N m"; farther it is "Continue straight for N m"
const NAV_TURN_MIN_DEG = 30;       // a change of direction at least this big is a turn
const NAV_WALK_M_PER_MIN = 78;     // walking pace for the time estimate (about 1.3 m/s)
const NAV_FACING_DEG = 70;         // facing more than this away from the path: tell the user to turn
// The words and the arrow for a turn. angle > 0 = to the right.
function turnWord(angle) {
  const a = Math.abs(angle), side = angle < 0 ? 'left' : 'right';
  if (a >= 165) return { word: 'Turn around', icon: 'uturn' };
  if (a >= 120) return { word: 'Make a sharp ' + side, icon: 'sharp-' + side };
  if (a >= 60) return { word: 'Turn ' + side, icon: side };
  return { word: 'Bear ' + side, icon: 'slight-' + side };
}
const NAV_ICON_DEG = { straight: 0, 'slight-left': -45, left: -90, 'sharp-left': -135, uturn: 180, 'slight-right': 45, right: 90, 'sharp-right': 135 };

const OUTSIDE_SNAP_M = 40;         // you are "on the outside walkways" when the nearest walkway is an outside one within this
const OUTSIDE_M = 25;
const OUTSIDE_BACK_M = 5;
// Choosing which gate to come back through: the walk to the gate is outside the drawn walkways (no street data), so it is
// the straight distance times this to allow for turns and crossings.
const OUTSIDE_DETOUR = 1.3;
// A vehicle gate is for vehicles; on foot it is only chosen when it clearly saves this much over the main gate.
const VEHICLE_GATE_PENALTY_M = 40;          // a building farther away than this (you are not on campus) gets no path
const PROJ_M_PER_DEG = 111320;
const DEFAULT_CAMPUS_LAT = 14.3283;
const DEFAULT_CAMPUS_LNG = 120.9408;
// The building's own pin is usually mid-building, tens of meters past the door. The ribbon
// stops at the entrance; it is only carried on to the marker when that is this close.
const MARKER_EXTEND_MAX_M = 12;
// Scanning the anchor QR (inside the AR view, so the camera's own heading is known at that
// exact moment): any successful read counts; heading samples are taken for up to ANCHOR_MAX_WAIT_MS.
const ANCHOR_HFOV_DEG = 55;       // typical portrait back-camera horizontal field of view
const ANCHOR_HITS_NEEDED = 2;
const ANCHOR_MAX_WAIT_MS = 1200;  // after the first read, finish within this even with fewer heading samples
// Students walk on the walkways, so your position is pinned onto the nearest drawn path when
// it is this close (removes GPS's sideways error, the "path runs beside the road" effect).
const SNAP_TO_PATH_M = 15;

// ---- campus edge: the convex hull of everything drawn (building outlines, walkway points, building pins), in metres
function hullXY(pts) {
  const p = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [], upper = [];
  p.forEach((q) => { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); });
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
// How far a point is OUTSIDE a convex polygon (0 when inside).
function outsideDistXY(pt, poly) {
  let inside = true, best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if ((b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x) < 0) inside = false;     // hull is counter-clockwise
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
    const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / l2));
    best = Math.min(best, Math.hypot(pt.x - (a.x + t * dx), pt.y - (a.y + t * dy)));
  }
  return inside ? 0 : best;
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


window.LamparaGuide = createApp({
  data() {
    return {
      arBuild: AR_BUILD,
      // game touches on the start screen: the player strip, a talking mascot, and a star on buildings you have already reached
      hudStrip: window.LamparaGameHud ? LamparaGameHud.strip({ local: true }) : '',
      hudBuddy: window.LamparaGameHud ? LamparaGameHud.buddy('Pick a building and your quest begins!|Tap a building, then press Start.|Every arrival earns points.') : '',
      sceneHtml: window.LamparaPixelScene ? LamparaPixelScene.html({ walker: false, moon: false, stars: 40, seed: 11 }) : '',
      pinIcon: window.LamparaMascots ? LamparaMascots.icon('pin', 44) : '',
      gateTip: 0,
      gateTips: ['Hold your phone upright.', 'Open sky gives the best location.', 'Stay still for a moment while I find you.', 'Almost there. Every arrival earns points!'],
      hasMusic: !!window.LamparaAudio,
      musicOn: window.LamparaAudio ? LamparaAudio.enabled() : false,
      stampIcon: window.LamparaMascots ? LamparaMascots.icon('star', 18) : '',
      started: false,
      checking: true,
      quickStart: false,
      statusText: '',
      statusOk: false,
      headingInit: false, // set true once the compass is delivering a heading
      // Independent compass reading (same technique guide.php uses), for
      // the "turn left/right" off-screen indicator only — not connected to
      // AR.js's own internal compass driving the 3D scene.
      compassHeading: 0,
      compassReady: false,
      // Partial toggles, disclosed as such in the UI copy — see the overlay
      // markup for why these can't be full stop/start like guide.php's.
      cameraOn: true,
      locationOn: true,
      buildings: [],
      // Outdoor walkway graph (Campus Paths admin page) — the ground ribbon
      // routes over this. Empty graph = no ribbon, the arrow marker still works.
      campusGraph: { nodes: [], edges: [] },
      // Banner state for the route: null | { status: 'ok'|'arrived'|'off-path', dir, turnDistance, remaining }
      routeInfo: null,
      myPos: null,            // reactive, updated about once a second (drives routing and the banner)
      gateNote: '',           // what the start screen is waiting for
      searchQuery: '',
      showAllBuildings: false, // toggled by the dropdown-browse button, independent of searchQuery
      searchOpen: false,       // the search box has focus: show the building list even before anything is typed
      target: null,
      chatOpenFor: null,
      chatMessages: [],
      chatInput: '',
      chatLoading: false,
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
      refreshing: false, // "Refresh path" in progress
      // text directions
      guidance: null,         // what to do right now: { icon, title, dist, detail, badge, facing, totalM, etaMin, step }
      stepList: [],           // every instruction on the way, for the Directions list
      directionsOpen: false,
      menuOpen: false,        // the "more" menu at the top
      miniMapOn: (() => { try { return localStorage.getItem('lampara_ar_minimap') !== '0'; } catch (e) { return true; } })(),
      voiceOn: (() => { try { return localStorage.getItem('lampara_ar_voice') === '1'; } catch (e) { return false; } })(),
      // start screen
      gateQuery: '',          // search box on the start screen
      gateAll: false,         // show every building on the start screen (4 by default, so the button stays in view on a small phone)
      debugUi: /[?&]debug\b/.test(location.search), // the build label is for testers only
      rooms: [],              // the directory, so the start screen and the search bar can find offices and rooms, not only buildings
      pendingRoom: null,      // a room picked by name: its building is the outdoor destination, and 'Find inside' opens that room afterwards
      arrivalDismissed: false,
      exitCard: new URLSearchParams(location.search).get('exit') === '1',   // came out of a building on an indoor route: greet with a card
      pendingTarget: null,    // the building picked on the start screen (chosen as soon as the AR view is up)
      gateStage: '',          // what start-up is doing: 'map' | 'camera' | 'gps' | 'ready'
      gateAcc: null,          // GPS accuracy while waiting for a fix
      clearNav: (() => { try { return localStorage.getItem('lampara_ar_clear') !== '0'; } catch (e) { return true; } })(),   // clear navigation switch (on by default)
      refreshNote: '',   // what it is doing right now (shown on the button)
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
    // The buildings listed on the start screen: matches for what was typed, or all of them.
    gateList() {
      const q = this.gateQuery.trim().toLowerCase();
      const list = q ? this.buildings.filter((b) => b.name.toLowerCase().includes(q)) : this.buildings.slice();
      return list.sort((a, b) => a.name.localeCompare(b.name)).slice(0, q || this.gateAll ? 12 : 4);
    },
    gateRooms() { return this.findRooms(this.gateQuery); },
    restroomAsk() { return RoomSearch.isRestroomQuery(this.gateQuery); },
    askedGender() { return RoomSearch.queryGender(this.gateQuery); },
    ddRooms() { return this.findRooms(this.searchQuery); },
    // Two ways into a building, for two different moments:
    //   - doorHref, on the "You've arrived" card: the visitor is at the door of the building just walked to, so show the floor plan
    //     from that entrance to the room picked at the start (Student/journey.php); with no room picked, ask for a room to find.
    //   - insideHref, the small button at the bottom while still walking: someone already inside who wants to say which room they are in.
    arrivedAtTarget() { return !!this.guidance && this.guidance.icon === 'arrive' && this.guidance.step === -1; },
    roomHere() { const r = this.pendingRoom; return r && this.target && String(r.building_id) === String(this.target.id) ? r : null; },
    doorHref() { return this.roomHere ? '../Student/journey.php?arrived=1&to=' + this.roomHere.id : '../Student/scan.php'; },
    doorSub() { return this.roomHere ? 'Show me the way to ' + this.roomHere.room_name : 'Scan a room sign to find your floor'; },
    insideHref() { return this.roomHere ? '../Student/scan.php?room=' + this.roomHere.id : '../Student/scan.php'; },
    insideLabel() { return 'Scan room sign'; },
    // Clear navigation is in effect: a building is chosen and the switch is on. Everything but the search bar, Ask Lampara and the path is hidden.
    // question chips for the chat, made from this building's real rooms
    chatStarters() { return this.chatOpenFor ? LamparaChat.starters(this.rooms, this.chatOpenFor.id) : []; },
    // how full the little signal bar is: a tight GPS fix (a few metres) fills it, a rough one (60 m or more) leaves it nearly empty
    accFill() { return this.gateAcc === null ? 0 : Math.max(0.08, Math.min(1, 1 - (this.gateAcc - 5) / 55)); },
    clearActive() { return this.clearNav && !!this.target; },
    searchMatches() {
      const q = this.searchQuery.trim().toLowerCase();
      if (q.length < 2) return [];
      return this.buildings.filter(b => b.name.toLowerCase().includes(q));
    },
    // What the dropdown actually shows: filtered matches while typing, or
    // every registered building when browsing via the toggle button with
    // nothing typed — two entry points into the same list UI.
    // While a destination is set the list still opens, so you can switch to another building before reaching the first one;
    // nearest first when your position is known.
    dropdownList() {
      let list = [];
      if (this.searchQuery.trim().length >= 2) list = this.searchMatches;
      else if (this.showAllBuildings || this.searchOpen) list = this.buildings;
      const here = this._pos || this.myPos;
      if (!here || list.length < 2) return list;
      return list.slice().sort((a, b) => haversineMeters(here, a) - haversineMeters(here, b));
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
  async mounted() {
    // Music on the start screen (the building list and the "getting ready" steps). It stops the moment the camera is up and
    // navigation has started. Phones keep sound back until the first tap, so the first tap on this screen is what starts it.
    setInterval(() => { if (this.checking && this.gateStage) this.gateTip = (this.gateTip + 1) % this.gateTips.length; }, 3200);   // a new tip from your mascot every few seconds
    if (window.LamparaAudio) {
      LamparaAudio.mute(!this.musicOn);
      const begin = () => { if (!this.started && this.musicOn) LamparaAudio.play('start'); };
      begin();
      document.addEventListener('pointerdown', begin, { once: true, capture: true });
      document.addEventListener('visibilitychange', () => { if (this.started) return; if (document.hidden) LamparaAudio.stop(); else begin(); });
      this.$watch('started', (on) => { if (on) LamparaAudio.stop(); });
    }
    if (window.LamparaMascots && window.LamparaGameHud) LamparaMascots.onChange(() => { this.hudStrip = LamparaGameHud.strip({ local: true }); });
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
  async created() {
    // Buildings are loaded up front so a destination can be picked on the start screen before anything is asked of the phone.
    try {
      this.buildings = await LamparaCache.loadBuildings('../../../Backend/api/buildings.php');
      // The landing page links here with ?to=<building id>: that building is already chosen on the start screen.
      const to = new URLSearchParams(location.search).get('to');
      const b = to ? this.buildings.find((x) => String(x.id) === to) : null;
      if (b) this.pendingTarget = b;
    } catch (e) { /* loaded again on start */ }
    // The search page links here with ?gate=<point id> to walk to a campus gate: it is routed like a building, to that walkway point.
    const gid = new URLSearchParams(location.search).get('gate');
    if (gid && window.LamparaGates) {
      try {
        const g = LamparaGates.list(await LamparaCache.loadCampusGraph('../../../Backend/api/campus-graph.php')).find((x) => String(x.nodeId) === gid);
        if (g) this.pendingTarget = LamparaGates.asTarget(g);
      } catch (e) { /* no walkway map: the gate is simply not preselected */ }
    }
    // The directory loads on its own: a slow or missing one only means no room results.
    await this.loadRooms();
    // Manual Search links here with ?room=<id> (and ?to=<its building>): remember the room for the 'Find inside' button.
    const rid = new URLSearchParams(location.search).get('room');
    const room = rid ? this.rooms.find((x) => String(x.id) === rid) : null;
    if (room) { this.pendingRoom = room; if (!this.pendingTarget) this.pendingTarget = this.buildings.find((x) => String(x.id) === String(room.building_id)) || null; }
  },
  methods: {
    async start() {
      this.exitCard = false;
      this.checking = true;
      this.quickStart = false;
      this.statusText = '';
      this.gateStage = 'map';
      if (!window.LamparaLocar) {
        this.statusText = 'The AR engine could not load. Check your connection and reload.';
        this.checking = false;
        return;
      }
      // iPhone only grants compass/motion from inside the tap that started this, so ask before any await.
      const motion = LamparaLocar.requestMotion();

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

      this.loadFootprints(); // building outlines + roads under the mini-map; never blocks starting AR
      this.gateStage = 'camera';
      if (await motion === 'denied') {
        this.statusText = 'Motion and compass permission was denied. Allow it in the browser settings and try again.';
        this.checking = false;
        return;
      }
      await this.proceedToAr();
      this.checking = false;
    },
    // Scanning the campus's one registered AR anchor fixes where you stand AND which way you
    // face. It happens inside the AR view (frames are read from LocAR's own camera video) so the
    // AR camera's heading is known at the instant the code is seen:
    //   position  -> the anchor's real spot replaces where GPS put the camera (and its GPS error is remembered)
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
        // LocAR owns the camera; its <video> is what we read (a second getUserMedia would fight it).
        const video = LamparaLocar.video() || document.querySelector('video');
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
      this._pos = this.myPos;
      this.statusOk = true;
      this.anchorScanned = true;
      this.showAllPaths = true;
      if (info.scan_heading != null && this._anchorHits.length) {
        const hits = this._anchorHits.slice().sort((a, b) => a - b);
        LamparaLocar.setHeadingOffset(hits[Math.floor(hits.length / 2)]);
        this.headingLocked = true;
        this.anchorNote = 'Position and direction set from the QR';
      } else if (info.scan_heading != null) {
        this.anchorNote = 'Position set. Direction will line up after a few steps along the path.';
      } else {
        this.anchorNote = 'Position set. This QR has no direction yet (Admin → Campus Paths).';
      }
      setTimeout(() => { this.anchorNote = ''; }, 6000);
      // Raw GPS is typically 5-20 m off. The QR tells us where you REALLY are, so (raw fix at the sign - anchor) is the
      // GPS error; the engine subtracts it from every later fix. Needs a fresh reading, otherwise the next one is used.
      const raw = LamparaLocar.lastRawFix();
      if (raw && Date.now() - raw.t < 15000) {
        this._anchorCorr = { lat: raw.lat - info.lat, lng: raw.lng - info.lng };
        LamparaLocar.resetPosition(info.lat, info.lng, this._anchorCorr);
      } else {
        LamparaLocar.resetPosition(info.lat, info.lng);
        this._pendingAnchorCorr = true;
      }
      this.renderAllPaths();
      return true;
    },
    skipAnchorScan() {
      this.stopAnchorScan();
      this.anchorScanned = true;
    },
    // LocAR starts the camera (permission prompt) and the GPS/compass itself; the page only reacts to its fixes.
    async proceedToAr() {
      const mid = (arr) => arr.length ? arr.reduce((a, v) => a + v, 0) / arr.length : null;
      const nodes = this.campusGraph.nodes;
      const bl = this.buildings.map((b) => b.lat).filter((v) => typeof v === 'number');
      const bg = this.buildings.map((b) => b.lng).filter((v) => typeof v === 'number');
      const origin = {
        lat: mid(bl) ?? mid(nodes.map((n) => n.lat)) ?? DEFAULT_CAMPUS_LAT,
        lng: mid(bg) ?? mid(nodes.map((n) => n.lng)) ?? DEFAULT_CAMPUS_LNG
      };
      try {
        await LamparaLocar.start({
          origin,
          eyeHeight: EYE_HEIGHT_M,
          fov: CAMERA_LONG_FOV_DEG,
          onFix: (raw, ff) => this.onFix(raw, ff),
          onHeadingLock: () => { this.headingLocked = true; },
          onError: (m) => { this.statusText = m; },
          onTap: (b) => { this.selectBuilding(b); this.openChat(b); }
        });
      } catch (e) {
        const msg = e && e.message ? e.message : String(e);
        this.statusText = /denied|permission|notallowed/i.test(msg) ? 'The camera was blocked. Allow camera access for this site in your browser settings, then try again.' : 'Could not start the camera: ' + msg;
        return;
      }
      // Like the AR Lab, lay the path only once there is a good GPS fix: the position filter starts from it, so the
      // chevrons do not slide about while it settles. Gives up after 12 s and carries on with the best it has.
      this.gateStage = 'gps';
      const fix = await LamparaLocar.waitForFix(12000, 15, (best) => { this.gateAcc = Math.round(best.acc); });
      this.gateStage = 'ready';
      if (fix) { this.myPos = { lat: fix.lat, lng: fix.lng }; this._pos = this.myPos; this._posAt = Date.now(); this.statusOk = true; }
      this.started = true;
      LamparaLocar.setGraph(this.campusGraph);
      LamparaLocar.setBuildings(this.buildings);          // the name labels first, so choosing a building below can swap its label for the marker
      if (this.pendingTarget) { const b = this.pendingTarget.gate ? this.pendingTarget : this.buildings.find((x) => x.id === this.pendingTarget.id); if (b) this.selectBuilding(b); }
      this.startMiniMap();
      // Feeds the "turn left/right" hint and the status chip.
      this._guideTimer = setInterval(() => this.updateGuidance(), 300);
      this._compassTimer = setInterval(() => {
        const h = LamparaLocar.heading(0);
        if (h === null) return;
        if (!this.compassReady || Math.abs(relativeAngle(this.compassHeading, h)) >= 1) this.compassHeading = h;
        this.compassReady = true;
        this.headingInit = true;
      }, 250);

      // Defined immediately, so the button that calls this never just does nothing with no visible error.
      window.__arDebug = () => {
        try {
          const vid = LamparaLocar.video();
          const p = LamparaLocar.position();
          let report = AR_BUILD + '\nengine: LocAR 0.2.12 (three.js)\nground ' + EYE_HEIGHT_M + ' m below phone (?h=)\ncamera long-side fov=' + CAMERA_LONG_FOV_DEG + ' (?fov=), video ' + (vid ? vid.videoWidth + 'x' + vid.videoHeight : 'none');
          report += '\nfiltered position: ' + (p ? p.lat.toFixed(6) + ', ' + p.lng.toFixed(6) + ' (±' + Math.round(p.acc) + ' m)' : 'none yet');
          report += '\nheading auto-aligned=' + this.headingLocked + ' offset=' + LamparaLocar.headingOffset.toFixed(1) + ' deg';
          report += '\nGPS correction from QR=' + (this._anchorCorr ? Math.round(haversineMeters({ lat: 0, lng: 0 }, this._anchorCorr)) + ' m' : 'none') + ' snapped to path=' + (this._snapDist != null ? this._snapDist.toFixed(1) + ' m away' : 'no');
          const here = this._pos || this.myPos;
          if (here) {
            const od = this.outsideMeters(here);
            report += '\nside: ' + (this.isOutside(here) ? 'OUTSIDE the campus' : 'inside the campus') + (od === null ? '' : ' (' + Math.round(od) + ' m from the campus edge)');
            const R = this.regions();
            report += '\nmain entrance: ' + (R.mainEntrance ? R.mainEntrance.name : 'none found (name a point "Main Entrance")') + '; outside buildings: ' + (this.buildings.filter((b) => R.outsideBuildingIds.has(String(b.id))).map((b) => b.name).join(', ') || 'none') + '; outside walkway points: ' + R.outsideNodes.size;
          }
          report += '\ngates: ' + (this.gates().map((g) => g.name + ' (' + g.kind + ')').join(', ') || 'none drawn (set a point to type Gate in Campus Paths)');
          if (this._gateCalc && this._gateCalc.length) {
            this._gateCalc.forEach((o, i) => { report += '\n  ' + (i ? '  ' : '> ') + o.gate.name + ': ' + Math.round(o.toGate) + ' m to the gate + ' + Math.round(o.walk) + ' m walk' + (o.penalty ? ' + ' + o.penalty + ' vehicle' : '') + ' = ' + Math.round(o.cost) + ' m'; });
          }
          const off = LamparaLocar.routeOffMeters();
          report += '\nroute on ground=' + (off !== null) + (off !== null ? ' (' + off.toFixed(1) + ' m off it)' : '');
          if (off === null) report += '\n  why not: ' + this.routeWhyNot();
          report += '\ncampusGraph loaded: ' + this.campusGraph.nodes.length + ' node(s), ' + this.campusGraph.edges.length + ' edge(s)';
          report += '\nshowAllPaths=' + this.showAllPaths + ' anchorScanned=' + this.anchorScanned;
          if (!this.showAllPaths) report += '\n  why not: ' + (this.target ? 'a building is chosen, so only its route is shown' : !this.campusAnchor ? 'no campus QR anchor is registered (Admin → Campus Paths)' : !this.anchorScanned ? 'the campus QR has not been scanned yet' : 'the QR scan was skipped; only a completed scan shows the whole network');
          report += this.target ? '\n\nTarget: ' + this.target.name + ' (' + this.target.distance + ' m)' : '\n\nNo target selected yet: search a building first, then tap this button again.';
          alert(report);
        } catch (e) {
          alert('AR debug threw an error: ' + e.message);
        }
      };

      if (this.campusAnchor && !this.anchorScanned) this.startAnchorScan();
    },
    // Every filtered GPS reading from the engine (the camera itself already moves every frame inside the engine).
    onFix(raw, ff) {
      // Right after a QR scan with no fresh reading yet: the first one measures the GPS error at the sign.
      if (this._pendingAnchorCorr && this.anchorPos) {
        this._pendingAnchorCorr = false;
        this._anchorCorr = { lat: raw.lat - this.anchorPos.lat, lng: raw.lng - this.anchorPos.lng };
        LamparaLocar.resetPosition(this.anchorPos.lat, this.anchorPos.lng, this._anchorCorr);
        return;
      }
      this.statusOk = true;
      this._pos = { lat: ff.lat, lng: ff.lng };           // live, not reactive: the mini-map reads this every redraw
      if (!this.locationOn) return;
      // Vue-tracked position and the route search behind it only move about once a second (or on a real step), so GPS
      // readings do not each trigger a re-render and a route search while the AR camera is being moved.
      const now = Date.now();
      if (!this.myPos || now - (this._posAt || 0) > 1000 || haversineMeters(this.myPos, this._pos) > 3) {
        this.myPos = this._pos;
        this._posAt = now;
        this.updateTargetDistance();
      }
    },
    // Where you are drawn: the corrected GPS position, pinned onto the nearest drawn walkway when
    // you are close to one.
    displayPos() {
      const here = this._pos || this.myPos;
      if (!here) return null;
      // With a route active, stay on the route itself so a parallel walkway can't steal the dot.
      if (this.target && this._routePts && this._routePts.length > 1) {
        const rs = this.snapToPolyline(here, this._routePts);
        if (rs && rs.dist <= SNAP_TO_PATH_M) { this._snapDist = rs.dist; return { lat: rs.lat, lng: rs.lng }; }
      }
      if (this.campusGraph.edges.length) {
        const snap = CampusRoute.snapToGraph(here, this.campusGraph.nodes, this.campusGraph.edges);
        if (snap && snap.dist <= SNAP_TO_PATH_M) { this._snapDist = snap.dist; return { lat: snap.lat, lng: snap.lng }; }
      }
      this._snapDist = null;
      return here;
    },
    // Building outlines and road lines (imported from the campus map export, already in GPS
    // coordinates). Kept in localStorage so the mini-map still has them offline. They are only drawn when the
    // OpenStreetMap tiles are not available (offline); with the tiles showing, only the chosen building is outlined.
    async loadFootprints() {
      let list = null;
      try {
        const res = await fetch('../../../Backend/api/campus-footprints.php', { cache: 'no-store' });
        const data = await res.json();
        if (data.success) {
          list = data.footprints;
          try { localStorage.setItem('lampara_footprints', JSON.stringify(list)); } catch (e) { /* storage full or blocked */ }
        }
      } catch (e) {
        try { list = JSON.parse(localStorage.getItem('lampara_footprints') || 'null'); } catch (err) { list = null; }
      }
      if (list && list.length) {
        // Precompute each shape's bounding box so the mini-map can skip far-away ones.
        this._footprints = list.map((f) => {
          const la = f.points.map((p) => p[0]), lo = f.points.map((p) => p[1]);
          return { ...f, minLat: Math.min(...la), maxLat: Math.max(...la), minLng: Math.min(...lo), maxLng: Math.max(...lo) };
        });
      } else {
        this._footprints = [];
      }
    },
    // OpenStreetMap tiles under the mini-map. The zoom is picked so one tile pixel is about one mini-map pixel; tiles are
    // fetched on demand, kept in a small cache (the service worker also keeps them for offline) and drawn as they arrive.
    // Returns true when at least one tile was drawn, so the caller knows whether the map base is showing.
    drawOsmTiles(ctx, S, me, radius, k) {
      const cache = this._osm || (this._osm = new Map());
      const latR = me.lat * Math.PI / 180;
      const mpp = (2 * radius) / S;                                   // metres per mini-map pixel
      const z = Math.max(OSM_MIN_ZOOM, Math.min(OSM_MAX_ZOOM, Math.round(Math.log2(156543.03 * Math.cos(latR) / mpp))));
      const n = Math.pow(2, z);
      const xc = (me.lng + 180) / 360 * n;
      const yc = (1 - Math.log(Math.tan(latR) + 1 / Math.cos(latR)) / Math.PI) / 2 * n;
      const tpx = 40075016.686 * Math.cos(latR) / n * k;              // one tile, in mini-map pixels
      const half = S / 2 / tpx;
      let drawn = false;
      for (let ty = Math.floor(yc - half); ty <= Math.floor(yc + half); ty++) {
        for (let tx = Math.floor(xc - half); tx <= Math.floor(xc + half); tx++) {
          if (ty < 0 || ty >= n) continue;
          const wx = ((tx % n) + n) % n;
          const key = z + '/' + wx + '/' + ty;
          let t = cache.get(key);
          if (!t) {
            const img = new Image();
            t = { img, ok: false };
            img.onload = () => { t.ok = true; };
            img.onerror = () => { t.failed = Date.now(); };
            img.src = OSM_TILE_URL.replace('{z}', z).replace('{x}', wx).replace('{y}', ty);
            cache.set(key, t);
            if (cache.size > OSM_CACHE_MAX) cache.delete(cache.keys().next().value);
          } else if (t.failed && Date.now() - t.failed > 20000) {       // a failed tile is retried now and then
            t.failed = 0; t.img.src = t.img.src;
          }
          if (!t.ok) continue;
          ctx.drawImage(t.img, S / 2 + (tx - xc) * tpx - 0.5, S / 2 + (ty - yc) * tpx - 0.5, tpx + 1, tpx + 1);
          drawn = true;
        }
      }
      return drawn;
    },
    // Closest point on a lat/lng polyline: { lat, lng, dist }.
    snapToPolyline(pos, pts) {
      let best = null;
      for (let i = 1; i < pts.length; i++) {
        const A = CampusRoute.toXY(pts[i - 1], pos), B = CampusRoute.toXY(pts[i], pos);
        const dx = B.x - A.x, dy = B.y - A.y, len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(A.x * dx + A.y * dy) / len2));
        const dist = Math.hypot(A.x + t * dx, A.y + t * dy);
        if (!best || dist < best.dist) best = { lat: pts[i - 1].lat + t * (pts[i].lat - pts[i - 1].lat), lng: pts[i - 1].lng + t * (pts[i].lng - pts[i - 1].lng), dist };
      }
      return best;
    },
    // Where the camera is facing (compass degrees, WITHOUT the automatic correction: what the QR scan compares
    // against), or null when the phone is pointed too far up/down for the heading to mean anything.
    cameraHeadingDeg(minHorizontal = 0.5) {
      return window.LamparaLocar && LamparaLocar.ready ? LamparaLocar.rawHeading(minHorizontal) : null;
    },
    setTarget(building) {
      this.target = building ? { ...building } : null;
      if (this.target && this.showAllPaths) {
        this.showAllPaths = false;
        LamparaLocar.clearNetwork();
      }
      LamparaLocar.setTarget(this.target);
      if (!this.target) { this._miniMapZoom = 0; this.clearRoute(); return; }
      this.updateTargetDistance();
      if (this.myPos) {                                    // the smallest mini-map view that still holds the building
        const d = haversineMeters(this.myPos, this.target) * 1.15;
        const i = MINIMAP_RADII_M.findIndex((r) => r >= d);
        this._miniMapZoom = i < 0 ? MINIMAP_RADII_M.length - 1 : i;
      }
      this.updateRoute(true);
    },
    updateTargetDistance() {
      if (!this.target || !this.myPos) return;
      this.target = { ...this.target, distance: Math.round(haversineMeters(this.myPos, this.target)) };
      this.updateRoute();
    },
    // ---- coming back into the campus ----
    // The two sides of the campus gates, worked out from the drawn walkways. The "portals" are the gate points and the main
    // entrance. The OUTSIDE walkways are the ones reachable from an outside building (Heritage, JEG) without going through a
    // portal; everything else is inside. Cached until the drawn data changes.
    regions() {
      const g = this.campusGraph;
      const key = g.nodes.length + ':' + g.edges.length + ':' + this.buildings.length;
      if (this._regKey === key && this._regions) return this._regions;
      this._regKey = key;
      return (this._regions = CampusRoute.regions(g, this.buildings));
    },
    // A copy of the walkway graph limited to some points (and the connections between them).
    subGraph(ids) { return CampusRoute.subGraph(this.campusGraph, ids); },
    // How far outside the campus edge a position is, in metres (0 = inside); null when there is not enough drawn to tell.
    // The edge is the convex hull of the INSIDE building outlines, walkway points and building pins.
    outsideMeters(p) {
      const R = this.regions(), fps = this._footprints || [];
      const key = fps.length + ':' + this._regKey;
      if (this._edgeKey !== key) {
        const ll = [];
        fps.forEach((f) => { if (f.kind === 'building' && f.building_id != null && !R.outsideBuildingIds.has(String(f.building_id))) f.points.forEach((q) => ll.push({ lat: q[0], lng: q[1] })); });
        this.campusGraph.nodes.forEach((n) => { if (!R.outsideNodes.has(n.id)) ll.push({ lat: n.lat, lng: n.lng }); });
        this.buildings.forEach((b) => { if (typeof b.lat === 'number' && !R.outsideBuildingIds.has(String(b.id))) ll.push({ lat: b.lat, lng: b.lng }); });
        this._edgeKey = key;
        this._edgeRef = ll.length ? ll[0] : null;
        this._edge = ll.length >= 3 ? hullXY(ll.map((q) => CampusRoute.toXY(q, this._edgeRef))) : null;
      }
      if (!this._edge || this._edge.length < 3) return null;
      return outsideDistXY(CampusRoute.toXY(p, this._edgeRef), this._edge);
    },
    // Updates and returns whether you are outside the campus now (with hysteresis, see OUTSIDE_M).
    updateOutside(p) {
      const d = this.outsideMeters(p);
      this._outsideDist = d;
      if (d === null) return false;
      if (this._outside) { if (d <= OUTSIDE_BACK_M) this._outside = false; }
      else if (d > OUTSIDE_M) this._outside = true;
      return !!this._outside;
    },
    // Which side of the gates you are on: true = outside the campus. You are outside when the nearest walkway is one of the
    // outside ones, or when you are well beyond the campus edge.
    isOutside(me) {
      const R = this.regions(), g = this.campusGraph;
      let onOutsideWalkway = false;
      if (R.outsideNodes.size && g.edges.length) {
        const snap = CampusRoute.snapToGraph(me, g.nodes, g.edges);
        onOutsideWalkway = !!snap && snap.dist <= OUTSIDE_SNAP_M && (R.outsideNodes.has(snap.nodeA.id) || R.outsideNodes.has(snap.nodeB.id));
      }
      return this.updateOutside(me) || onOutsideWalkway;
    },
    // Crossing the campus edge. Returns null when the normal route is right, else { points, info }:
    //   inside  -> an OUTSIDE building (Heritage, JEG): leave through an exit gate first (the cheaper of the main and vehicle
    //              exit), then walk to the building.
    //   outside -> a building INSIDE the campus (Main, Annex, Gymnasium, Multipurpose ...): go in through the main entrance first,
    //              then on to the building along the inside walkways. The way in is never an exit gate.
    // A route is built leg by leg so that it really passes the gate or the entrance, even where a shorter path skips it.
    crossPlan(me, goal, entrance) {
      const g = this.campusGraph;
      if (!g.edges.length) return null;
      const R = this.regions();
      const destOutside = R.outsideBuildingIds.has(String(this.target.id));
      const outside = this.isOutside(me);
      const dest = entrance !== null && entrance !== undefined ? entrance : goal;
      const nodePt = (n) => ({ lat: n.lat, lng: n.lng, id: n.id, name: n.name || '' });
      const legPts = (r, from) => { const pts = r.points.slice(); if (r.snapDist > 2) pts.unshift(from); return pts; };
      const legLen = (r) => r.length + (r.snapDist > 2 ? r.snapDist : 0);
      // keeps the second leg's points after the join (its first point is the gate/entrance itself)
      const after = (r, at) => r.points.filter((q) => haversineMeters(q, at) > 2);

      if (!outside && destOutside) {                               // INSIDE -> outside building: out through an exit gate
        const outer = this.subGraph(new Set([...R.outsideNodes]));
        const options = [];
        const usable = this.gates().filter((gt) => !CampusRoute.entranceOnly(gt.name));       // an entrance-only gate is not a way out
        (usable.length ? usable : this.gates()).forEach((gt) => {
          const withGate = this.subGraph(new Set([...R.outsideNodes, gt.id]));
          const leg1 = CampusRoute.findRoute(g, me, gt.id);
          const leg2 = CampusRoute.findRoute(withGate, { lat: gt.lat, lng: gt.lng }, dest) || CampusRoute.findRoute(g, { lat: gt.lat, lng: gt.lng }, dest);
          if (!leg1 || !leg2) return;
          const penalty = gt.kind === 'vehicle' ? VEHICLE_GATE_PENALTY_M : 0;
          const toGate = legLen(leg1), walk = legLen(leg2);
          options.push({ gate: gt, leg1, leg2, toGate, walk, penalty, cost: toGate + walk + penalty });
        });
        this._gateCalc = options.sort((a, b) => a.cost - b.cost);
        const best = this._gateCalc[0];
        if (!best) return null;
        const gt = best.gate;
        const points = legPts(best.leg1, me).concat(after(best.leg2, gt));
        return { points, kind: 'x' + gt.id, info: { status: 'via-gate', phase: 'exit', gateName: gt.name, gateKind: gt.kind, toGate: Math.round(best.toGate), rest: Math.round(best.walk), remaining: Math.round(best.toGate + best.walk) }, routePts: null };
      }

      if (outside && !destOutside) {                               // OUTSIDE -> a building inside: in through the main entrance
        const portal = R.mainEntrance;
        if (!portal) return null;
        const outerG = this.subGraph(new Set([...R.outsideNodes, portal.id]));
        const innerG = this.subGraph(new Set([...R.insideNodes]));     // the inside walkways (the portals are part of them)
        const leg2 = CampusRoute.findRoute(innerG, { lat: portal.lat, lng: portal.lng }, dest);
        if (!leg2) return null;
        let leg1 = outerG.edges.length ? CampusRoute.findRoute(outerG, me, portal.id) : null;
        let head, toPortal;
        if (leg1 && leg1.snapDist <= OFF_PATH_METERS) { head = legPts(leg1, me); toPortal = legLen(leg1); }
        else { head = [me, nodePt(portal)]; toPortal = haversineMeters(me, portal); }       // far outside: straight to the entrance
        const rest = legLen(leg2);
        this._gateCalc = [{ gate: { name: portal.name, kind: 'main' }, toGate: toPortal, walk: rest, penalty: 0, cost: toPortal + rest }];
        const points = head.concat(after(leg2, portal));
        return { points, kind: 'e' + portal.id, info: { status: 'via-gate', phase: 'enter', gateName: portal.name || 'the main entrance', gateKind: 'main', toGate: Math.round(toPortal), rest: Math.round(rest), remaining: Math.round(toPortal + rest) }, routePts: null };
      }
      this._gateCalc = null;
      return null;
    },
    // The campus gates: every walkway point of type "Gate". One whose name says vehicle / car / truck / service / delivery is a
    // vehicle gate (e.g. "Vehicle Exit"); any other is a main gate (e.g. "Main Exit").
    gates() {
      return this.campusGraph.nodes.filter((n) => n.node_type === 'gate').map((n) => ({
        id: n.id, name: n.name || 'Gate', lat: n.lat, lng: n.lng,
        kind: CampusRoute.gateKind(n.name)
      }));
    },
    // The calculation behind "go back to the entrance first". For every gate:
    //   cost = straight distance from you to the gate x OUTSIDE_DETOUR   (outside the drawn walkways)
    //        + the walkway distance from that gate to the building       (Dijkstra over the drawn walkways)
    //        + VEHICLE_GATE_PENALTY_M when it is a vehicle gate
    // Returns every usable gate cheapest first: [{ gate, route, toGate, walk, penalty, cost }].
    pickGate(me, dest) {
      const out = [];
      this.gates().forEach((g) => {
        const r = CampusRoute.findRoute(this.campusGraph, { lat: g.lat, lng: g.lng }, dest);
        if (!r) return;                                          // this gate does not connect to the building
        const toGate = haversineMeters(me, g) * OUTSIDE_DETOUR;
        const walk = r.length + (r.snapDist > 2 ? r.snapDist : 0);
        const penalty = g.kind === 'vehicle' ? VEHICLE_GATE_PENALTY_M : 0;
        out.push({ gate: g, route: r, toGate, walk, penalty, cost: toGate + walk + penalty });
      });
      return out.sort((a, b) => a.cost - b.cost);
    },
    // Routes from where you're standing to the target building and draws it on the ground, the way the AR Lab does:
    //   - along the drawn walkways to the building's entrance, with a short straight connector from where you stand to the
    //     walkway (and, for a building with NO entrance set, to the walkway point nearest the building);
    //   - if there is no usable walkway at all, a straight line to the building, so a chosen building always gets a path.
    // Throttled (GPS fixes can arrive faster than the geometry is worth rebuilding).
    updateRoute(force) {
      const now = Date.now();
      if (!force && now - (this._lastRouteAt || 0) < 1500) return;
      this._lastRouteAt = now;

      if (!this.target || !this.myPos) { this.clearRoute(); return; }
      const me = { lat: this.myPos.lat, lng: this.myPos.lng };
      const goal = { lat: this.target.lat, lng: this.target.lng };
      const crow = haversineMeters(me, goal);
      if (crow > ROUTE_MAX_M) {      // not on campus: a path this long means nothing
        this._routePts = null;
        this._miniRoute = null;
        LamparaLocar.clearRoute();
        this.routeInfo = { status: 'far', remaining: Math.round(crow) };
        return;
      }
      const entrance = this.target.entrance_node_id;
      // Crossing the campus edge (see crossPlan): out through an exit gate to an outside building, or in through the main entrance.
      const cross = this.crossPlan(me, goal, entrance);
      if (cross) {
        this._routePts = cross.routePts;
        this._miniRoute = cross.points;
        this.routeInfo = cross.info;
        this.buildSteps(cross.points, cross.info);
        this.renderRibbon(cross.points, cross.kind);
        return;
      }
      let route = this.campusGraph.edges.length ? CampusRoute.findRoute(this.campusGraph, me, entrance || goal) : null;
      if (!route && entrance) route = CampusRoute.findRoute(this.campusGraph, me, goal);   // entrance node unreachable: walk to the nearest path
      let points, length;
      if (route) {
        points = route.points.slice();
        length = route.length;
        if (route.snapDist > 2) { points.unshift(me); length += route.snapDist; }   // straight connector from you to the walkway
      } else {
        points = [me, goal];
        length = crow;
      }
      this._routePts = route && route.snapDist <= OFF_PATH_METERS ? route.points : null;
      this._miniRoute = points;                     // what the mini-map traces (your position, the walkway points, the building)
      this._stepsPoints = points;

      if (length <= ARRIVED_METERS) {
        LamparaLocar.clearRoute();
        this.routeInfo = { status: 'arrived' };
        return;
      }
      if (!route) {
        this.routeInfo = { status: 'direct', remaining: Math.round(length) };
      } else if (route.snapDist > OFF_PATH_METERS) {
        this.routeInfo = { status: 'off-path', remaining: Math.round(route.snapDist) };
      } else {
        const turn = CampusRoute.nextTurn(route.points);
        this.routeInfo = { status: 'ok', dir: turn.dir, turnDistance: Math.round(turn.distance), remaining: Math.round(length) };
      }
      this.buildSteps(points, this.routeInfo);
      this.renderRibbon(points, route ? 'w' : 'd');
    },
    startMiniMap() {
      if (this._miniMapTimer) return;
      this._miniMapZoom = 0;
      this._miniMapTimer = setInterval(() => this.drawMiniMap(), 333);
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

      // Glide toward the real position (steps and corner snaps would otherwise jump the dot).
      const target = this.displayPos ? this.displayPos() : this.myPos;
      let me = target;
      if (target) {
        const cur = this._mmPos;
        if (!cur || haversineMeters(cur, target) > 30) this._mmPos = { lat: target.lat, lng: target.lng };
        else this._mmPos = { lat: cur.lat + (target.lat - cur.lat) * MINIMAP_EASE, lng: cur.lng + (target.lng - cur.lng) * MINIMAP_EASE };
        me = this._mmPos;
      }
      const radius = MINIMAP_RADII_M[this._miniMapZoom || 0];
      if (me) {
        const k = (S / 2) / radius;
        const kx = PROJ_M_PER_DEG * Math.cos(me.lat * Math.PI / 180);
        const P = (p) => ({ x: S / 2 + (p.lng - me.lng) * kx * k, y: S / 2 - (p.lat - me.lat) * PROJ_M_PER_DEG * k });
        this.drawOsmTiles(ctx, S, me, radius, k);
        // Until a building is chosen the mini-map shows only you (the dot and the way you face) on the base map. Once one is
        // chosen it traces the path to it: the route's points joined by a line, a dot on each point, and a marker on the
        // building, which is also outlined.
        if (this.target) {
          const fps = this._footprints;
          if (fps && fps.length) {
            const mLat = radius * 1.5 / PROJ_M_PER_DEG, mLng = radius * 1.5 / kx;
            ctx.lineJoin = 'round';
            fps.forEach((f) => {
              if (f.building_id == null || f.building_id !== this.target.id) return;
              if (f.maxLat < me.lat - mLat || f.minLat > me.lat + mLat || f.maxLng < me.lng - mLng || f.minLng > me.lng + mLng) return;
              ctx.beginPath();
              f.points.forEach((pt, i) => { const Q = P({ lat: pt[0], lng: pt[1] }); if (i) ctx.lineTo(Q.x, Q.y); else ctx.moveTo(Q.x, Q.y); });
              ctx.closePath();
              ctx.fillStyle = 'rgba(250,204,21,0.45)'; ctx.fill();
              ctx.strokeStyle = '#facc15'; ctx.lineWidth = 2; ctx.stroke();
            });
          }
          const route = this._miniRoute;
          if (route && route.length > 1) {
            ctx.lineCap = 'round'; ctx.lineJoin = 'round';
            const trace = () => { ctx.beginPath(); route.forEach((p, i) => { const Q = P(p); if (i) ctx.lineTo(Q.x, Q.y); else ctx.moveTo(Q.x, Q.y); }); ctx.stroke(); };
            ctx.strokeStyle = '#161850'; ctx.lineWidth = 7; trace();          // dark edge so it reads on the light map
            ctx.strokeStyle = '#ffd100'; ctx.lineWidth = 4; trace();
            ctx.fillStyle = '#fff'; ctx.strokeStyle = '#161850'; ctx.lineWidth = 1.5;
            route.slice(1, -1).forEach((p) => { const Q = P(p); ctx.beginPath(); ctx.arc(Q.x, Q.y, 2.8, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
          }
          const D = P(this._miniRoute && this._miniRoute.length > 1 ? this._miniRoute[this._miniRoute.length - 1] : this.target);
          ctx.fillStyle = '#ffd100'; ctx.strokeStyle = '#161850'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(D.x, D.y, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#161850'; ctx.beginPath(); ctx.arc(D.x, D.y, 2, 0, Math.PI * 2); ctx.fill();
        }
        // You + the direction you face in the real world (AR camera heading minus the correction).
        const rawH = window.LamparaLocar && LamparaLocar.ready ? LamparaLocar.heading(0.05) : null;
        if (rawH !== null) {
          this._mmHdg = this._mmHdg == null ? rawH : (this._mmHdg + relativeAngle(this._mmHdg, rawH) * 0.25 + 360) % 360;
          const h = this._mmHdg * Math.PI / 180;
          ctx.fillStyle = 'rgba(96,165,250,0.35)';
          ctx.beginPath(); ctx.moveTo(S / 2, S / 2);
          ctx.arc(S / 2, S / 2, S * 0.3, h - Math.PI / 2 - 0.45, h - Math.PI / 2 + 0.45); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#3b82f6'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(S / 2, S / 2, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      ctx.textAlign = 'center'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 3;
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px sans-serif';
      ctx.strokeText('N', S / 2, 11); ctx.fillText('N', S / 2, 11);
      ctx.font = '9px sans-serif';
      ctx.strokeText(radius + ' m', S / 2, S - 5); ctx.fillText(radius + ' m', S / 2, S - 5);
      ctx.font = '7px sans-serif'; ctx.lineWidth = 2;
      ctx.strokeText('\u00a9 OpenStreetMap', S / 2, S - 15); ctx.fillText('\u00a9 OpenStreetMap', S / 2, S - 15);
    },
    clearRoute() {
      this._routePts = null;
      this._miniRoute = null;
      this._steps = []; this.stepList = [];
      if (window.LamparaLocar && LamparaLocar.ready) LamparaLocar.clearRoute();
      this.routeInfo = null;
    },
    // Shows the WHOLE walkway graph in AR right after a successful anchor scan: every edge, not just a route to a
    // destination, since no destination is known yet at that point. Disappears the moment a building is picked.
    renderAllPaths() {
      if (this.campusGraph.edges.length) LamparaLocar.setNetwork(this.campusGraph);
    },
    // Chevrons on the ground along the route (points start at your own feet), laid once like in the AR Lab, one stretch at a time:
    // only the path to the next point is drawn, and reaching it reveals the next stretch. They are
    // only laid again when the target changes, the kind of route changes (walkway or straight line), you stray more than
    // 15 m from them (the engine checks that), or you tap Refresh path. The part already walked fades away by itself.
    // The destination marker moves to the end of the route, so the path and the marker meet.
    renderRibbon(points, kind) {
      // Walkway points (the lettered ones, Point B, Point D ...) are the stops: reach one and the next stretch appears.
      const pts = points.map((p) => ({ lat: p.lat, lng: p.lng, stop: p.id !== undefined && p.id !== null, name: p.name || '' }));
      pts[pts.length - 1].stop = true;
      pts[pts.length - 1].name = this.target.name;
      LamparaLocar.setRoute(pts, this.target.id + ':' + kind);
      const last = pts[pts.length - 1];
      LamparaLocar.moveTarget(last.lat, last.lng);
    },
    // Visual-only: LocAR's camera feed has no clean public "stop", so this just covers it (see the overlay markup).
    toggleCamera() {
      this.cameraOn = !this.cameraOn;
    },
    // ---- text directions: "Turn left in 23 m" ----
    // Turns the route's points (your position first, the building last) into instructions. A turn is a change of direction of
    // at least NAV_TURN_MIN_DEG; the gate you must pass (exit or main entrance) is an instruction of its own.
    buildSteps(points, info) {
      const pts = [];
      points.forEach((p) => {
        const last = pts[pts.length - 1];
        if (!last || haversineMeters(last, p) >= 1.5) pts.push({ lat: p.lat, lng: p.lng, name: p.name || '' });
        else if (p.name && !last.name) last.name = p.name;
      });
      if (pts.length < 2 || !this.target) { this._steps = []; this.stepList = []; return; }
      const cum = [0];
      for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + haversineMeters(pts[i - 1], pts[i]));
      const gateName = info && info.status === 'via-gate' ? info.gateName : null;
      const man = [];
      for (let i = 1; i < pts.length - 1; i++) {
        const ang = relativeAngle(bearingDeg(pts[i - 1], pts[i]), bearingDeg(pts[i], pts[i + 1]));
        if (gateName && pts[i].name === gateName) man.push({ i, kind: 'gate', angle: ang, ...(Math.abs(ang) >= NAV_TURN_MIN_DEG ? turnWord(ang) : { word: '', icon: 'gate' }) });
        else if (Math.abs(ang) >= NAV_TURN_MIN_DEG) man.push({ i, kind: 'turn', angle: ang, ...turnWord(ang) });
      }
      man.push({ i: pts.length - 1, kind: 'arrive', icon: 'arrive', word: '' });
      const label = (m) => (m.kind === 'arrive' ? this.target.name : (pts[m.i].name || 'the corner'));
      const exit = info && info.phase === 'exit';
      const steps = man.map((m, k) => {
        const next = man[k + 1];
        return {
          ...m, point: { lat: pts[m.i].lat, lng: pts[m.i].lng }, name: label(m),
          leg: Math.round(cum[m.i] - cum[k ? man[k - 1].i : 0]),
          after: next ? Math.round(cum[next.i] - cum[m.i]) : 0,
          nextName: next ? label(next) : '',
          gateWord: m.kind === 'gate' ? (exit ? 'Leave through ' : 'Go in through ') + pts[m.i].name : ''
        };
      });
      // the Directions list: item k is "what to do at the previous point, then walk to point k"
      this.stepList = steps.map((m, k) => {
        const prev = k ? steps[k - 1] : null;
        let title;
        if (!prev) title = m.kind === 'arrive' ? 'Walk to ' + m.name : 'Head toward ' + m.name;
        else if (prev.kind === 'gate') title = prev.gateWord + (prev.word ? ', then ' + prev.word.toLowerCase() : '');
        else title = prev.word + ' at ' + prev.name;
        return { key: k, icon: prev ? (prev.kind === 'gate' && !prev.word ? 'gate' : prev.icon) : 'straight', title, detail: !prev ? 'Walk straight ahead' : (m.kind === 'arrive' ? 'then ' + m.leg + ' m to ' + m.name + ', where you arrive' : 'then ' + m.leg + ' m to ' + m.name), meters: m.leg };
      });
      this._steps = steps;
      this._stepIdx = 0;
    },
    // Runs a few times a second: works out the instruction for where you are and which way you face right now.
    updateGuidance() {
      const tgt = this.target, ri = this.routeInfo, here = this._pos || this.myPos;
      if (!tgt || !ri || !here) { this.guidance = tgt && window.LamparaTutorial && LamparaTutorial.active ? LamparaTutorial.sampleGuidance() : null; return; }
      const eta = (m) => Math.max(1, Math.round(m / NAV_WALK_M_PER_MIN));
      if (ri.status === 'arrived') { try { this.rewardArrival(tgt); } catch (e) { /* the reward must never get in the way of the directions */ } this.guidance = { icon: 'arrive', title: "You've arrived", dist: '', detail: tgt.name, badge: '', facing: null, totalM: 0, etaMin: 0, step: -1 }; return; }
      if (ri.status === 'far') { this.guidance = { icon: 'warn', title: 'Too far to guide you', dist: '', detail: ri.remaining + ' m from ' + tgt.name + '. Are you on campus?', badge: '', facing: null, totalM: ri.remaining, etaMin: 0, step: -1 }; return; }
      const steps = this._steps || [];
      if (!steps.length) { this.guidance = { icon: 'straight', title: 'Finding your route', dist: '', detail: tgt.name, badge: '', facing: null, totalM: ri.remaining || 0, etaMin: 0, step: -1 }; return; }
      let idx = Math.min(this._stepIdx || 0, steps.length - 1);
      while (idx < steps.length - 1 && haversineMeters(here, steps[idx].point) < NAV_REACH_M) idx++;
      this._stepIdx = idx;
      const m = steps[idx], d = Math.round(haversineMeters(here, m.point)), near = d <= NAV_TURN_NEAR_M;
      let icon, title, dist, detail;
      if (m.kind === 'arrive') {
        icon = d <= 12 ? 'arrive' : 'straight'; title = d <= 12 ? 'Arriving' : 'Continue straight'; dist = d <= 12 ? '' : 'for ' + d + ' m'; detail = 'to ' + tgt.name;
      } else if (m.kind === 'gate') {
        icon = near ? (m.word ? m.icon : 'gate') : 'straight';
        title = near ? m.gateWord : 'Continue straight'; dist = near ? (d <= 10 ? 'now' : 'in ' + d + ' m') : 'for ' + d + ' m';
        detail = near ? (m.word ? 'then ' + m.word.toLowerCase() + ' · ' : '') + 'then ' + m.after + ' m to ' + m.nextName : 'to ' + m.gateWord.toLowerCase();
      } else {
        icon = near ? m.icon : 'straight'; title = near ? m.word : 'Continue straight'; dist = near ? (d <= 10 ? 'now' : 'in ' + d + ' m') : 'for ' + d + ' m';
        detail = near ? 'at ' + m.name + ' · then ' + m.after + ' m to ' + m.nextName : 'then ' + m.word.toLowerCase() + ' at ' + m.name;
      }
      // facing the wrong way: say so (the arrow in the AR view is off screen then)
      let facing = null;
      if (this.compassReady && d > 12) {
        const rel = relativeAngle(this.compassHeading, bearingDeg(here, m.point));
        if (Math.abs(rel) > NAV_FACING_DEG) facing = Math.abs(rel) > 150 ? { side: 'around', text: 'Turn around: the path is behind you' } : { side: rel > 0 ? 'right' : 'left', text: 'Turn ' + (rel > 0 ? 'right' : 'left') + ' to face the path' };
      }
      const badge = ri.status === 'via-gate' ? (ri.phase === 'exit' ? 'Out through ' : 'In through ') + (ri.phase === 'enter' && (CampusRoute.EXIT_RE.test(ri.gateName || '') || /^point\s+[a-z]+$/i.test(ri.gateName || '')) ? 'the main entrance' : (/^point\s+[a-z]+$/i.test(ri.gateName || '') ? 'the gate' : ri.gateName)) : ri.status === 'off-path' ? 'Off the walkways' : ri.status === 'direct' ? 'No walkway here: straight line' : '';
      const totalM = ri.remaining || 0;
      this.guidance = { icon, title, dist, detail, badge, facing, totalM, etaMin: eta(totalM), step: idx };
      if (!this._tipShown && !this.headingLocked) {            // once: how the compass gets lined up
        this._tipShown = true;
        this.anchorNote = 'Walk a few steps along the path to line up the compass';
        setTimeout(() => { this.anchorNote = ''; }, 6000);
      }
      this.announce(idx, m, d, title);
    },
    // Voice and a buzz as a turn comes up: once at about 60 m, once at about 20 m, once at the turn. Only when the voice switch is on.
    announce(idx, m, d, title) {
      if (!this.voiceOn) return;
      const key = idx + ':' + m.point.lat.toFixed(5) + ',' + m.point.lng.toFixed(5);
      if (this._annKey !== key) { this._annKey = key; this._ann = {}; }
      const a = this._ann, word = m.kind === 'arrive' ? 'You have arrived' : (m.kind === 'gate' ? m.gateWord : m.word);
      if (d <= 60 && d > 25 && !a.far) { a.far = true; this.say(m.kind === 'arrive' ? 'Continue straight for ' + Math.round(d / 10) * 10 + ' meters' : 'In ' + Math.round(d / 10) * 10 + ' meters, ' + word.toLowerCase()); }
      else if (d <= 25 && d > 10 && !a.near) { a.near = true; this.say(word + ' in ' + Math.round(d / 5) * 5 + ' meters'); this.buzz(120); }
      else if (d <= 10 && !a.now) { a.now = true; this.say(word); this.buzz([150, 80, 150]); }
    },
    say(text) {
      try {
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1; u.lang = 'en';
        window.speechSynthesis.speak(u);
      } catch (e) { /* no speech on this phone */ }
    },
    buzz(pattern) { try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) { /* no vibration */ } },
    toggleVoice() {
      this.voiceOn = !this.voiceOn;
      try { localStorage.setItem('lampara_ar_voice', this.voiceOn ? '1' : '0'); } catch (e) { /* not remembered */ }
      if (this.voiceOn) { this._annKey = ''; this.say('Voice directions on'); } else { try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    },
    iconDeg(icon) { return NAV_ICON_DEG[icon] || 0; },
    // done / doing / todo for a line of the start-up list
    stageClass(stage) {
      const order = ['map', 'camera', 'gps', 'ready'], cur = order.indexOf(this.gateStage), me = order.indexOf(stage);
      return me < cur ? 'done' : me === cur ? 'doing' : 'todo';
    },
    pickDestination(b) {
      this.pendingTarget = this.pendingTarget && this.pendingTarget.id === b.id ? null : b;
      if (this.pendingRoom && (!this.pendingTarget || String(this.pendingRoom.building_id) !== String(this.pendingTarget.id))) this.pendingRoom = null;
    },
    async loadRooms() {
      try { this.rooms = LamparaCache.getRooms() || []; } catch (e) { this.rooms = []; }
      if (!navigator.onLine) return;
      try {
        const res = await fetch('../../../Backend/api/rooms.php');
        const data = await res.json();
        if (data && data.success) { this.rooms = data.rooms; LamparaCache.setRooms(data.rooms); }
      } catch (e) { /* the cached copy stays */ }
    },
    // Rooms and offices matching what was typed: every word must appear in the name, number, floor or building. Best matches first.
    // Rooms and offices matching what was typed (number, name, initials, building, floor...), the same search as Manual Search.
    pickGender(g) { this.gateQuery = (RoomSearch.withGender(this.gateQuery, '') + (g ? ' ' + g : '')).trim(); },
    findRooms(query) {
      if (String(query || '').trim().length < 2) return [];
      return RoomSearch.rank(this.rooms, query, 5);
    },
    roomLabel(r) { return (r.room_number ? r.room_number + ' \u2014 ' : '') + r.room_name + (r.subtitle ? ' (' + r.subtitle + ')' : ''); },
    // Picking a room on the start screen: its building becomes the destination.
    pickRoomGate(r) {
      const b = this.buildings.find((x) => String(x.id) === String(r.building_id));
      if (!b) return;
      this.pendingRoom = r;
      this.pendingTarget = b;
    },
    // Picking a room in the search bar: walk to its building, and remember the room for 'Find inside'.
    pickRoomHud(r) {
      const b = this.buildings.find((x) => String(x.id) === String(r.building_id));
      if (!b) return;
      this.pendingRoom = r;
      this.pickFromList(b);
    },
    selectBuilding(building) { this.setTarget(building); },
    // Choosing a building from the list: switches the destination (even while another one is still active) and closes the list.
    pickFromList(b) {
      if (this.pendingRoom && String(this.pendingRoom.building_id) !== String(b.id)) this.pendingRoom = null;
      this.selectBuilding(b);
      this.searchQuery = '';
      this.showAllBuildings = false;
      this.searchOpen = false;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    },
    closeSearchSoon() { setTimeout(() => { this.searchOpen = false; }, 200); },
    // Distance from you to a building, for the list ("120 m", "1.2 km"); '' until there is a position.
    distLabel(b) {
      const here = this._pos || this.myPos;
      if (!here) return '';
      const d = haversineMeters(here, b);
      return d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
    },
    // Clear navigation: stop navigating and take the path away (the route, the chevrons, the directions, the markers).
    clearNavigation() {
      this.pendingRoom = null;
      this.menuOpen = false;
      this.directionsOpen = false;
      this.searchQuery = '';
      this.showAllBuildings = false;
      this.searchOpen = false;
      this.setTarget(null);
      this.guidance = null;
      this.stepList = [];
      this._steps = [];
      if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } }
    },
    // "Refresh path": for when the chevrons have drifted off the walkway or float above/below the ground. Restarts the
    // position from fresh GPS readings and lays everything again at ground height; the walking-based compass correction
    // and any QR correction are kept.
    async refreshPath() {
      if (this.refreshing || !window.LamparaLocar || !LamparaLocar.ready) return;
      this.refreshing = true;
      try {
        this.refreshNote = 'Recapturing your location…';
        const p = await LamparaLocar.refresh((best, n) => { this.refreshNote = 'Recapturing your location… ±' + Math.round(best.acc) + ' m'; });
        this.refreshNote = '';
        this._mmPos = null;                                  // the mini-map dot jumps to the new spot instead of gliding there
        this._pos = { lat: p.lat, lng: p.lng };
        if (this.locationOn) this.myPos = this._pos;
        LamparaLocar.setBuildings(this.buildings);          // labels first: setTarget hides the chosen building's own label
        if (this.showAllPaths) this.renderAllPaths();
        if (this.target) {
          LamparaLocar.setTarget(this.target);
          this.updateTargetDistance();
          this.updateRoute(true);
        }
        this.anchorNote = !p.fresh ? 'No new GPS reading yet. Try again in a moment.'
          : p.acc > 25 ? 'Path refreshed, but GPS is weak (±' + Math.round(p.acc) + ' m). Move into open sky and refresh again.'
          : 'Location recaptured, path refreshed (±' + Math.round(p.acc) + ' m)';
      } catch (e) {
        this.anchorNote = 'Could not refresh the path.';
      }
      this.refreshing = false;
      this.refreshNote = '';
      setTimeout(() => { this.anchorNote = ''; }, 4000);
    },
    // Plain-words reason the ground route is missing, for AR debug.
    routeWhyNot() {
      if (!this.target) return 'no building chosen yet. Search one and pick it from the list.';
      if (!this.myPos) return 'no GPS position yet.';
      const crow = Math.round(haversineMeters(this.myPos, this.target));
      if (crow > ROUTE_MAX_M) return 'you are ' + crow + ' m from ' + this.target.name + ' (a path is only drawn within ' + ROUTE_MAX_M + ' m). Are you on campus?';
      if (crow <= ARRIVED_METERS) return 'you are already there.';
      return 'a route to ' + this.target.name + ' exists (' + (this.routeInfo ? this.routeInfo.status : '?') + ') but is not on the ground yet. Tap Refresh path.';
    },
    // Reaching a destination for real earns points, once per building; reaching all of them is the Campus Explorer achievement.
    rewardArrival(b) {
      const M = window.LamparaMascots;
      if (!M || b.gate || (window.LamparaTutorial && LamparaTutorial.active)) return;   // a gate is not a building: no stamps or points for it
      M.event('arrive', String(b.id));
      if (!M.award('visit:' + b.id, 10)) return;
      M.toast('Arrived at ' + b.name, 10);
      if (this.buildings.length && M.visited() >= this.buildings.length && M.award('explorer', 50)) M.toast('Campus Explorer', 50);
    },
    stamped(id) { return !!window.LamparaMascots && LamparaMascots.earnedList()['visit:' + id] !== undefined; },
    // The way back from the start screen: where you came from, or the home page when this page was opened directly.
    goBack() { if (history.length > 1 && document.referrer) history.back(); else location.href = 'index.php'; },
    toggleMusic() {
      this.musicOn = !this.musicOn;
      LamparaAudio.setEnabled(this.musicOn);
      LamparaAudio.mute(!this.musicOn);
      if (this.musicOn && !this.started) LamparaAudio.play('start'); else LamparaAudio.stop();
    },
    openMascots() { if (window.LamparaMascotShop) LamparaMascotShop.open(); },
    replayTutorial() {
      this.menuOpen = false;
      if (window.LamparaTutorial) LamparaTutorial.start(true);
    },
    toggleMiniMap() {
      this.miniMapOn = !this.miniMapOn;
      try { localStorage.setItem('lampara_ar_minimap', this.miniMapOn ? '1' : '0'); } catch (e) { /* not remembered */ }
    },
    toggleClearNav() {
      this.clearNav = !this.clearNav;
      try { localStorage.setItem('lampara_ar_clear', this.clearNav ? '1' : '0'); } catch (e) { /* not remembered */ }
    },
    // Turns only the 2D distance readout off; the AR view itself always needs GPS to place the path.
    toggleLocation() {
      this.locationOn = !this.locationOn;
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
        this.chatMessages = [{ role: 'assistant', text: `Hi! Ask me anything about ${building.name}: where an office is, when it opens, what is on each floor. I only answer from what is registered, so if I don't know, I'll say so.` }];
      }
    },
    chatFormat: (t) => LamparaChat.format(t),
    chatRoomHref: (id) => LamparaChat.roomHref(id),
    chatScrollDown() { this.$nextTick(() => { const el = this.$refs.chatLog; if (el) el.scrollTop = el.scrollHeight; }); },
    async sendChat(text) {
      const userText = String(text === undefined ? this.chatInput : text).trim();
      if (!userText || this.chatLoading) return;
      if (window.LamparaMascots) { LamparaMascots.event('ask'); if (LamparaMascots.award('first-question', 5)) LamparaMascots.toast('First Question', 5); }
      const history = this.chatMessages.map((m) => ({ role: m.role, text: m.text }));
      this.chatMessages.push({ role: 'user', text: userText });
      this.chatInput = '';
      this.chatLoading = true;
      this.chatScrollDown();
      let out;
      try { out = await LamparaChat.ask({ buildingId: this.chatOpenFor.id, message: userText, history }); }
      catch (e) { out = LamparaChat.localAnswer(userText, this.chatOpenFor.id); }
      this.chatMessages.push({ role: 'assistant', text: out.reply, rooms: out.rooms || [], followups: out.followups || [], offline: !!out.offline });
      this.chatLoading = false;
      this.chatScrollDown();
      if (window.LamparaAudio) LamparaAudio.blip('a');
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
