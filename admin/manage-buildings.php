<?php
require_once __DIR__ . '/_auth.php';
$activeNav = 'manage-buildings';
$cssVer = filemtime(__DIR__ . '/../assets/css/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Manage Buildings</title>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/_nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container">

      <div class="page-head">
        <div>
          <h1>Manage Buildings</h1>
          <p>{{ buildings.length }} building(s) on file</p>
        </div>
        <div class="search-box">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="#9aa79f" stroke-width="1.8"/><path d="M20 20l-4.5-4.5" stroke="#9aa79f" stroke-width="1.8" stroke-linecap="round"/></svg>
          <input v-model="q" type="text" placeholder="Search buildings">
        </div>
      </div>

      <div class="manage-grid">
        <div>
          <div v-for="b in filtered" :key="b.id" class="card building-row">
            <div class="avatar" :style="{ background: colorFor(b.id) }">{{ b.name.charAt(0) }}</div>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:0.875rem;" class="truncate">{{ b.name }}</div>
              <div style="font-family:'JetBrains Mono',monospace; font-size:0.6875rem; color:#9aa79f;">{{ b.lat }}, {{ b.lng }}</div>
              <div class="building-meta">
                <span class="dot" :class="isStale(b.updated_at) ? 'dot-amber' : 'dot-green'"></span>
                <span :class="isStale(b.updated_at) ? 'stale-text' : 'meta-text'">{{ timeAgo(b.updated_at) }}</span>
                <span class="meta-text">&middot; {{ b.room_count }} room(s)</span>
                <span v-if="b.open_flags > 0" class="badge badge-amber">{{ b.open_flags }}</span>
                <a :href="'register-building.php?edit=' + b.id" class="btn-link edit-link">Edit</a>
                <button @click="deleteBuilding(b)" class="btn-link delete-link">Delete</button>
              </div>
            </div>
          </div>
          <div v-if="filtered.length === 0" class="empty-state">No buildings match.</div>
        </div>

        <div class="card map-card">
          <div class="map-head">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 20l-6-2V6l6 2 6-2 6 2v12l-6-2-6 2Z" stroke="#5b6b63" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 8v12M15 6v12" stroke="#5b6b63" stroke-width="1.7"/></svg>
            <span style="font-weight:600; font-size:0.8125rem;">Campus Map Preview</span>
            <span class="map-n">N &uarr;</span>
          </div>
          <div class="map-area" ref="mapArea"></div>
          <p v-if="buildings.length === 0" class="map-empty">No coordinates to plot yet.</p>
        </div>
      </div>

    </div>
  </main>
</div>

<style>
  .search-box {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 0.6rem 1rem;
  }
  .search-box input { border: none; background: none; font-family: inherit; font-size: 0.8125rem; outline: none; width: 12rem; max-width: 100%; }

  .manage-grid { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
  @media (min-width: 900px) { .manage-grid { grid-template-columns: 1fr 1fr; align-items: start; } }

  .building-row { display: flex; align-items: flex-start; gap: 0.75rem; margin-bottom: 0.75rem; }
  .building-meta { display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.35rem; }
  .dot { width: 0.4rem; height: 0.4rem; border-radius: 999px; }
  .dot-green { background: var(--green-500); }
  .dot-amber { background: var(--moss-500); }
  .meta-text { font-size: 0.7rem; color: var(--muted); }
  .stale-text { font-size: 0.7rem; color: var(--moss-500); font-weight: 600; }
  .edit-link { margin-left: auto; font-size: 0.7rem; color: var(--muted); }
  .edit-link:hover { color: var(--green-700); }
  .delete-link { font-size: 0.7rem; color: var(--red-600); }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .map-card { padding: 0; overflow: hidden; }
  .map-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.9rem 1rem; }
  .map-n { margin-left: auto; font-size: 0.6875rem; font-weight: 700; color: #9aa79f; }
  .map-area { position: relative; height: 60vh; min-height: 380px; }
  .map-empty { position: absolute; inset: 0; top: 2.75rem; display: flex; align-items: center; justify-content: center; color: #9aa79f; font-size: 0.8125rem; pointer-events: none; }
</style>

<script>
const { createApp } = Vue;
const COLORS = ['#22c55e', '#16a34a', '#15803d', '#86efac', '#65a30d', '#14532d'];

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
      const result = await Swal.fire({
        title: `Delete "${b.name}"?`,
        text: `This also deletes its ${b.room_count} registered room(s). This can't be undone.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280'
      });
      if (!result.isConfirmed) return;
      const res = await fetch('../api/buildings.php?id=' + b.id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) await this.loadBuildings();
      else Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
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
