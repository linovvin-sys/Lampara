<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/tailwind.css">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>
  html, body { margin: 0; height: 100%; overflow: hidden; font-family: 'Outfit', sans-serif; }
  #camera-feed { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
  .lamp-glow { filter: drop-shadow(0 0 18px rgba(245, 158, 11, 0.55)); }
  .fade-bg { background: linear-gradient(180deg, rgba(0,0,0,.75), rgba(0,0,0,.05) 45%, rgba(0,0,0,.05) 60%, rgba(0,0,0,.85)); }
</style>
</head>
<body class="bg-black">

<div id="app" class="relative w-screen h-screen text-white select-none">

  <!-- live camera background -->
  <video id="camera-feed" autoplay playsinline muted></video>
  <div class="absolute inset-0 z-0 fade-bg"></div>

  <!-- setup / permission screen -->
  <div v-if="!started" class="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950">
    <div class="text-center max-w-sm px-6">
      <div class="w-14 h-14 mx-auto mb-5 rounded-2xl bg-amber-500 flex items-center justify-center lamp-glow">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
      </div>
      <h1 class="text-2xl font-bold mb-2">Start Lampara</h1>
      <p class="text-white/60 text-sm mb-6 leading-relaxed">Needs camera, location, and compass permission to point you toward nearby registered buildings.</p>
      <button @click="start" class="bg-amber-500 hover:bg-amber-400 text-zinc-900 rounded-2xl px-6 py-3.5 font-semibold w-full transition">
        Enable Camera &amp; Location
      </button>
      <p v-if="statusText && !statusOk" class="text-amber-400 text-xs font-mono mt-4">{{ statusText }}</p>
    </div>
  </div>

  <!-- top status row -->
  <div v-if="started" class="relative z-10 p-4 flex items-center gap-2">
    <div class="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full pl-2.5 pr-3 py-1.5">
      <span class="w-1.5 h-1.5 rounded-full" :class="statusOk ? 'bg-emerald-400' : 'bg-amber-400'"></span>
      <span class="text-xs font-medium text-white">GPS + Compass</span>
    </div>
    <a href="student/manual-search.php" class="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M8.5 8.7a9.9 9.9 0 0 1 10.9 2M5 12a9.9 9.9 0 0 1 3-2.2M12 19.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6ZM8.8 15.2a5.5 5.5 0 0 1 6.6.1" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      No signal? Search manually
    </a>
  </div>

  <!-- AR overlay: nearest building "in view" -->
  <div v-if="started && facingBuilding" class="absolute top-[38%] left-1/2 -translate-x-1/2 z-10 text-center">
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" class="mx-auto mb-3 lamp-glow transition-transform duration-300" :style="{ transform: 'rotate(' + arrowRotation + 'deg)' }">
      <path d="M12 3.5 L19.5 16 L12 12.7 L4.5 16 Z" fill="#f59e0b"/>
    </svg>
    <div class="bg-white text-zinc-900 rounded-2xl px-4 py-3 inline-block shadow-2xl">
      <div class="font-semibold text-base">{{ facingBuilding.name }}</div>
      <div class="text-xs mt-0.5"><span class="font-mono font-medium text-amber-600">{{ facingBuilding.distance }}m</span> <span class="text-zinc-500">away</span></div>
    </div>
  </div>

  <!-- bottom action row -->
  <div v-if="started && facingBuilding" class="absolute bottom-8 inset-x-0 z-10 flex flex-col items-center gap-3">
    <a href="student/scan.php" class="flex items-center gap-2 bg-white/95 text-zinc-900 rounded-full px-4 py-2.5 text-xs font-medium shadow-lg">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.2" stroke="#111" stroke-width="1.6"/></svg>
      Scan signage (indoor)
    </a>
    <button @click="openChat(facingBuilding)" class="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 rounded-full px-6 py-3.5 font-semibold shadow-2xl transition lamp-glow">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 12c0 4.418-4.03 8-9 8-1.06 0-2.078-.163-3.024-.463L3 21l1.5-4.5C3.55 15.06 3 13.57 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" stroke="#111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Ask Lampara
    </button>
  </div>

  <!-- chat panel -->
  <div v-if="chatOpenFor" class="absolute inset-0 z-40 bg-zinc-950/60 flex items-end" @click.self="chatOpenFor = null">
    <div class="bg-white text-zinc-900 rounded-t-3xl w-full max-h-[75vh] flex flex-col">
      <div class="flex justify-between items-center px-5 pt-5 pb-3 border-b border-zinc-100">
        <h2 class="font-bold">Ask Lampara</h2>
        <button @click="chatOpenFor = null" class="text-zinc-400 text-2xl leading-none">&times;</button>
      </div>
      <div class="px-5 pt-3">
        <div class="flex items-center gap-2 bg-amber-50 text-amber-800 text-[11px] font-medium rounded-xl px-3 py-2">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
          Grounded on {{ chatOpenFor.name }}'s registered directory only
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm" ref="chatLog">
        <div v-for="(m, i) in chatMessages" :key="i" class="flex items-end gap-2" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
          <div v-if="m.role !== 'user'" class="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <span class="inline-block px-3.5 py-2.5 rounded-2xl max-w-[75%]" :class="m.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800'">{{ m.text }}</span>
        </div>
      </div>
      <form @submit.prevent="sendChat" class="flex gap-2 p-4 border-t border-zinc-100">
        <input v-model="chatInput" type="text" placeholder="Ask about this building…" class="flex-1 bg-zinc-100 rounded-full px-4 py-3 text-sm focus:outline-none">
        <button class="w-11 h-11 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 20 4l-4.5 16-4-6.5L4 12.5Z" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/></svg>
        </button>
      </form>
    </div>
  </div>

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
function bearingDeg(a, b) {
  const lat1 = a.lat * Math.PI / 180, lat2 = b.lat * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

createApp({
  data() {
    return {
      started: false,
      statusText: '',
      statusOk: false,
      buildings: [],
      myPos: null,
      heading: 0,
      facingBuilding: null,
      arrowRotation: 0,
      chatOpenFor: null,
      chatMessages: [],
      chatInput: ''
    };
  },
  methods: {
    async start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        document.getElementById('camera-feed').srcObject = stream;
      } catch (e) {
        this.statusText = 'Camera permission denied.';
        return;
      }

      if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { await DeviceOrientationEvent.requestPermission(); } catch (e) {}
      }
      window.addEventListener('deviceorientationabsolute', this.onOrientation, true);
      window.addEventListener('deviceorientation', this.onOrientation, true);

      if (!navigator.geolocation) {
        this.statusText = 'Geolocation not supported.';
        return;
      }
      navigator.geolocation.watchPosition(
        (pos) => {
          this.myPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          this.statusOk = true;
          this.recompute();
        },
        (err) => { this.statusText = 'GPS error: ' + err.message; },
        { enableHighAccuracy: true }
      );

      const res = await fetch('api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;

      this.started = true;
    },
    onOrientation(e) {
      this.heading = e.webkitCompassHeading != null ? e.webkitCompassHeading : (360 - e.alpha) % 360;
      this.recompute();
    },
    recompute() {
      if (!this.myPos || !this.buildings.length) return;
      let best = null, bestDiff = 999;
      for (const b of this.buildings) {
        const dist = haversineMeters(this.myPos, b);
        if (dist > 300) continue;
        const brg = bearingDeg(this.myPos, b);
        let diff = Math.abs(((brg - this.heading + 540) % 360) - 180);
        if (diff < 35 && diff < bestDiff) {
          bestDiff = diff;
          best = { ...b, distance: Math.round(dist), bearing: brg };
        }
      }
      this.facingBuilding = best;
      if (best) {
        const rel = ((best.bearing - this.heading + 540) % 360) - 180;
        this.arrowRotation = rel;
      }
    },
    openChat(building) {
      this.chatOpenFor = building;
      this.chatMessages = [{ role: 'assistant', text: `Ask me anything about ${building.name} — I'll only answer from what's registered.` }];
    },
    async sendChat() {
      if (!this.chatInput.trim()) return;
      const userText = this.chatInput;
      this.chatMessages.push({ role: 'user', text: userText });
      this.chatInput = '';
      try {
        const res = await fetch('api/chat.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ building_id: this.chatOpenFor.id, message: userText })
        });
        const data = await res.json();
        this.chatMessages.push({ role: 'assistant', text: data.reply || "I don't have that information." });
      } catch (e) {
        this.chatMessages.push({ role: 'assistant', text: "Couldn't reach the server — try again once you're back online." });
      }
    }
  }
}).mount('#app');
</script>

</body>
</html>
