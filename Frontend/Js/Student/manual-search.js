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

// ---- Smarter search: shared with the walking guide (Js/Include/room-search.js): every word must match somewhere, a partial room
// number works, filler like "room" is ignored, initials work and a typo is forgiven.
const { norm, wordScore, highlight } = RoomSearch;

createApp({
  data() {
    return { hudStrip: window.LamparaGameHud ? LamparaGameHud.strip({ href: '../Public/guide-ar.php?shop=1' }) : '', gates: [], qd: '', cap: 30, hudBuddy: window.LamparaGameHud ? LamparaGameHud.buddy('Looking for a room? Type its name or number.|Tap Find inside to see the way on the floor plan.|Tap Walk there to start outside.|Every room you reach earns points!') : '', q: '', filterType: 'all', rooms: [], loading: true, isOffline: !navigator.onLine, cachedAt: null, me: null, picking: false, recentIds: [] };
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
    // A restroom search (or the CR filter): offer Men / Women.
    restroomAsk() { return this.filterType === 'cr' || RoomSearch.isRestroomQuery(this.qd); },
    askedGender() { return RoomSearch.queryGender(this.qd); },
    searching() { return this.qd.trim().length > 0; },
    // Somewhere to ask when search is not enough: an information-type office from the directory.
    helpRoom() { return this.rooms.find((r) => /admission|information|registrar/i.test(r.room_name)) || null; },
    // What the list shows: one ranked list while searching, otherwise the rooms you used last, then every building.
    allSections() {
      if (this.searching) return [{ id: 'results', name: '', rooms: this.filtered }];
      const recent = this.filterType === 'all' ? this.recentIds.map((id) => this.rooms.find((r) => String(r.id) === String(id))).filter(Boolean) : [];
      return (recent.length ? [{ id: 'recent', name: 'Recent', rooms: recent, recent: true }] : []).concat(this.groups);
    },
    // Draw only the first `cap` cards (more on request): a long directory stays quick to scroll and to type into.
    sections() {
      let left = this.cap;
      return this.allSections.map((g) => { const rooms = g.rooms.slice(0, Math.max(0, left)); left -= rooms.length; return { ...g, rooms }; }).filter((g) => g.rooms.length);
    },
    totalCards() { return this.allSections.reduce((n, g) => n + g.rooms.length, 0); },
    shownCards() { return this.sections.reduce((n, g) => n + g.rooms.length, 0); },
    // Campus gates that match what was typed (or all of them under the "Gates and exits" filter). People can look for them
    // as "entrance", "exit", "gate", "vehicle", "car", "pedestrian"...
    gateMatches() {
      const words = RoomSearch.words(this.qd);
      if (this.filterType !== 'all' && this.filterType !== 'gate') return [];
      if (this.filterType === 'all' && !words.length) return [];
      return this.gates.filter((g) => words.every((w) => norm(g.words).includes(w)));
    },
    // Rooms that pass the kind filter and the search words; best match first while searching.
    filtered() {
      let list = this.rooms;
      if (this.filterType !== 'all') list = list.filter((r) => (r.category || (r.room_type === 'office' ? 'office' : 'classroom')) === this.filterType);
      let words = RoomSearch.words(this.qd);
      // "cr women": only restrooms for women (and ones that do not say), searched by the rest of the words
      const g = RoomSearch.queryGender(this.qd);
      if (g && this.restroomAsk) {
        list = list.filter((r) => RoomSearch.isRestroom(r) && [g, ''].includes(RoomSearch.restroomFor(r)));
        words = RoomSearch.words(RoomSearch.withGender(this.qd, ''));
      }
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
      return [['all', 'All'], ['office', 'Offices'], ['classroom', 'Classrooms and labs'], ['cr', 'Restrooms'], ['canteen', 'Canteen'], ['gate', 'Gates and exits']].filter(([k]) => k === 'all' || (k === 'gate' ? this.gates.length > 0 : has(k)));
    }
  },
  async mounted() {
    if (window.LamparaMascots && window.LamparaGameHud) LamparaMascots.onChange(() => { this.hudStrip = LamparaGameHud.strip({ href: '../Public/guide-ar.php?shop=1' }); });
    this.me = LamparaCache.getMyFloor();
    try { this.recentIds = JSON.parse(localStorage.getItem('lampara_recent_rooms') || '[]'); } catch (e) { this.recentIds = []; }
    // type-ahead: wait a moment after the last keystroke before re-searching, and start the list from the top again
    this.$watch('q', (v) => { clearTimeout(this._qt); this._qt = setTimeout(() => { this.qd = v; this.cap = 30; }, v ? 140 : 0); });
    this.$watch('filterType', () => { this.cap = 30; });
    // the campus gates, from the walkway map (kept for offline like the room directory)
    if (window.LamparaGates) LamparaCache.loadCampusGraph('../../../Backend/api/campus-graph.php').then((g) => { this.gates = LamparaGates.list(g); }).catch(() => {});
    this.loadFromCache();
    window.addEventListener('online', () => { this.isOffline = false; this.search(); });
    window.addEventListener('offline', () => { this.isOffline = true; });
    await this.search();
    if (this.$refs.box && matchMedia('(min-width: 700px)').matches) this.$refs.box.focus();
  },
  methods: {
    pickGender(g) {
      const base = RoomSearch.isRestroomQuery(this.q) ? RoomSearch.withGender(this.q, '') : (RoomSearch.queryGender(this.q) ? 'cr' : (this.q.trim() || 'cr'));
      this.q = g ? (base + ' ' + g).trim() : (this.filterType === 'cr' && base === 'cr' ? '' : base);
    },
    // Remember the rooms you open, newest first (kept on this device only).
    remember(r) {
      try {
        const ids = [r.id].concat(this.recentIds.filter((x) => String(x) !== String(r.id))).slice(0, 5);
        localStorage.setItem('lampara_recent_rooms', JSON.stringify(ids));
      } catch (e) { /* storage blocked */ }
    },
    hl(text) { return highlight(text, this.qd); },
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
