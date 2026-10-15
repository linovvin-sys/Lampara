const { createApp, markRaw } = Vue;
const API = 'campus-graph.php';
const LABEL_MIN_ZOOM = 19; // building names are always-on from this zoom in (lower, they overlap at the main cluster)
const POOR_GPS_METERS = 25;

// Recording a walk / dropping a point at your position.
const SNAP_METERS = 6;         // a new point this close to an existing one joins it instead of duplicating it
const WALK_MAX_ACCURACY = 20;  // GPS fixes worse than this (meters) are ignored while recording
const MIN_STEP = 3;            // movement smaller than this is GPS noise
const WALK_TOLERANCE = 5;      // meters: a reading this far off the straight line from the last point makes a corner
const MAX_LEG = 30;            // on a long straight, still drop a point this often

// Flat-earth distance/bearing — fine over a campus.
const M_PER_DEG = 111320;
function metersBetween(a, b) {
  const dy = (b.lat - a.lat) * M_PER_DEG;
  const dx = (b.lng - a.lng) * M_PER_DEG * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot(dx, dy);
}
// How far point p is from the straight segment a-b, in meters.
function distToSegment(p, a, b) {
  const k = M_PER_DEG * Math.cos(a.lat * Math.PI / 180);
  const px = (p.lng - a.lng) * k, py = (p.lat - a.lat) * M_PER_DEG;
  const bx = (b.lng - a.lng) * k, by = (b.lat - a.lat) * M_PER_DEG;
  const len2 = bx * bx + by * by;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / len2));
  return Math.hypot(px - t * bx, py - t * by);
}

// Data flow: `baseGraph` / `baseBuildings` are the last data from the server;
// `nodes` / `edges` / `buildings` are that data with any offline (pending)
// changes laid on top (AdminOffline.overlay*), and are what the map draws.
// Each edit goes through AdminOffline.run(): saved to the server when it's
// reachable, otherwise added to the pending list and shown right away.
//
// Leaflet objects stay out of Vue's reactivity (markRaw) — proxying them breaks
// their internal identity checks. Everything drawn on the map is rebuilt from
// the reactive arrays in redraw().
// Remembers the "Show point names" choice on this device.
function viewPref(key, dflt) {
  try { const v = localStorage.getItem('lampara_cp_' + key); return v === null ? dflt : v; } catch (e) { return dflt; }
}
function setViewPref(key, value) {
  try { localStorage.setItem('lampara_cp_' + key, value); } catch (e) { /* storage blocked: the choice just is not remembered */ }
}
const edgeKey = (a, b) => (String(a) < String(b) ? a + '|' + b : b + '|' + a);

createApp({
  data() {
    return {
      baseGraph: { nodes: [], edges: [] },
      baseBuildings: [],
      nodes: [],
      edges: [],
      buildings: [],
      selectedId: null,
      map: null,
      layer: null,
      locating: false,
      gpsNote: '',
      recording: false,      // "Record my walk" is on
      recordedCount: 0,
      walkNote: '',
      // Lock: while on, taps can't add, move, connect or delete points (panning, zooming and selecting still work).
      undo: null,
      nudgeBusy: false,
      liveMsg: '',            // what the last delete removed: { label, snapshot }, for the Undo button
      locked: EditorLock.get('campus-paths'),
      lockIcon: EditorLock.icon,
      extraBuilding: '', extraLabel: '', multi: false, pickedIds: [], deletingMany: false,
      nameDraft: '', typeDraft: 'junction', entranceDraft: '', savingPoint: false, savedNote: '', smoothing: false,
      pathsOnly: viewPref('pathsonly', '0') === '1',
      nameError: '',
      // View controls (display only: nothing here changes the saved paths).
      showNames: viewPref('names', '1') === '1',   // point names on the map (building names still follow the zoom)
      gapTarget: '',                               // which point to join across a gap ('' = the nearest)
      viewFrom: '',                                // show only the path between these two places (node ids), '' = everything
      viewTo: '',
      // Outdoor AR anchors — one QR per gate/junction/entrance a sign gets
      // posted at, so a student who skips the main gate can still scan
      // whichever outdoor node they actually pass to fix their starting
      // position instead of trusting GPS alone.
      campusAnchors: [],
      qrBusy: false,
      headingDrafts: {}, // anchor id -> typed-degrees draft string, kept per anchor
      pickingDirectionFor: null, // anchor id whose direction the next map tap sets
      showingQrFor: null         // anchor id currently shown in the print modal
    };
  },
  watch: {
    pathsOnly(v) { setViewPref('pathsonly', v ? '1' : '0'); if (this.map) this.redraw(); },
    showNames(v) { setViewPref('names', v ? '1' : '0'); if (this.map) this.redraw(); },
    viewFrom() { this.viewChanged(); },
    viewTo() { this.viewChanged(); },
    // The Name field follows whichever point is selected.
    selectedId() {
      const n = this.selected;
      this.savedNote = '';
      this.resetDrafts();
    },
    // Draws the actual QR image once the print dialog's canvas exists.
    async showingQrFor(anchorId) {
      const anchor = this.campusAnchors.find((a) => a.id === anchorId);
      if (!anchor) return;
      await this.$nextTick();
      const el = this.$refs.qrCanvas;
      if (!el || typeof QRCode === 'undefined') return;
      el.innerHTML = '';
      new QRCode(el, { text: this.qrUrlFor(anchor.code), width: 180, height: 180 });
    }
  },
  computed: {
    // Second doors recorded on the selected point: [{ building, label }].
    extrasHere() {
      if (this.selectedId === null) return [];
      const out = [];
      this.buildings.forEach((b) => (b.extra_entrances || []).forEach((e) => { if (String(e.node_id) === String(this.selectedId)) out.push({ building: b, label: e.label || '' }); }));
      return out;
    },
    // True when the Name, Type or Entrance fields differ from what is saved for the selected point.
    pointDirty() {
      const n = this.selected; if (!n) return false;
      return this.nameDraft.trim() !== this.labelOf(n) || this.typeDraft !== n.node_type || String(this.entranceDraft) !== String(this.entranceBuildingId);
    },
    selected() { return this.nodes.find((n) => String(n.id) === String(this.selectedId)) || null; },
    showingCampusQr: {
      get() { return this.showingQrFor !== null; },
      set(v) { if (!v) this.showingQrFor = null; }
    },
    qrModalAnchor() { return this.campusAnchors.find((a) => a.id === this.showingQrFor) || null; },
    // The anchor (if any) already set on whichever point is selected.
    selectedAnchor() { return this.selectedId === null ? null : this.campusAnchors.find((a) => String(a.campus_node_id) === String(this.selectedId)) || null; },
    entranceBuildingId() {
      const b = this.buildings.find((x) => this.selectedId !== null && String(x.entrance_node_id) === String(this.selectedId));
      return b ? b.id : '';
    },
    // Name of every point (its own, or "Point X" in creation order for older unnamed ones).
    nodeNames() { return PointNames.map(this.nodes); },
    // Places the path view can start or end at: every building and every gate. A building is reached at its entrance
    // point; one with no entrance set is reached at the walkway point nearest its pin (and the option says so).
    //   value 'b:<building id>' or 'n:<node id>';  node = the walkway point the path starts or ends at.
    viewOptions() {
      const names = this.nodeNames, out = [];
      const nearest = (lat, lng) => {
        let best = null;
        this.nodes.forEach((n) => {
          const d = Math.hypot((n.lat - lat) * 111320, (n.lng - lng) * 111320 * Math.cos(lat * Math.PI / 180));
          if (!best || d < best.d) best = { id: String(n.id), d };
        });
        return best ? best.id : null;
      };
      const entranceIds = new Set();
      this.buildings.forEach((b) => {
        const id = b.entrance_node_id;
        const has = id !== null && id !== undefined && this.nodes.some((n) => String(n.id) === String(id));
        const node = has ? String(id) : nearest(b.lat, b.lng);
        if (node === null) return;
        if (has) entranceIds.add(node);
        out.push({ value: 'b:' + b.id, node, building: b.id, outside: CampusRoute.isOutsideBuilding(b), label: b.name + (has ? '' : ' (nearest point)') });
      });
      out.sort((x, y) => x.label.localeCompare(y.label));
      const buildingOf = new Map();
      this.buildings.forEach((b) => { if (b.entrance_node_id !== null && b.entrance_node_id !== undefined) buildingOf.set(String(b.entrance_node_id), b.name); });
      // Every walkway point under its own name, so a path can be viewed point to point (Point B, Point D, ...).
      const pts = this.nodes.map((n) => {
        const nm = names.get(String(n.id)) || 'Point';
        const where = buildingOf.get(String(n.id));
        return { value: 'n:' + n.id, node: String(n.id), group: 'Points', label: nm + (where ? ' (' + where + ')' : n.node_type === 'gate' ? ' (gate)' : '') };
      }).sort((x, y) => PointNames.compare(names.get(x.node), names.get(y.node)));
      return out.map((o) => ({ ...o, group: 'Buildings' })).concat(pts);
    },
    viewBuildings() { return this.viewOptions.filter((o) => o.group === 'Buildings'); },
    viewPoints() { return this.viewOptions.filter((o) => o.group === 'Points'); },
    // When the two chosen places are not connected: the two closest points across the gap, so the map can offer to join them.
    viewGap() {
      const rv = this.routeView;
      if (!rv || rv.ok || !rv.a || !rv.b) return null;
      const byId = new Map(this.nodes.map((n) => [String(n.id), n]));
      const comp = new Map();
      const adj = new Map(this.nodes.map((n) => [String(n.id), []]));
      this.edges.forEach((e) => { const x = String(e.node_a_id), y = String(e.node_b_id); if (adj.has(x) && adj.has(y)) { adj.get(x).push(y); adj.get(y).push(x); } });
      const walk = (start, tag) => { const st = [start]; comp.set(start, tag); while (st.length) { const c = st.pop(); adj.get(c).forEach((o) => { if (!comp.has(o)) { comp.set(o, tag); st.push(o); } }); } };
      walk(rv.a.node, 'a');
      if (comp.has(rv.b.node)) return null;
      walk(rv.b.node, 'b');
      const A = this.nodes.filter((n) => comp.get(String(n.id)) === 'a'), Bn = this.nodes.filter((n) => comp.get(String(n.id)) === 'b');
      let best = null;
      A.forEach((p) => Bn.forEach((q) => {
        const d = Math.hypot((q.lat - p.lat) * 111320, (q.lng - p.lng) * 111320 * Math.cos(p.lat * Math.PI / 180));
        if (!best || d < best.d) best = { p, q, d };
      }));
      if (!best) return null;
      // Every point on the far side, nearest first: the closest one is only a guess, so the page lets the admin choose
      // (for example the path really goes Main building > Point B, not to the nearest point).
      const dist = (q) => Math.hypot((q.lat - best.p.lat) * 111320, (q.lng - best.p.lng) * 111320 * Math.cos(best.p.lat * Math.PI / 180));
      const choices = Bn.map((q) => ({ id: q.id, name: this.nodeNames.get(String(q.id)), meters: Math.round(dist(q)) })).sort((x, y) => x.meters - y.meters);
      return { a: best.p, aName: this.nodeNames.get(String(best.p.id)), choices };
    },
    // The walk between the two chosen places, or null when no path view is chosen. It follows the same entrance and exit rules as
    // the AR guide (CampusRoute.regions):
    //   inside -> an outside building (Heritage, JEG): out through an exit gate first (the cheaper of the main and vehicle exit);
    //   outside -> a place inside the campus: in through the main entrance first, never through an exit gate;
    //   anything else: the shortest walk.
    //   { ok: true, nodeIds: Set, edgeKeys: Set, length (m), from, to, via, phase }   or   { ok: false, from, to, a, b } when not connected
    routeView() {
      if (!this.viewFrom || !this.viewTo || this.viewFrom === this.viewTo) return null;
      const opt = (v) => this.viewOptions.find((o) => o.value === v) || null;
      const oa = opt(this.viewFrom), ob = opt(this.viewTo);
      if (!oa || !ob) return null;
      const from = oa.label.replace(' (nearest point)', ''), to = ob.label.replace(' (nearest point)', '');
      const start = oa.node, end = ob.node;
      const byId = new Map(this.nodes.map((n) => [String(n.id), n]));
      const metres = (p, q) => Math.hypot((q.lat - p.lat) * 111320, (q.lng - p.lng) * 111320 * Math.cos(p.lat * Math.PI / 180));
      // the shortest walk between two points, optionally limited to some points: { ids, length } or null
      const walk = (a, b, allowed) => {
        if (a === b) return { ids: [a], length: 0 };
        if (!byId.has(a) || !byId.has(b)) return null;
        const adj = new Map();
        byId.forEach((n, id) => { if (!allowed || allowed.has(id)) adj.set(id, []); });
        this.edges.forEach((e) => {
          const x = String(e.node_a_id), y = String(e.node_b_id);
          if (!adj.has(x) || !adj.has(y)) return;
          const d = metres(byId.get(x), byId.get(y));
          adj.get(x).push({ id: y, d }); adj.get(y).push({ id: x, d });
        });
        if (!adj.has(a) || !adj.has(b)) return null;
        const dist = new Map([...adj.keys()].map((id) => [id, Infinity])), prev = new Map(), done = new Set();
        dist.set(a, 0);
        while (done.size < dist.size) {
          let cur = null, cd = Infinity;
          dist.forEach((d, id) => { if (!done.has(id) && d < cd) { cur = id; cd = d; } });
          if (cur === null || cur === b) break;
          done.add(cur);
          adj.get(cur).forEach(({ id, d }) => { if (cd + d < dist.get(id)) { dist.set(id, cd + d); prev.set(id, cur); } });
        }
        if (dist.get(b) === Infinity) return null;
        const ids = [b];
        while (ids[0] !== a) ids.unshift(prev.get(ids[0]));
        return { ids, length: dist.get(b) };
      };
      const join = (p1, p2) => (p1 && p2 ? { ids: p1.ids.concat(p2.ids.slice(1)), length: p1.length + p2.length } : null);
      const strSet = (set) => new Set([...set].map(String));

      const R = CampusRoute.regions({ nodes: this.nodes, edges: this.edges }, this.buildings);
      const outsideSet = strSet(R.outsideNodes), insideSet = strSet(R.insideNodes);
      const isOut = (o) => (o.group === 'Buildings' ? !!o.outside : outsideSet.has(o.node));
      let path = null, via = '', phase = '';
      if (outsideSet.size) {
        if (!isOut(oa) && isOut(ob)) {                                   // inside -> outside: through an exit gate
          let best = null;
          this.nodes.filter((n) => n.node_type === 'gate').forEach((gt) => {
            const id = String(gt.id), name = gt.name || this.nodeNames.get(id) || 'Gate';
            const p = join(walk(start, id, null), walk(id, end, new Set([...outsideSet, id])) || walk(id, end, null));
            if (!p) return;
            const cost = p.length + (CampusRoute.gateKind(name) === 'vehicle' ? CampusRoute.VEHICLE_GATE_PENALTY_M : 0);
            if (!best || cost < best.cost) best = { path: p, cost, name };
          });
          if (best) { path = best.path; via = best.name; phase = 'exit'; }
        } else if (isOut(oa) && !isOut(ob) && R.mainEntrance) {          // outside -> inside: through the main entrance
          const portal = String(R.mainEntrance.id);
          const p = join(walk(start, portal, new Set([...outsideSet, portal])), walk(portal, end, insideSet));
          if (p) { path = p; via = R.mainEntrance.name || this.nodeNames.get(portal) || 'the main entrance'; phase = 'enter'; }
        }
      }
      if (!path) path = walk(start, end, null);
      if (!path) return { ok: false, from, to, a: oa, b: ob };
      const edgeKeys = new Set();
      for (let i = 1; i < path.ids.length; i++) edgeKeys.add(edgeKey(path.ids[i - 1], path.ids[i]));
      return { ok: true, nodeIds: new Set(path.ids), edgeKeys, length: path.length, from, to, a: oa, b: ob, via, phase };
    },
    // The list beside the map follows the path view too.
    listPoints() {
      const rv = this.routeView;
      return rv && rv.ok ? this.pointList.filter((p) => rv.nodeIds.has(String(p.id))) : this.pointList;
    },
    // The list beside the map: one row per point, in name order.
    pointList() {
      const names = this.nodeNames;
      const label = (id) => names.get(String(id)) || '';
      const typeLabel = { junction: 'Junction', gate: 'Gate', entrance: 'Building entrance' };
      return this.nodes.map((n) => {
        const links = this.edges
          .filter((e) => String(e.node_a_id) === String(n.id) || String(e.node_b_id) === String(n.id))
          .map((e) => label(String(e.node_a_id) === String(n.id) ? e.node_b_id : e.node_a_id))
          .sort(PointNames.compare);
        const building = this.buildings.find((b) => b.entrance_node_id !== null && b.entrance_node_id !== undefined && String(b.entrance_node_id) === String(n.id));
        return {
          id: n.id, name: label(n.id), short: PointNames.short(label(n.id)), type: n.node_type, typeLabel: typeLabel[n.node_type] || n.node_type,
          lat: n.lat, lng: n.lng, links, entranceOf: building ? building.name : '', pending: !!n._pending
        };
      }).sort((a, b) => PointNames.compare(a.name, b.name));
    }
  },
  async mounted() {
    this.initMap();
    await this.loadAll();
    this.fitToData();
    this.loadCampusAnchors();
    AdminOffline.onSynced(async () => { await this.loadAll(); });
    window.addEventListener('pagehide', () => { if (this.recording) this.releaseWalk(); });
    AdminOffline.onChange(() => { this.rebuild(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.showingCampusQr) this.showingCampusQr = false;
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && this.undo) {
        const t = e.target; const tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        e.preventDefault(); this.undoLast();
      }
      this.onEditorKey(e);
    });
  },
  methods: {
    async loadCampusAnchors() {
      try {
        const res = await fetch('../../../Backend/api/qr-anchors.php?campus=1');
        const data = await res.json();
        this.campusAnchors = (data.success && data.anchors) ? data.anchors : [];
      } catch (e) { /* editor still works without QR state */ }
    },
    qrUrlFor(code) {
      return new URL('../Public/guide-ar.php?qr=' + code, window.location.href).href;
    },
    // Adds (or replaces) the AR anchor on whichever point is selected. Every
    // outdoor node can have its own anchor, so this never touches anchors on
    // other nodes.
    async setCampusQr() {
      if (this.selectedId === null) return;
      if (!(await AdminOffline.guardOnline('Generating the campus AR anchor QR'))) return;
      const label = this.labelOf(this.selected);
      const nodeId = this.selectedId;
      this.qrBusy = true;
      try {
        const res = await fetch('../../../Backend/api/qr-anchors.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campus_node_id: nodeId, label })
        });
        const data = await res.json();
        if (!data.success) { AdminOffline.toast(data.error || 'Could not create the QR code', 'error'); return; }
        this.campusAnchors = this.campusAnchors.filter((a) => String(a.campus_node_id) !== String(nodeId));
        const anchor = { id: data.id, campus_node_id: nodeId, code: data.code, label: data.label, scan_heading: null };
        this.campusAnchors.push(anchor);
        this.showingQrFor = anchor.id;
      } finally {
        this.qrBusy = false;
      }
    },
    // The direction a person faces while scanning a given sign, standing at its anchor point.
    // Easiest to set from the map: select the point the sign is at / straight ahead of it and the
    // bearing is worked out from the two positions (no compass involved).
    async saveHeading(anchor, value) {
      if (!anchor) return;
      if (!(await AdminOffline.guardOnline('Saving the anchor direction'))) return;
      const res = await fetch('../../../Backend/api/qr-anchors.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchor_id: anchor.id, scan_heading: value })
      });
      const data = await res.json();
      if (!data.success) { AdminOffline.toast(data.error || 'Could not save the direction', 'error'); return; }
      const i = this.campusAnchors.findIndex((a) => a.id === anchor.id);
      if (i !== -1) this.campusAnchors[i] = { ...this.campusAnchors[i], scan_heading: data.scan_heading };
      delete this.headingDrafts[anchor.id];
      AdminOffline.toast('Anchor direction saved', 'success');
    },
    // One-tap setup: press "Set direction" on an anchor's row, then tap where its sign is on
    // the map. The bearing from that anchor's point to the tapped spot is saved.
    startPickDirection(anchor) {
      this.select(null);
      this.pickingDirectionFor = anchor.id;
    },
    headingToward(lat, lng) {
      const anchor = this.campusAnchors.find((a) => a.id === this.pickingDirectionFor);
      const from = anchor && this.nodes.find((n) => String(n.id) === String(anchor.campus_node_id));
      if (!from) { AdminOffline.toast('The anchor point is missing from the map', 'error'); return; }
      if (Math.abs(lat - from.lat) < 1e-6 && Math.abs(lng - from.lng) < 1e-6) { AdminOffline.toast('Tap the sign, not the anchor point itself', 'error'); return; }
      const p1 = from.lat * Math.PI / 180, p2 = lat * Math.PI / 180, dl = (lng - from.lng) * Math.PI / 180;
      const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
      this.saveHeading(anchor, Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360));
    },
    saveHeadingDraft(anchor) {
      const v = parseFloat(this.headingDrafts[anchor.id]);
      this.saveHeading(anchor, isNaN(v) ? null : v);
    },
    showCampusQr(anchor) {
      this.showingQrFor = anchor.id;
    },
    async removeCampusQr(anchor) {
      const result = await Swal.fire({
        title: 'Remove this AR anchor?',
        text: 'The printed sign at ' + (anchor.label || 'this point') + ' will stop working.',
        icon: 'warning', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#ff0000'
      });
      if (!result.isConfirmed) return;
      await fetch('../../../Backend/api/qr-anchors.php?id=' + anchor.id, { method: 'DELETE' });
      this.campusAnchors = this.campusAnchors.filter((a) => a.id !== anchor.id);
      if (this.showingQrFor === anchor.id) this.showingQrFor = null;
    },
    initMap() {
      // The campus centre (from the school's settings) until real data loads.
      const map = L.map(this.$refs.mapArea, CampusBounds.mapOptions()).setView(CampusBounds.CENTER, 18);
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        bounds: CampusBounds.BOUNDS, maxZoom: 21, maxNativeZoom: 19
      });
      // Satellite is the useful one here — walkways are visible on it.
      const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        bounds: CampusBounds.BOUNDS, maxZoom: 21, maxNativeZoom: 19
      });
      sat.addTo(map);
      L.control.layers({ Satellite: sat, Streets: osm }, null, { position: 'topright' }).addTo(map);
      this.layer = markRaw(L.layerGroup().addTo(map));
      map.on('click', (e) => this.onMapTap(e.latlng.lat, e.latlng.lng));
      map.on('zoomend', () => this.redraw()); // labels switch on/off with zoom
      this.map = markRaw(map);
    },

    // ---- data ----
    async loadAll() {
      try {
        const [g, b] = await Promise.all([
          fetch('../../../Backend/api/campus-graph.php', { credentials: 'same-origin' }).then((r) => r.json()),
          fetch('../../../Backend/api/buildings.php', { credentials: 'same-origin' }).then((r) => r.json())
        ]);
        if (g.success) this.baseGraph = { nodes: g.nodes, edges: g.edges };
        if (b.success) this.baseBuildings = b.buildings;
      } catch (e) {
        // No connection and nothing saved yet: the page still works, it just starts empty.
        if (!this.baseBuildings.length && !this.baseGraph.nodes.length) {
          AdminOffline.toast('Could not load saved data. Open this page once while online to keep a copy.', 'info');
        }
      }
      this.rebuild();
    },
    rebuild() {
      const graph = AdminOffline.overlayCampus(this.baseGraph);
      this.nodes = graph.nodes;
      this.edges = graph.edges;
      this.buildings = AdminOffline.overlayBuildings(this.baseBuildings);
      if (this.selectedId !== null && !this.nodes.some((n) => String(n.id) === String(this.selectedId))) this.selectedId = null;
      if (this.map) this.redraw();
    },
    fitToData() {
      const pts = [
        ...this.nodes.map((n) => [n.lat, n.lng]),
        ...this.buildings.map((b) => [b.lat, b.lng])
      ];
      if (pts.length > 1) this.map.fitBounds(pts, { padding: [40, 40], maxZoom: 19 });
      else if (pts.length === 1) this.map.setView(pts[0], 18);
    },

    // The path view changed: redraw, and bring the chosen path into view.
    viewChanged() {
      if (!this.map) return;
      this.redraw();
      const rv = this.routeView;
      if (rv && rv.ok) {
        const pts = this.nodes.filter((n) => rv.nodeIds.has(String(n.id))).map((n) => [n.lat, n.lng]);
        if (pts.length > 1) this.map.fitBounds(pts, { padding: [50, 50], maxZoom: 19 });
      }
    },
    clearView() { this.viewFrom = ''; this.viewTo = ''; },
    // Joins the two closest points across a gap (the usual reason two places are "not connected"), then shows the path.
    async connectGap() {
      const g = this.viewGap;
      if (!g || this.lockedNow('connect these points')) return;
      const to = this.gapTarget && g.choices.some((c) => String(c.id) === String(this.gapTarget)) ? this.gapTarget : g.choices[0].id;
      await this.connect(g.a.id, to);
      this.gapTarget = '';
    },
    swapView() { const f = this.viewFrom; this.viewFrom = this.viewTo; this.viewTo = f; },

    // ---- drawing ----
    redraw() {
      if (this.$refs.mapArea) this.$refs.mapArea.classList.toggle('is-locked-surface', !!this.locked);   // by hand: Vue's :class would erase Leaflet's own classes
      this.layer.clearLayers();
      const byId = new Map(this.nodes.map((n) => [String(n.id), n]));
      // With a path view on, only that path's points, connections and the two buildings at its ends are drawn.
      const rv = this.routeView && this.routeView.ok ? this.routeView : null;
      const showNode = (n) => !rv || rv.nodeIds.has(String(n.id));

      this.edges.forEach((e) => {
        const a = byId.get(String(e.node_a_id)), b = byId.get(String(e.node_b_id));
        if (!a || !b) return;
        if (rv && !rv.edgeKeys.has(edgeKey(a.id, b.id))) return;
        const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
          color: '#ffd100', weight: 5, opacity: 0.9, dashArray: e._pending ? '2 8' : null,
          interactive: !this.locked     // a locked map ignores taps on connections
        });
        line.on('click', (ev) => { L.DomEvent.stopPropagation(ev); this.deleteEdge(e); });
        line.addTo(this.layer);
      });

      // Building pin, plus a dashed leader to its entrance point so a missing
      // or wrong link is visible at a glance.
      const showLabels = this.showNames && this.map.getZoom() >= LABEL_MIN_ZOOM;
      this.buildings.forEach((b) => {
        if (this.pathsOnly) return;
        if (rv && b.id !== rv.a.building && b.id !== rv.b.building) return;
        const icon = L.divIcon({ className: '', html: '<div class="cp-building"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
        L.marker([b.lat, b.lng], { icon, interactive: true, zIndexOffset: -500 })
          .bindTooltip(b.name, { permanent: showLabels, direction: 'top', offset: [0, -8], className: 'cp-label' })
          .addTo(this.layer);
        const ent = b.entrance_node_id !== null && b.entrance_node_id !== undefined ? byId.get(String(b.entrance_node_id)) : null;
        if (ent) L.polyline([[b.lat, b.lng], [ent.lat, ent.lng]], { color: '#7c3aed', weight: 2, dashArray: '4 6' }).addTo(this.layer);
        (b.extra_entrances || []).forEach((x) => { const en = byId.get(String(x.node_id)); if (en) L.polyline([[b.lat, b.lng], [en.lat, en.lng]], { color: '#d97706', weight: 2, dashArray: '2 6' }).bindTooltip(x.label || 'Second entrance', { sticky: true }).addTo(this.layer); });
      });

      // Names of points that would sit on top of each other are left off (they still show on hover or when selected),
      // so a crowded spot such as the main entrance stays readable. Zooming in makes room for more.
      const placed = [];
      this.nodes.forEach((n) => {
        if (!showNode(n) || (this.pathsOnly && String(n.id) !== String(this.selectedId) && !this.pickedIds.includes(String(n.id)))) return;
        const cls = ['cp-node', n.node_type, String(n.id) === String(this.selectedId) ? 'is-selected' : '', n._pending ? 'is-pending' : '', this.pickedIds.includes(String(n.id)) ? 'is-picked' : ''].join(' ');
        const icon = L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
        const m = L.marker([n.lat, n.lng], { icon, draggable: !this.locked, zIndexOffset: 500 });
        // The point's letter, so the map matches the list beside it.
        let labelOn = this.showNames;
        if (labelOn) {
          const pt = this.map.latLngToContainerPoint([n.lat, n.lng]);
          if (String(n.id) !== String(this.selectedId) && placed.some((q) => Math.hypot(q.x - pt.x, q.y - pt.y) < 26)) labelOn = false;
          else placed.push(pt);
        }
        m.bindTooltip(PointNames.short(this.nodeNames.get(String(n.id))), { permanent: labelOn, direction: 'right', offset: [9, 0], className: 'cp-pt-label' });
        m.on('click', (ev) => { L.DomEvent.stopPropagation(ev); this.onNodeTap(n); });
        m.on('dragend', () => { const p = m.getLatLng(); this.moveNode(n, p.lat, p.lng); });
        m.addTo(this.layer);
      });
    },
    select(id) {
      this.selectedId = id;
      this.redraw();
    },
    labelOf(n) { return this.nodeNames.get(String(n.id)) || ''; },

    // ---- lock ----
    async toggleLock() {
      if (this.recording) await this.stopWalk();  // finish saving the walk's last point before locking
      this.locked = !this.locked;
      EditorLock.set('campus-paths', this.locked);
      this.redraw();
    },
    // Call at the start of anything that would change the map. True (after telling the admin) when locked.
    lockedNow(what) {
      if (!this.locked) return false;
      AdminOffline.toast(`The map is locked. Unlock it to ${what}.`, 'info');
      return true;
    },

    // ---- one Save for everything in the Selected point panel ----
    resetDrafts() {
      const n = this.selected;
      this.nameDraft = n ? this.labelOf(n) : ''; this.typeDraft = n ? n.node_type : 'junction';
      this.entranceDraft = n ? String(this.entranceBuildingId) : ''; this.nameError = '';
    },
    async savePoint() {
      const n = this.selected;
      if (!n || this.savingPoint || this.lockedNow('save changes to a point')) return;
      this.savingPoint = true; this.savedNote = '';
      try {
        if (this.nameDraft.trim() !== this.labelOf(n)) { await this.renameSelected(); if (this.nameError) return; }
        const entranceChanged = String(this.entranceDraft) !== String(this.entranceBuildingId);
        if (entranceChanged) await this.setEntrance(this.entranceDraft);   // an entrance point is also set to the entrance type
        if (this.typeDraft !== this.selected.node_type && !(entranceChanged && this.entranceDraft !== '')) await this.changeType(this.typeDraft);
        this.resetDrafts(); this.savedNote = 'Saved'; this.liveMsg = 'Point saved';
        setTimeout(() => { this.savedNote = ''; }, 2500);
      } finally { this.savingPoint = false; }
    },

    // ---- smooth sharp turns: extra points that round each corner; every existing point stays exactly where it is ----
    // A plain bend (a junction joined to exactly two others, not an entrance or gate) is replaced by a short curve. The old
    // corner point is kept, tied to the middle of the curve by a tiny link, so nothing that referred to it is lost.
    smoothPlan() {
      const M = 111320, out = [];
      const deg = new Map();
      this.edges.forEach((e) => { [e.node_a_id, e.node_b_id].forEach((id) => { const k = String(id); (deg.get(k) || deg.set(k, []).get(k)).push(e); }); });
      this.nodes.forEach((c) => {
        const es = deg.get(String(c.id)) || [];
        if (es.length !== 2 || c.node_type !== 'junction' || this.buildings.some((b) => String(b.entrance_node_id) === String(c.id))) return;
        const other = (e) => this.nodes.find((x) => String(x.id) === String(String(e.node_a_id) === String(c.id) ? e.node_b_id : e.node_a_id));
        const A = other(es[0]), B = other(es[1]); if (!A || !B) return;
        const kx = M * Math.cos(c.lat * Math.PI / 180);
        const va = [(A.lng - c.lng) * kx, (A.lat - c.lat) * M], vb = [(B.lng - c.lng) * kx, (B.lat - c.lat) * M];
        const la = Math.hypot(...va), lb = Math.hypot(...vb); if (la < 3 || lb < 3) return;
        const cos = (va[0] * vb[0] + va[1] * vb[1]) / (la * lb), turn = 180 - Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
        if (turn < 30) return;                                          // already gentle
        const d = Math.min(8, la * 0.4, lb * 0.4), ua = va.map((x) => x / la), ub = vb.map((x) => x / lb);
        const P1 = [ua[0] * d, ua[1] * d], P2 = [ub[0] * d, ub[1] * d];
        const curve = [0.25, 0.5, 0.75].map((s) => {                    // quadratic curve P1 -> (corner) -> P2
          const w = [(1 - s) * (1 - s), 2 * s * (1 - s), s * s];
          return [w[0] * P1[0] + w[2] * P2[0], w[0] * P1[1] + w[2] * P2[1]];
        });
        const pt = (v) => ({ lat: c.lat + v[1] / M, lng: c.lng + v[0] / kx });
        out.push({ corner: c, A, B, edges: es, points: [P1, ...curve, P2].map(pt), turn: Math.round(turn) });
      });
      return out;
    },
    async smoothSharpTurns() {
      if (this.lockedNow('smooth the paths')) return;
      const plan = this.smoothPlan();
      if (!plan.length) { Swal.fire({ icon: 'info', title: 'Nothing to smooth', text: 'No plain bend is sharper than 30 degrees. Gates, entrances and forks are left alone.' }); return; }
      const added = plan.length * 5;
      const r = await Swal.fire({ icon: 'question', title: 'Round ' + plan.length + ' sharp turn' + (plan.length === 1 ? '' : 's') + '?', text: 'This adds ' + added + ' points to make the corners curve. Your existing points are not moved or removed.', showCancelButton: true, confirmButtonText: 'Smooth them' });
      if (!r.isConfirmed) return;
      this.smoothing = true;
      try {
        for (const s of plan) {
          const ids = [];
          for (const p of s.points) { const id = await this.createNode(p.lat, p.lng); if (id === null) throw new Error('Could not add a point'); ids.push(id); }
          for (const e of s.edges) await this.dropEdge(e);
          await this.connect(s.A.id, ids[0]); // the straight part up to the curve
          for (let i = 0; i < ids.length - 1; i++) await this.connect(ids[i], ids[i + 1]);
          await this.connect(ids[ids.length - 1], s.B.id);
          await this.connect(s.corner.id, ids[2]);           // tiny link keeps the old corner attached
        }
        this.undo = null; this.liveMsg = 'Smoothed ' + plan.length + ' turns';
        Swal.fire({ toast: true, position: 'bottom', icon: 'success', title: 'Smoothed ' + plan.length + ' turn' + (plan.length === 1 ? '' : 's'), showConfirmButton: false, timer: 2200 });
      } catch (e) { Swal.fire({ icon: 'error', title: 'Stopped early', text: e.message }); }
      finally { this.smoothing = false; this.rebuild(); this.redraw(); }
    },
    async dropEdge(edge) {
      const out = await this.save({ type: 'edge.delete', payload: { id: edge.id }, label: 'Replaced a corner with a curve' }, () => this.request(API + '?edge_id=' + edge.id, 'DELETE'));
      if (out && !out.queued) this.baseGraph.edges = this.baseGraph.edges.filter((e) => String(e.id) !== String(edge.id));
      this.rebuild();
    },

    // ---- select several points and remove them together ----
    toggleMulti() {
      this.multi = !this.multi; this.pickedIds = [];
      if (this.multi) this.select(null); else this.redraw();
      this.liveMsg = this.multi ? 'Selecting several points. Tap points to choose them.' : 'Back to normal editing.';
      if (this.multi) this.redraw();
    },
    togglePick(id) {
      const k = String(id), i = this.pickedIds.indexOf(k);
      if (i >= 0) this.pickedIds.splice(i, 1); else this.pickedIds.push(k);
      this.redraw();
    },
    pickInView() {
      const b = this.map.getBounds(), rv = this.routeView;
      this.pickedIds = this.nodes.filter((n) => b.contains([n.lat, n.lng]) && (!rv || !rv.ok || rv.nodeIds.has(String(n.id)))).map((n) => String(n.id));
      this.redraw();
    },
    async deleteMany() {
      if (this.lockedNow('delete points') || !this.pickedIds.length || this.deletingMany) return;
      if (!(await AdminOffline.guardOnline('Deleting several points'))) return;
      const ids = this.pickedIds.slice(), set = new Set(ids);
      const joins = this.baseGraph.edges.filter((e) => set.has(String(e.node_a_id)) || set.has(String(e.node_b_id))).length;
      const entrances = this.baseBuildings.filter((b) => set.has(String(b.entrance_node_id))).map((b) => b.name);
      if (!(await AdminConfirm({
        title: 'Delete ' + ids.length + ' point' + (ids.length === 1 ? '' : 's') + '?',
        text: [joins ? joins + ' connection' + (joins === 1 ? '' : 's') + ' go with them.' : '',
               entrances.length ? 'The entrance of ' + entrances.join(', ') + ' will be empty until you set a new one.' : '',
               'You can undo this right afterwards.'].filter(Boolean).join(' '),
        confirmText: 'Delete ' + ids.length, danger: true }))) return;
      this.deletingMany = true;
      try {
        const data = await this.request(API + '?ids=' + ids.join(','), 'DELETE');
        this.undo = { label: 'Deleted ' + ids.length + ' point' + (ids.length === 1 ? '' : 's'), snapshot: data.snapshot };
        this.baseGraph.nodes = this.baseGraph.nodes.filter((x) => !set.has(String(x.id)));
        this.baseGraph.edges = this.baseGraph.edges.filter((e) => !set.has(String(e.node_a_id)) && !set.has(String(e.node_b_id)));
        this.baseBuildings.forEach((b) => { if (set.has(String(b.entrance_node_id))) b.entrance_node_id = null; });
        this.pickedIds = []; this.selectedId = null; this.liveMsg = 'Deleted ' + ids.length + ' points';
        this.rebuild();
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Could not delete', text: e.message || 'Try again.' });
      } finally { this.deletingMany = false; }
    },

    // ---- second entrances ----
    async addExtra() {
      const n = this.selected; if (!n || !this.extraBuilding || this.lockedNow('add an entrance')) return;
      const b = this.buildings.find((x) => String(x.id) === String(this.extraBuilding)), label = this.extraLabel.trim();
      const out = await this.save(
        { type: 'extra_entrance.add', payload: { building_id: this.extraBuilding, node_id: n.id, label }, label: `Added a second entrance to "${b ? b.name : 'a building'}"` },
        () => this.request(API + '?action=extra_entrance', 'POST', { building_id: this.extraBuilding, node_id: n.id, label })
      );
      if (!out) return;
      this.extraBuilding = ''; this.extraLabel = '';
      if (out.queued) this.rebuild(); else await this.loadAll();
      AdminOffline.toast(out.queued ? 'Saved on this device. It syncs when you are back online.' : 'Entrance added', out.queued ? 'info' : undefined);
    },
    async removeExtra(x) {
      if (this.lockedNow('remove an entrance')) return;
      const nodeId = this.selectedId;
      const out = await this.save(
        { type: 'extra_entrance.remove', payload: { building_id: x.building.id, node_id: nodeId }, label: `Removed a second entrance of "${x.building.name}"` },
        () => this.request(API + '?extra_entrance=1&building_id=' + x.building.id + '&node_id=' + nodeId, 'DELETE')
      );
      if (!out) return;
      if (out.queued) this.rebuild(); else await this.loadAll();
      AdminOffline.toast(out.queued ? 'Saved on this device. It syncs when you are back online.' : 'Entrance removed', out.queued ? 'info' : undefined);
    },

    // ---- naming ----
    async renameSelected() {
      const n = this.selected;
      if (!n || this.lockedNow('rename points')) return;
      const name = PointNames.clean(this.nameDraft);
      if (!name) { this.nameError = 'A point needs a name.'; return; }
      if (name === this.labelOf(n)) { this.nameError = ''; return; }
      if (!PointNames.isFree(name, this.nodes, this.nodeNames, n.id)) { this.nameError = `Another point is already named "${name}".`; return; }
      this.nameError = '';
      const base = this.baseNode(n.id);
      const out = await this.save(
        { type: 'node.update', payload: { id: n.id, lat: n.lat, lng: n.lng, node_type: n.node_type, name, base: base ? { lat: base.lat, lng: base.lng, node_type: base.node_type } : null },
          label: `Renamed ${this.labelOf(n)} to "${name}"` },
        () => this.request(API + '?node_id=' + n.id, 'PUT', { lat: n.lat, lng: n.lng, node_type: n.node_type, name })
      );
      if (out && !out.queued && base) base.name = name;
      this.rebuild();
      this.nameDraft = name;
    },
    focusNode(id) {
      const n = this.nodes.find((x) => String(x.id) === String(id));
      if (!n) return;
      this.map.setView([n.lat, n.lng], Math.max(this.map.getZoom(), 19));
      this.select(id);
    },

    // ---- saving (server when reachable, pending list otherwise) ----
    // Runs one edit; shows server-side problems (not connectivity ones) as an error.
    async save(op, direct) {
      try {
        const out = await AdminOffline.run(op, direct);
        if (out.queued) this.rebuild();
        return out;
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.message || 'Could not save' });
        return null;
      }
    },
    async request(path, method, body) {
      const data = await AdminOffline.fetchJson(path, { method, body: body ? JSON.stringify(body) : undefined });
      if (!data.success) throw new Error(data.error || 'Request failed');
      return data;
    },
    baseNode(id) { return this.baseGraph.nodes.find((n) => String(n.id) === String(id)) || null; },

    // Creates a point and returns its id (real or temporary), or null if it failed.
    async createNode(lat, lng) {
      if (this.locked) return null;
      const tempId = AdminOffline.newTempId();
      // Next free "Point A", "Point B", ... (the server double-checks when it saves).
      const name = PointNames.next([...this.nodeNames.values()]);
      const out = await this.save(
        { type: 'node.create', payload: { temp_id: tempId, lat, lng, node_type: 'junction', name }, label: `New ${name} (${lat.toFixed(5)}, ${lng.toFixed(5)})` },
        () => this.request(API, 'POST', { lat, lng, node_type: 'junction', name })
      );
      if (!out) return null;
      if (out.queued) return tempId;
      this.baseGraph.nodes.push({ id: out.result.id, lat, lng, node_type: 'junction', name: out.result.name || name });
      this.rebuild();
      return out.result.id;
    },
    async connect(fromId, toId) {
      if (this.locked || String(fromId) === String(toId)) return;
      const out = await this.save(
        { type: 'edge.create', payload: { temp_id: AdminOffline.newTempId(), node_a_id: fromId, node_b_id: toId }, label: 'Connected two walkway points' },
        () => this.request(API + '?action=edge', 'POST', { node_a_id: fromId, node_b_id: toId })
      );
      if (out && !out.queued && !out.result.already_existed) {
        this.baseGraph.edges.push({ id: out.result.id, node_a_id: Math.min(fromId, toId), node_b_id: Math.max(fromId, toId) });
        // Undo for a new connection removes it again.
        this.undo = { label: `Connected ${this.nodeNames.get(String(fromId)) || 'a point'} to ${this.nodeNames.get(String(toId)) || 'a point'}`, edgeId: out.result.id };
        this.rebuild();
      }
    },
    async moveNode(node, lat, lng) {
      if (this.locked) { this.rebuild(); return; }   // (a locked marker can't be dragged; this is just a safety net)
      const base = this.baseNode(node.id);
      const out = await this.save(
        { type: 'node.update', payload: { id: node.id, lat, lng, node_type: node.node_type, base: base ? { lat: base.lat, lng: base.lng, node_type: base.node_type } : null },
          label: `Moved walkway point (${lat.toFixed(5)}, ${lng.toFixed(5)})` },
        () => this.request(API + '?node_id=' + node.id, 'PUT', { lat, lng, node_type: node.node_type })
      );
      if (out && !out.queued && base) { base.lat = lat; base.lng = lng; }
      this.rebuild();
    },
    async changeType(type) {
      const n = this.selected;
      if (!n || this.lockedNow('change a point')) return;
      const base = this.baseNode(n.id);
      const out = await this.save(
        { type: 'node.update', payload: { id: n.id, lat: n.lat, lng: n.lng, node_type: type, base: base ? { lat: base.lat, lng: base.lng, node_type: base.node_type } : null },
          label: `Changed walkway point type to ${type}` },
        () => this.request(API + '?node_id=' + n.id, 'PUT', { lat: n.lat, lng: n.lng, node_type: type })
      );
      if (out && !out.queued && base) base.node_type = type;
      this.rebuild();
    },
    async setEntrance(value) {
      const n = this.selected;
      if (!n || this.lockedNow('change an entrance')) return;
      // One building per entrance point: clear whichever building currently
      // holds this node before assigning it to the newly chosen one.
      const prev = this.buildings.find((b) => String(b.entrance_node_id) === String(n.id));
      if (prev && String(prev.id) !== String(value)) await this.saveEntrance(prev, null);
      if (value !== '') {
        const target = this.buildings.find((b) => String(b.id) === String(value));
        if (target) {
          await this.saveEntrance(target, n.id);
          if (n.node_type !== 'entrance') await this.changeType('entrance');
        }
      }
      this.rebuild();
    },
    async saveEntrance(building, nodeId) {
      const baseB = this.baseBuildings.find((b) => String(b.id) === String(building.id));
      const out = await this.save(
        { type: 'entrance.set', payload: { building_id: building.id, node_id: nodeId, base_entrance: baseB ? (baseB.entrance_node_id ?? null) : null },
          label: nodeId === null ? `Cleared entrance of "${building.name}"` : `Set entrance of "${building.name}"` },
        () => this.request(API + '?action=entrance', 'POST', { building_id: building.id, node_id: nodeId })
      );
      if (out && !out.queued && baseB) baseB.entrance_node_id = nodeId;
    },
    async deleteEdge(edge) {
      if (this.lockedNow('remove a connection')) return;
      const r = await Swal.fire({ title: 'Remove this connection?', icon: 'question', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#ff0000' });
      if (!r.isConfirmed) return;
      const out = await this.save(
        { type: 'edge.delete', payload: { id: edge.id }, label: 'Removed a walkway connection' },
        () => this.request(API + '?edge_id=' + edge.id, 'DELETE')
      );
      if (out && !out.queued) {
        // Undo for a removed connection draws it again between the same two points.
        this.undo = {
          label: `Removed the connection ${this.nodeNames.get(String(edge.node_a_id)) || ''} – ${this.nodeNames.get(String(edge.node_b_id)) || ''}`,
          snapshot: { edges: [{ node_a_id: edge.node_a_id, node_b_id: edge.node_b_id }] }
        };
        this.baseGraph.edges = this.baseGraph.edges.filter((e) => String(e.id) !== String(edge.id));
        this.rebuild();
      }
    },
    // Wipes every point (and so every connection and building entrance) after a confirmation.
    // The server hands back a snapshot, which the Undo button puts back exactly as it was.
    async removeAll() {
      if (this.lockedNow('remove all points') || !this.nodes.length) return;
      if (!(await AdminOffline.guardOnline('Removing all points'))) return;
      if (AdminOffline.count() > 0) {
        AdminOffline.toast('Sync or discard your changes saved on this device first.', 'info');
        return;
      }
      const count = this.nodes.length;
      const r = await Swal.fire({
        icon: 'warning', title: `Remove all ${count} points?`,
        text: 'Every connection is removed too, and buildings lose their entrance. You can undo it right afterwards.',
        showCancelButton: true, confirmButtonText: 'Remove all', confirmButtonColor: '#ff0000'
      });
      if (!r.isConfirmed) return;
      try {
        const out = await this.request(API + '?all=1', 'DELETE');
        this.undo = { label: `Removed all ${out.removed} points`, snapshot: out.snapshot };
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Could not remove the points', text: e.message });
        return;
      }
      this.selectedId = null;
      await this.loadAll();
    },
    // Puts the last delete back: same points, names, connections and entrances.
    async undoLast() {
      if (!this.undo) return;
      if (!(await AdminOffline.guardOnline('Undo'))) return;
      try {
        if (this.undo.edgeId) await this.request(API + '?edge_id=' + this.undo.edgeId, 'DELETE');   // undo a new connection
        else await this.request(API + '?action=restore', 'POST', this.undo.snapshot);
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Could not undo', text: e.message });
        return;
      }
      this.undo = null;
      await this.loadAll();
      AdminOffline.toast('Undone');
    },
    async deleteSelected() {
      const n = this.selected;
      if (!n || this.lockedNow('delete a point')) return;
      const name = this.labelOf(n);
      const joins = this.baseGraph.edges.filter((e) => String(e.node_a_id) === String(n.id) || String(e.node_b_id) === String(n.id)).length;
      const entranceOf = this.baseBuildings.filter((b) => String(b.entrance_node_id) === String(n.id)).map((b) => b.name);
      const hasAnchor = this.campusAnchors.some((a) => String(a.campus_node_id) === String(n.id));
      if ((joins > 0 || entranceOf.length || hasAnchor) && !(await AdminConfirm({
        title: 'Delete ' + (name || 'this point') + '?',
        text: [joins ? 'It is joined to ' + joins + ' other point' + (joins === 1 ? '' : 's') + ', and those connections go with it.' : '',
               entranceOf.length ? 'It is the entrance of ' + entranceOf.join(', ') + ', which will have no entrance until you set a new one.' : '',
               hasAnchor ? 'Its outdoor AR anchor QR will stop working.' : '',
               'You can undo this right afterwards.'].filter(Boolean).join(' '),
        confirmText: 'Delete point', danger: true }))) return;
      const out = await this.save(
        { type: 'node.delete', payload: { id: n.id }, label: 'Deleted a walkway point' },
        () => this.request(API + '?node_id=' + n.id, 'DELETE')
      );
      if (out && !out.queued) {
        if (out.result && out.result.snapshot) this.undo = { label: `Deleted ${name}`, snapshot: out.result.snapshot };
        this.baseGraph.nodes = this.baseGraph.nodes.filter((x) => String(x.id) !== String(n.id));
        this.baseGraph.edges = this.baseGraph.edges.filter((e) => String(e.node_a_id) !== String(n.id) && String(e.node_b_id) !== String(n.id));
        this.baseBuildings.forEach((b) => { if (String(b.entrance_node_id) === String(n.id)) b.entrance_node_id = null; });
      }
      this.selectedId = null;
      this.rebuild();
    },

    // ---- taps ----
    async onNodeTap(node) {
      if (this.multi) { this.togglePick(node.id); return; }
      if (this.pickingDirectionFor !== null) { this.headingToward(node.lat, node.lng); this.pickingDirectionFor = null; return; }
      // Tap a second node while one is selected -> connect them, then keep the
      // new one selected so you can chain along a walkway without re-tapping.
      if (this.locked) {                  // locked: tapping a point only selects it
        this.select(String(this.selectedId) === String(node.id) ? null : node.id);
        return;
      }
      if (this.selectedId !== null && String(this.selectedId) !== String(node.id)) {
        await this.connect(this.selectedId, node.id);
        this.select(node.id);
        return;
      }
      this.select(String(this.selectedId) === String(node.id) ? null : node.id);
    },
    async onMapTap(lat, lng) {
      if (this.multi) return;   // while choosing points to remove, a tap on empty map does nothing
      if (this.pickingDirectionFor !== null) { this.headingToward(lat, lng); this.pickingDirectionFor = null; return; }
      // Tapping empty map while a point is selected just deselects (so a stray
      // tap doesn't drop an unwanted point) — tap again to actually add one.
      if (this.selectedId !== null) { this.select(null); return; }
      if (this.locked) return;            // a locked map never adds points from a tap
      const id = await this.createNode(lat, lng);
      if (id !== null) this.select(id);
    },

    // ---- keyboard / assistive alternatives to tap and drag ----

    // Alt+Arrow nudges the selected point 1 m (Shift: 5 m); Delete removes it; Esc deselects.
    // Ignored while typing in a field, so renaming a point never moves or deletes it.
    onEditorKey(e) {
      const t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      if (document.querySelector('.modal-overlay.is-open, .swal2-container')) return;
      if (e.key === 'Escape' && this.selectedId !== null) { this.select(null); return; }
      if (this.selectedId === null) return;
      if (e.key === 'Delete') { e.preventDefault(); this.deleteSelected(); return; }
      const dir = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e' }[e.key];
      if (dir && e.altKey) { e.preventDefault(); this.nudge(dir, e.shiftKey ? 5 : 1); }
    },
    async nudge(dir, meters) {
      const n = this.selected;
      if (!n || this.nudgeBusy || this.lockedNow('move a point')) return;
      this.nudgeBusy = true;
      const dLat = meters / 111320, dLng = meters / (111320 * Math.cos(n.lat * Math.PI / 180));
      const lat = n.lat + (dir === 'n' ? dLat : dir === 's' ? -dLat : 0);
      const lng = n.lng + (dir === 'e' ? dLng : dir === 'w' ? -dLng : 0);
      try { await this.moveNode(n, lat, lng); } finally { this.nudgeBusy = false; }
      this.announce(`Moved ${meters} m ${{ n: 'north', s: 'south', e: 'east', w: 'west' }[dir]}`);
    },
    // Same as tapping an empty spot, but at the centre of the visible map.
    async addAtCenter() {
      if (this.lockedNow('add a point') || !this.map) return;
      const c = this.map.getCenter();
      const id = await this.createNode(c.lat, c.lng);
      if (id === null) return;
      if (this.selectedId !== null) await this.connect(this.selectedId, id);
      this.select(id);
      this.announce('Point added at the centre of the map');
    },
    // Same as tapping a second point while one is selected.
    async connectSelectedTo(otherId) {
      if (!otherId || this.selectedId === null) return;
      await this.connect(this.selectedId, otherId);
      this.announce('Points connected');
    },
    announce(msg) { this.liveMsg = ''; this.$nextTick(() => { this.liveMsg = msg; }); },

    // ---- adding points from where you're standing ----

    // The existing point closest to here, if it's within SNAP_METERS (never `exceptId`).
    nearestNode(lat, lng, exceptId) {
      let best = null, bestD = SNAP_METERS;
      this.nodes.forEach((n) => {
        if (exceptId !== null && exceptId !== undefined && String(n.id) === String(exceptId)) return;
        const d = metersBetween({ lat, lng }, n);
        if (d <= bestD) { best = n; bestD = d; }
      });
      return best;
    },
    // A spot to build the path on: the existing point you're standing at, or a new one.
    async placePoint(lat, lng, exceptId) {
      const near = this.nearestNode(lat, lng, exceptId);
      if (near) return { id: near.id, lat: near.lat, lng: near.lng, snapped: true };
      const id = await this.createNode(lat, lng);
      return { id, lat, lng, snapped: false };
    },

    // One point at the phone's GPS position. Works with no signal (GPS doesn't need
    // one). If you're within a few meters of an existing point, that one is used
    // (so junctions aren't duplicated). If a point is selected, the spot is joined to
    // it and becomes the selected one, so tapping once per corner while walking
    // builds a connected path.
    dropHere() {
      if (this.lockedNow('drop a point')) return;
      if (!navigator.geolocation) { this.gpsNote = 'This browser has no location support.'; return; }
      this.locating = true;
      this.gpsNote = 'Getting your location…';
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude, acc = Math.round(pos.coords.accuracy);
        const prev = this.selectedId;
        const prevNode = this.selected;
        if (prevNode && metersBetween(prevNode, { lat, lng }) < MIN_STEP) {
          this.gpsNote = 'You are still at the selected point. Walk to the next corner first.';
          this.locating = false;
          return;
        }
        const p = await this.placePoint(lat, lng, prev);
        if (p.id !== null) {
          if (prev !== null && String(prev) !== String(p.id)) await this.connect(prev, p.id);
          this.select(p.id);
          this.map.setView([p.lat, p.lng], Math.max(this.map.getZoom(), 19));
        }
        this.gpsNote = (p.snapped ? 'Joined the existing point you are standing at. ' : 'Dropped at your location. ') +
          (acc > POOR_GPS_METERS ? `GPS is only accurate to ±${acc} m: wait for a better fix and drag the point if it looks off.` : `(±${acc} m)`);
        this.locating = false;
      }, (err) => {
        this.gpsNote = 'Could not get your location: ' + err.message;
        this.locating = false;
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    },

    // Records the spot where the admin is standing as a single point. Unlike dropHere it
    // never connects to the selected point, so it can be used for a standalone location
    // (a gate, an entrance, a sign). Joins an existing point if one is within a few meters.
    captureLocation() {
      if (this.lockedNow('capture your location')) return;
      if (!navigator.geolocation) { this.gpsNote = 'This browser has no location support.'; return; }
      this.locating = true;
      this.gpsNote = 'Capturing your location…';
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const lat = pos.coords.latitude, lng = pos.coords.longitude, acc = Math.round(pos.coords.accuracy);
        const p = await this.placePoint(lat, lng, null);
        if (p.id !== null) {
          this.select(p.id);
          this.map.setView([p.lat, p.lng], Math.max(this.map.getZoom(), 19));
        }
        this.gpsNote = (p.snapped ? 'Selected the existing point you are standing at. ' : 'Captured your location. ') +
          `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)} ` +
          (acc > POOR_GPS_METERS ? `GPS is only accurate to ±${acc} m: wait for a better fix and drag the point if it looks off.` : `(±${acc} m)`);
        this.locating = false;
      }, (err) => {
        this.gpsNote = 'Could not get your location: ' + err.message;
        this.locating = false;
      }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    },

    // ---- record my walk ----
    // Walk the path with the phone; points are added for you. Only the corners (and one
    // point every 30 m on a long straight) are kept, not every GPS reading, so a walk
    // becomes a handful of points. A corner is found the usual way for tracing a
    // polyline: keep the readings since the last point, and when any of them lies more
    // than WALK_TOLERANCE meters off the straight line to the newest reading, the one
    // furthest off is the bend. Start from a selected point to branch off it, or from
    // anywhere (joins an existing point within a few meters). Works offline.
    toggleWalk() { return this.recording ? this.stopWalk() : this.startWalk(); },
    async startWalk() {
      if (this.lockedNow('record a walk')) return;
      if (!navigator.geolocation) { this.walkNote = 'This browser has no location support.'; return; }
      const start = this.selected ? { id: this.selected.id, lat: this.selected.lat, lng: this.selected.lng } : null;
      this.recording = true;
      this.recordedCount = 0;
      this.walkNote = 'Waiting for a GPS fix…';
      this._walk = { last: start, window: [], latest: null, chain: Promise.resolve(), watchId: null, wake: null };
      try {
        if (navigator.wakeLock) this._walk.wake = await navigator.wakeLock.request('screen'); // keep the screen on while walking
      } catch (e) { /* optional */ }
      this._walk.watchId = navigator.geolocation.watchPosition((pos) => {
        const w = this._walk;
        if (!w) return;
        const { latitude, longitude, accuracy } = pos.coords;
        // Fixes are handled one at a time, in order, so slow saves can't overlap.
        w.chain = w.chain.then(() => this.onWalkFix(latitude, longitude, Math.round(accuracy))).catch(() => {});
      }, (err) => {
        this.walkNote = 'Location problem: ' + err.message;
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    },
    async onWalkFix(lat, lng, acc) {
      const w = this._walk;
      if (!w || !this.recording) return;
      if (acc > WALK_MAX_ACCURACY) { this.walkNote = `Waiting for a better GPS signal (±${acc} m)…`; return; }
      this.walkNote = `Recording · ${this.recordedCount} point${this.recordedCount === 1 ? '' : 's'} · GPS ±${acc} m`;
      w.latest = { lat, lng };
      this.map.panTo([lat, lng], { animate: true });

      if (!w.last) {                                  // first fix: this is where the path starts
        const p = await this.placePoint(lat, lng, null);
        if (p.id !== null) { w.last = p; if (!p.snapped) this.recordedCount++; this.select(p.id); }
        return;
      }
      const fix = { lat, lng };
      if (!w.window.length && metersBetween(w.last, fix) < MIN_STEP) return; // standing still / GPS noise
      w.window.push(fix);

      // Any reading in the window straying from the straight line to the newest one is a corner.
      // Re-check after adding one, since the readings after it may hold another bend.
      for (let guard = 0; guard < 8; guard++) {
        let worst = -1, worstDist = WALK_TOLERANCE;
        for (let i = 0; i < w.window.length - 1; i++) {
          const dist = distToSegment(w.window[i], w.last, fix);
          if (dist > worstDist) { worst = i; worstDist = dist; }
        }
        if (worst < 0) break;
        const corner = w.window[worst];
        w.window = w.window.slice(worst + 1);
        await this.addWalkPoint(corner);
      }
      // A long straight still gets a point now and then.
      if (metersBetween(w.last, fix) >= MAX_LEG) {
        w.window = [];
        await this.addWalkPoint(fix);
      }
    },
    async addWalkPoint(at) {
      const w = this._walk;
      const p = await this.placePoint(at.lat, at.lng, w.last ? w.last.id : null);
      if (p.id === null) return;
      if (!w.last || String(p.id) !== String(w.last.id)) {
        if (w.last) await this.connect(w.last.id, p.id);
        if (!p.snapped) this.recordedCount++;
      }
      w.last = p;
      this.select(p.id);
    },
    async stopWalk() {
      const w = this._walk;
      if (!w) { this.recording = false; return; }
      if (w.watchId !== null) navigator.geolocation.clearWatch(w.watchId);
      await w.chain;                                  // let any point that is mid-save finish
      // Close the walk where you are standing now.
      const end = w.latest;
      if (end && w.last && metersBetween(w.last, end) >= MIN_STEP) await this.addWalkPoint(end);
      const n = this.recordedCount;
      this.releaseWalk();
      this.walkNote = n ? `Saved ${n} point${n === 1 ? '' : 's'}. Drag any that look off, or record another stretch.` : 'Nothing recorded. Walk a few meters first.';
    },
    releaseWalk() {
      const w = this._walk;
      if (w) {
        if (w.watchId !== null) navigator.geolocation.clearWatch(w.watchId);
        if (w.wake) w.wake.release().catch(() => {});
      }
      this._walk = null;
      this.recording = false;
    }
  }
}).mount('#app');
