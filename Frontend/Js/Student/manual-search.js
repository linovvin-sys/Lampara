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

// ---- Smarter search: every word must match somewhere (name, number, building, floor, kind), a typo is forgiven,
// and results are ranked so the best match is first. Runs on the cached directory, so it also works offline.
const KIND_WORDS = { office: 'office offices', classroom: 'classroom classrooms class lab laboratory room', cr: 'cr comfort restroom bathroom toilet', canteen: 'canteen cafeteria food eat' };
const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function within1(a, b) {            // edit distance <= 1 (typo tolerance)
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, miss = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++miss > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return miss + (a.length - i) + (b.length - j) <= 1;
}
// How well one word fits one room: 0 = no match. Higher is better.
function wordScore(w, r) {
  const name = norm(r.room_name), num = RoomNumber.compact(r.room_number).toLowerCase();
  const nameWords = name.split(/[^a-z0-9]+/).filter(Boolean);
  if (num && (num === w || RoomNumber.matches(r.room_number, w))) return num === w ? 9 : 7;
  if (name === w) return 10;
  if (nameWords.some((x) => x === w)) return 8;
  if (nameWords.some((x) => x.startsWith(w))) return 6;
  if (name.includes(w)) return 4;
  const sub = norm(r.subtitle);
  if (sub && sub.includes(w)) return 5;
  const bld = norm(r.building_name), flr = norm(r.floor), kind = KIND_WORDS[r.category] || KIND_WORDS[r.room_type] || '';
  if (bld.includes(w) || flr.includes(w) || kind.split(' ').some((x) => x.startsWith(w))) return 3;
  if (w.length >= 4 && [...nameWords, ...bld.split(/[^a-z0-9]+/)].some((x) => within1(w, x))) return 2;
  return 0;
}
// Cut the matched words out of a name so the page can bold them.
function highlight(text, q) {
  const words = norm(q).split(/\s+/).filter(Boolean);
  const src = String(text || ''), low = norm(src);
  if (!words.length || low.length !== src.length) return [{ t: src, hit: false }];
  const mark = new Array(src.length).fill(false);
  words.forEach((w) => { let i = low.indexOf(w); while (i !== -1) { for (let k = i; k < i + w.length; k++) mark[k] = true; i = low.indexOf(w, i + w.length); } });
  const out = [];
  for (let i = 0; i < src.length; i++) {
    if (out.length && out[out.length - 1].hit === mark[i]) out[out.length - 1].t += src[i];
    else out.push({ t: src[i], hit: mark[i] });
  }
  return out;
}

createApp({
  data() {
    return { q: '', filterType: 'all', rooms: [], loading: true, isOffline: !navigator.onLine, cachedAt: null, me: null, picking: false, recentIds: [] };
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
    searching() { return this.q.trim().length > 0; },
    // Somewhere to ask when search is not enough: an information-type office from the directory.
    helpRoom() { return this.rooms.find((r) => /admission|information|registrar/i.test(r.room_name)) || null; },
    // What the list shows: one ranked list while searching, otherwise the rooms you used last, then every building.
    sections() {
      if (this.searching) return [{ id: 'results', name: '', rooms: this.filtered }];
      const recent = this.filterType === 'all' ? this.recentIds.map((id) => this.rooms.find((r) => String(r.id) === String(id))).filter(Boolean) : [];
      return (recent.length ? [{ id: 'recent', name: 'Recent', rooms: recent, recent: true }] : []).concat(this.groups);
    },
    // Rooms that pass the kind filter and the search words; best match first while searching.
    filtered() {
      let list = this.rooms;
      if (this.filterType !== 'all') list = list.filter((r) => (r.category || (r.room_type === 'office' ? 'office' : 'classroom')) === this.filterType);
      const words = norm(this.q).split(/\s+/).filter(Boolean);
      if (!words.length) return list;
      const scored = [];
      list.forEach((r) => {
        let total = 0;
        for (const w of words) { const sc = wordScore(w, r); if (!sc) return; total += sc; }
        scored.push({ r, total, near: this.me && String(r.building_id) === String(this.me.building_id) ? 1 : 0 });
      });
      return scored.sort((a, b) => b.total - a.total || b.near - a.near || String(a.r.room_name).localeCompare(String(b.r.room_name))).map((x) => x.r);
    },
    // Browsing (no search): rooms grouped by building, then floor, with the building you are in first.
    groups() {
      const byB = new Map();
      this.filtered.forEach((r) => {
        if (!byB.has(r.building_id)) byB.set(r.building_id, { id: r.building_id, name: r.building_name, rooms: [] });
        byB.get(r.building_id).rooms.push(r);
      });
      const mine = this.me ? String(this.me.building_id) : '';
      return [...byB.values()].map((g) => {
        g.rooms.sort((a, b) => (floorRank(a.floor) ?? 99) - (floorRank(b.floor) ?? 99) || String(a.room_number || '').localeCompare(String(b.room_number || ''), undefined, { numeric: true }));
        g.here = String(g.id) === mine;
        return g;
      }).sort((a, b) => (b.here - a.here) || String(a.name).localeCompare(String(b.name)));
    },
    kinds() {
      const has = (k) => this.rooms.some((r) => (r.category || (r.room_type === 'office' ? 'office' : 'classroom')) === k);
      return [['all', 'All'], ['office', 'Offices'], ['classroom', 'Classrooms and labs'], ['cr', 'Restrooms'], ['canteen', 'Canteen']].filter(([k]) => k === 'all' || has(k));
    }
  },
  async mounted() {
    this.me = LamparaCache.getMyFloor();
    try { this.recentIds = JSON.parse(localStorage.getItem('lampara_recent_rooms') || '[]'); } catch (e) { this.recentIds = []; }
    this.loadFromCache();
    window.addEventListener('online', () => { this.isOffline = false; this.search(); });
    window.addEventListener('offline', () => { this.isOffline = true; });
    await this.search();
    if (this.$refs.box && matchMedia('(min-width: 700px)').matches) this.$refs.box.focus();
  },
  methods: {
    // Remember the rooms you open, newest first (kept on this device only).
    remember(r) {
      try {
        const ids = [r.id].concat(this.recentIds.filter((x) => String(x) !== String(r.id))).slice(0, 5);
        localStorage.setItem('lampara_recent_rooms', JSON.stringify(ids));
      } catch (e) { /* storage blocked */ }
    },
    hl(text) { return highlight(text, this.q); },
    clearSearch() { this.q = ''; this.$refs.box && this.$refs.box.focus(); },
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
      const url = '../../../Backend/api/rooms.php';
      try {
        const res = await fetch(url);
        const data = await res.json();
        if (data.success) {
          this.rooms = data.rooms;
          this.isOffline = false;
          LamparaCache.setRooms(data.rooms);
          this.cachedAt = LamparaCache.getRoomsCachedAt();
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
