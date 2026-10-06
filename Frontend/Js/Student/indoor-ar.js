const { createApp } = Vue;
const API = '../../../Backend/api/';

const STEP_LENGTH = 0.7;      // meters per detected step — a rough average stride
const AHEAD_METERS = 14;      // how much of the path ahead the ribbon draws
const ARRIVE_METERS = 1.5;    // this close to a segment's end counts as reached
const CAMERA_HEIGHT = 1.6;    // a-camera default; the ribbon's ground plane is set relative to it
const MAP_PX_PER_METER = 6;   // mini-map zoom (240px canvas => ~20 m across)

createApp({
  data() {
    return {
      stage: 'loading', // loading | error | gate | nav
      error: '', errorDetail: [],
      fromRoom: null, toRoom: null,
      segFloors: [],      // floor name for each route segment, in order
      totalMeters: 0,
      segIndex: 0,        // which segment (floor) we're walking
      s: 0,               // meters walked along the current segment
      hud: null,          // { kind: turn|straight|stairs|arrived, dir, distance, remaining, nextFloor }
      lookHint: null,     // 'left' | 'right' while the path ahead is outside the camera's view
      alignNote: '',      // short confirmation after "Align"
      motionOk: false
    };
  },
  computed: {
    currentFloor() { return this.segFloors[this.segIndex] || ''; }
  },
  async mounted() {
    try {
      await this.load();
    } catch (e) {
      this.fail("Something went wrong loading the route.", [String(e && e.message || e)]);
    }
  },
  beforeUnmount() { this.stopTracking(); },
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

    async load() {
      const q = new URLSearchParams(location.search);
      const fromId = q.get('from'), toId = q.get('to');
      if (!fromId || !toId) return this.fail('This link is missing a starting room or a destination.');

      const rooms = await this.getRooms();
      const from = rooms.find((r) => String(r.id) === String(fromId));
      const to = rooms.find((r) => String(r.id) === String(toId));
      if (!from || !to) return this.fail("Couldn't find one of those rooms.");
      if (from.building_id !== to.building_id) {
        return this.fail('Indoor AR works inside one building.', [`Head to ${to.building_name} first, then start again from a room there.`]);
      }
      if (from.map_x === null || from.map_y === null || to.map_x === null || to.map_y === null) {
        return this.fail("These rooms don't have a marker on their floor plan yet.", ['An admin needs to place both rooms on the floor plan (Register Room).']);
      }

      const graph = await this.fetchBuildingGraph(from.building_id);
      const plans = await this.fetchPlans(from.building_id, graph, [from.floor, to.floor]);
      const fromPlan = plans.find((p) => p.floor === from.floor);
      const toPlan = plans.find((p) => p.floor === to.floor);
      if (!fromPlan || !toPlan) return this.fail("A floor plan is missing for this route.", ['An admin needs to upload the plan for each floor involved.']);
      if (!graph.edges.length) return this.fail("Walkable paths haven't been drawn for this building yet.");

      const segments = routeAcrossFloors(
        graph.nodes, graph.edges,
        { x: from.map_x, y: from.map_y }, fromPlan.id,
        { x: to.map_x, y: to.map_y }, toPlan.id
      );
      if (!segments) return this.fail("No connected walking route between these rooms yet.", ['An admin needs to finish drawing the paths (and any stairs links between floors).']);

      const segPlans = segments.map((seg) => plans.find((p) => p.id === seg.floorPlanId));
      const uncalibrated = segPlans.filter((p) => !IndoorNav.isCalibrated(p));
      if (uncalibrated.length) {
        return this.fail("AR directions aren't set up for this route yet.",
          [...new Set(uncalibrated.map((p) => (p ? p.floor : 'a floor on the route')))].map((f) => `${f} needs calibrating (admin: Floor Calibration).`));
      }

      // Non-reactive: big arrays/objects the AR loop reads every 200 ms.
      this._paths = segments.map((seg, i) => IndoorNav.buildPath(seg.points, segPlans[i]));
      this._plans = segPlans;
      this._images = {};
      segPlans.forEach((p) => this.ensureImage(from.building_id, p));

      this.fromRoom = from;
      this.toRoom = to;
      this.segFloors = segPlans.map((p) => p.floor);
      this.totalMeters = Math.round(this._paths.reduce((sum, p) => sum + p.total, 0));
      this.stage = 'gate';
    },

    // ---- Start: permissions need a user gesture, so they're requested here ----
    async begin() {
      try {
        if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
          this.motionOk = (await DeviceMotionEvent.requestPermission()) === 'granted';
        } else {
          this.motionOk = typeof DeviceMotionEvent !== 'undefined';
        }
      } catch (e) { this.motionOk = false; }
      try {
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
          await DeviceOrientationEvent.requestPermission();
        }
      } catch (e) { /* the compass-aligned camera just won't align without it */ }
      this.stage = 'nav';
      this.$nextTick(() => this.setupScene());
    },

    setupScene() {
      const scene = this.$refs.arScene;
      if (!scene) return;
      const init = () => {
        this.forceArSize();
        window.addEventListener('resize', this.forceArSize);
        window.addEventListener('arjs-video-loaded', () => setTimeout(this.forceArSize, 50));
        setTimeout(this.forceArSize, 800);
        setTimeout(this.forceArSize, 2000);
        // Same fix as the outdoor guide: re-assert the render size every frame,
        // since AR.js keeps resetting it.
        if (!AFRAME.components['force-ar-size-every-frame']) {
          AFRAME.registerComponent('force-ar-size-every-frame', { tick: () => window.__iaForceSize && window.__iaForceSize() });
        }
        window.__iaForceSize = () => this.forceArSize();
        scene.setAttribute('force-ar-size-every-frame', '');

        // Phones: compass-aligned camera rotation (the same controls the outdoor
        // guide gets through gps-new-camera — but with no GPS involved at all).
        // Desktop keeps the default mouse look-around for testing.
        const camEl = scene.querySelector('#ia-cam');
        const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        camEl.setAttribute('look-controls-enabled', String(!mobile));
        if (mobile) camEl.setAttribute('arjs-device-orientation-controls', 'true');

        this._ribbon = ArRibbon.create(scene);
        this.buildMarker();
        this.startTracking();
      };
      if (scene.hasLoaded) init(); else scene.addEventListener('loaded', init, { once: true });
    },
    forceArSize() {
      const scene = this.$refs.arScene;
      if (!scene || !scene.renderer) return;
      const vv = window.visualViewport;
      const w = vv ? vv.width : window.innerWidth;
      const h = vv ? vv.height : window.innerHeight;
      scene.renderer.setSize(w, h, true);
      if (scene.camera) { scene.camera.aspect = w / h; scene.camera.updateProjectionMatrix(); }
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
      this.tick();
    },
    stopTracking() {
      if (this._timer) clearInterval(this._timer);
      if (this._steps) this._steps.stop();
      if (this._motionProbe) window.removeEventListener('devicemotion', this._motionProbe);
      if (this._ribbon) this._ribbon.remove();
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
      this.tick();
    },

    // The direction the camera is looking, as a compass bearing in the scene (0 = scene north), or
    // null when it can't be told (no camera yet, or the phone is pointing straight up or down).
    cameraHeading() {
      const o = window.__iaHeadingOverride;           // lets tests drive the heading
      if (typeof o === 'number') return o;
      const scene = this.$refs.arScene;
      if (!scene || !scene.camera) return null;
      const dir = new AFRAME.THREE.Vector3();
      scene.camera.getWorldDirection(dir);
      if (Math.hypot(dir.x, dir.z) < 0.25) return null;
      return (Math.atan2(dir.x, -dir.z) * 180 / Math.PI + 360) % 360;
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
      this.tick();
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
    tick() {
      const scene = this.$refs.arScene;
      if (!scene || !this._paths) return;
      const camEl = scene.querySelector('#ia-cam');
      if (!camEl || !camEl.object3D) return;
      const path = this._paths[this.segIndex];

      const here = IndoorNav.toScene(IndoorNav.pointAt(path, this.s), path.cal);
      camEl.object3D.position.set(here.x, CAMERA_HEIGHT, here.y);

      const remaining = path.total - this.s;
      const ahead = IndoorNav.aheadScene(path, this.s, AHEAD_METERS);
      if (ahead.length >= 2 && remaining > ARRIVE_METERS) this._ribbon.update(CampusRoute.smooth(ahead, 1.5));
      else this._ribbon.remove();

      this.updateHud(path, remaining);
      if (remaining > ARRIVE_METERS) this.updateLookHint(ahead); else this.lookHint = null;
      this.drawMinimap(scene, path);
    },
    updateHud(path, remaining) {
      const isLast = this.segIndex === this._paths.length - 1;
      const laterMeters = this._paths.slice(this.segIndex + 1).reduce((sum, p) => sum + p.total, 0);
      if (remaining <= ARRIVE_METERS) {
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
      const scene = this.$refs.arScene;
      if (!scene) return;
      if (this._marker && this._marker.parentNode) this._marker.parentNode.removeChild(this._marker);
      const path = this._paths[this.segIndex];
      const end = IndoorNav.toScene(path.pts[path.pts.length - 1], path.cal);
      const isLast = this.segIndex === this._paths.length - 1;

      const root = document.createElement('a-entity');
      root.setAttribute('position', `${end.x} 0.2 ${end.y}`);

      const pin = document.createElement('a-entity');
      pin.setAttribute('animation__bob', 'property: position; dir: alternate; dur: 1200; easing: easeInOutQuad; loop: true; from: 0 1.5 0; to: 0 1.8 0');
      const cone = document.createElement('a-cone');
      cone.setAttribute('radius-bottom', '0.22');
      cone.setAttribute('radius-top', '0');
      cone.setAttribute('height', '0.5');
      cone.setAttribute('segments-radial', '6');
      cone.setAttribute('rotation', '180 0 0');
      cone.setAttribute('material', 'color: #10b981; emissive: #10b981; emissiveIntensity: 0.5; shader: standard');
      pin.appendChild(cone);

      const label = document.createElement('a-text');
      label.setAttribute('value', isLast ? this.toRoom.room_name : `Stairs to ${this.segFloors[this.nextWalkedIndex(this.segIndex)]}`);
      label.setAttribute('align', 'center');
      label.setAttribute('width', '3');
      label.setAttribute('color', '#ffffff');
      label.setAttribute('position', '0 0.55 0');
      label.setAttribute('look-at', '#ia-cam');
      pin.appendChild(label);

      root.appendChild(pin);
      scene.appendChild(root);
      this._marker = root;
    },

    // Small circular map: the floor plan, rotated so where you're facing is up,
    // with the route drawn on it. Heading comes from the AR camera itself.
    drawMinimap(scene, path) {
      const canvas = this.$refs.minimap;
      if (!canvas || !scene.camera) return;
      const ctx = canvas.getContext('2d');
      const W = canvas.width, H = canvas.height;
      const THREE = AFRAME.THREE;
      const dir = new THREE.Vector3();
      scene.camera.getWorldDirection(dir);
      const bearingTrue = Math.atan2(dir.x, -dir.z) * 180 / Math.PI;
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
      ctx.strokeStyle = '#34d399';
      ctx.lineWidth = 2.2 / MAP_PX_PER_METER * 2;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      path.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.restore();

      // You: a fixed arrow in the centre (the map turns around it).
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#059669';
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
