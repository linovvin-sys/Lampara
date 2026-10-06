const { createApp } = Vue;
const API = '../../../Backend/api/';

// Data flow: `basePlans` is what the server last said; `plans` is that with any
// calibration saved offline laid on top (AdminOffline.overlayPlans). Saving goes
// through AdminOffline.run(): to the server when it's reachable, otherwise into the
// pending list to be synced later with the admin's approval. The compass reading
// itself needs no connection.

function safeGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
const toRad = (d) => d * Math.PI / 180;
// Meters and compass bearing (clockwise from north) from fix a to fix b.
function geoDistanceBearing(a, b) {
  const R = 6371000, p1 = toRad(a.lat), p2 = toRad(b.lat), dl = toRad(b.lng - a.lng);
  const h = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const dist = 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
  return { dist, bearing: (Math.atan2(y, x) * 180 / Math.PI + 360) % 360 };
}

createApp({
  data() {
    return {
      baseBuildings: [], buildings: [], buildingId: '',
      basePlans: [], plans: [], planId: '', plansNote: '',
      pts: [],                 // up to two {x, y} plan points (percent), A then B
      imgSize: { w: 0, h: 0 }, // natural pixel size of the plan image
      distance: null,          // real meters between A and B
      bearing: null,           // real compass bearing (deg) walking A -> B
      compassOn: false, liveHeading: null,
      saving: false,
      // Lock: while on, taps on the plan can't place, replace or clear the two points.
      // "Measure it for me": walk from A to B (steps + compass) or mark A and B with GPS.
      measure: 'walk',         // 'walk' | 'gps'
      walking: false, steps: 0, walkNote: '',
      stride: Number(safeGet('lampara_stride')) || 0.7,   // meters per step
      gps: { a: null, b: null }, gpsBusy: '', gpsNote: '',
      undoPts: null,           // the points before the last Clear / Remove, for the Undo button
      locked: EditorLock.get('calibration'),
      lockIcon: EditorLock.icon
    };
  },
  computed: {
    plan() { return this.plans.find((p) => String(p.id) === String(this.planId)) || null; },
    // The side list: the two points, named like everywhere else (Point A, Point B).
    pointList() {
      return this.pts.map((p, i) => ({ i, name: 'Point ' + PointNames.label(i), short: PointNames.label(i), x: p.x, y: p.y }));
    },
    // What the numbers work out to — shown before saving so a typo is obvious.
    preview() {
      if (this.pts.length < 2 || !this.distance || this.distance <= 0 || this.bearing === null || this.bearing === '') return null;
      const { w, h } = this.imgSize;
      if (!w || !h) return null;
      const [a, b] = this.pts;
      // A->B in image pixels (y down). Its angle from plan-up, clockwise, is the
      // same angle in real space because the image scales uniformly.
      const dxPx = (b.x - a.x) / 100 * w, dyPx = (b.y - a.y) / 100 * h;
      const pxLen = Math.hypot(dxPx, dyPx);
      if (pxLen < 5) return null;
      const planBearing = Math.atan2(dxPx, -dyPx) * 180 / Math.PI;
      const metersPerPx = this.distance / pxLen;
      const north = (((this.bearing - planBearing) % 360) + 360) % 360;
      return {
        widthM: metersPerPx * w, heightM: metersPerPx * h,
        mx: metersPerPx * w / 100, my: metersPerPx * h / 100,
        north
      };
    }
  },
  async mounted() {
    AdminOffline.onSynced(async () => { await this.loadBuildings(); await this.loadPlans(true); });
    AdminOffline.onChange(() => { this.buildings = AdminOffline.overlayBuildings(this.baseBuildings); this.plans = AdminOffline.overlayPlans(this.basePlans); });
    await this.loadBuildings();
  },
  beforeUnmount() { this.stopCompass(); this.stopSteps(); },
  methods: {
    isCalibrated(p) {
      return !!p && p.north_offset !== null && p.meters_per_unit_x > 0 && p.meters_per_unit_y > 0;
    },
    async loadBuildings() {
      try {
        const res = await fetch(API + 'buildings.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.baseBuildings = data.buildings;
      } catch (e) { /* offline with no saved copy */ }
      this.buildings = AdminOffline.overlayBuildings(this.baseBuildings);
    },
    async loadPlans(keepSelection) {
      // Called from the building <select> with the DOM event as its argument, so only
      // an explicit `true` means "refresh but keep the chosen floor".
      keepSelection = keepSelection === true;
      const keep = keepSelection ? this.planId : '';
      this.basePlans = []; this.plans = []; this.plansNote = '';
      if (!keepSelection) { this.planId = ''; this.resetInputs(); }
      if (!this.buildingId) return;
      // A building made offline can't have floor plans yet.
      if (AdminOffline.isTemp(this.buildingId)) { this.plansNote = "This building hasn't synced yet, so it has no floor plans."; return; }
      try {
        const res = await fetch(API + 'floor-plans.php?building_id=' + this.buildingId, { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.basePlans = data.plans;
      } catch (e) {
        this.plansNote = "Floor plans aren't available offline for this building. Open it once while connected to keep a copy.";
      }
      this.plans = AdminOffline.overlayPlans(this.basePlans);
      if (keep) this.planId = keep;
    },
    pickPlan() { this.resetInputs(); },
    resetInputs() {
      this.cancelWalk();
      this.gps = { a: null, b: null }; this.gpsNote = ''; this.walkNote = '';
      this.undoPts = null;
      this.pts = []; this.distance = null; this.bearing = null; this.imgSize = { w: 0, h: 0 };
      this.stopCompass();
    },
    toggleLock() {
      this.locked = !this.locked;
      EditorLock.set('calibration', this.locked);
    },
    // Drag A or B to a new spot (mouse, touch or pen). A press that barely moves does nothing.
    startDrag(i, e) {
      if (this.locked || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const el = e.currentTarget;
      const rect = el.parentElement.getBoundingClientRect();
      const from = { x: e.clientX, y: e.clientY };
      let moved = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* window listeners below still work */ }
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 5) return;
        if (!moved) { moved = true; this.undoPts = this.pts.map((p) => ({ ...p })); }   // Undo puts it back
        this.pts[i] = {
          x: Math.max(0, Math.min(100, (ev.clientX - rect.left) / rect.width * 100)),
          y: Math.max(0, Math.min(100, (ev.clientY - rect.top) / rect.height * 100))
        };
      };
      const up = () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    clearPoints() {
      if (this.locked || !this.pts.length) return;
      this.undoPts = this.pts.map((p) => ({ ...p }));
      this.pts = [];
    },
    removePoint(i) {
      if (this.locked) return;
      this.undoPts = this.pts.map((p) => ({ ...p }));
      this.pts = this.pts.filter((_, k) => k !== i);
    },
    undoClear() {
      if (!this.undoPts) return;
      this.pts = this.undoPts;
      this.undoPts = null;
    },
    onImgLoad(e) { this.imgSize = { w: e.target.naturalWidth, h: e.target.naturalHeight }; },
    tapPlan(e) {
      if (this.locked) return;   // locked: the plan ignores taps
      const rect = e.currentTarget.getBoundingClientRect();
      const p = { x: (e.clientX - rect.left) / rect.width * 100, y: (e.clientY - rect.top) / rect.height * 100 };
      // Third tap starts over rather than silently moving one of the two points (Undo brings them back).
      if (this.pts.length >= 2) this.undoPts = this.pts.map((q) => ({ ...q }));
      this.pts = this.pts.length >= 2 ? [p] : [...this.pts, p];
    },

    // First tap starts listening (and asks iOS for permission); the second tap
    // freezes the current reading into the bearing field.
    async toggleCompass() {
      if (!this.compassOn) {
        try {
          if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
            const r = await DeviceOrientationEvent.requestPermission();
            if (r !== 'granted') throw new Error('denied');
          }
        } catch (err) {
          Swal.fire({ icon: 'info', title: 'Compass unavailable', text: 'This device/browser did not allow compass access. Type the bearing in instead.' });
          return;
        }
        this.startCompass();
        return;
      }
      if (this.liveHeading !== null) this.bearing = Math.round(this.liveHeading);
      this.stopCompass();
    },
    startCompass() {
      this.compassOn = true;
      this.liveHeading = null;
      this._onOrientation = (e) => {
        // webkitCompassHeading is already true-north on iOS; on Android the
        // absolute event's alpha counts counter-clockwise, so flip it.
        const raw = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.alpha != null ? (360 - e.alpha) % 360 : null);
        if (raw === null) return;
        if (this.liveHeading === null) { this.liveHeading = raw; return; }
        let delta = ((raw - this.liveHeading + 540) % 360) - 180;
        this.liveHeading = (this.liveHeading + delta * 0.2 + 360) % 360; // smooth the jitter
      };
      this._eventName = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
      window.addEventListener(this._eventName, this._onOrientation, true);
    },
    stopCompass() {
      if (this._onOrientation) window.removeEventListener(this._eventName, this._onOrientation, true);
      this._onOrientation = null;
      this.compassOn = false;
    },

    // ---- measure by walking: stand at A, walk to B ----
    setStride() {
      if (!(this.stride > 0.2 && this.stride < 1.5)) this.stride = 0.7;
      safeSet('lampara_stride', String(this.stride));
    },
    async startWalk() {
      if (this.pts.length < 2 || this.walking) return;
      this.walkNote = '';
      if (typeof DeviceMotionEvent === 'undefined' || !('ondevicemotion' in window)) {
        this.walkNote = "This device can't count steps. Open this page on your phone, or type the distance in.";
        return;
      }
      try {                                    // iOS asks for both permissions, from a tap
        if (typeof DeviceMotionEvent.requestPermission === 'function' && (await DeviceMotionEvent.requestPermission()) !== 'granted') throw new Error('motion');
        if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function' && (await DeviceOrientationEvent.requestPermission()) !== 'granted') throw new Error('compass');
      } catch (err) {
        this.walkNote = 'Motion and compass access was not allowed, so the walk can not be measured. Type the values in instead.';
        return;
      }
      this.setStride();
      this.steps = 0; this._headings = [];
      this.stopCompass(); this.startCompass();
      this._steps = new IndoorNav.StepDetector(() => {
        this.steps++;
        if (this.liveHeading !== null) this._headings.push(this.liveHeading);   // direction of travel at each step
      });
      this._steps.start();
      this.walking = true;
    },
    stopSteps() {
      if (this._steps) { this._steps.stop(); this._steps = null; }
    },
    cancelWalk() {
      this.stopSteps();
      if (this.walking) this.stopCompass();
      this.walking = false; this.steps = 0;
    },
    finishWalk() {
      if (!this.walking) return;
      const steps = this.steps, headings = this._headings || [];
      this.cancelWalk();
      if (steps < 3 || !headings.length) {
        this.walkNote = 'Not enough steps were detected. Walk at a normal pace from A to B, holding the phone flat with its top edge pointing the way you walk.';
        return;
      }
      // average direction of travel (circular mean, so 359 and 1 give 0, not 180)
      const sx = headings.reduce((s, h) => s + Math.sin(toRad(h)), 0), cy = headings.reduce((s, h) => s + Math.cos(toRad(h)), 0);
      this.bearing = Math.round((Math.atan2(sx, cy) * 180 / Math.PI + 360) % 360);
      this.distance = Math.round(steps * this.stride * 10) / 10;
      this.walkNote = `Measured ${steps} steps (about ${this.distance} m) heading ${this.bearing}°. Check it against a tape or your own pacing, and adjust the fields below if it is off.`;
    },

    // ---- measure with GPS: mark A and B where you stand (only trustworthy outdoors / in big open halls) ----
    grabFix(which) {
      if (!navigator.geolocation) { this.gpsNote = "This device has no location service. Type the values in instead."; return; }
      this.gpsBusy = which; this.gpsNote = '';
      let best = null;
      const id = navigator.geolocation.watchPosition((p) => {
        if (!best || p.coords.accuracy < best.acc) best = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      }, () => {}, { enableHighAccuracy: true, maximumAge: 0 });
      setTimeout(() => {
        navigator.geolocation.clearWatch(id);
        this.gpsBusy = '';
        if (!best) { this.gpsNote = 'No location fix. Move near a window or outside and try again.'; return; }
        this.gps[which] = best;
        this.applyGps();
      }, 6000);
    },
    applyGps() {
      const { a, b } = this.gps;
      if (!a || !b) return;
      const r = geoDistanceBearing(a, b);
      const acc = Math.max(a.acc, b.acc);
      this.distance = Math.round(r.dist * 10) / 10;
      this.bearing = Math.round(r.bearing);
      this.gpsNote = `A is accurate to about ${Math.round(a.acc)} m and B to ${Math.round(b.acc)} m. ` +
        (r.dist < acc * 4 ? 'The two points are too close together for this accuracy, so the result is probably wrong. Use "Walk it", or pick points further apart.' : 'Check the result against a tape or your own pacing.');
    },
    clearGps() { this.gps = { a: null, b: null }; this.gpsNote = ''; },

    async save() {
      if (!this.preview || !this.plan) return;
      this.saving = true;
      const values = { north_offset: this.preview.north, meters_per_unit_x: this.preview.mx, meters_per_unit_y: this.preview.my };
      const seen = this.basePlans.find((p) => String(p.id) === String(this.plan.id));
      const op = {
        type: 'calibration.set',
        payload: { plan_id: this.plan.id, ...values, base_updated_at: seen ? seen.updated_at : null },
        label: `Calibrated ${this.plan.floor} (${(this.buildings.find((b) => String(b.id) === String(this.buildingId)) || {}).name || 'building'})`
      };
      try {
        const out = await AdminOffline.run(op, async () => {
          const data = await AdminOffline.fetchJson('floor-plans.php?action=calibrate', { method: 'POST', body: JSON.stringify({ id: this.plan.id, ...values }) });
          if (!data.success) throw new Error(data.error || 'Could not save');
          return data;
        });
        if (out.queued) {
          this.plans = AdminOffline.overlayPlans(this.basePlans);
          Swal.fire({ icon: 'info', title: 'Saved on this device', text: "It will be offered for sync when you're back online.", timer: 2600, showConfirmButton: false });
        } else {
          await this.loadPlans(true); // pick up the new saved values and timestamp
          Swal.fire({ icon: 'success', title: 'Calibration saved', timer: 1400, showConfirmButton: false });
        }
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.message || 'Could not save' });
      } finally {
        this.saving = false;
      }
    }
  }
}).mount('#app');
