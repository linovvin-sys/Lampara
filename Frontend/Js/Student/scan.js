const { createApp } = Vue;

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
// Generous vs. the outdoor guide's 300m — GPS drifts more once you're
// actually inside a building, and this only needs to rule out "clearly not
// on campus at all," not pinpoint which building you're in.
const CAMPUS_RADIUS_METERS = 500;

createApp({
  data() {
    return {
      locCheck: null, locDeclined: false,
      stage: 'scan', scanning: false, manualNumber: '', room: null, reported: false,
      pickRooms: [], altRooms: [], cameraReady: false, cameraFailed: false, detectedNumber: null, aiReadFailed: false, cameraStream: null,
      sceneHtml: window.LamparaPixelScene ? LamparaPixelScene.html({ walker: false, moon: false, stars: 36, seed: 19 }) : '',
      hasMusic: !!window.LamparaAudio,
      musicOn: window.LamparaAudio ? LamparaAudio.enabled() : false,
      onCampus: null, // null = still checking, true/false once GPS resolves
      liveBox: null, // screen-space {left, top, width, height} of the currently detected text, or null
      destQuery: '', destResults: [], destination: null, destResultsTruncated: false,
      // Entered via Manual Search (?room=<id>) rather than an actual camera
      // scan — the tapped room is the DESTINATION, not "where you are", so
      // the whole "You're at X" scanned framing is wrong here. Swaps the
      // result screen to "where are you now, then here's the route" instead.
      planningMode: false,
      // The visitor already said "inside" on the first question (Student/where.php): do not offer "I am still outside" again.
      saidInside: (() => { try { return sessionStorage.getItem('lampara_where') === 'inside'; } catch (e) { return false; } })(),
      originQuery: '', originResults: [], nearbyRooms: [], nearbyLabel: '', nearbyTitle: 'Rooms on',
      // Keyed by 'room' / 'destination' -> the floor_plans row for that
      // room's building+floor, or null once we've checked and there isn't
      // one. Only ever populated once a destination is picked — no map to
      // show before that anyway.
      floorPlans: { room: null, destination: null },
      loadingFloorPlan: false,
      // The walkable-path graph for the shared floor plan (same-floor mode
      // only — there's no cross-floor graph). Empty whenever it doesn't apply.
      pathGraph: { nodes: [], edges: [] },
      // Whole-building graph (every floor's nodes/edges, including
      // stairs/elevator links between floors) — only fetched for the
      // different-floor, same-building case, since same-floor already has
      // its own lighter per-floor pathGraph fetch above.
      buildingGraph: { nodes: [], edges: [] },
      // Floor plan image for each floor_plan_id a multi-floor route touches
      // — seeded from floorPlans.room/destination for the two endpoints,
      // fetched separately only for floors the route passes THROUGH.
      segmentFloorPlans: {},
      currentSegmentIndex: 0,
      // Every room in the shared building with a placed marker — drawn as
      // small muted context dots on the map so the destination doesn't sit
      // alone on an otherwise-blank floor plan (see roomsOnFloor).
      buildingRooms: []
    };
  },
  async mounted() {
    // Music on the screen where you pick a destination (right after a scan, or "Where are you now?" from Manual Search); it ends
    // when you leave that screen. Phones keep sound back until a tap, so the first tap here also starts it.
    if (window.LamparaAudio) {
      LamparaAudio.mute(!this.musicOn);
      const sync = () => { if (this.stage === 'result' && this.musicOn && !document.hidden) LamparaAudio.play('pick'); else LamparaAudio.stop(); };
      this.$watch('stage', sync);
      document.addEventListener('pointerdown', () => { if (this.stage === 'result' && this.musicOn) LamparaAudio.play('pick'); }, { capture: true });
      document.addEventListener('visibilitychange', sync);
      window.addEventListener('pagehide', () => LamparaAudio.stop());
    }
    // Entered from Manual Search (no camera involved at all) — the tapped
    // room is the DESTINATION, not "where you are" (there was no scan to
    // establish that). Jump straight to the result screen and ask for the
    // current room instead. Also the offline-capable entry point:
    // lookupRoomById falls back to the cached directory when there's no signal.
    const roomIdParam = new URLSearchParams(window.location.search).get('room');
    if (roomIdParam) {
      this.planningMode = true;
      this.scanning = true;
      this.destination = await this.lookupRoomById(roomIdParam);
      this.scanning = false;
      this.stage = 'result';
      // Quick picks: the rooms on the floor you were last on (saved from a scan or Manual Search), nothing to type.
      const mine = LamparaCache.getMyFloor();
      if (mine && this.destination) {
        this.nearbyRooms = LamparaCache.getRooms()
          .filter((r) => String(r.building_id) === String(mine.building_id) && r.floor === mine.floor && r.id !== this.destination.id)
          .sort((a, b) => String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true }))
          .slice(0, 8);
        this.nearbyLabel = mine.floor + ' \u00b7 ' + mine.building_name;
      }
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      this.cameraStream = stream;
      document.getElementById('camera-feed').srcObject = stream;
      this.cameraReady = true;
      this.startLiveDetection();
      // Discard the current box on rotation rather than letting it ease
      // (smooth) from its old position toward the new one — that would look
      // like the box sliding diagonally across the screen for a moment. A
      // clean re-detection on the next pass reads better than a stale one.
      const handleRotation = () => { this.liveBox = null; this._missedDetections = 0; };
      window.addEventListener('orientationchange', handleRotation);
      if (window.screen && window.screen.orientation) {
        window.screen.orientation.addEventListener('change', handleRotation);
      }
    } catch (e) { this.cameraFailed = true; /* camera optional for manual-number fallback */ }

    // Gate AI scanning to campus grounds — otherwise it'll happily OCR a
    // room number off literally any sign anywhere and check it against the
    // database, with no connection to whether you're actually here.
    if (navigator.geolocation) {
      try {
        const buildings = await LamparaCache.loadBuildings('../../../Backend/api/buildings.php');
        navigator.geolocation.watchPosition(
          (pos) => {
            const myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            this.onCampus = buildings.some(b => haversineMeters(myPos, b) <= CAMPUS_RADIUS_METERS);
          },
          () => { this.onCampus = false; },
          { enableHighAccuracy: true }
        );
      } catch (e) { this.onCampus = false; }
    } else {
      this.onCampus = false;
    }
  },
  computed: {
    directionHint() {
      if (!this.room || !this.destination) return '';
      if (this.destination.building_id !== this.room.building_id) {
        return `Different building — head to ${this.destination.building_name} first, then find the ${this.destination.floor} floor.`;
      }
      if (this.destination.floor !== this.room.floor) {
        // destination.floor already reads "3rd Floor", so don't append another "floor".
        return `Same building, different floor — go to the ${this.destination.floor}.`;
      }
      return `Same floor as you, in ${this.destination.building_name} — look for Room ${this.destination.room_number} nearby.`;
    },
    // 'same-floor'   -> one plan image, two pins (you + destination)
    // 'multi-floor'  -> a real connected route spanning 2+ floor plans,
    //                   paged one floor at a time (routeSegments)
    // 'text-only'    -> different building, or the data needed isn't there
    //                   (no plan uploaded, no marker placed, or the
    //                   different-floor case has no connecting stairs graph
    //                   yet) — the text directionHint above always covers
    //                   this case, so falling back here never strands anyone.
    mapMode() {
      if (!this.room || !this.destination) return 'text-only';
      if (this.room.building_id !== this.destination.building_id) return 'text-only';
      const hasRoomPin = this.room.map_x !== null && this.room.map_y !== null && this.floorPlans.room;
      if (this.room.floor === this.destination.floor) {
        return hasRoomPin && this.destination.map_x !== null && this.destination.map_y !== null ? 'same-floor' : 'text-only';
      }
      // Different floor: only worth showing once there's an ACTUAL connected
      // route (a real stairs/elevator link somewhere in the graph) — a bare
      // floor plan with no way to get from one to the other isn't useful,
      // and the text hint already says "go to floor X" either way.
      return this.routeSegments && this.routeSegments.length > 1 ? 'multi-floor' : 'text-only';
    },
    // Ordered list of {x, y} percentage points forming the shortest walkable
    // route between the two rooms' own pins, or null whenever that can't be
    // computed — no graph drawn for this floor yet, or the graph doesn't
    // connect the two segments they're nearest to. Each pin snaps to the
    // closest point on the closest corridor segment automatically — no
    // manual per-room linking step needed. mapMode's plain pins always work
    // regardless; this only adds the route LINE on top when the data supports it.
    routePath() {
      if (this.mapMode !== 'same-floor') return null;
      if (!this.pathGraph.edges.length) return null;
      return routeBetweenPoints(
        this.pathGraph.nodes, this.pathGraph.edges,
        { x: this.room.map_x, y: this.room.map_y },
        { x: this.destination.map_x, y: this.destination.map_y }
      );
    },
    // Per-floor route segments for the different-floor, same-building case —
    // see routeAcrossFloors. Requires both floors to actually have an
    // uploaded plan (their floor_plan_id is how segments key into the
    // combined graph) and both rooms to have a placed marker.
    routeSegments() {
      if (!this.room || !this.destination) return null;
      if (this.room.building_id !== this.destination.building_id) return null;
      if (this.room.floor === this.destination.floor) return null; // same-floor uses routePath instead
      if (!this.floorPlans.room || !this.floorPlans.destination) return null;
      if (this.room.map_x === null || this.room.map_y === null) return null;
      if (this.destination.map_x === null || this.destination.map_y === null) return null;
      if (!this.buildingGraph.edges.length) return null;
      return routeAcrossFloors(
        this.buildingGraph.nodes, this.buildingGraph.edges,
        { x: this.room.map_x, y: this.room.map_y }, this.floorPlans.room.id,
        { x: this.destination.map_x, y: this.destination.map_y }, this.floorPlans.destination.id
      );
    },
    // Link to the indoor AR guide, or null when it can't work yet: it needs a
    // real route, and every floor on that route calibrated (meters per plan
    // unit + which way is north) — see the admin Floor Calibration page.
    // The animated floor-plan route (Student/journey.php). Same building: one route from this room to the destination.
    // Another building: the three-step route (leave this one, walk outside, find the room).
    // What to offer before anyone types: the rooms on the floor just scanned, then the offices people look for most.
    // Only rooms with a spot on the floor plan, so the animated route can always be drawn.
    quickGroups() {
      if (!this.room) return [];
      const all = (LamparaCache.getRooms() || []).filter((r) => r.map_x !== null && r.map_x !== undefined && r.id !== this.room.id);
      const num = (a, b) => String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true });
      const here = all.filter((r) => String(r.building_id) === String(this.room.building_id) && r.floor === this.room.floor).sort(num).slice(0, 5);
      const offices = all.filter((r) => r.category === 'office' && !here.includes(r)).sort((a, b) => String(a.room_name).localeCompare(String(b.room_name))).slice(0, 6);
      const out = [];
      if (here.length) out.push({ title: 'On this floor', rooms: here, here: true });
      if (offices.length) out.push({ title: 'Offices around campus', rooms: offices, here: false });
      return out;
    },
    journeyUrl() {
      if (!this.room || !this.destination || String(this.room.id) === String(this.destination.id)) return null;
      if (this.room.map_x === null || this.room.map_y === null || this.destination.map_x === null || this.destination.map_y === null) return null;
      return `journey.php?from=${this.room.id}&to=${this.destination.id}`;
    },
    currentSegment() {
      return this.mapMode === 'multi-floor' ? this.routeSegments[this.currentSegmentIndex] : null;
    }
  },
  beforeUnmount() {
    this.detectionActive = false;
    if (this.detectorWorker) this.detectorWorker.terminate();
  },
  watch: {
    // The <video> only exists inside v-if="stage === 'scan'" — Vue destroys
    // it entirely on leaving Stage 1 and creates a brand-new element on
    // returning ("Scan Another" / "Try again"). The camera stream itself
    // was only ever attached once in mounted(), to that ORIGINAL element,
    // so the new one just sat there black with nothing playing. Reattach
    // the same still-live stream (no need to re-request getUserMedia) once
    // the new element exists.
    stage(newStage) {
      if (newStage !== 'scan' || !this.cameraStream) return;
      this.$nextTick(() => {
        const video = document.getElementById('camera-feed');
        if (video) video.srcObject = this.cameraStream;
      });
    },
    // Fetches the floor plan image for any floor a multi-floor route passes
    // THROUGH (not just its two endpoints, which are already covered by
    // floorPlans.room/destination) — e.g. a route from floor 2 to floor 4
    // that has to cross floor 3's landing.
    routeSegments(segments) {
      this.currentSegmentIndex = 0; // a new route always starts on its first page
      this.loadSegmentFloorPlans(segments);
    }
  },
  methods: {
    // ---- Live text detector (Tesseract.js) — stage 1, visual-only ----
    // Runs a lightweight OCR pass every ~700ms on a downscaled copy of the
    // frame, purely to draw a box around text it notices. It never decides
    // the room number itself — that's still Gemini's job on tap, since
    // Tesseract alone is nowhere near accurate/robust enough on angled or
    // low-light signage to be trusted as the actual answer.
    async startLiveDetection() {
      if (typeof Tesseract === 'undefined') return; // CDN failed to load — degrade silently, tap-to-scan still works
      this.detectionActive = true;
      try {
        this.detectorWorker = await Tesseract.createWorker('eng');
      } catch (e) {
        return; // no live box, but the real scan flow is unaffected
      }
      this.runDetectionLoop();
    },
    async runDetectionLoop() {
      while (this.detectionActive) {
        if (this.stage === 'scan' && !this.scanning && this.cameraReady) {
          try {
            const frame = this.captureDetectionFrame();
            const { data } = await this.detectorWorker.recognize(frame);
            this.updateLiveBox(data);
          } catch (e) {
            // A single failed pass isn't worth surfacing — just try again next tick.
          }
        } else {
          this.liveBox = null;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
    },
    // A small, downscaled copy of the frame — full camera resolution would
    // make each OCR pass far too slow to feel "live" on a phone.
    captureDetectionFrame() {
      const video = this.$refs.video;
      const scale = 480 / video.videoWidth;
      this._detectScale = scale;
      const canvas = document.createElement('canvas');
      canvas.width = 480;
      canvas.height = Math.round(video.videoHeight * scale);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas;
    },
    updateLiveBox(data) {
      const words = (data.words || []).filter((w) => w.confidence > 45 && w.text.trim().length > 0);
      if (!words.length) {
        // A single missed pass (hand jitter, momentary blur) shouldn't make
        // the box flicker away — only clear it after a couple in a row.
        this._missedDetections = (this._missedDetections || 0) + 1;
        if (this._missedDetections >= 2) this.liveBox = null;
        return;
      }
      this._missedDetections = 0;
      // Merge every detected word into one box covering the whole sign,
      // rather than drawing a separate box per word.
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      words.forEach((w) => {
        x0 = Math.min(x0, w.bbox.x0); y0 = Math.min(y0, w.bbox.y0);
        x1 = Math.max(x1, w.bbox.x1); y1 = Math.max(y1, w.bbox.y1);
      });
      // Scale back up from the downscaled detection frame to full video
      // resolution before mapping to screen coordinates.
      const s = 1 / this._detectScale;
      const raw = this.mapToScreen(x0 * s, y0 * s, (x1 - x0) * s, (y1 - y0) * s);
      if (!raw) return;
      if (!this.liveBox) {
        this.liveBox = raw;
        return;
      }
      // Each OCR pass finds slightly different word boundaries even for the
      // same physical sign — same discipline as the outdoor guide's compass
      // smoothing: ease toward each new reading instead of snapping straight
      // to it, so the box glides rather than visibly jittering pass to pass.
      const a = 0.35;
      this.liveBox = {
        left: this.liveBox.left + (raw.left - this.liveBox.left) * a,
        top: this.liveBox.top + (raw.top - this.liveBox.top) * a,
        width: this.liveBox.width + (raw.width - this.liveBox.width) * a,
        height: this.liveBox.height + (raw.height - this.liveBox.height) * a
      };
    },
    // The video fills the screen via object-fit:cover, which crops/scales
    // the source frame non-trivially — a detected pixel coordinate has to be
    // mapped through that same crop/scale to land in the right spot on screen.
    mapToScreen(x, y, w, h) {
      const video = this.$refs.video;
      const dw = video.clientWidth, dh = video.clientHeight;
      const vw = video.videoWidth, vh = video.videoHeight;
      if (!vw || !vh) return null;
      const scale = Math.max(dw / vw, dh / vh);
      const offsetX = (dw - vw * scale) / 2;
      const offsetY = (dh - vh * scale) / 2;
      return {
        left: offsetX + x * scale,
        top: offsetY + y * scale,
        width: w * scale,
        height: h * scale
      };
    },
    // Captures the current video frame to a canvas and returns it as a
    // base64 JPEG data URL — this is the photo sent to Gemini's vision input.
    captureFrame() {
      const video = this.$refs.video;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      return canvas.toDataURL('image/jpeg', 0.85);
    },
    // Every room with this number. Two buildings can both have a 1101, so this can be more than one: see applyMatches().
    async lookupRooms(roomNumber) {
      // "1101a", "1101-A" and "1101 - A" are all the same room.
      roomNumber = RoomNumber.normalize(roomNumber) || String(roomNumber).trim();
      if (navigator.onLine) {
        try {
          const res = await fetch('../../../Backend/api/rooms.php?room_number=' + encodeURIComponent(roomNumber));
          const data = await res.json();
          if (data.success) {
            if (data.rooms.length) LamparaCache.mergeRooms(data.rooms);
            return data.rooms;
          }
        } catch (e) { /* fall through to cache */ }
      }
      const key = RoomNumber.compact(roomNumber);
      return LamparaCache.getRooms().filter((r) => r.room_number && RoomNumber.compact(r.room_number) === key);
    },
    // A good-enough GPS fix, or null (no permission, no signal, too slow): the tiebreaker then falls back to the last scan, then asks.
    quickFix() {
      return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition((p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }), () => resolve(null), { enableHighAccuracy: true, timeout: 4000, maximumAge: 60000 });
      });
    },
    // The same room number in several buildings: work out which one the student is in.
    //   1. GPS: clearly nearest to one of those buildings (within 150 m, and the next one at least 40 m farther)
    //   2. the building of their last scan (they are most likely still there; "Not this building?" is on the result)
    //   3. otherwise ask. Never guess between buildings without one of these.
    async pickBuilding(list) {
      const fix = await this.quickFix();
      if (fix && fix.acc <= 80) {
        const bs = LamparaCache.getBuildings() || [];
        const dist = (b) => { const R = 6371008.8, r = (d) => d * Math.PI / 180, dLat = r(b.lat - fix.lat), dLng = r(b.lng - fix.lng); const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(fix.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
        const ranked = list.map((room) => { const b = bs.find((x) => String(x.id) === String(room.building_id)); return { room, d: b && b.lat != null ? dist(b) : Infinity }; }).sort((a, b) => a.d - b.d);
        if (ranked[0].d <= 150 && (ranked.length < 2 || ranked[1].d - ranked[0].d >= 40)) return ranked[0].room;
      }
      const mine = LamparaCache.getMyFloor();
      const last = mine && list.find((r) => String(r.building_id) === String(mine.building_id));
      return last || null;
    },
    // Sets the result for a scanned or typed number: the room, or the "which building?" question when it is not clear.
    async applyMatches(list) {
      this.pickRooms = []; this.altRooms = []; this.room = null;
      if (list.length > 1) {
        const r = await this.pickBuilding(list);
        if (r) { this.room = r; this.altRooms = list.filter((x) => x.id !== r.id); }
        else this.pickRooms = list;
      } else this.room = list[0] || null;
      if (this.room && !(await this.confirmHere(this.room))) { this.room = null; this.locDeclined = true; return; }
      if (this.room) { LamparaCache.setMyFloor(this.room); this.noteScan(); }
    },
    // "Are you sure you are here?" A coarse GPS fix (even a weak one from inside) is compared with the building the sign belongs to.
    // Far away: ask first. No fix at all (no signal, no permission): say nothing, never block a real scan.
    async confirmHere(room) {
      const b = (LamparaCache.getBuildings() || []).find((x) => String(x.id) === String(room.building_id));
      if (!b || b.lat == null || b.lng == null) return true;
      const fix = await this.quickFix();
      if (!fix) return true;
      const d = haversineMeters({ lat: fix.lat, lng: fix.lng }, { lat: Number(b.lat), lng: Number(b.lng) });
      if (d <= 90 + Math.min(fix.acc || 0, 150)) return true;          // within the building's size plus how unsure the phone is
      return new Promise((resolve) => { this.locCheck = { building: b.name, room: room.room_name, meters: Math.round(d), acc: Math.round(fix.acc || 0), resolve }; this.$nextTick(() => { const el = document.getElementById('lcYes'); if (el) el.focus(); }); });
    },
    locAnswer(yes) { const c = this.locCheck; this.locCheck = null; if (c) c.resolve(yes); },
    chooseBuilding(r) {
      this.altRooms = this.pickRooms.filter((x) => x.id !== r.id); this.pickRooms = []; this.room = r;
      LamparaCache.setMyFloor(r); this.noteScan();
    },
    notThisBuilding() { this.pickRooms = [this.room, ...this.altRooms]; this.altRooms = []; this.room = null; },
    buildingLabel(r) { return (r.building_number ? 'Bldg ' + r.building_number + ' \u00b7 ' : '') + r.building_name; },
    // Used by the Manual Search entry point (?room=<id>) — fetches the full
    // directory rather than a single-room endpoint (there isn't a by-id one),
    // which conveniently also refreshes the whole offline room cache.
    async lookupRoomById(id) {
      if (navigator.onLine) {
        try {
          const res = await fetch('../../../Backend/api/rooms.php');
          const data = await res.json();
          if (data.success) {
            LamparaCache.setRooms(data.rooms);
            return data.rooms.find((r) => String(r.id) === String(id)) || null;
          }
        } catch (e) { /* fall through to cache */ }
      }
      return LamparaCache.getRooms().find((r) => String(r.id) === String(id)) || null;
    },
    async performScan() {
      this.detectedNumber = null; this.locDeclined = false;
      this.pickRooms = []; this.altRooms = [];
      this.aiReadFailed = false;
      const typedNumber = this.manualNumber.trim();

      // Manual entry always takes priority — it's the intentional fallback
      // for "not sure of the exact number" / no-camera / AI-can't-read-it cases.
      if (typedNumber) {
        this.scanning = true;
        try {
          await this.applyMatches(await this.lookupRooms(typedNumber));
        } finally {
          this.scanning = false;
          if (!this.locDeclined) this.stage = 'result';
        }
        return;
      }

      if (this.onCampus === false) {
        alert("AI signage scanning only works when you're on campus grounds — type the room number shown on the sign instead.");
        return;
      }

      if (!this.cameraReady) {
        alert("Camera isn't available — type the room number shown on the sign instead.");
        return;
      }

      this.scanning = true;
      try {
        const image = this.captureFrame();
        const res = await fetch('../../../Backend/api/scan.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image })
        });
        const data = await res.json();

        if (!data.success) {
          alert(data.error || "Couldn't read the sign — try again or type the number manually.");
          return;
        }
        if (!data.room_number) {
          this.aiReadFailed = true;
          this.room = null;
          if (!this.locDeclined) this.stage = 'result';
          return;
        }
        this.detectedNumber = data.room_number;
        await this.applyMatches(await this.lookupRooms(data.room_number));
        if (!this.locDeclined) this.stage = 'result';
      } catch (e) {
        alert("Couldn't reach the AI service — check your connection and try again.");
      } finally {
        this.scanning = false;
      }
    },
    // Debounced so it doesn't fire an API call on every single keystroke.
    searchDestinations() {
      clearTimeout(this._destDebounce);
      this.destination = null;
      this.floorPlans = { room: null, destination: null };
      this.pathGraph = { nodes: [], edges: [] };
      this.buildingGraph = { nodes: [], edges: [] };
      this.segmentFloorPlans = {};
      this.buildingRooms = [];
      const q = this.destQuery.trim();
      if (!q) { this.destResults = []; return; }
      this._destDebounce = setTimeout(async () => {
        let rooms = null; // null = network didn't answer at all, distinct from "answered with zero matches"
        if (navigator.onLine) {
          try {
            const res = await fetch('../../../Backend/api/rooms.php?q=' + encodeURIComponent(q));
            const data = await res.json();
            if (data.success) { rooms = data.rooms; LamparaCache.mergeRooms(data.rooms); }
          } catch (e) { /* fall through to cache */ }
        }
        if (rooms === null) {
          const ql = q.toLowerCase();
          rooms = LamparaCache.getRooms().filter((r) =>
            r.room_name.toLowerCase().includes(ql) || (r.room_number || '').toLowerCase().includes(ql) || RoomNumber.matches(r.room_number, q));
        }
        // Don't suggest navigating to the room you're already standing in.
        const matches = rooms.filter((r) => !this.room || r.id !== this.room.id);
        // Was capped at 6 with zero indication anything got cut off — a
        // single floor can easily have more than 6 rooms (Amafel's 2nd
        // floor alone has 9), so a broad search silently hid real matches.
        // Raised the cap and surface a "narrow your search" hint instead of
        // truncating invisibly.
        this.destResultsTruncated = matches.length > 12;
        this.destResults = matches.slice(0, 12);
      }, 300);
    },
    pickDestination(d) {
      this.destination = d;
      this.destQuery = d.room_number + ' — ' + d.room_name;
      this.destResults = [];
      this.destResultsTruncated = false;
      if (this.openAnimatedRoute()) return;
      this.loadFloorPlansForRoute();
    },
    // Reading a room sign counts toward the weekly quests (each different room once).
    toggleMusic() {
      this.musicOn = !this.musicOn;
      LamparaAudio.setEnabled(this.musicOn);
      LamparaAudio.mute(!this.musicOn);
      if (this.musicOn && this.stage === 'result') LamparaAudio.play('pick'); else LamparaAudio.stop();
    },
    // Can an indoor route be drawn to this room? Only when its building has a floor plan for that floor and the room is marked on it.
    // (Before the directory has been saved on this phone we cannot tell, so the option stays.)
    canRoute(d) {
      if (!d) return false;
      if (d.map_x === null || d.map_x === undefined || d.map_y === null || d.map_y === undefined) return false;
      let any = false;
      try { any = Object.keys(JSON.parse(localStorage.getItem('lampara_floorplans_cache') || '{}')).length > 0; } catch (e) { any = false; }
      return any ? !!LamparaCache.getFloorPlan(d.building_id, d.floor) : true;
    },
    noteScan() { if (window.LamparaMascots) LamparaMascots.event('scan', String(this.room.id)); },
    // Once both ends are known, the animated floor-plan route (Student/journey.php) is the way to show it, same building or not.
    // The older plan viewer below stays as the fallback for rooms that have no spot on the plan yet.
    openAnimatedRoute() {
      const url = this.journeyUrl;
      if (!url) return false;
      location.href = url;
      return true;
    },
    // Planning-mode counterpart to searchDestinations — same debounced,
    // offline-fallback pattern, just filling in "where you are" instead of
    // "where you're going" (which is already fixed as the destination here).
    searchOrigin() {
      clearTimeout(this._originDebounce);
      const q = this.originQuery.trim();
      if (!q) { this.originResults = []; return; }
      this._originDebounce = setTimeout(async () => {
        let rooms = null;
        if (navigator.onLine) {
          try {
            const res = await fetch('../../../Backend/api/rooms.php?q=' + encodeURIComponent(q));
            const data = await res.json();
            if (data.success) { rooms = data.rooms; LamparaCache.mergeRooms(data.rooms); }
          } catch (e) { /* fall through to cache */ }
        }
        if (rooms === null) {
          const ql = q.toLowerCase();
          rooms = LamparaCache.getRooms().filter((r) =>
            r.room_name.toLowerCase().includes(ql) || (r.room_number || '').toLowerCase().includes(ql) || RoomNumber.matches(r.room_number, q));
        }
        this.originResults = rooms.filter((r) => !this.destination || r.id !== this.destination.id).slice(0, 12);
      }, 300);
    },
    pickOrigin(r) {
      this.room = r;
      LamparaCache.setMyFloor(r);
      this.originQuery = r.room_number + ' — ' + r.room_name;
      this.originResults = [];
      if (this.destination && this.openAnimatedRoute()) return;
      this.loadFloorPlansForRoute();
    },
    // Planning-mode only — goes back to "where are you now?" without losing
    // the destination or leaving the result screen (there's no camera stage
    // to return to in this flow).
    changeOrigin() {
      this.room = null;
      this.originQuery = '';
      this.originResults = [];
      this.floorPlans = { room: null, destination: null };
      this.pathGraph = { nodes: [], edges: [] };
      this.buildingGraph = { nodes: [], edges: [] };
      this.segmentFloorPlans = {};
      this.buildingRooms = [];
    },
    async fetchFloorPlan(buildingId, floor) {
      if (navigator.onLine) {
        try {
          const res = await fetch(`../../../Backend/api/floor-plans.php?building_id=${buildingId}&floor=${encodeURIComponent(floor)}`);
          const data = await res.json();
          if (data.success && data.plan) {
            // Download the actual image bytes as a data URL too — the API
            // only ever returns a path, and a path is useless with zero
            // signal later. Metadata still caches even if this part fails.
            // With the service worker active it saves the image file itself (no size limit),
            // so the base64 copy in localStorage is only kept as the fallback without it.
            let imageDataUrl = null;
            if (!LamparaCache.workerHandlesImages()) {
              try { imageDataUrl = await LamparaCache.fetchImageAsDataUrl('../../' + data.plan.image_path); } catch (e) { /* offline image caching is best-effort */ }
            }
            const cachedPlan = { ...data.plan, imageDataUrl };
            LamparaCache.setFloorPlan(buildingId, floor, cachedPlan);
            return cachedPlan;
          }
          if (data.success) return null; // this floor genuinely has no plan — not a network failure
        } catch (e) { /* fall through to cache */ }
      }
      return LamparaCache.getFloorPlan(buildingId, floor);
    },
    async fetchPathGraph(floorPlanId) {
      if (navigator.onLine) {
        try {
          const res = await fetch('../../../Backend/api/floor-plan-graph.php?floor_plan_id=' + floorPlanId);
          const data = await res.json();
          if (data.success) {
            const graph = { nodes: data.nodes, edges: data.edges };
            LamparaCache.setGraph(floorPlanId, graph);
            return graph;
          }
        } catch (e) { /* fall through to cache */ }
      }
      return LamparaCache.getGraph(floorPlanId) || { nodes: [], edges: [] };
    },
    async fetchBuildingGraph(buildingId) {
      if (navigator.onLine) {
        try {
          const res = await fetch('../../../Backend/api/floor-plan-graph.php?building_id=' + buildingId);
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
    // Every room in the building with a placed marker — used purely as
    // context dots on the map (see roomsOnFloor) so the destination doesn't
    // sit alone on an otherwise-blank floor plan. Reuses the same offline
    // room cache as everything else; a full building fetch here also keeps
    // that cache warm for Manual Search's offline directory.
    async fetchBuildingRooms(buildingId) {
      if (navigator.onLine) {
        try {
          const res = await fetch('../../../Backend/api/rooms.php?building_id=' + buildingId);
          const data = await res.json();
          if (data.success) { LamparaCache.mergeRooms(data.rooms); return data.rooms; }
        } catch (e) { /* fall through to cache */ }
      }
      return LamparaCache.getRooms().filter((r) => r.building_id === buildingId);
    },
    // Other rooms with a marker on the given floor — excludes the current
    // room and the destination themselves, which already get their own
    // distinct (larger, colored) pins drawn separately.
    roomsOnFloor(floor) {
      return this.buildingRooms.filter((r) =>
        r.floor === floor && r.map_x !== null && r.map_y !== null &&
        (!this.room || r.id !== this.room.id) && (!this.destination || r.id !== this.destination.id));
    },
    // Only fetches what mapMode could actually use — same building only,
    // and never for the different-building case (text-only regardless).
    async loadFloorPlansForRoute() {
      this.floorPlans = { room: null, destination: null };
      this.pathGraph = { nodes: [], edges: [] };
      this.buildingGraph = { nodes: [], edges: [] };
      this.segmentFloorPlans = {};
      this.buildingRooms = [];
      if (!this.room || !this.destination) return;
      if (this.room.building_id !== this.destination.building_id) return;
      this.loadingFloorPlan = true;
      try {
        this.floorPlans.room = await this.fetchFloorPlan(this.room.building_id, this.room.floor);
        this.floorPlans.destination = this.room.floor === this.destination.floor
          ? this.floorPlans.room
          : await this.fetchFloorPlan(this.destination.building_id, this.destination.floor);
        this.buildingRooms = await this.fetchBuildingRooms(this.room.building_id);
        if (this.room.floor === this.destination.floor) {
          // Same-floor case — its own lighter per-floor graph, unchanged.
          if (this.floorPlans.room) this.pathGraph = await this.fetchPathGraph(this.floorPlans.room.id);
        } else if (this.floorPlans.room && this.floorPlans.destination) {
          // Different floor — needs the WHOLE building's graph, since the
          // route may cross through floors neither room is actually on.
          this.buildingGraph = await this.fetchBuildingGraph(this.room.building_id);
        }
      } finally {
        this.loadingFloorPlan = false;
      }
    },
    // routeSegments can reference a floor NEITHER room is on (a floor the
    // route just passes through) — those need their own image fetch;
    // the two endpoint floors are already covered by floorPlans.room/destination.
    async loadSegmentFloorPlans(segments) {
      if (!segments) { this.segmentFloorPlans = {}; return; }
      const next = { ...this.segmentFloorPlans };
      for (const seg of segments) {
        if (next[seg.floorPlanId]) continue;
        if (this.floorPlans.room && this.floorPlans.room.id === seg.floorPlanId) { next[seg.floorPlanId] = this.floorPlans.room; continue; }
        if (this.floorPlans.destination && this.floorPlans.destination.id === seg.floorPlanId) { next[seg.floorPlanId] = this.floorPlans.destination; continue; }
        const node = this.buildingGraph.nodes.find((n) => n.floor_plan_id === seg.floorPlanId);
        if (node) {
          const plan = await this.fetchFloorPlan(this.room.building_id, node.floor);
          if (plan) next[seg.floorPlanId] = plan;
        }
      }
      this.segmentFloorPlans = next;
    },
    segmentImage(segment) {
      const plan = segment && this.segmentFloorPlans[segment.floorPlanId];
      if (!plan) return '';
      return plan.imageDataUrl || ('../../' + plan.image_path);
    },
    segmentFloorLabel(segment) {
      if (!segment) return '';
      if (this.floorPlans.room && this.floorPlans.room.id === segment.floorPlanId) return this.room.floor;
      if (this.floorPlans.destination && this.floorPlans.destination.id === segment.floorPlanId) return this.destination.floor;
      const node = this.buildingGraph.nodes.find((n) => n.floor_plan_id === segment.floorPlanId);
      return node ? node.floor : '';
    },
    async reportOutdated() {
      // From the scan flow the room you scanned is reported; from Find inside it is the destination you were looking at.
      const target = this.planningMode ? this.destination : this.room;
      if (!target) return;
      try {
        await fetch('../../../Backend/api/flags.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ room_id: target.id, note: this.planningMode ? 'Flagged from the Find inside screen' : 'Flagged from scan result screen' })
        });
        this.reported = true;
      } catch (e) { /* offline: the button stays available to try again */ }
    },
    // Someone who has just walked in: offer the rooms on the lowest floor of the destination's building, by number.
    showEntranceRooms() {
      if (!this.destination) return;
      const rank = (name) => {
        const t = String(name || '').trim().toLowerCase(), m = t.match(/^(-?\d+)/);
        if (m) return parseInt(m[1], 10);
        if (/^(g|ground|lower ground)/.test(t)) return 0;
        if (/basement|^b\d?\b/.test(t)) return -1;
        return 99;
      };
      const inBuilding = LamparaCache.getRooms().filter((r) => String(r.building_id) === String(this.destination.building_id) && r.id !== this.destination.id);
      if (!inBuilding.length) return;
      // The floor the admin marked as the entrance, otherwise the lowest one.
      const marked = this.destination.building_entrance_floor;
      const markedRooms = marked ? inBuilding.filter((r) => r.floor === marked) : [];
      const low = Math.min(...inBuilding.map((r) => rank(r.floor)));
      const floorRooms = markedRooms.length ? markedRooms : inBuilding.filter((r) => rank(r.floor) === low);
      this.nearbyRooms = floorRooms.sort((a, b) => String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true })).slice(0, 10);
      this.nearbyTitle = 'Rooms near the entrance, on';
      this.nearbyLabel = floorRooms[0].floor + ' \u00b7 ' + floorRooms[0].building_name;
    },
    reset() {
      this.stage = 'scan';
      this.room = null;
      this.reported = false;
      this.manualNumber = '';
      this.detectedNumber = null;
      this.aiReadFailed = false;
      this.destQuery = '';
      this.destResults = [];
      this.destResultsTruncated = false;
      this.destination = null;
      this.floorPlans = { room: null, destination: null };
      this.pathGraph = { nodes: [], edges: [] };
      this.buildingGraph = { nodes: [], edges: [] };
      this.segmentFloorPlans = {};
      this.buildingRooms = [];
    }
  }
}).mount('#app');
