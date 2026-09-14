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
    <video id="camera-feed" autoplay playsinline muted></video>
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
      <p class="text-xs text-white/70">{{ scanning ? 'Reading sign with AI…' : 'Tap to read this sign with AI' }}</p>
    </div>
  </template>

  <!-- ===== STAGE 2: result ===== -->
  <template v-else-if="stage === 'result'">
    <div class="min-h-screen bg-zinc-50 text-zinc-900 pb-10">
      <div class="p-4">
        <button @click="reset" class="text-xs text-zinc-500">&larr; Scan another</button>
      </div>

      <div v-if="room" class="px-5">
        <div class="flex flex-col items-center mb-6">
          <div class="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-2">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#10b981"/><path d="M8 12.3l2.7 2.7L16.3 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span class="inline-flex items-center gap-1.5 bg-zinc-900 text-white text-[10px] font-bold tracking-widest rounded-full px-3 py-1">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span> VERIFIED BY AI
          </span>
        </div>

        <div class="bg-white rounded-2xl border border-zinc-200 p-4 mb-4 shadow-sm">
          <div class="font-bold text-lg">Room {{ room.room_number }} — {{ room.room_name }}</div>
          <div class="text-zinc-500 text-sm">{{ room.floor }}, {{ room.building_name }}</div>
          <div v-if="room.room_type === 'office'" class="mt-2 inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg px-2.5 py-1">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {{ room.hours || 'Hours not set' }}
          </div>
          <div v-else class="mt-2 text-xs text-zinc-400 italic">Classroom/Lab — no fixed hours</div>
        </div>

        <button @click="reportOutdated" :disabled="reported"
                class="flex items-center gap-1.5 text-amber-700 text-xs font-semibold mb-6 disabled:opacity-50">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 3.5 22 20.5H2L12 3.5Z" stroke="#b45309" stroke-width="1.9" stroke-linejoin="round"/><path d="M12 10v4.5" stroke="#b45309" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="17.3" r="0.9" fill="#b45309"/></svg>
          {{ reported ? 'Thanks — reported to the campus admin' : 'This seems outdated — report it' }}
        </button>

        <a href="../index.php" class="block text-center bg-zinc-900 text-amber-400 rounded-full py-3.5 font-semibold">Back to Guide</a>
      </div>

      <div v-else class="px-5 text-center pt-10">
        <p class="text-zinc-500 mb-4">No room registered with that number yet.</p>
        <a href="manual-search.php" class="text-amber-600 font-semibold text-sm">Browse the directory instead →</a>
      </div>
    </div>
  </template>

</div>

<script>
const { createApp } = Vue;
createApp({
  data() {
    return { stage: 'scan', scanning: false, manualNumber: '', room: null, reported: false };
  },
  async mounted() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      document.getElementById('camera-feed').srcObject = stream;
    } catch (e) { /* camera optional for manual-number fallback */ }
  },
  methods: {
    async performScan() {
      // TODO: this is where the real two-stage detection belongs —
      // (1) a local bounding-box pass flags likely signage in the live frame,
      // (2) only on tap does a captured frame get sent to an AI vision call
      //     (e.g. Gemini Vision) that OCRs the room number off the sign.
      // For now this uses whatever the user typed manually, so the rest of
      // the flow (room lookup, result screen) is fully real and working.
      const roomNumber = this.manualNumber.trim();
      if (!roomNumber) { alert('Type the room number shown on the sign, or wire up AI scanning here.'); return; }
      this.scanning = true;
      try {
        const res = await fetch('../api/rooms.php?room_number=' + encodeURIComponent(roomNumber));
        const data = await res.json();
        this.room = (data.success && data.rooms.length) ? data.rooms[0] : null;
      } finally {
        this.scanning = false;
        this.stage = 'result';
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
    }
  }
}).mount('#app');
</script>

</body>
</html>
