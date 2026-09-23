const { createApp } = Vue;

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
      myPos: null,
      searchQuery: '',
      showAllBuildings: false, // toggled by the dropdown-browse button, independent of searchQuery
      target: null,
      chatOpenFor: null,
      chatMessages: [],
      chatInput: '',
      chatLoading: false,
      arEntities: {} // building.id -> {wrapper, label, arrow}
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

      if (!navigator.geolocation) {
        this.statusText = 'Geolocation not supported.';
        this.checking = false;
        return;
      }

      const res = await fetch('../../../Backend/api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;

      // AR.js requests the camera itself once <a-scene> mounts, right after
      // this same tap — not before the user knows why.
      this.started = true;
      this.checking = false;
      this.startLocationWatch();
      this.startCompassWatch();

      // Defined immediately, before anything that could throw and silently
      // stop the rest of this setup — the button that calls this should
      // never just do nothing with no visible error either way.
      window.__arDebug = () => {
        try {
          const scene2 = this.$refs.arScene || document.querySelector('a-scene');
          if (!scene2) { alert('No <a-scene> found in the DOM at all.'); return; }
          const camEl = scene2.querySelector('[gps-new-camera]');
          const camComp = camEl && camEl.components && camEl.components['gps-new-camera'];
          let report = 'gps-new-camera found: ' + !!camComp;
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
            report += '\norigin established (threeLoc.initialPosition)=' + !!(camComp.threeLoc && camComp.threeLoc.initialPosition);
            report += '\n_currentPosition=' + (camComp._currentPosition ? JSON.stringify(camComp._currentPosition) : 'null (no GPS fix accurate enough yet)');
            // AR.js's OWN internal GPS watch silently discards any fix with
            // accuracy worse than 100m before it updates _currentPosition or
            // sets the origin — separate from our own distance-tracking
            // watch below, which has no such filter and will keep updating
            // regardless. Showing the live accuracy number here is the only
            // way to tell whether you're actually close to clearing AR.js's
            // threshold or not.
          }
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

        const onSceneReady = () => {
          this.forceArSize();
          this.buildAllEntities();
          this.setupTapSelection(scene);
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
    forceArSize() {
      const scene = this.$refs.arScene;
      if (!scene || !scene.renderer) return;
      const vv = window.visualViewport;
      const w = vv ? vv.width : window.innerWidth;
      const h = vv ? vv.height : window.innerHeight;
      scene.renderer.setSize(w, h, true);
      if (scene.camera) {
        scene.camera.aspect = w / h;
        scene.camera.updateProjectionMatrix();
      }
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

        scene.appendChild(wrapper);
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
      if (!this.target) return;

      const entry = this.arEntities[this.target.id];
      this.updateTargetDistance();
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
      arrow.setAttribute('animation__bob', 'property: position; dir: alternate; dur: 1400; easing: easeInOutQuad; loop: true; to: 0 0.65 0');
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
      const labelScale = Math.max(5, Math.round(d * 0.05 * 10) / 10);
      entry.label.setAttribute('scale', `${labelScale} ${labelScale} ${labelScale}`);
      if (entry.arrow) {
        const arrowScale = Math.max(1.2, Math.round(d * 0.1 * 10) / 10);
        entry.arrow.setAttribute('scale', `${arrowScale} ${arrowScale} ${arrowScale}`);
      }
    },
    updateTargetDistance() {
      if (!this.target || !this.myPos) return;
      this.target = { ...this.target, distance: Math.round(haversineMeters(this.myPos, this.target)) };
      this.applyTargetScale();
    },
    selectBuilding(building) { this.setTarget(building); },
    // Shared by start() and by toggleLocation() re-enabling.
    startLocationWatch() {
      this.gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          this.myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          this.statusOk = true;
          this.updateTargetDistance();
        },
        (err) => { this.statusText = 'GPS error: ' + err.message; },
        { enableHighAccuracy: true }
      );
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
