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
      stage: 'scan', scanning: false, manualNumber: '', room: null, reported: false,
      cameraReady: false, detectedNumber: null, aiReadFailed: false, cameraStream: null,
      onCampus: null, // null = still checking, true/false once GPS resolves
      liveBox: null, // screen-space {left, top, width, height} of the currently detected text, or null
      destQuery: '', destResults: [], destination: null, destResultsTruncated: false
    };
  },
  async mounted() {
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
    } catch (e) { /* camera optional for manual-number fallback */ }

    // Gate AI scanning to campus grounds — otherwise it'll happily OCR a
    // room number off literally any sign anywhere and check it against the
    // database, with no connection to whether you're actually here.
    if (navigator.geolocation) {
      try {
        const res = await fetch('../../../Backend/api/buildings.php');
        const data = await res.json();
        const buildings = data.success ? data.buildings : [];
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
        return `Same building, different floor — go to the ${this.destination.floor} floor.`;
      }
      return `Same floor as you, in ${this.destination.building_name} — look for Room ${this.destination.room_number} nearby.`;
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
    async lookupRoom(roomNumber) {
      const res = await fetch('../../../Backend/api/rooms.php?room_number=' + encodeURIComponent(roomNumber));
      const data = await res.json();
      return (data.success && data.rooms.length) ? data.rooms[0] : null;
    },
    async performScan() {
      this.detectedNumber = null;
      this.aiReadFailed = false;
      const typedNumber = this.manualNumber.trim();

      // Manual entry always takes priority — it's the intentional fallback
      // for "not sure of the exact number" / no-camera / AI-can't-read-it cases.
      if (typedNumber) {
        this.scanning = true;
        try {
          this.room = await this.lookupRoom(typedNumber);
        } finally {
          this.scanning = false;
          this.stage = 'result';
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
          this.stage = 'result';
          return;
        }
        this.detectedNumber = data.room_number;
        this.room = await this.lookupRoom(data.room_number);
        this.stage = 'result';
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
      const q = this.destQuery.trim();
      if (!q) { this.destResults = []; return; }
      this._destDebounce = setTimeout(async () => {
        const res = await fetch('../../../Backend/api/rooms.php?q=' + encodeURIComponent(q));
        const data = await res.json();
        const rooms = data.success ? data.rooms : [];
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
    },
    async reportOutdated() {
      if (!this.room) return;
      await fetch('../../../Backend/api/flags.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: this.room.id, note: 'Flagged from scan result screen' })
      });
      this.reported = true;
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
    }
  }
}).mount('#app');
