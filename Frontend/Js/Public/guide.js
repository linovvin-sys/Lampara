const { createApp } = Vue;

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1-h));
}
function bearingDeg(a, b) {
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}
// Signed angular difference in [-180, 180]: positive = b is clockwise (right) of a.
function relativeAngle(fromDeg, toDeg) {
  return ((toDeg - fromDeg + 540) % 360) - 180;
}

createApp({
  data() {
    return {
      started: false,
      checking: true, // briefly true on load while we silently check for an already-granted permission
      quickStart: false, // permission was already granted — skip the explanation, but still need one real tap
      statusText: '',
      statusOk: false,
      buildings: [],
      myPos: null,
      heading: 0,
      headingInit: false,
      // Independent on/off toggles — lets someone who's not comfortable with
      // a live camera or location share turn either off mid-session without
      // having to reset the browser's site permission (which stays granted;
      // this only stops/restarts the JS-side stream and GPS watch).
      cameraOn: true,
      locationOn: true,
      cameraStream: null,
      gpsWatchId: null,
      searchQuery: '',
      target: null,
      ambientBuildings: [],
      chatOpenFor: null,
      chatMessages: [],
      chatInput: '',
      chatLoading: false
    };
  },
  computed: {
    // All name matches, not just the first — a single match auto-selects,
    // but multiple matches are shown as a "did you mean?" list instead of
    // silently picking one (the Critical misidentification gap).
    searchMatches() {
      const q = this.searchQuery.trim().toLowerCase();
      if (q.length < 2) return [];
      return this.buildings.filter(b => b.name.toLowerCase().includes(q));
    }
  },
  watch: {
    searchMatches(matches) {
      // A manual pick from the disambiguation list already set the target —
      // don't stomp it just because the query still matches multiple names.
      if (this.target && matches.some(b => b.id === this.target.id) && matches.length > 1) return;
      const building = matches.length === 1 ? matches[0] : null;
      this.target = building ? { ...building } : null;
      this.recompute();
    }
  },
  async mounted() {
    // Skip the full explanation screen on repeat visits when permission was
    // genuinely already granted (checked without triggering a prompt) — but
    // still require one real tap before calling start(), not a fully silent
    // auto-start. iOS ties its compass permission specifically to a live user
    // gesture; a silent automatic call can make just the compass silently
    // fail even when camera/GPS succeed fine, with no visible error at all.
    // One lightweight tap guarantees correctness on every device instead of
    // gambling on undocumented platform behavior.
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'camera' });
        if (status.state === 'granted') {
          this.quickStart = true;
          this.checking = false;
          return;
        }
      }
    } catch (e) { /* Permissions API unsupported for 'camera' on this browser — fall back to the full gate */ }
    this.checking = false;
  },
  methods: {
    async start() {
      this.checking = true;
      this.quickStart = false;
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        document.getElementById('camera-feed').srcObject = stream;
        this.cameraStream = stream;
        this.cameraOn = true;
      } catch (e) {
        this.statusText = 'Camera permission denied.';
        this.checking = false;
        return;
      }

      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { await DeviceOrientationEvent.requestPermission(); } catch (e) {}
      }
      // Registering both event types made Android phones fire two different,
      // sometimes-conflicting heading readings per physical movement — that
      // conflict, not sensor noise, is what smoothing alone couldn't fix.
      // Use "absolute" (true compass-referenced) when the browser supports
      // it; only fall back to plain deviceorientation otherwise.
      const primaryEvent = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
      window.addEventListener(primaryEvent, this.onOrientation, true);
      // Some Android OEM browsers report an event type as supported (feature
      // detection passes) but never actually dispatch it — no permission
      // prompt, no error, it just silently never fires. If nothing arrives
      // shortly, fall back to the other event type instead of leaving the
      // compass permanently stuck at its default heading.
      setTimeout(() => {
        if (!this.headingInit && primaryEvent === 'deviceorientationabsolute') {
          window.removeEventListener('deviceorientationabsolute', this.onOrientation, true);
          window.addEventListener('deviceorientation', this.onOrientation, true);
        }
      }, 2500);

      if (!navigator.geolocation) {
        this.statusText = 'Geolocation not supported.';
        this.checking = false;
        return;
      }
      this.locationOn = true;
      this.startLocationWatch();

      const res = await fetch('../../../Backend/api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;

      this.started = true;
      this.checking = false;
    },
    // Shared by the initial start() and by toggleLocation() re-enabling —
    // keeps the smoothing/error logic in one place instead of duplicated.
    startLocationWatch() {
      this.gpsWatchId = navigator.geolocation.watchPosition(
        (pos) => {
          const raw = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          // GPS wobbles a few meters even standing still — at short range to a
          // building that noise alone swings the calculated bearing enough to
          // make labels visibly drift. Smooth position the same way heading is
          // smoothed, so it settles instead of sliding on its own.
          if (!this.myPos) {
            this.myPos = raw;
          } else {
            this.myPos = {
              lat: this.myPos.lat + (raw.lat - this.myPos.lat) * 0.2,
              lng: this.myPos.lng + (raw.lng - this.myPos.lng) * 0.2
            };
          }
          this.statusOk = true;
          this.recompute();
        },
        (err) => { this.statusText = 'GPS error: ' + err.message; },
        { enableHighAccuracy: true }
      );
    },
    // Lets someone turn the live camera off mid-session (privacy comfort)
    // without touching the browser's actual camera permission — stopping the
    // MediaStream tracks here, not revoking anything, so turning it back on
    // just re-requests a stream rather than re-prompting for permission.
    async toggleCamera() {
      if (this.cameraOn) {
        if (this.cameraStream) this.cameraStream.getTracks().forEach(t => t.stop());
        this.cameraStream = null;
        const video = document.getElementById('camera-feed');
        if (video) video.srcObject = null;
        this.cameraOn = false;
      } else {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          document.getElementById('camera-feed').srcObject = stream;
          this.cameraStream = stream;
          this.cameraOn = true;
        } catch (e) {
          alert("Couldn't turn the camera back on — check your browser's site permissions.");
        }
      }
    },
    // Same idea for location: clears the GPS watch (no more position
    // updates) instead of revoking permission, so ambient labels/target
    // freeze and clear until switched back on.
    toggleLocation() {
      if (this.locationOn) {
        if (this.gpsWatchId !== null) navigator.geolocation.clearWatch(this.gpsWatchId);
        this.gpsWatchId = null;
        this.locationOn = false;
        this.statusOk = false;
        this.myPos = null;
        this.ambientBuildings = [];
      } else {
        this.locationOn = true;
        this.startLocationWatch();
      }
    },
    onOrientation(e) {
      const raw = e.webkitCompassHeading != null ? e.webkitCompassHeading : (360 - e.alpha) % 360;
      // Raw compass readings jitter several degrees per event — smooth with a
      // circular exponential moving average so labels glide instead of shaking.
      if (!this.headingInit) {
        this.heading = raw;
        this.headingInit = true;
      } else {
        const delta = relativeAngle(this.heading, raw);
        this.heading = (this.heading + delta * 0.15 + 360) % 360;
      }
      this.recompute();
    },
    // Maps a relative bearing to a horizontal screen position (50% = straight
    // ahead). Buildings outside a wide-ish cone are hidden for ambient labels,
    // but the searched target always shows, clamped to a screen edge with an
    // "offscreen" flag so you know which way to turn.
    bearingToScreen(relDeg, halfConeDeg) {
      const clamped = Math.max(-halfConeDeg, Math.min(halfConeDeg, relDeg));
      return 50 + (clamped / halfConeDeg) * 42;
    },
    recompute() {
      if (!this.myPos || !this.buildings.length) return;

      const ambient = [];
      for (const b of this.buildings) {
        if (this.target && b.id === this.target.id) continue;
        const dist = haversineMeters(this.myPos, b);
        if (dist > 300) continue;
        const rel = relativeAngle(this.heading, bearingDeg(this.myPos, b));
        // Hysteresis: wider cone to keep a label shown than to first show it,
        // so jitter right at the edge doesn't flicker it on/off.
        const wasVisible = this.ambientBuildings.some(x => x.id === b.id);
        const cone = wasVisible ? 75 : 60;
        if (Math.abs(rel) > cone) continue;
        ambient.push({ id: b.id, name: b.name, leftPercent: this.bearingToScreen(rel, 70) });
      }
      this.ambientBuildings = ambient;

      if (this.target) {
        const dist = Math.round(haversineMeters(this.myPos, this.target));
        const rel = relativeAngle(this.heading, bearingDeg(this.myPos, this.target));
        this.target = {
          ...this.target,
          distance: dist,
          leftPercent: this.bearingToScreen(rel, 70),
          offscreen: rel > 70 ? 'right' : (rel < -70 ? 'left' : false)
        };
      }
    },
    // Explicit pick from the "did you mean?" disambiguation list.
    selectBuilding(building) {
      this.target = { ...building };
      this.recompute();
    },
    openChat(building) {
      // Keep the running conversation when reopening the same building's chat
      // — only start fresh when it's actually a different building.
      const isSameBuilding = this.chatOpenFor && this.chatOpenFor.id === building.id;
      this.chatOpenFor = building;
      if (!isSameBuilding || this.chatMessages.length === 0) {
        this.chatMessages = [{ role: 'assistant', text: `Ask me anything about ${building.name} — I'll only answer from what's registered.` }];
      }
    },
    async sendChat() {
      if (!this.chatInput.trim() || this.chatLoading) return;
      const userText = this.chatInput;
      // Snapshot before pushing the new message — the server appends it separately.
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
    // Renders **bold** and markdown bullet lists (lines starting with "- "
    // or "* ") as real HTML instead of raw asterisks/dashes on one squished
    // line. Escapes first so neither the AI's text nor anything a user types
    // can inject raw HTML.
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
