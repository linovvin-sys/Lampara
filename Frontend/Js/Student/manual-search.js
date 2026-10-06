const { createApp } = Vue;

// Real offline-first pattern: cache the full directory in localStorage the
// first time it loads successfully. After that, this page works with zero
// signal — it just serves (and client-side filters) the cached snapshot.
// Honest limitation: the snapshot is only as fresh as the last time this
// device was online here, same staleness discipline as the rest of the app.
// "3rd Floor" -> 3, "Ground Floor" -> 0, "Basement" -> -1; null when the name does not say.
function floorRank(name) {
  const s = String(name || '').trim().toLowerCase();
  const m = s.match(/^(-?\d+)/);
  if (m) return parseInt(m[1], 10);
  if (/^(g|ground|lower ground)/.test(s)) return 0;
  if (/basement|^b\d?\b/.test(s)) return -1;
  return null;
}

createApp({
  data() {
    return { q: '', filterType: 'all', rooms: [], loading: true, isOffline: !navigator.onLine, cachedAt: null, me: null, picking: false };
  },
  computed: {
    // Every building + floor in the directory, in building then floor order: the choices for "You are on".
    floorChoices() {
      const seen = new Map();
      this.rooms.forEach((r) => {
        const key = r.building_id + '|' + r.floor;
        if (!seen.has(key)) seen.set(key, { key, building_id: r.building_id, building_name: r.building_name, floor: r.floor });
      });
      return [...seen.values()].sort((a, b) =>
        String(a.building_name).localeCompare(String(b.building_name)) || (floorRank(a.floor) ?? 99) - (floorRank(b.floor) ?? 99));
    },
    meKey() { return this.me ? this.me.building_id + '|' + this.me.floor : ''; },
    filtered() {
      let list = this.rooms;
      if (this.filterType !== 'all') list = list.filter(r => r.room_type === this.filterType);
      // When offline (or the network request failed), filter the cached
      // snapshot client-side instead of relying on the server's search.
      if (this.isOffline && this.q.trim()) {
        const q = this.q.trim().toLowerCase();
        // room_number is null for rooms with no number; "1101a" also finds "1101 - A".
        list = list.filter(r => r.room_name.toLowerCase().includes(q) || (r.room_number || '').toLowerCase().includes(q) || RoomNumber.matches(r.room_number, q));
      }
      return list;
    }
  },
  async mounted() {
    this.me = LamparaCache.getMyFloor();
    this.loadFromCache();
    window.addEventListener('online', () => { this.isOffline = false; this.search(); });
    window.addEventListener('offline', () => { this.isOffline = true; });
    await this.search();
  },
  methods: {
    chooseFloor(c) {
      this.me = { building_id: c.building_id, building_name: c.building_name, floor: c.floor };
      LamparaCache.setMyFloor(this.me);
      this.picking = false;
    },
    clearFloor() {
      this.me = null;
      LamparaCache.clearMyFloor();
      this.picking = false;
    },
    // Where a room is relative to the floor the student is on: { kind, text, floors }.
    //   up / down  -> "Up 2 floors" / "Down 1 floor"      same -> "Same floor"
    //   other      -> "Different building"                 null -> nothing to show (floor not chosen)
    floorHint(r) {
      if (!this.me) return null;
      if (String(r.building_id) !== String(this.me.building_id)) return { kind: 'other', text: 'Other building' };
      const mine = floorRank(this.me.floor), theirs = floorRank(r.floor);
      if (r.floor === this.me.floor || (mine !== null && mine === theirs)) return { kind: 'same', text: 'Same floor' };
      if (mine === null || theirs === null) return { kind: 'other', text: r.floor };
      const n = Math.abs(theirs - mine);
      return theirs > mine
        ? { kind: 'up', text: 'Up ' + n + (n === 1 ? ' floor' : ' floors'), floors: n }
        : { kind: 'down', text: 'Down ' + n + (n === 1 ? ' floor' : ' floors'), floors: n };
    },
    loadFromCache() {
      const cached = LamparaCache.getRooms();
      if (cached.length) {
        this.rooms = cached;
        this.cachedAt = LamparaCache.getRoomsCachedAt();
        this.loading = false;
      }
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
            LamparaCache.setRooms(data.rooms);
            this.cachedAt = LamparaCache.getRoomsCachedAt();
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
