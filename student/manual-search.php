<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Manual Search</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/tailwind.css">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>body { font-family: 'Outfit', sans-serif; }</style>
</head>
<body class="bg-white min-h-screen">

<div id="app" class="max-w-lg mx-auto">
  <div class="bg-zinc-900 px-5 py-4 flex items-center gap-3">
    <a href="../index.php" class="text-white/70 text-sm">&larr;</a>
    <h1 class="text-white font-semibold">Manual Search</h1>
  </div>

  <div class="bg-zinc-900 text-white flex items-center gap-2.5 px-5 py-3">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M8.5 8.7a9.9 9.9 0 0 1 10.9 2M5 12a9.9 9.9 0 0 1 3-2.2M12 19.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6ZM8.8 15.2a5.5 5.5 0 0 1 6.6.1" stroke="#f59e0b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <div>
      <div class="text-sm font-bold">{{ isOffline ? "You're offline" : "Directory" }}</div>
      <div class="text-xs text-white/60">
        <span v-if="cachedAt">{{ isOffline ? 'Showing directory cached at ' : 'Last synced ' }}{{ cachedAt }}</span>
        <span v-else>Loading directory…</span>
      </div>
    </div>
  </div>

  <div class="px-5 pt-5 pb-2">
    <h2 class="text-xl font-extrabold text-zinc-900">Find your room</h2>
    <p class="text-zinc-500 text-xs mt-1">Browse all registered rooms and offices — works with zero signal once loaded once</p>
  </div>

  <div class="px-5 mb-3">
    <div class="flex items-center gap-2 bg-zinc-100 rounded-2xl px-4 py-2.5">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="#8a8a90" stroke-width="1.8"/><path d="M20 20l-4.5-4.5" stroke="#8a8a90" stroke-width="1.8" stroke-linecap="round"/></svg>
      <input v-model="q" @input="search" type="text" placeholder="Search rooms or offices…" class="flex-1 bg-transparent text-sm focus:outline-none">
    </div>
  </div>

  <div class="px-5 flex gap-2 mb-4">
    <button @click="filterType = 'all'" :class="filterType === 'all' ? 'bg-amber-500 text-white' : 'bg-zinc-100 text-zinc-600'" class="text-xs font-semibold rounded-full px-3.5 py-2">All</button>
    <button @click="filterType = 'office'" :class="filterType === 'office' ? 'bg-amber-500 text-white' : 'bg-zinc-100 text-zinc-600'" class="text-xs font-semibold rounded-full px-3.5 py-2">Offices</button>
    <button @click="filterType = 'classroom'" :class="filterType === 'classroom' ? 'bg-amber-500 text-white' : 'bg-zinc-100 text-zinc-600'" class="text-xs font-semibold rounded-full px-3.5 py-2">Classrooms/Labs</button>
  </div>

  <div class="px-5 space-y-2 pb-6">
    <div v-if="loading" class="text-center text-zinc-400 text-sm py-8">Loading…</div>
    <div v-else-if="filtered.length === 0" class="text-center text-zinc-400 text-sm py-8">No rooms match.</div>
    <a v-for="r in filtered" :key="r.id" href="scan.php" class="flex items-center gap-3 bg-white border border-zinc-200 rounded-2xl p-3">
      <div class="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" :class="r.room_type === 'office' ? 'bg-amber-100' : 'bg-emerald-100'">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 21V9l8-5 8 5v12" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 21v-6h6v6" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/></svg>
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-sm text-zinc-900 truncate">{{ r.room_name }}</div>
        <div class="text-xs text-zinc-500">Room {{ r.room_number }} · {{ r.floor }}</div>
      </div>
      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" class="flex-shrink-0"><path d="M9 5l7 7-7 7" stroke="#a1a1aa" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>
  </div>

  <div class="mx-5 mb-8 flex items-start gap-2.5 bg-amber-50 rounded-2xl p-3.5">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" class="flex-shrink-0 mt-0.5"><circle cx="12" cy="12" r="9.5" stroke="#b45309" stroke-width="1.7"/><path d="M12 11v5.5M12 8v.01" stroke="#b45309" stroke-width="1.8" stroke-linecap="round"/></svg>
    <p class="text-[11px] text-amber-800 leading-relaxed">AI chat and signage scanning need a connection — reconnect to use them. Directory browsing works offline once it's loaded here at least once.</p>
  </div>
</div>

<script>
const { createApp } = Vue;
const CACHE_KEY = 'lampara_rooms_cache';
const CACHE_TIME_KEY = 'lampara_rooms_cache_time';

// Real offline-first pattern: cache the full directory in localStorage the
// first time it loads successfully. After that, this page works with zero
// signal — it just serves (and client-side filters) the cached snapshot.
// Honest limitation: the snapshot is only as fresh as the last time this
// device was online here, same staleness discipline as the rest of the app.
createApp({
  data() {
    return { q: '', filterType: 'all', rooms: [], loading: true, isOffline: !navigator.onLine, cachedAt: null };
  },
  computed: {
    filtered() {
      let list = this.rooms;
      if (this.filterType !== 'all') list = list.filter(r => r.room_type === this.filterType);
      // When offline (or the network request failed), filter the cached
      // snapshot client-side instead of relying on the server's search.
      if (this.isOffline && this.q.trim()) {
        const q = this.q.trim().toLowerCase();
        list = list.filter(r => r.room_name.toLowerCase().includes(q) || r.room_number.toLowerCase().includes(q));
      }
      return list;
    }
  },
  async mounted() {
    this.loadFromCache();
    window.addEventListener('online', () => { this.isOffline = false; this.search(); });
    window.addEventListener('offline', () => { this.isOffline = true; });
    await this.search();
  },
  methods: {
    loadFromCache() {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        const cachedTime = localStorage.getItem(CACHE_TIME_KEY);
        if (cached) {
          this.rooms = JSON.parse(cached);
          this.cachedAt = cachedTime ? new Date(parseInt(cachedTime)).toLocaleString() : null;
          this.loading = false;
        }
      } catch (e) { /* localStorage unavailable — degrades to network-only */ }
    },
    async search() {
      if (!navigator.onLine) { this.isOffline = true; this.loading = false; return; }
      const hasCache = this.rooms.length > 0;
      if (!hasCache) this.loading = true;
      const url = this.q.trim() ? '../api/rooms.php?q=' + encodeURIComponent(this.q.trim()) : '../api/rooms.php';
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
          this.rooms = data.rooms;
          this.isOffline = false;
          if (!this.q.trim()) {
            localStorage.setItem(CACHE_KEY, JSON.stringify(data.rooms));
            localStorage.setItem(CACHE_TIME_KEY, Date.now().toString());
            this.cachedAt = new Date().toLocaleString();
          }
        }
      } catch (e) {
        // Network call failed — fall back to whatever's already cached/loaded.
        this.isOffline = true;
      } finally {
        this.loading = false;
      }
    }
  }
}).mount('#app');
</script>

</body>
</html>
