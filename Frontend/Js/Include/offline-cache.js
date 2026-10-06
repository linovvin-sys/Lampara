// Shared offline-cache layer for the student-facing pages (manual-search.php,
// scan.php). Plain localStorage, same "network-first, cache as fallback"
// discipline everywhere: try the real API, and on success ALSO refresh the
// cache so it's available next time there's no signal at all. Honest
// limitation, same as the rest of the app: a snapshot is only as fresh as
// the last time this exact device successfully loaded it here.
const LamparaCache = (function () {
  const ROOMS_KEY = 'lampara_rooms_cache';
  const ROOMS_TIME_KEY = 'lampara_rooms_cache_time';
  const PLANS_KEY = 'lampara_floorplans_cache';
  const GRAPHS_KEY = 'lampara_graphs_cache';
  const BUILDINGS_KEY = 'lampara_buildings_cache';
  const CAMPUS_GRAPH_KEY = 'lampara_campus_graph_cache';
  const SYNCED_AT_KEY = 'lampara_student_synced_at';
  const MY_FLOOR_KEY = 'lampara_my_floor';

  function getJSON(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback; // storage unavailable (private mode, quota) — caller just gets nothing cached
    }
  }
  // Returns whether it was actually stored.
  function setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      // Storage full or unavailable — caching silently no-ops. Live/online
      // features are unaffected; only the offline fallback stays thinner.
      return false;
    }
  }

  return {
    getRooms() {
      return getJSON(ROOMS_KEY, []);
    },
    setRooms(rooms) {
      setJSON(ROOMS_KEY, rooms);
      setJSON(ROOMS_TIME_KEY, Date.now());
    },
    getRoomsCachedAt() {
      const t = getJSON(ROOMS_TIME_KEY, null);
      return t ? new Date(t).toLocaleString() : null;
    },
    // Upsert into the cached room list by id — used when a page only ever
    // fetches ONE room (a signage lookup, a direct link) rather than the
    // full directory, so that single result still grows the offline snapshot
    // instead of being thrown away once the page closes.
    mergeRooms(newRooms) {
      const existing = this.getRooms();
      const byId = new Map(existing.map((r) => [r.id, r]));
      newRooms.forEach((r) => byId.set(r.id, r));
      this.setRooms([...byId.values()]);
    },

    // The floor the student last said they are on (a scanned sign, or "where I am"): lets Manual
    // Search show which rooms are up, down or on the same floor.
    getMyFloor() {
      return getJSON(MY_FLOOR_KEY, null);
    },
    setMyFloor(room) {
      if (!room || !room.building_id || !room.floor) return;
      setJSON(MY_FLOOR_KEY, { building_id: room.building_id, building_name: room.building_name || '', floor: room.floor });
    },
    clearMyFloor() {
      try { localStorage.removeItem(MY_FLOOR_KEY); } catch (e) { /* storage blocked */ }
    },

    floorPlanKey(buildingId, floor) {
      return buildingId + '|' + floor;
    },
    getFloorPlan(buildingId, floor) {
      const all = getJSON(PLANS_KEY, {});
      return all[this.floorPlanKey(buildingId, floor)] || null;
    },
    setFloorPlan(buildingId, floor, plan) {
      const all = getJSON(PLANS_KEY, {});
      all[this.floorPlanKey(buildingId, floor)] = plan;
      if (setJSON(PLANS_KEY, all)) return;
      // localStorage is only ~5 MB and a few floor plan images as text can fill it.
      // Drop the stored image copies and keep the plan details — the images are
      // still available offline through the service worker's file cache.
      Object.keys(all).forEach((k) => { if (all[k]) all[k].imageDataUrl = null; });
      setJSON(PLANS_KEY, all);
    },
    // True when the service worker is controlling this page: it saves floor plan
    // images itself (in its file cache, which has no 5 MB limit), so pages don't
    // need to keep their own base64 copy in localStorage.
    workerHandlesImages() {
      return 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
    },
    getSyncedAt() {
      return getJSON(SYNCED_AT_KEY, null);
    },
    setSyncedAt(ms) {
      setJSON(SYNCED_AT_KEY, ms);
    },

    getGraph(floorPlanId) {
      const all = getJSON(GRAPHS_KEY, {});
      return all[floorPlanId] || null;
    },
    setGraph(floorPlanId, graph) {
      const all = getJSON(GRAPHS_KEY, {});
      all[floorPlanId] = graph;
      setJSON(GRAPHS_KEY, all);
    },
    // Whole-building graphs (every floor's nodes/edges, cross-floor links
    // included) share the same store as per-floor graphs — a "building:"
    // prefix keeps their keys from ever colliding with a numeric floor_plan_id.
    getBuildingGraph(buildingId) {
      return this.getGraph('building:' + buildingId);
    },
    setBuildingGraph(buildingId, graph) {
      this.setGraph('building:' + buildingId, graph);
    },

    // Registered buildings (name + GPS) — needed by the outdoor AR guide and
    // the on-campus check on the scan page, both of which used to fail outright
    // with no signal.
    getBuildings() {
      return getJSON(BUILDINGS_KEY, []);
    },
    setBuildings(buildings) {
      setJSON(BUILDINGS_KEY, buildings);
    },

    // Outdoor walkway graph (Campus Paths) the ground ribbon routes over.
    getCampusGraph() {
      return getJSON(CAMPUS_GRAPH_KEY, null);
    },
    setCampusGraph(graph) {
      setJSON(CAMPUS_GRAPH_KEY, graph);
    },

    // Network-first loaders that keep the cache warm — every online visit
    // refreshes what the next offline visit will fall back to. Same
    // discipline as the rest of this file. Resolve to the data either way
    // (empty when there's neither signal nor a previous snapshot).
    async loadBuildings(url) {
      if (navigator.onLine) {
        try {
          const res = await fetch(url);
          const data = await res.json();
          if (data.success) { this.setBuildings(data.buildings); return data.buildings; }
        } catch (e) { /* fall through to cache */ }
      }
      return this.getBuildings();
    },
    async loadCampusGraph(url) {
      if (navigator.onLine) {
        try {
          const res = await fetch(url);
          const data = await res.json();
          if (data.success) {
            const graph = { nodes: data.nodes, edges: data.edges };
            this.setCampusGraph(graph);
            return graph;
          }
        } catch (e) { /* fall through to cache */ }
      }
      return this.getCampusGraph() || { nodes: [], edges: [] };
    },

    // Downloads an image and returns it as a base64 data URL — the only way
    // to actually have the PICTURE itself available with zero signal later;
    // the API/DB only ever hands back a path, not bytes.
    async fetchImageAsDataUrl(url) {
      const res = await fetch(url);
      const blob = await res.blob();
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    }
  };
})();
