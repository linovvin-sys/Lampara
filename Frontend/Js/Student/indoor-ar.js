const { createApp } = Vue;
const API = '../../../Backend/api/';

const STEP_LENGTH = 0.7;      // meters per detected step — a rough average stride
const AHEAD_METERS = 14;      // how much of the path ahead the ribbon draws
const ARRIVE_METERS = 1.5;    // this close to a segment's end counts as reached
const CAMERA_HEIGHT = 1.6;    // phone held at about eye level; the ribbon's ground plane is set relative to it
const CAMERA_FOV_DEG = 65;    // horizontal field of view of a typical phone camera
const MAP_PX_PER_METER = 6;   // mini-map zoom (240px canvas => ~20 m across)

createApp({
  data() {
    return {
      stage: 'loading', // loading | error | gate | nav
      error: '', errorDetail: [],
      fromRoom: null, toRoom: null,
      leave: false,       // the route ends at the building's exit (the destination is in another building)
      nextBuilding: '',   // that other building's name
      segFloors: [],      // floor name for each route segment, in order
      totalMeters: 0,
      segIndex: 0,        // which segment (floor) we're walking
      s: 0,               // meters walked along the current segment
      hud: null,          // { kind: turn|straight|stairs|arrived, dir, distance, remaining, nextFloor }
      lookHint: null,     // 'left' | 'right' while the path ahead is outside the camera's view
      alignNote: '',      // short confirmation after "Align"
      motionOk: false,
      // This floor's registered AR anchor (one per floor, set by an admin),
      // or null if none exists yet — gates whether starting the guide
      // requires scanning it first. See begin()/startAnchorScan().
      floorAnchor: null,
      anchorScanned: false,
      scanningAnchor: false,
      anchorScanError: ''
    };
  },
  computed: {
    currentFloor() { return this.segFloors[this.segIndex] || ''; },
    // what the ribbon leads to: the room, or the building's exit when the room is in another building
    destName() { return this.leave ? 'the exit' : (this.toRoom ? this.toRoom.room_name : ''); },
    // the same trip on the animated floor plan (Student/journey.php)
    planUrl() { return 'journey.php' + location.search; },
    hasRoute() { return !!new URLSearchParams(location.search).get('to'); },
    // after the exit: the outside walking guide, aimed at the destination's building
    outsideUrl() { return this.toRoom && this.leave ? '../Public/guide-ar.php?to=' + this.toRoom.building_id + '&room=' + this.toRoom.id : '#'; }
  },
  async mounted() {
    try {
      await this.load();
    } catch (e) {
      this.fail("Something went wrong loading the route.", [String(e && e.message || e)]);
    }
  },
  beforeUnmount() { this.stopTracking(); this.stopAnchorScan(); },
  methods: {
    fail(message, detail = []) {
      this.error = message;
      this.errorDetail = detail;
      this.stage = 'error';
    },
    goBack() {
      if (history.length > 1) history.back();
      else location.href = 'manual-search.php';
    },

    // ---- Data: network first, offline cache as fallback (same as scan.js) ----
    async getRooms() {
      if (navigator.onLine) {
        try {
          const res = await fetch(API + 'rooms.php');
          const data = await res.json();
          if (data.success) { LamparaCache.setRooms(data.rooms); return data.rooms; }
        } catch (e) { /* fall through to cache */ }
      }
      return LamparaCache.getRooms();
    },
    async fetchBuildingGraph(buildingId) {
      if (navigator.onLine) {
        try {
          const res = await fetch(API + 'floor-plan-graph.php?building_id=' + buildingId);
          const data = await res.json();
          if (data.success) {
            const graph = { nodes: data.nodes, edges: data.edges };
            LamparaCache.setBuildingGraph(buildingId, graph);
            return graph;
          }
        } catch (e) { /* fall through to cache */ }
      }
      return LamparaCache.getBuildingGraph(buildingId) || { nodes: [], edges: [] };
    },
    // Every floor plan of the building (with calibration). Merged into the same
    // per-floor cache scan.js uses, keeping any already-downloaded image bytes.
    async fetchPlans(buildingId, graph, roomFloors) {
      if (navigator.onLine) {
        try {
          const res = await fetch(API + 'floor-plans.php?building_id=' + buildingId);
          const data = await res.json();
          if (data.success) {
            return data.plans.map((p) => {
              const existing = LamparaCache.getFloorPlan(buildingId, p.floor) || {};
              const keepImage = existing.imageDataUrl && existing.image_path === p.image_path;
              const merged = { ...existing, ...p, imageDataUrl: keepImage ? existing.imageDataUrl : null };
              LamparaCache.setFloorPlan(buildingId, p.floor, merged);
              return merged;
            });
          }
        } catch (e) { /* fall through to cache */ }
      }
      const floors = new Set([...graph.nodes.map((n) => n.floor), ...roomFloors]);
      return [...floors].map((f) => LamparaCache.getFloorPlan(buildingId, f)).filter(Boolean);
    },
    // Best-effort: keep the plan image bytes for offline mini-maps.
    async ensureImage(buildingId, plan) {
      if (plan.imageDataUrl) return;
      if (LamparaCache.workerHandlesImages()) { fetch('../../' + plan.image_path).catch(() => {}); return; } // the worker keeps the file
      try {
        plan.imageDataUrl = await LamparaCache.fetchImageAsDataUrl('../../' + plan.image_path);
        LamparaCache.setFloorPlan(buildingId, plan.floor, plan);
      } catch (e) { /* mini-map falls back to the image URL */ }
    },

    // The building's exit/entrance as a floor-plan point (see Js/Include/building-doors.js).
    async doorData(buildingId, kind) {
      let building = { id: buildingId };
      try { const d = await (await fetch(API + 'buildings.php')).json(); if (d.success) building = d.buildings.find((b) => String(b.id) === String(buildingId)) || building; } catch (e) { /* the entrance floor is then the lowest one */ }
      await BuildingDoors.load(API + 'building-doors.php');
      const graph = await this.fetchBuildingGraph(buildingId);
      const plans = await this.fetchPlans(buildingId, graph, []);
      return BuildingDoors.find(building, graph, plans, kind);
    },

    async load() {
      const q = new URLSearchParams(location.search);
      const fromId = q.get('from'), toId = q.get('to'), arrived = !!q.get('arrived');
      if (!toId || (!fromId && !arrived)) return this.fail('This link is missing a starting room or a destination.');

      const rooms = await this.getRooms();
      const to = rooms.find((r) => String(r.id) === String(toId));
      const from = fromId ? rooms.find((r) => String(r.id) === String(fromId)) : null;
      if (!to || (fromId && !from)) return this.fail("Couldn't find one of those rooms.");
      const placed = (r) => r.map_x !== null && r.map_y !== null;

      // Three trips: room -> room in one building; room -> this building's exit (the destination is in another building);
      // or from the destination building's door -> room (the visitor has just walked in, ?arrived=1).
      let bid, A, B, startRoom = from, endRoom = to;
      this.leave = false;
      if (from && String(from.building_id) !== String(to.building_id)) {
        if (!placed(from)) return this.fail("Your starting room doesn't have a marker on its floor plan yet.", ['An admin needs to place it on the floor plan (Register Room).']);
        bid = from.building_id;
        const bd = await this.doorData(bid, 'exit');
        if (!bd) return this.fail("This building's exit isn't set up yet.", ['An admin needs to draw walking paths on the entrance floor.']);
        A = { floor: from.floor, x: from.map_x, y: from.map_y }; B = bd;
        this.leave = true; this.nextBuilding = to.building_name;
      } else if (!from) {
        if (!placed(to)) return this.fail("This room doesn't have a marker on its floor plan yet.", ['An admin needs to place it on the floor plan (Register Room).']);
        bid = to.building_id;
        const bd = await this.doorData(bid, 'entry');
        if (!bd) return this.fail("This building's entrance isn't set up yet.", ['An admin needs to draw walking paths on the entrance floor.']);
        A = bd; B = { floor: to.floor, x: to.map_x, y: to.map_y };
        startRoom = { room_name: 'the entrance', room_number: '' };
      } else {
        if (!placed(from) || !placed(to)) return this.fail("These rooms don't have a marker on their floor plan yet.", ['An admin needs to place both rooms on the floor plan (Register Room).']);
        bid = from.building_id;
        A = { floor: from.floor, x: from.map_x, y: from.map_y }; B = { floor: to.floor, x: to.map_x, y: to.map_y };
      }

      const graph = await this.fetchBuildingGraph(bid);
      const plans = await this.fetchPlans(bid, graph, [A.floor, B.floor]);
      const fromPlan = plans.find((p) => p.floor === A.floor);
      const toPlan = plans.find((p) => p.floor === B.floor);
      if (!fromPlan || !toPlan) return this.fail("A floor plan is missing for this route.", ['An admin needs to upload the plan for each floor involved.']);
      if (!graph.edges.length) return this.fail("Walkable paths haven't been drawn for this building yet.");

      const segments = routeAcrossFloors(
        graph.nodes, graph.edges,
        { x: A.x, y: A.y }, fromPlan.id,
        { x: B.x, y: B.y }, toPlan.id
      );
      if (!segments) return this.fail("No connected walking route between these rooms yet.", ['An admin needs to finish drawing the paths (and any stairs links between floors).']);

      const segPlans = segments.map((seg) => plans.find((p) => p.id === seg.floorPlanId));
      const uncalibrated = segPlans.filter((p) => !IndoorNav.isCalibrated(p));
      if (uncalibrated.length) {
        return this.fail("The camera guide isn't set up for this route yet.",
          [...new Set(uncalibrated.map((p) => (p ? p.floor : 'a floor on the route')))].map((f) => `${f} needs calibrating (admin: Floor Calibration).`));
      }

      // Non-reactive: big arrays/objects the AR loop reads every 200 ms.
      this._paths = segments.map((seg, i) => IndoorNav.buildPath(seg.points, segPlans[i]));
      this._plans = segPlans;
      this._fromPlan = fromPlan;
      this._images = {};
      segPlans.forEach((p) => this.ensureImage(bid, p));

      try {
        const anchorRes = await fetch(API + 'qr-anchors.php?floor_plan_id=' + fromPlan.id);
        const anchorData = await anchorRes.json();
        this.floorAnchor = (anchorData.success && anchorData.anchors.length) ? anchorData.anchors[0] : null;
      } catch (e) { this.floorAnchor = null; }

      this.fromRoom = startRoom;
      this.toRoom = endRoom;
      this.segFloors = segPlans.map((p) => p.floor);
      this.totalMeters = Math.round(this._paths.reduce((sum, p) => sum + p.total, 0));
      this.stage = 'gate';
    },

    // ---- Start: tapped from the gate screen. If this floor has a registered
    // AR anchor QR, scanning it comes first (see startAnchorScan); otherwise
    // this goes straight to permissions + the AR scene, same as before. ----
    begin() {
      if (this.floorAnchor && !this.anchorScanned) { this.startAnchorScan(); return; }
      this.proceedToNav();
    },
    // Permissions need a user gesture, so they're requested here, right
    // before the AR scene actually mounts.
    async proceedToNav() {
      // iPhone only grants compass access from inside the tap, so ask for it before any await.
      const compass = window.LamparaLocarIndoor ? window.LamparaLocarIndoor.requestMotion() : null;
      try {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          this.motionOk = (await DeviceMotionEvent.requestPermission()) === 'granted';
        } else {
          this.motionOk = typeof DeviceMotionEvent !== 'undefined';
        }
      } catch (e) { this.motionOk = false; }
      if (compass) await compass;   // the compass-aligned camera just won't align without it
      // The LocAR module loads after this classic script; wait for it (the CDN may also be unreachable).
      if (!window.LamparaLocarIndoor) {
        await new Promise((resolve) => {
          window.addEventListener('lampara-locar-indoor-loaded', resolve, { once: true });
          setTimeout(resolve, 10000);
        });
      }
      if (!window.LamparaLocarIndoor) return this.fail("Couldn't open the camera view.", ['Check your connection and try again.']);
      try {
        const path = this._paths[this.segIndex];
        const here = IndoorNav.toScene(IndoorNav.pointAt(path, this.s), path.cal);
        await window.LamparaLocarIndoor.start({ eyeHeight: CAMERA_HEIGHT, fov: CAMERA_FOV_DEG, start: here });
      } catch (e) {
        return this.fail("Couldn't start the camera.", [String(e && e.message || e)]);
      }
      this.stage = 'nav';
      this.$nextTick(() => { this.buildMarker(); this.startTracking(); });
    },

    // ---- Position tracking ----
    startTracking() {
      // Always listen for steps. Whether the permission call said yes or not, a browser that
      // delivers motion readings should count steps, so the first real reading switches the
      // "Manual steps" chip to "Counting steps" instead of leaving the student on the +/- buttons.
      this._steps = new IndoorNav.StepDetector(() => this.advance(STEP_LENGTH));
      this._steps.start();
      this._motionProbe = (e) => {
        const a = e.accelerationIncludingGravity;
        if (a && a.x !== null && a.x !== undefined) {
          this.motionOk = true;
          window.removeEventListener('devicemotion', this._motionProbe);
        }
      };
      window.addEventListener('devicemotion', this._motionProbe);
      this._timer = setInterval(() => this.tick(), 200);
      const flow = () => { if (this._paths) this.drawMinimap(this._paths[this.segIndex]); this._mm = requestAnimationFrame(flow); };
      this._mm = requestAnimationFrame(flow);
      this.tick();
    },
    stopTracking() {
      if (this._timer) clearInterval(this._timer);
      if (this._mm) cancelAnimationFrame(this._mm);
      if (this._steps) this._steps.stop();
      if (this._motionProbe) window.removeEventListener('devicemotion', this._motionProbe);
      if (window.LamparaLocarIndoor && window.LamparaLocarIndoor.ready) window.LamparaLocarIndoor.stop();
    },
    advance(delta) {
      const path = this._paths[this.segIndex];
      this.s = Math.max(0, Math.min(path.total, this.s + delta));
      this.tick();
    },
    nudge(delta) { this.advance(delta); },
    nextCorner() {
      const path = this._paths[this.segIndex];
      this.s = IndoorNav.nextCornerDistance(path, this.s);
      this.tick();
    },
    // Scanning the floor's one registered AR anchor (set by an admin in
    // Register Building) sets the exact real starting position before the
    // AR scene ever mounts — this is the whole point: the walk starts from
    // a known point on the plan, not from wherever the camera happens to be
    // facing when AR opens. Uses its own short-lived camera preview (not
    // AR.js's feed, which doesn't exist yet at this stage).
    async startAnchorScan() {
      this.scanningAnchor = true;
      this.anchorScanError = '';
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        this._anchorStream = stream;
        await this.$nextTick();
        const video = this.$refs.anchorVideo;
        if (!video) throw new Error('no video element');
        video.srcObject = stream;
        await video.play();
        this._anchorScanLoop(video);
      } catch (e) {
        this.anchorScanError = "Couldn't open the camera.";
        this.scanningAnchor = false;
      }
    },
    stopAnchorScan() {
      this.scanningAnchor = false;
      if (this._anchorStream) { this._anchorStream.getTracks().forEach((t) => t.stop()); this._anchorStream = null; }
    },
    async _anchorScanLoop(video) {
      if (!this._anchorCanvas) this._anchorCanvas = document.createElement('canvas');
      const canvas = this._anchorCanvas;
      while (this.scanningAnchor) {
        if (video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = typeof jsQR !== 'undefined' ? jsQR(frame.data, frame.width, frame.height) : null;
          if (result && result.data) {
            this.stopAnchorScan();
            await this.handleAnchorCode(result.data);
            return;
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
    },
    // Only usable if it resolves to THIS floor's own registered anchor —
    // anything else (wrong floor, a stray QR from elsewhere) is rejected so
    // the walk can't start from a position that isn't actually where the
    // student is standing.
    async handleAnchorCode(raw) {
      let code = raw;
      try { const u = new URL(raw); code = u.searchParams.get('qr') || raw; } catch (e) { /* plain code, not a URL */ }
      try {
        const res = await fetch(API + 'qr-anchors.php?code=' + encodeURIComponent(code));
        const data = await res.json();
        if (!data.success || !this._fromPlan || data.floor_plan_id !== this._fromPlan.id) {
          this.anchorScanError = "That's not this floor's anchor QR.";
          return;
        }
        const path = this._paths[0];
        this.s = IndoorNav.snapToPlanPoint(path, { x: data.x, y: data.y }).s;
        this.anchorScanned = true;
        this.proceedToNav();
      } catch (e) {
        this.anchorScanError = 'Could not look up that QR code.';
      }
    },
    skipAnchorScan() {
      this.anchorScanned = true;
      this.proceedToNav();
    },
    // The next floor you actually have to walk on. A floor the route merely
    // passes through (you arrive and leave by the same stairwell, ~0 m of
    // walking) is skipped, so the prompt says "stairs to 3rd Floor" once instead
    // of asking you to confirm the 2nd floor and then immediately the 3rd.
    nextWalkedIndex(from) {
      let i = from + 1;
      while (i < this._paths.length - 1 && this._paths[i].total <= ARRIVE_METERS) i++;
      return Math.min(i, this._paths.length - 1);
    },
    confirmFloor() {
      if (this.segIndex >= this._paths.length - 1) return;
      this.segIndex = this.nextWalkedIndex(this.segIndex);
      this.s = 0;
      this.buildMarker();
      this.tick(true);
    },

    // The direction the camera is looking, as a compass bearing in the scene (0 = scene north), or
    // null when it can't be told (no camera yet, or the phone is pointing straight up or down).
    cameraHeading() {
      const o = window.__iaHeadingOverride;           // lets tests drive the heading
      if (typeof o === 'number') return o;
      const eng = window.LamparaLocarIndoor;
      return eng && eng.ready ? eng.heading() : null;
    },
    // Bearing (scene north = 0) of the stretch of path just ahead of you.
    pathHeading(ahead) {
      for (let i = 1; i < ahead.length; i++) {
        const dx = ahead[i].x - ahead[0].x, dz = ahead[i].y - ahead[0].y;
        if (Math.hypot(dx, dz) > 0.5) return (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
      }
      return null;
    },
    // Compasses are often 20-40 degrees off indoors, which turns the whole drawing. Face along the
    // route (the way the green path should run), tap Align, and the plan is rotated to match.
    alignToPath() {
      const path = this._paths && this._paths[this.segIndex];
      const heading = this.cameraHeading();
      if (!path || heading === null) { this.alignNote = 'Hold the phone up, facing along the hallway, then try again.'; return; }
      const ahead = IndoorNav.aheadScene(path, this.s, AHEAD_METERS);
      const route = this.pathHeading(ahead);
      if (route === null) { this.alignNote = 'You are at the end of this stretch. Align where the path continues.'; return; }
      const delta = ((heading - route + 540) % 360) - 180;
      this._paths.forEach((p) => { p.cal = { ...p.cal, north_offset: p.cal.north_offset + delta }; });
      this._plans = this._plans.map((pl, i) => ({ ...pl, north_offset: this._paths[i].cal.north_offset }));
      this.alignNote = 'Aligned (turned the map ' + Math.round(Math.abs(delta)) + '° ' + (delta >= 0 ? 'clockwise' : 'counter-clockwise') + ').';
      this.buildMarker();
      this.tick(true);
      setTimeout(() => { this.alignNote = ''; }, 3500);
    },
    // Tells the student which way to turn when the path ahead is outside the camera's view, so the
    // ribbon is never "somewhere else" with no explanation.
    updateLookHint(ahead) {
      const cam = this.cameraHeading(), route = this.pathHeading(ahead);
      if (cam === null || route === null) { this.lookHint = null; return; }
      const rel = ((route - cam + 540) % 360) - 180;           // + = path is to your right
      const limit = this.lookHint ? 35 : 48;                     // wider to keep it than to show it: no flicker
      this.lookHint = Math.abs(rel) > limit ? (rel > 0 ? 'right' : 'left') : null;
    },

    // One refresh: move the camera along the route, redraw the ribbon, update
    // the banner and the mini-map. Runs at 5 Hz and after every step.
    tick(jump) {
      const eng = window.LamparaLocarIndoor;
      if (!eng || !eng.ready || !this._paths) return;
      const path = this._paths[this.segIndex];

      const here = IndoorNav.toScene(IndoorNav.pointAt(path, this.s), path.cal);
      eng.setPosition(here.x, here.y, jump === true);

      const remaining = path.total - this.s;
      const ahead = IndoorNav.aheadScene(path, this.s, AHEAD_METERS);
      eng.setRoute(ahead.length >= 2 && remaining > ARRIVE_METERS ? CampusRoute.smooth(ahead, 1.5) : null);

      this.updateHud(path, remaining);
      if (remaining > ARRIVE_METERS) this.updateLookHint(ahead); else this.lookHint = null;
      this.drawMinimap(path);
    },
    updateHud(path, remaining) {
      const isLast = this.segIndex === this._paths.length - 1;
      const laterMeters = this._paths.slice(this.segIndex + 1).reduce((sum, p) => sum + p.total, 0);
      if (remaining <= ARRIVE_METERS) {
        if (isLast && this.leave && !this._leaveSaved) { this._leaveSaved = true; LamparaTrip.set({ to: String(this.toRoom.id), from: String(new URLSearchParams(location.search).get('from') || ''), arrived: 0, step: 1, label: this.toRoom.room_name + ' (' + this.toRoom.building_name + ')' }); }
        this.hud = isLast
          ? { kind: 'arrived' }
          : { kind: 'stairs', nextFloor: this.segFloors[this.nextWalkedIndex(this.segIndex)] };
        return;
      }
      const turn = IndoorNav.nextTurn(path, this.s);
      this.hud = turn.dir
        ? { kind: 'turn', dir: turn.dir, distance: Math.round(turn.distance), remaining: Math.round(remaining + laterMeters) }
        : { kind: 'straight', remaining: Math.round(remaining + laterMeters) };
    },

    // Pin at the end of the current segment: the destination on the last floor,
    // the stairs on earlier ones.
    buildMarker() {
      const eng = window.LamparaLocarIndoor;
      if (!eng || !eng.ready) return;
      const path = this._paths[this.segIndex];
      const end = IndoorNav.toScene(path.pts[path.pts.length - 1], path.cal);
      const isLast = this.segIndex === this._paths.length - 1;
      eng.setMarker(end, isLast ? (this.leave ? 'Exit' : this.toRoom.room_name) : `Stairs to ${this.segFloors[this.nextWalkedIndex(this.segIndex)]}`);
    },

    // Small circular map: the floor plan, rotated so where you're facing is up,
    // with the route drawn on it. Heading comes from the AR camera itself.
    drawMinimap(path) {
      const canvas = this.$refs.minimap;
      const bearingTrue = this.cameraHeading();
      if (!canvas || bearingTrue === null) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      const headingPlan = (bearingTrue - path.cal.north_offset) * Math.PI / 180;

      const plan = this._plans[this.segIndex];
      const pos = IndoorNav.pointAt(path, this.s);

      ctx.save();
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, W, H);
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-headingPlan);
      ctx.scale(MAP_PX_PER_METER, MAP_PX_PER_METER);
      ctx.translate(-pos.x, -pos.y);

      let img = this._images[plan.id];
      if (!img) {
        img = new Image();
        img.src = plan.imageDataUrl || ('../../' + plan.image_path);
        this._images[plan.id] = img;
      }
      if (img.complete && img.naturalWidth) {
        ctx.globalAlpha = 0.55;
        ctx.drawImage(img, 0, 0, 100 * plan.meters_per_unit_x, 100 * plan.meters_per_unit_y);
        ctx.globalAlpha = 1;
      }
      // the route as a flowing broken line, like on the floor-plan screen
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.setLineDash([1.7, 1.9]);
      ctx.lineDashOffset = -(Date.now() / 1000) * 3;
      const trace = () => { ctx.beginPath(); path.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); };
      ctx.strokeStyle = '#161850';
      ctx.lineWidth = 1.5;
      trace();
      ctx.strokeStyle = '#ffd100';
      ctx.lineWidth = 0.85;
      trace();
      ctx.setLineDash([]);
      ctx.restore();

      // You: a fixed arrow in the centre (the map turns around it).
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d4ab00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(W / 2, H / 2 - 16);
      ctx.lineTo(W / 2 + 11, H / 2 + 12);
      ctx.lineTo(W / 2, H / 2 + 6);
      ctx.lineTo(W / 2 - 11, H / 2 + 12);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  }
}).mount('#app');
