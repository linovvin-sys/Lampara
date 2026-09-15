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
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/admin.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
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

      <div class="roadmap-section">
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:0.75rem; margin-bottom:0.9rem;">
          <h2 class="section-title" style="margin:0;">Coming soon</h2>
          <span style="font-size:0.75rem; color: var(--muted);">Design previews — not wired up yet</span>
        </div>

        <div class="roadmap-grid">

          <div class="roadmap-card">
            <div class="roadmap-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/></svg></div>
            <div class="roadmap-title">
              Building Disambiguation
              <span class="badge badge-amber">In Design</span>
            </div>
            <p class="roadmap-body">
              When two registered buildings are close together and inside the same compass cone, the
              student app will ask "Did you mean X or Y?" instead of silently guessing wrong.
            </p>
            <div class="roadmap-mock">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--moss-500)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px; margin-right:0.15rem;"><path d="M12 3.5 22 20.5H2L12 3.5Z"/><path d="M12 10v4M12 17h.01"/></svg>
              Amafel Building &amp; Amafel Annex are 12m apart and may be hard to tell apart outdoors.
              <span style="display:block; margin-top:0.4rem; font-weight:600; color: var(--green-700);">Review conflict (preview)</span>
            </div>
          </div>

          <div class="roadmap-card">
            <div class="roadmap-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v5h5"/><path d="M20 20v-5h-5"/><path d="M4.5 9A8 8 0 0 1 18 5.5L20 7.5"/><path d="M19.5 15A8 8 0 0 1 6 18.5L4 16.5"/></svg></div>
            <div class="roadmap-title">
              Directory Reconfirmation
              <span class="badge badge-amber">In Design</span>
            </div>
            <p class="roadmap-body">
              Extends the existing "stale" indicator into a real workflow — periodically ask admins to
              reconfirm a room's info is still accurate instead of trusting it indefinitely.
            </p>
            <div class="roadmap-mock">
              Room 204 — Treasury hasn't been reconfirmed in 94 days.
              <span style="display:block; margin-top:0.4rem; font-weight:600; color: var(--green-700);">Mark as still accurate (preview)</span>
            </div>
          </div>

          <div class="roadmap-card">
            <div class="roadmap-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21V9"/><path d="M4 5h13l3 3-3 3H4V5Z"/></svg></div>
            <div class="roadmap-title">
              Signage Quality Coverage
              <span class="badge badge-neutral">Planned</span>
            </div>
            <p class="roadmap-body">
              Since scanning reads whatever signage already exists, a per-building rating helps admins
              know where scanning will be less reliable and manual selection matters more.
            </p>
            <div class="roadmap-mock">
              Signage quality: <strong>Fair</strong> &middot; 3 rooms flagged with unclear or missing signs
            </div>
          </div>

          <div class="roadmap-card">
            <div class="roadmap-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="14" width="4" height="7"/><rect x="10" y="9" width="4" height="12"/><rect x="17" y="4" width="4" height="17"/></svg></div>
            <div class="roadmap-title">
              Gemini API Usage Monitor
              <span class="badge badge-neutral">Planned</span>
            </div>
            <p class="roadmap-body">
              Visibility into free-tier rate-limit usage, so a busy demo or class period doesn't
              unexpectedly fail chat or signage scans.
            </p>
            <div class="roadmap-mock">
              ▓▓▓▓▓▓▓▓░░ 62% of today's free-tier quota used
            </div>
          </div>

          <div class="roadmap-card">
            <div class="roadmap-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg></div>
            <div class="roadmap-title">
              Voice Chat (Stretch)
              <span class="badge badge-neutral">Stretch</span>
            </div>
            <p class="roadmap-body">
              Optional voice input/output for the student-facing AI chat via the Web Speech API — off
              by default, toggled per campus.
            </p>
            <div class="roadmap-mock">
              Enable voice input/output for student chat &nbsp;
              <span style="display:inline-block; width:2rem; height:1.1rem; border-radius:999px; background:var(--line); vertical-align:middle; position:relative;">
                <span style="position:absolute; top:2px; left:2px; width:0.9rem; height:0.9rem; border-radius:999px; background:#fff;"></span>
              </span>
            </div>
          </div>

          <div class="roadmap-card">
            <div class="roadmap-icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5 13 13l-4.5 2.5L11 11l4.5-2.5Z"/></svg></div>
            <div class="roadmap-title">
              Turn-by-Turn Indoor Guidance
              <span class="badge badge-neutral">Stretch</span>
            </div>
            <p class="roadmap-body">
              Beyond confirming a room, step-by-step guidance from anywhere on the same floor —
              requires mapping how hallways connect, out of scope for the current defense build.
            </p>
            <div class="roadmap-mock">
              Room connections editor — not started
            </div>
          </div>

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
  .roadmap-section { margin-top: 2.5rem; }
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
      else alert('Error: ' + (data.error || 'unknown'));
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
