<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Manual Search</title>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>
  :root {
    --green-50:  #f0fdf4;
    --green-100: #dcfce7;
    --green-200: #bbf7d0;
    --green-500: #22c55e;
    --green-600: #16a34a;
    --green-700: #15803d;
    --moss-100:  #ecfccb;
    --moss-500:  #65a30d;
    --ink:       #14251c;
    --muted:     #5b6b63;
    --line:      #e3ede6;
    --bg:        #f8faf7;
  }

  * { box-sizing: border-box; }
  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: 'Outfit', sans-serif;
    color: var(--ink);
    background: var(--bg);
  }

  .shell { max-width: 30rem; margin: 0 auto; min-height: 100dvh; background: #ffffff; }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 10;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.1rem;
    background: rgba(255, 255, 255, 0.92);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--line);
  }
  .back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.65rem;
    background: var(--green-50);
    color: var(--green-700);
    text-decoration: none;
    flex-shrink: 0;
  }
  .topbar h1 { font-size: 1rem; font-weight: 700; margin: 0; }

  .status-strip {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    padding: 0.75rem 1.1rem;
    background: var(--green-50);
    border-bottom: 1px solid var(--green-100);
  }
  .status-strip.is-offline { background: var(--moss-100); border-bottom-color: #ddec9e; }
  .status-strip .status-icon { flex-shrink: 0; color: var(--green-700); }
  .status-strip.is-offline .status-icon { color: var(--moss-500); }
  .status-strip .status-title { font-size: 0.8125rem; font-weight: 700; color: var(--ink); }
  .status-strip .status-sub { font-size: 0.75rem; color: var(--muted); }

  .page-intro { padding: 1.25rem 1.1rem 0.5rem; }
  .page-intro h2 { font-size: 1.375rem; font-weight: 800; margin: 0 0 0.3rem; }
  .page-intro p { color: var(--muted); font-size: 0.8125rem; margin: 0; line-height: 1.5; }

  .search-box {
    margin: 0.9rem 1.1rem 0;
    display: flex;
    align-items: center;
    gap: 0.6rem;
    background: var(--bg);
    border: 1px solid var(--line);
    border-radius: 1rem;
    padding: 0.75rem 1rem;
  }
  .search-box svg { flex-shrink: 0; color: #9aa79f; }
  .search-box input {
    flex: 1;
    border: none;
    background: none;
    font-family: inherit;
    font-size: 0.875rem;
    color: var(--ink);
    outline: none;
  }

  .filter-row {
    display: flex;
    gap: 0.5rem;
    padding: 0.9rem 1.1rem;
    overflow-x: auto;
  }
  .filter-pill {
    flex-shrink: 0;
    font-family: inherit;
    font-size: 0.8125rem;
    font-weight: 600;
    border: none;
    border-radius: 999px;
    padding: 0.5rem 1rem;
    background: var(--bg);
    color: var(--muted);
    cursor: pointer;
  }
  .filter-pill.is-active { background: var(--green-600); color: #ffffff; }

  .room-list { padding: 0 1.1rem 1.5rem; display: flex; flex-direction: column; gap: 0.6rem; }
  .empty-state { text-align: center; color: #9aa79f; font-size: 0.875rem; padding: 2.5rem 0; }

  .room-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 1rem;
    padding: 0.8rem 0.9rem;
    text-decoration: none;
    color: inherit;
    transition: border-color 140ms ease-out, background-color 140ms ease-out;
  }
  .room-row:hover { border-color: var(--green-200); background: var(--green-50); }

  .room-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: var(--ink);
  }
  .room-icon.type-office { background: var(--green-100); }
  .room-icon.type-classroom { background: var(--moss-100); }

  .room-info { flex: 1; min-width: 0; }
  .room-info .room-name { font-weight: 700; font-size: 0.875rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .room-info .room-meta { font-size: 0.75rem; color: var(--muted); margin-top: 0.1rem; }
  .room-chevron { flex-shrink: 0; color: #c7d1cb; }

  .offline-note {
    display: flex;
    align-items: flex-start;
    gap: 0.6rem;
    margin: 0 1.1rem 2rem;
    background: var(--moss-100);
    border-radius: 1rem;
    padding: 0.9rem 1rem;
  }
  .offline-note svg { flex-shrink: 0; margin-top: 0.1rem; color: var(--moss-500); }
  .offline-note p { margin: 0; font-size: 0.75rem; color: #4d6b1f; line-height: 1.5; }
</style>
</head>
<body>

<div id="app" class="shell">
  <div class="topbar">
    <a href="../guide.php" class="back-btn" aria-label="Back to guide">
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
    <a v-for="r in filtered" :key="r.id" href="scan.php" class="room-row">
      <div class="room-icon" :class="r.room_type === 'office' ? 'type-office' : 'type-classroom'">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4 21V9l8-5 8 5v12"/><path d="M9 21v-6h6v6"/></svg>
      </div>
      <div class="room-info">
        <div class="room-name">{{ r.room_name }}</div>
        <div class="room-meta">Room {{ r.room_number }} &middot; {{ r.floor }}</div>
      </div>
      <svg class="room-chevron" width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
    </a>
  </div>

  <div class="offline-note">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="12" r="9.5"/><path d="M12 11v5.5M12 8v.01"/></svg>
    <p>AI chat and signage scanning need a connection — reconnect to use them. Directory browsing works offline once it's loaded here at least once.</p>
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
