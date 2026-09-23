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
      const url = this.q.trim() ? '../../../Backend/api/rooms.php?q=' + encodeURIComponent(this.q.trim()) : '../../../Backend/api/rooms.php';
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
