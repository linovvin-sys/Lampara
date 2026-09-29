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

  function getJSON(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) {
      return fallback; // storage unavailable (private mode, quota) — caller just gets nothing cached
    }
  }
  function setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      // Storage full or unavailable — caching silently no-ops. Live/online
      // features are unaffected; only the offline fallback stays thinner.
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
      setJSON(PLANS_KEY, all);
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
