<?php
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/manual-search.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Student/manual-search.js');
$cacheJsVer = filemtime(__DIR__ . '/../../Js/Include/offline-cache.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Manual Search</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/Student/manual-search.css?v=<?= $pageCssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
</head>
<body>

<div id="app" class="shell">
  <div class="topbar">
    <a href="../Public/guide-ar.php" class="back-btn" aria-label="Back to guide">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
    </a>
    <h1>Manual Search</h1>
  </div>

  <div class="status-strip" :class="{ 'is-offline': isOffline }">
    <span class="status-icon">
      <svg v-if="isOffline" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18M8.5 8.7a9.9 9.9 0 0 1 10.9 2M5 12a9.9 9.9 0 0 1 3-2.2M12 19.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6ZM8.8 15.2a5.5 5.5 0 0 1 6.6.1"/></svg>
      <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5a9.9 9.9 0 0 1 14 0M8.5 15.7a5.5 5.5 0 0 1 7 0M12 19.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z"/></svg>
    </span>
    <div>
      <div class="status-title">{{ isOffline ? "You're offline" : "Directory" }}</div>
      <div class="status-sub">
        <span v-if="cachedAt">{{ isOffline ? 'Showing directory cached at ' : 'Last synced ' }}{{ cachedAt }}</span>
        <span v-else>Loading directory…</span>
      </div>
    </div>
  </div>

  <div class="page-intro">
    <h2>Find your room</h2>
    <p>Browse all registered rooms and offices — works with zero signal once loaded here at least once.</p>
  </div>

  <div class="here-card">
    <div class="here-row">
      <span class="here-label">You are on</span>
      <button type="button" class="here-pick" @click="picking = !picking" :aria-expanded="picking ? 'true' : 'false'">
        <template v-if="me">{{ me.floor }} &middot; {{ me.building_name }}</template>
        <template v-else>Choose your floor</template>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
      </button>
    </div>
    <div v-if="picking" class="here-list" role="listbox">
      <button v-for="c in floorChoices" :key="c.key" type="button" role="option" class="here-opt" :class="{ on: c.key === meKey }" @click="chooseFloor(c)">
        <span>{{ c.floor }}</span><small>{{ c.building_name }}</small>
      </button>
      <button v-if="me" type="button" class="here-opt clear" @click="clearFloor">I'm not sure</button>
    </div>
    <p v-if="!me && !picking" class="here-hint">Tell us which floor you are on and each room will show whether to go up, down or stay on this floor. Scanning a sign sets it for you.</p>
  </div>

  <div class="search-box">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.5-4.5"/></svg>
    <input v-model="q" @input="search" type="text" placeholder="Search rooms or offices…">
  </div>

  <div class="filter-row">
    <button @click="filterType = 'all'" class="filter-pill" :class="{ 'is-active': filterType === 'all' }">All</button>
    <button @click="filterType = 'office'" class="filter-pill" :class="{ 'is-active': filterType === 'office' }">Offices</button>
    <button @click="filterType = 'classroom'" class="filter-pill" :class="{ 'is-active': filterType === 'classroom' }">Classrooms/Labs</button>
  </div>

  <div class="room-list">
    <div v-if="loading" class="empty-state">Loading…</div>
    <div v-else-if="filtered.length === 0" class="empty-state">No rooms match.</div>
    <a v-for="r in filtered" :key="r.id" :href="'scan.php?room=' + r.id" class="room-row">
      <div class="room-icon" :class="r.room_type === 'office' ? 'type-office' : 'type-classroom'">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/></svg>
      </div>
      <div class="room-info">
        <div class="room-name">{{ r.room_name }}</div>
        <div class="room-meta">{{ r.room_number ? 'Room ' + r.room_number : 'No number' }} &middot; {{ r.floor }}<template v-if="floorHint(r) && floorHint(r).kind === 'other'"> &middot; {{ r.building_name }}</template></div>
      </div>
      <span v-if="floorHint(r)" class="floor-hint" :class="'is-' + floorHint(r).kind">
        <svg v-if="floorHint(r).kind === 'up'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
        <svg v-else-if="floorHint(r).kind === 'down'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
        <svg v-else-if="floorHint(r).kind === 'same'" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/></svg>
        <span>{{ floorHint(r).text }}</span>
      </span>
      <svg class="room-chevron" width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>
  </div>

  <div class="offline-note">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 8v.01"/></svg>
    <p>Signage scanning needs a connection — reconnect to use it. Browsing the directory and getting directions to a room you've visited here before both work offline once loaded at least once.</p>
  </div>
</div>

<script src="../../Js/Include/offline-cache.js?v=<?= $cacheJsVer ?>"></script>
<script src="../../Js/Include/student-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Include/room-number.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/room-number.js') ?>"></script>
<script src="../../Js/Student/manual-search.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
