<?php $cssVer = filemtime(__DIR__ . '/../assets/css/tailwind.css'); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Scan Signage</title>
<meta name="theme-color" content="#09090b">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/tailwind.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>
  :root {
    --green-50:  #f0fdf4;
    --green-100: #dcfce7;
    --green-500: #22c55e;
    --green-600: #16a34a;
    --green-700: #15803d;
    --moss-100:  #ecfccb;
    --moss-500:  #65a30d;
    --ink:       #14251c;
    --muted:     #5b6b63;
    --line:      #e3ede6;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; font-family: 'Outfit', sans-serif; }
  #camera-feed { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
  .lamp-glow { filter: drop-shadow(0 0 18px rgba(16, 185, 129, 0.55)); }
  /* The precompiled tailwind.css bundle has no emerald border utilities (it
     only ships classes other pages already used) — defined directly here
     instead of pulling in the Tailwind build step. */
  .scan-ring { border-color: #22c55e; }
  .scan-input:focus { outline: none; border-color: #22c55e; }
  .pointer-events-auto { pointer-events: auto; }

  /* ---- Stage 2: result screen (full card-based redesign) ---- */
  .result-shell { max-width: 30rem; margin: 0 auto; min-height: 100dvh; background: #ffffff; color: var(--ink); padding-bottom: 2.5rem; }

  .confirm-badge {
    width: 4rem; height: 4rem; border-radius: 999px;
    background: var(--green-100);
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 0.6rem;
  }

  .source-tag {
    display: inline-flex; align-items: center; gap: 0.4rem;
    font-size: 0.625rem; font-weight: 800; letter-spacing: 0.06em;
    border-radius: 999px; padding: 0.3rem 0.75rem;
  }
  .source-tag.ai { background: var(--ink); color: #ffffff; }
  .source-tag.ai .dot { width: 0.35rem; height: 0.35rem; border-radius: 999px; background: var(--green-500); }
  .source-tag.manual { background: #eef1ee; color: var(--muted); }

  .result-heading { text-align: center; margin: 1rem 0 1.25rem; }
  .result-heading h1 { font-size: 1.5rem; font-weight: 800; margin: 0; }
  .result-heading p { color: var(--muted); font-size: 0.875rem; margin: 0.3rem 0 0; }

  .notes-pill {
    display: inline-flex; align-items: center; gap: 0.5rem;
    background: var(--green-50); color: var(--green-700);
    font-size: 0.8125rem; font-weight: 600;
    border-radius: 999px; padding: 0.5rem 0.9rem; margin-top: 0.75rem;
  }

  .info-card {
    background: #ffffff; border: 1px solid var(--line); border-radius: 1rem;
    padding: 1rem 1.1rem; margin: 0 1.1rem 1rem; box-shadow: 0 1px 2px rgba(20,37,28,0.04);
  }
  .hours-badge {
    display: inline-flex; align-items: center; gap: 0.4rem;
    background: var(--green-50); color: var(--green-700);
    font-size: 0.75rem; font-weight: 700; border-radius: 0.5rem; padding: 0.3rem 0.6rem;
  }
  .hours-badge .dot { width: 0.35rem; height: 0.35rem; border-radius: 999px; background: var(--green-500); }
  .no-hours { color: #9aa79f; font-size: 0.75rem; font-style: italic; }
  .building-line { color: #9aa79f; font-size: 0.75rem; margin-top: 0.5rem; }

  .report-btn {
    display: flex; align-items: center; gap: 0.4rem;
    background: none; border: none; font-family: inherit; cursor: pointer;
    color: var(--moss-500); font-size: 0.8125rem; font-weight: 700;
    margin: 0 1.1rem 1.5rem;
  }
  .report-btn:disabled { opacity: 0.6; cursor: default; }

  .btn-dark {
    display: block; text-align: center; width: calc(100% - 2.2rem);
    margin: 0 1.1rem; background: var(--ink); color: var(--green-500);
    border: none; border-radius: 999px; padding: 0.9rem; font-weight: 700; font-size: 0.9375rem;
    font-family: inherit; cursor: pointer;
  }
  .back-link { display: block; text-align: center; color: var(--muted); font-size: 0.875rem; font-weight: 600; margin-top: 0.9rem; text-decoration: none; }

  .not-found { padding: 3rem 1.5rem 0; text-align: center; }
  .not-found p.primary { color: var(--muted); margin: 0 0 0.25rem; }
  .not-found p.secondary { color: #9aa79f; font-size: 0.75rem; margin: 0 0 1.25rem; }
  .not-found .link-btn { display: block; margin: 0 auto 0.5rem; background: none; border: none; font-family: inherit; cursor: pointer; color: var(--green-700); font-weight: 700; font-size: 0.875rem; }
</style>
</head>
<body style="background:#09090b;">

<div id="app" style="position:relative; width:100vw; height:100vh; color:#fff; overflow:hidden;">

  <!-- ===== STAGE 1: camera + tap-to-scan (AR chrome kept, recolored) ===== -->
  <template v-if="stage === 'scan'">
    <video id="camera-feed" ref="video" autoplay playsinline muted></video>
    <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80"></div>

    <div class="relative z-10 p-4">
      <a href="../guide.php" class="inline-flex items-center gap-1.5 text-xs text-white/70">&larr; Back to guide</a>
    </div>

    <div class="absolute top-16 left-4 flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-2.5 pr-3 py-1.5 z-10">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="#22c55e" stroke-width="1.6"/><rect x="14.5" y="3.5" width="6" height="6" rx="1" stroke="#22c55e" stroke-width="1.6"/><rect x="3.5" y="14.5" width="6" height="6" rx="1" stroke="#22c55e" stroke-width="1.6"/><rect x="14.5" y="14.5" width="6" height="6" rx="1" stroke="#22c55e" stroke-width="1.6"/></svg>
      <span class="text-xs font-medium">Point camera at a room signage</span>
    </div>

    <div class="absolute inset-0 flex flex-col items-center justify-center z-10 px-8 pointer-events-none">
      <p class="text-white/50 text-sm text-center mb-6">Not sure of the exact number? Type it manually below.</p>
      <input v-model="manualNumber" type="text" placeholder="e.g. 204" maxlength="10"
             class="w-40 text-center bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-lg font-mono tracking-widest text-white placeholder-white/30 focus:outline-none scan-input mb-4 pointer-events-auto">
    </div>

    <div class="absolute bottom-10 inset-x-0 flex flex-col items-center gap-4 z-10">
      <button @click="performScan" :disabled="scanning"
              class="w-20 h-20 rounded-full bg-white border-4 scan-ring flex items-center justify-center lamp-glow disabled:opacity-60">
        <span v-if="!scanning" class="w-12 h-12 rounded-full bg-emerald-50"></span>
        <span v-else class="text-zinc-900 text-xs font-semibold">…</span>
      </button>
      <p v-if="scanning" class="text-xs text-white/70">Reading sign with AI…</p>
      <p v-else-if="onCampus === false && !manualNumber" class="text-xs text-white/70 font-medium px-8 text-center">AI scanning only works on campus grounds — type the room number manually instead</p>
      <p v-else class="text-xs text-white/70">Tap to read this sign with AI</p>
    </div>
  </template>

  <!-- ===== STAGE 2: result (full white/green card redesign) ===== -->
  <template v-else-if="stage === 'result'">
    <div class="result-shell">
      <div v-if="room" style="padding-top:1.25rem;">
        <div style="display:flex; flex-direction:column; align-items:center;">
          <div class="confirm-badge">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#16a34a"/><path d="M8 12.3l2.7 2.7L16.3 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span v-if="detectedNumber" class="source-tag ai"><span class="dot"></span> READ BY AI</span>
          <span v-else class="source-tag manual">MANUALLY ENTERED</span>
        </div>

        <!-- "you are here" confirmation, not just a data card — uses the room's
             actual registered notes for spatial context (e.g. "Near Exit Stairs")
             instead of the AI guessing anything about physical layout. -->
        <div class="result-heading">
          <h1>You're at Room {{ room.room_number }}!</h1>
          <p>{{ room.room_name }} &middot; {{ room.floor }}</p>
          <div v-if="room.notes">
            <span class="notes-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg>
              {{ room.notes }}
            </span>
          </div>
        </div>

        <div class="info-card">
          <div v-if="room.room_type === 'office'" class="hours-badge"><span class="dot"></span> {{ room.hours || 'Hours not set' }}</div>
          <div v-else class="no-hours">Classroom/Lab — no fixed hours</div>
          <div class="building-line">{{ room.building_name }}</div>
        </div>

        <button @click="reportOutdated" :disabled="reported" class="report-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3.5 22 20.5H2L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none"/></svg>
          {{ reported ? 'Thanks — reported to the campus admin' : 'This seems outdated — report it' }}
        </button>

        <button @click="reset" class="btn-dark">Scan Another</button>
        <a href="../guide.php" class="back-link">Back to outdoor guide</a>
      </div>

      <div v-else class="not-found">
        <p v-if="aiReadFailed" class="primary">Couldn't read a clear room number from that sign.</p>
        <p v-else-if="detectedNumber" class="primary">Read "<span style="font-family:'JetBrains Mono',monospace; font-weight:600; color:var(--ink);">{{ detectedNumber }}</span>" — no room registered with that number yet.</p>
        <p v-else class="primary">No room registered with that number yet.</p>
        <p class="secondary">Try repositioning the camera, or type the number manually.</p>
        <button @click="reset" class="link-btn">Try again &rarr;</button>
        <a href="manual-search.php" class="link-btn">Browse the directory instead &rarr;</a>
      </div>
    </div>
  </template>

</div>

<script>
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
      cameraReady: false, detectedNumber: null, aiReadFailed: false,
      onCampus: null // null = still checking, true/false once GPS resolves
    };
  },
  async mounted() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      document.getElementById('camera-feed').srcObject = stream;
      this.cameraReady = true;
    } catch (e) { /* camera optional for manual-number fallback */ }

    // Gate AI scanning to campus grounds — otherwise it'll happily OCR a
    // room number off literally any sign anywhere and check it against the
    // database, with no connection to whether you're actually here.
    if (navigator.geolocation) {
      try {
        const res = await fetch('../api/buildings.php');
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
  methods: {
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
      const res = await fetch('../api/rooms.php?room_number=' + encodeURIComponent(roomNumber));
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
        const res = await fetch('../api/scan.php', {
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
    async reportOutdated() {
      if (!this.room) return;
      await fetch('../api/flags.php', {
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
    }
  }
}).mount('#app');
</script>

</body>
</html>
