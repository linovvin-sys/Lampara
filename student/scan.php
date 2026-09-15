<?php $cssVer = filemtime(__DIR__ . '/../assets/css/tailwind.css'); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Scan Signage</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/tailwind.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>
  html, body { margin: 0; font-family: 'Outfit', sans-serif; }
  #camera-feed { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
  .lamp-glow { filter: drop-shadow(0 0 18px rgba(245, 158, 11, 0.55)); }
</style>
</head>
<body class="bg-zinc-950">

<div id="app" class="relative w-screen h-screen text-white overflow-hidden">

  <!-- ===== STAGE 1: camera + tap-to-scan ===== -->
  <template v-if="stage === 'scan'">
    <video id="camera-feed" ref="video" autoplay playsinline muted></video>
    <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80"></div>

    <div class="relative z-10 p-4">
      <a href="../index.php" class="inline-flex items-center gap-1.5 text-xs text-white/70">&larr; Back to guide</a>
    </div>

    <div class="absolute top-16 left-4 flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-2.5 pr-3 py-1.5 z-10">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="#f59e0b" stroke-width="1.6"/><rect x="14.5" y="3.5" width="6" height="6" rx="1" stroke="#f59e0b" stroke-width="1.6"/><rect x="3.5" y="14.5" width="6" height="6" rx="1" stroke="#f59e0b" stroke-width="1.6"/><rect x="14.5" y="14.5" width="6" height="6" rx="1" stroke="#f59e0b" stroke-width="1.6"/></svg>
      <span class="text-xs font-medium">Point camera at a room signage</span>
    </div>

    <div class="absolute inset-0 flex flex-col items-center justify-center z-10 px-8">
      <p class="text-white/50 text-sm text-center mb-6">Not sure of the exact number? Type it manually below.</p>
      <input v-model="manualNumber" type="text" placeholder="e.g. 204" maxlength="10"
             class="w-40 text-center bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-lg font-mono tracking-widest text-white placeholder-white/30 focus:outline-none focus:border-amber-500 mb-4">
    </div>

    <div class="absolute bottom-10 inset-x-0 flex flex-col items-center gap-4 z-10">
      <button @click="performScan" :disabled="scanning"
              class="w-20 h-20 rounded-full bg-white border-4 border-amber-500 flex items-center justify-center lamp-glow disabled:opacity-60">
        <span v-if="!scanning" class="w-12 h-12 rounded-full bg-amber-50"></span>
        <span v-else class="text-zinc-900 text-xs font-semibold">…</span>
      </button>
      <p v-if="scanning" class="text-xs text-white/70">Reading sign with AI…</p>
      <p v-else-if="onCampus === false && !manualNumber" class="text-xs text-amber-400 font-medium px-8 text-center">AI scanning only works on campus grounds — type the room number manually instead</p>
      <p v-else class="text-xs text-white/70">Tap to read this sign with AI</p>
    </div>
  </template>

  <!-- ===== STAGE 2: result ===== -->
  <template v-else-if="stage === 'result'">
    <div class="min-h-screen bg-zinc-50 text-zinc-900 pb-10">
      <div v-if="room" class="px-5 pt-4">
        <div class="flex flex-col items-center mb-5">
          <div class="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#10b981"/><path d="M8 12.3l2.7 2.7L16.3 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span v-if="detectedNumber" class="inline-flex items-center gap-1.5 bg-zinc-900 text-white text-[10px] font-bold tracking-widest rounded-full px-3 py-1">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> READ BY AI
          </span>
          <span v-else class="inline-flex items-center gap-1.5 bg-zinc-200 text-zinc-600 text-[10px] font-bold tracking-widest rounded-full px-3 py-1">
            MANUALLY ENTERED
          </span>
        </div>

        <!-- "you are here" confirmation, not just a data card — uses the room's
             actual registered notes for spatial context (e.g. "Near Exit Stairs")
             instead of the AI guessing anything about physical layout. -->
        <div class="text-center mb-5">
          <h1 class="text-2xl font-bold text-zinc-900">You're at Room {{ room.room_number }}!</h1>
          <p class="text-zinc-500 text-sm mt-1">{{ room.room_name }} · {{ room.floor }}</p>
          <p v-if="room.notes" class="inline-flex items-center gap-1.5 bg-amber-50 text-amber-800 text-sm font-medium rounded-full px-3.5 py-1.5 mt-3">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="flex-shrink-0"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#92400e" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" stroke="#92400e" stroke-width="1.8"/></svg>
            {{ room.notes }}
          </p>
        </div>

        <div class="bg-white rounded-2xl border border-zinc-200 p-4 mb-4 shadow-sm">
          <div v-if="room.room_type === 'office'" class="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg px-2.5 py-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {{ room.hours || 'Hours not set' }}
          </div>
          <div v-else class="text-xs text-zinc-400 italic">Classroom/Lab — no fixed hours</div>
          <div class="text-zinc-400 text-xs mt-2">{{ room.building_name }}</div>
        </div>

        <button @click="reportOutdated" :disabled="reported"
                class="flex items-center gap-1.5 text-amber-700 text-xs font-semibold mb-6 disabled:opacity-50">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 3.5 22 20.5H2L12 3.5Z" stroke="#b45309" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="#b45309" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17.3" r="0.9" fill="#b45309"/></svg>
          {{ reported ? 'Thanks — reported to the campus admin' : 'This seems outdated — report it' }}
        </button>

        <button @click="reset" class="block text-center w-full bg-zinc-900 text-amber-400 rounded-full py-3.5 font-semibold">Scan Another</button>
        <a href="../index.php" class="block text-center text-zinc-500 text-sm font-medium mt-3">Back to outdoor guide</a>
      </div>

      <div v-else class="px-5 text-center pt-10">
        <p v-if="aiReadFailed" class="text-zinc-500 mb-1">Couldn't read a clear room number from that sign.</p>
        <p v-else-if="detectedNumber" class="text-zinc-500 mb-1">Read "<span class="font-mono font-semibold text-zinc-700">{{ detectedNumber }}</span>" — no room registered with that number yet.</p>
        <p v-else class="text-zinc-500 mb-1">No room registered with that number yet.</p>
        <p class="text-zinc-400 text-xs mb-4">Try repositioning the camera, or type the number manually.</p>
        <button @click="reset" class="text-amber-600 font-semibold text-sm block mx-auto mb-2">Try again →</button>
        <a href="manual-search.php" class="text-amber-600 font-semibold text-sm">Browse the directory instead →</a>
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
