<?php
require_once __DIR__ . '/_auth.php';
$activeNav = 'dashboard';
$cssVer = filemtime(__DIR__ . '/../assets/css/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Dashboard</title>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/admin.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/_nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container">

      <div class="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>A quick look at the campus directory you're maintaining.</p>
        </div>
        <div style="display:flex; gap:0.6rem;">
          <a href="register-building.php" class="btn btn-secondary">+ Building</a>
          <a href="register-room.php" class="btn btn-primary">+ Room</a>
        </div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-100); color: var(--green-700);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/></svg>
          </div>
          <div class="stat-value">{{ buildings.length }}</div>
          <div class="stat-label">Buildings</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--green-200); color: var(--green-800);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M4 21h16M9 12v.01"/></svg>
          </div>
          <div class="stat-value">{{ rooms.length }}</div>
          <div class="stat-label">Rooms</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" style="background: var(--moss-100); color: var(--moss-500);">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
          </div>
          <div class="stat-value">{{ officeCount }}</div>
          <div class="stat-label">Offices</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon" :style="{ background: openFlags.length ? '#fef2f2' : 'var(--green-100)', color: openFlags.length ? '#b91c1c' : 'var(--green-700)' }">
            <svg v-if="openFlags.length" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/></svg>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>
          </div>
          <div class="stat-value">{{ openFlags.length }}</div>
          <div class="stat-label">Open reports</div>
        </div>
      </div>

      <div class="grid-2">

        <div class="card">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.9rem;">
            <h2 class="section-title" style="margin:0;">Recently updated buildings</h2>
            <a href="manage-buildings.php" class="btn-link" style="font-size:0.75rem; color: var(--green-700);">View all &rarr;</a>
          </div>
          <div v-if="loading" class="empty-state">Loading…</div>
          <template v-else>
            <div v-if="recentBuildings.length === 0" class="empty-state">No buildings registered yet.</div>
            <div v-for="b in recentBuildings" :key="b.id" class="list-row">
              <div class="avatar" :style="{ background: colorFor(b.id) }">{{ b.name.charAt(0) }}</div>
              <div style="flex:1; min-width:0;">
                <div style="font-weight:600; font-size:0.875rem;" class="truncate">{{ b.name }}</div>
                <div style="color: var(--muted); font-size:0.75rem;">{{ b.room_count }} room(s) &middot; updated {{ timeAgo(b.updated_at) }}</div>
              </div>
              <span v-if="b.open_flags > 0" class="badge badge-amber">{{ b.open_flags }} flag(s)</span>
              <a :href="'register-building.php?edit=' + b.id" class="btn-link" style="font-size:0.75rem; color: var(--muted); margin-left:0.5rem;">Edit</a>
            </div>
          </template>
        </div>

        <div class="card">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.9rem;">
            <h2 class="section-title" style="margin:0;">Open outdated-info reports</h2>
          </div>
          <div v-if="loading" class="empty-state">Loading…</div>
          <template v-else>
            <div v-if="openFlags.length === 0" class="empty-state">Nothing flagged — the directory looks current.</div>
            <div v-for="f in openFlags" :key="f.id" class="list-row" style="align-items:flex-start;">
              <div style="flex:1; min-width:0;">
                <div style="font-weight:600; font-size:0.8438rem;">
                  <span style="font-family:'JetBrains Mono',monospace; background: var(--green-50); border-radius:0.35rem; padding:0.05rem 0.35rem; font-size:0.75rem;">{{ f.room_number }}</span>
                  {{ f.room_name }} &middot; {{ f.building_name }}
                </div>
                <div v-if="f.note" style="color: var(--muted); font-size:0.8125rem; margin-top:0.25rem;">&ldquo;{{ f.note }}&rdquo;</div>
                <div style="color: #9aa79f; font-size:0.7rem; margin-top:0.25rem;">{{ timeAgo(f.created_at) }}</div>
              </div>
              <button @click="resolveFlag(f)" class="btn btn-secondary btn-sm-pad">Resolve</button>
            </div>
          </template>
        </div>

      </div>

    </div>
  </main>
</div>

<style>
  .grid-2 { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
  @media (min-width: 960px) { .grid-2 { grid-template-columns: 1.1fr 1fr; } }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .btn-sm-pad { padding: 0.4rem 0.9rem; font-size: 0.75rem; flex-shrink: 0; }
</style>

<script>
const { createApp } = Vue;
const COLORS = ['#22c55e', '#16a34a', '#15803d', '#86efac', '#65a30d', '#14532d'];

createApp({
  data() {
    return { buildings: [], rooms: [], openFlags: [], loading: true };
  },
  computed: {
    officeCount() { return this.rooms.filter(r => r.room_type === 'office').length; },
    recentBuildings() {
      return [...this.buildings]
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 6);
    }
  },
  async mounted() {
    await Promise.all([this.loadBuildings(), this.loadRooms(), this.loadFlags()]);
    this.loading = false;
  },
  methods: {
    colorFor(id) { return COLORS[id % COLORS.length]; },
    async loadBuildings() {
      const res = await fetch('../api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;
    },
    async loadRooms() {
      const res = await fetch('../api/rooms.php');
      const data = await res.json();
      if (data.success) this.rooms = data.rooms;
    },
    async loadFlags() {
      const res = await fetch('../api/flags.php?resolved=0');
      const data = await res.json();
      if (data.success) this.openFlags = data.flags;
    },
    async resolveFlag(f) {
      const res = await fetch('../api/flags.php?id=' + f.id, { method: 'PUT' });
      const data = await res.json();
      if (data.success) this.openFlags = this.openFlags.filter(x => x.id !== f.id);
      else Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
    },
    timeAgo(dateStr) {
      const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
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
