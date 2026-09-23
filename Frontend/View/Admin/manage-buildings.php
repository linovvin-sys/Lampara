<?php
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'manage-buildings';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Manage Buildings</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/manage-buildings.css">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

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

<script src="../../Js/Admin/manage-buildings.js"></script>

</body>
</html>
