<?php $cssVer = filemtime(__DIR__ . '/assets/css/tailwind.css'); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Guide</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/tailwind.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>
  /* 100% first as a fallback, then 100dvh (dynamic viewport height) overrides
     it on browsers that support it — dvh tracks the REAL visible viewport as
     the browser's own address bar/nav collapses or the keyboard opens, so
     content doesn't end up sized for a viewport that no longer exists. */
  html, body { margin: 0; height: 100%; height: 100dvh; overflow: hidden; font-family: 'Outfit', sans-serif; }
  #app { height: 100dvh; }
  #camera-feed { position: fixed; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
  .lamp-glow { filter: drop-shadow(0 0 18px rgba(245, 158, 11, 0.55)); }
  .fade-bg { background: linear-gradient(180deg, rgba(0,0,0,.75), rgba(0,0,0,.05) 45%, rgba(0,0,0,.05) 60%, rgba(0,0,0,.85)); }
  @keyframes ar-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
  .ar-bounce { animation: ar-bounce 900ms ease-in-out infinite; }

  /* Press feedback — makes buttons feel like they're actually listening. */
  .press { transition: transform 160ms ease-out; }
  .press:active { transform: scale(0.97); }

  /* Chat message entrance */
  .msg-enter-active { transition: opacity 200ms ease-out, transform 200ms ease-out; }
  .msg-enter-from { opacity: 0; transform: translateY(8px); }

  /* Chat sheet slide-up */
  .sheet-enter-active { transition: transform 260ms cubic-bezier(0.32, 0.72, 0, 1); }
  .sheet-leave-active { transition: transform 200ms ease-in; }
  .sheet-enter-from, .sheet-leave-to { transform: translateY(100%); }

  /* "AI is thinking" typing indicator */
  .typing-dot { width: 6px; height: 6px; border-radius: 9999px; background: #a1a1aa; animation: typing-bounce 1.1s infinite ease-in-out; }
  .typing-dot:nth-child(2) { animation-delay: 150ms; }
  .typing-dot:nth-child(3) { animation-delay: 300ms; }
  @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-4px); opacity: 1; } }

</style>
</head>
<body class="bg-black">

<div id="app" class="relative w-screen h-screen text-white select-none overflow-hidden">

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
      <button @click="start" class="press bg-amber-500 hover:bg-amber-400 text-zinc-900 rounded-2xl px-6 py-3.5 font-semibold w-full transition">
        Enable Camera &amp; Location
      </button>
      <p v-if="statusText && !statusOk" class="text-amber-400 text-xs font-mono mt-4">{{ statusText }}</p>
    </div>
  </div>

  <!-- top status row + search -->
  <div v-if="started" class="relative z-20 p-4 flex flex-col gap-2">
    <div class="flex items-center gap-2">
      <div class="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full pl-2.5 pr-3 py-1.5">
        <span class="w-1.5 h-1.5 rounded-full" :class="statusOk ? 'bg-emerald-400' : 'bg-amber-400'"></span>
        <span class="text-xs font-medium text-white">GPS + Compass</span>
      </div>
      <a href="student/manual-search.php" class="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M8.5 8.7a9.9 9.9 0 0 1 10.9 2M5 12a9.9 9.9 0 0 1 3-2.2M12 19.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6ZM8.8 15.2a5.5 5.5 0 0 1 6.6.1" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
        No signal? Search manually
      </a>
    </div>
    <div class="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3.5 py-2.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="flex-shrink-0"><circle cx="10.5" cy="10.5" r="6.5" stroke="#fff" stroke-opacity="0.5" stroke-width="1.8"/><path d="M20 20l-4.5-4.5" stroke="#fff" stroke-opacity="0.5" stroke-width="1.8" stroke-linecap="round"/></svg>
      <input v-model="searchQuery" type="text" placeholder="Search a building to get directions…"
             class="flex-1 bg-transparent text-sm text-white placeholder-white/40 focus:outline-none">
      <button v-if="searchQuery" @click="searchQuery = ''" class="text-white/50 text-xs font-medium flex-shrink-0">Clear</button>
    </div>
  </div>

  <!-- ambient idle labels: every nearby building's name, dim, positioned left/right by
       relative compass bearing so it roughly matches the direction you'd turn to face it -->
  <div v-if="started" class="absolute inset-0 z-10 pointer-events-none">
    <div v-for="b in ambientBuildings" :key="b.id"
         class="absolute top-[30%] -translate-x-1/2 transition-all duration-300 bg-black/40 text-white/70 text-xs font-medium rounded-full px-3 py-1.5 whitespace-nowrap"
         :style="{ left: b.leftPercent + '%' }">
      {{ b.name }}
    </div>
  </div>

  <!-- target building: bouncing arrow + card, promoted once search finds a match -->
  <div v-if="started && target" class="absolute top-[36%] -translate-x-1/2 z-10 text-center transition-all duration-300" :style="{ left: target.leftPercent + '%' }">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="mx-auto mb-2 lamp-glow ar-bounce" :style="{ transform: 'rotate(' + (target.offscreen ? (target.offscreen === 'left' ? -90 : 90) : 0) + 'deg)' }">
      <path d="M12 3.5 L19.5 16 L12 12.7 L4.5 16 Z" fill="#f59e0b"/>
    </svg>
    <div class="bg-white text-zinc-900 rounded-2xl px-4 py-3 inline-block shadow-2xl">
      <div class="font-semibold text-base">{{ target.name }}</div>
      <div class="text-xs mt-0.5">
        <span class="font-mono font-medium text-amber-600">{{ target.distance }}m</span>
        <span class="text-zinc-500">{{ target.offscreen ? '— turn to face it' : 'away' }}</span>
      </div>
    </div>
  </div>

  <!-- bottom action row: only once a search finds a target building -->
  <div v-if="started && target" class="absolute bottom-10 inset-x-0 z-20 flex flex-col items-center gap-3">
    <a href="student/scan.php" class="press flex items-center gap-2 bg-white/95 text-zinc-900 rounded-full px-4 py-2.5 text-xs font-medium shadow-lg">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.2" stroke="#111" stroke-width="1.6"/></svg>
      Scan signage (indoor)
    </a>
    <button @click="openChat(target)" class="press flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-zinc-900 rounded-full px-6 py-3.5 font-semibold shadow-2xl transition lamp-glow">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 12c0 4.418-4.03 8-9 8-1.06 0-2.078-.163-3.024-.463L3 21l1.5-4.5C3.55 15.06 3 13.57 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" stroke="#111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Ask Lampara
    </button>
  </div>

  <!-- chat panel -->
  <transition name="sheet">
    <div v-if="chatOpenFor" class="absolute inset-0 z-40 bg-zinc-950/60" @click.self="chatOpenFor = null">
      <div class="bg-white text-zinc-900 w-full h-full flex flex-col">
        <div class="flex justify-between items-center px-5 pt-5 pb-3 border-b border-zinc-100">
          <h2 class="font-bold">Ask Lampara</h2>
          <button @click="chatOpenFor = null" class="press text-zinc-400 text-2xl leading-none">&times;</button>
        </div>
        <div class="px-5 pt-3">
          <div class="flex items-center gap-2 bg-amber-50 text-amber-800 text-[11px] font-medium rounded-xl px-3 py-2">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500 flex-shrink-0"></span>
            Grounded on {{ chatOpenFor.name }}'s registered directory only
          </div>
        </div>
        <transition-group tag="div" name="msg" class="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm" ref="chatLog">
          <div v-for="(m, i) in chatMessages" :key="i" class="flex items-end gap-2" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
            <div v-if="m.role !== 'user'" class="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <span class="inline-block px-3.5 py-2.5 rounded-2xl max-w-[75%]" :class="m.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800'" v-html="formatMessage(m.text)"></span>
          </div>
          <div v-if="chatLoading" key="typing" class="flex items-end gap-2 justify-start">
            <div class="w-7 h-7 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <span class="inline-flex items-center gap-1 bg-zinc-100 rounded-2xl px-4 py-3.5">
              <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
            </span>
          </div>
        </transition-group>
        <form @submit.prevent="sendChat" class="flex gap-2 p-4 pb-6 border-t border-zinc-100">
          <input v-model="chatInput" type="text" placeholder="Ask about this building…" :disabled="chatLoading"
                 class="flex-1 bg-zinc-100 rounded-full px-4 py-3 text-sm focus:outline-none disabled:opacity-60">
          <button class="press w-11 h-11 rounded-full bg-amber-500 flex items-center justify-center flex-shrink-0 disabled:opacity-60" :disabled="chatLoading">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 20 4l-4.5 16-4-6.5L4 12.5Z" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/></svg>
          </button>
        </form>
      </div>
    </div>
  </transition>

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
// Signed angular difference in [-180, 180]: positive = b is clockwise (right) of a.
function relativeAngle(fromDeg, toDeg) {
  return ((toDeg - fromDeg + 540) % 360) - 180;
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
      headingInit: false,
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
    matchedBuilding() {
      const q = this.searchQuery.trim().toLowerCase();
      if (q.length < 2) return null;
      return this.buildings.find(b => b.name.toLowerCase().includes(q)) || null;
    }
  },
  watch: {
    matchedBuilding(building) { this.target = building ? { ...building } : null; this.recompute(); }
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
      // Registering both event types made Android phones fire two different,
      // sometimes-conflicting heading readings per physical movement — that
      // conflict, not sensor noise, is what smoothing alone couldn't fix.
      // Use "absolute" (true compass-referenced) when the browser supports
      // it; only fall back to plain deviceorientation otherwise.
      if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', this.onOrientation, true);
      } else {
        window.addEventListener('deviceorientation', this.onOrientation, true);
      }

      if (!navigator.geolocation) {
        this.statusText = 'Geolocation not supported.';
        return;
      }
      navigator.geolocation.watchPosition(
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

      const res = await fetch('api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;

      this.started = true;
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
        const res = await fetch('api/chat.php', {
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
    // Renders **bold** from the AI's reply as real bold — escape first so
    // neither the AI's text nor anything a user types can inject raw HTML.
    formatMessage(text) {
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      return escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    }
  }
}).mount('#app');
</script>

</body>
</html>
