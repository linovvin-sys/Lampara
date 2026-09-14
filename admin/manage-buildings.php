<?php require_once __DIR__ . '/_auth.php'; $cssVer = filemtime(__DIR__ . '/../assets/css/tailwind.css'); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Manage Buildings</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/tailwind.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>body { font-family: 'Outfit', sans-serif; }</style>
</head>
<body class="bg-white min-h-screen">

<div id="app">
  <div class="bg-zinc-900 px-4 sm:px-6 py-3.5 sm:py-4">
    <div class="flex items-center justify-between mb-2.5">
      <h1 class="text-white font-semibold text-sm sm:text-base">Admin · Manage Buildings &amp; Directory</h1>
      <a href="logout.php" class="text-white/40 hover:text-white/70 text-xs font-medium flex-shrink-0">Logout</a>
    </div>
    <nav class="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <a href="register-building.php" class="flex-shrink-0 text-xs font-medium rounded-full px-3.5 py-2 bg-white/10 text-white/70">Register Building</a>
      <a href="manage-buildings.php" class="flex-shrink-0 text-xs font-semibold rounded-full px-3.5 py-2 bg-amber-500 text-zinc-900">Manage Buildings</a>
      <a href="register-room.php" class="flex-shrink-0 text-xs font-medium rounded-full px-3.5 py-2 bg-white/10 text-white/70">Register Room</a>
    </nav>
  </div>

  <div class="max-w-6xl mx-auto p-4 sm:p-7 relative overflow-hidden">
    <div class="absolute -top-24 right-40 w-72 h-72 bg-emerald-400/10 rounded-full blur-3xl pointer-events-none"></div>

    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-1 relative">
      <h2 class="text-xl sm:text-2xl font-bold text-zinc-900">Registered Buildings</h2>
      <div class="flex items-center gap-2 bg-zinc-100 rounded-full px-3 py-2.5 sm:py-2">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" class="flex-shrink-0"><circle cx="10.5" cy="10.5" r="6.5" stroke="#a1a1aa" stroke-width="1.8"/><path d="M20 20l-4.5-4.5" stroke="#a1a1aa" stroke-width="1.8" stroke-linecap="round"/></svg>
        <input v-model="q" type="text" placeholder="Search buildings" class="bg-transparent text-sm sm:text-xs focus:outline-none w-full sm:w-32">
      </div>
    </div>
    <p class="text-zinc-500 text-xs mb-5 sm:mb-6 relative">{{ buildings.length }} building(s) on file</p>

    <div class="grid md:grid-cols-2 gap-6 relative">
      <!-- Left: compact list -->
      <div class="space-y-3">
        <div v-for="b in filtered" :key="b.id" class="flex items-start gap-3 bg-white border border-zinc-200 rounded-2xl p-4 shadow-sm">
          <div class="w-9 h-9 rounded-xl text-white text-xs font-semibold flex items-center justify-center flex-shrink-0" :style="{ background: colorFor(b.id) }">{{ b.name.charAt(0) }}</div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm text-zinc-900 truncate">{{ b.name }}</div>
            <div class="text-[10px] font-mono text-zinc-400">{{ b.lat }}, {{ b.lng }}</div>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="w-1.5 h-1.5 rounded-full" :class="isStale(b.updated_at) ? 'bg-amber-500' : 'bg-emerald-500'"></span>
              <span class="text-[11px]" :class="isStale(b.updated_at) ? 'text-amber-600 font-semibold' : 'text-zinc-500'">{{ timeAgo(b.updated_at) }}</span>
              <span class="text-[11px] text-zinc-400">· {{ b.room_count }} room(s)</span>
              <span v-if="b.open_flags > 0" class="flex items-center gap-1 bg-amber-50 text-amber-700 text-[10px] font-semibold rounded-full px-2 py-0.5">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 3.5 22 20.5H2L12 3.5Z" stroke="#b45309" stroke-width="2.1" stroke-linejoin="round"/></svg>
                {{ b.open_flags }}
              </span>
              <a :href="'register-building.php?edit=' + b.id" class="ml-auto text-[11px] font-semibold text-zinc-600 hover:text-amber-600">Edit</a>
              <button @click="deleteBuilding(b)" class="text-[11px] font-semibold text-red-600 hover:text-red-700">Delete</button>
            </div>
          </div>
        </div>
        <div v-if="filtered.length === 0" class="text-zinc-400 text-sm italic py-6 text-center">No buildings match.</div>
      </div>

      <!-- Right: live campus map -->
      <div class="bg-zinc-50 border border-zinc-200 rounded-2xl overflow-hidden relative">
        <div class="flex items-center gap-1.5 p-3.5">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 20l-6-2V6l6 2 6-2 6 2v12l-6-2-6 2Z" stroke="#71717a" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 8v12M15 6v12" stroke="#71717a" stroke-width="1.7"/></svg>
          <span class="text-xs font-semibold text-zinc-900">Campus Map Preview</span>
          <span class="ml-auto text-[10px] font-bold text-zinc-400">N ↑</span>
        </div>
        <div class="relative h-[60vh] min-h-[420px]" ref="mapArea"></div>
        <p v-if="buildings.length === 0" class="absolute inset-0 top-11 flex items-center justify-center text-zinc-400 text-xs pointer-events-none">No coordinates to plot yet.</p>
      </div>
    </div>
  </div>
</div>

<script>
const { createApp } = Vue;
const COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4'];

createApp({
  data() { return { buildings: [], q: '', map: null, markers: [] }; },
  computed: {
    filtered() {
      if (!this.q.trim()) return this.buildings;
      const q = this.q.toLowerCase();
      return this.buildings.filter(b => b.name.toLowerCase().includes(q));
    }
  },
  mounted() {
    this.initMap();
    this.loadBuildings();
  },
  methods: {
    colorFor(id) { return COLORS[id % COLORS.length]; },
    initMap() {
      // Amafel Building as a sane default center before real data loads.
      this.map = L.map(this.$refs.mapArea).setView([14.3283, 120.9372], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
      }).addTo(this.map);
    },
    renderMarkers() {
      if (!this.map) return;
      this.markers.forEach(m => this.map.removeLayer(m));
      this.markers = [];
      const latlngs = [];
      this.buildings.forEach(b => {
        const marker = L.marker([b.lat, b.lng]).addTo(this.map);
        marker.bindPopup(`<strong>${b.name}</strong><br>${b.room_count} room(s)`);
        this.markers.push(marker);
        latlngs.push([b.lat, b.lng]);
      });
      if (latlngs.length === 1) {
        this.map.setView(latlngs[0], 17);
      } else if (latlngs.length > 1) {
        this.map.fitBounds(latlngs, { padding: [40, 40] });
      }
    },
    async loadBuildings() {
      const res = await fetch('../api/buildings.php');
      const data = await res.json();
      if (data.success) {
        this.buildings = data.buildings;
        this.renderMarkers();
      }
    },
    async deleteBuilding(b) {
      if (!confirm(`Delete "${b.name}"? This also deletes its ${b.room_count} registered room(s). This can't be undone.`)) return;
      const res = await fetch('../api/buildings.php?id=' + b.id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) await this.loadBuildings();
      else alert('Error: ' + (data.error || 'unknown'));
    },
    isStale(updatedAt) {
      const days = (Date.now() - new Date(updatedAt).getTime()) / 86400000;
      return days > 90;
    },
    timeAgo(updatedAt) {
      const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);
      if (days < 1) return 'today';
      if (days === 1) return '1 day ago';
      if (days < 30) return days + ' days ago';
      const months = Math.floor(days / 30);
      return months === 1 ? '1 month ago' : months + ' months ago';
    }
  }
}).mount('#app');
</script>

</body>
</html>
