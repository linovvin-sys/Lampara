const { createApp, markRaw } = Vue;
const API = 'campus-graph.php';
const LABEL_MIN_ZOOM = 18; // building names are always-on from this zoom in
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
      undo: null,            // what the last delete removed: { label, snapshot }, for the Undo button
      locked: EditorLock.get('campus-paths'),
      lockIcon: EditorLock.icon,
      nameDraft: '',
      nameError: '',
      // The ONE AR anchor for the whole outdoor campus graph (not per
      // building, not per node) — scanned once to fix the outdoor AR
      // guide's real starting position instead of trusting GPS alone.
      campusAnchor: null,
      qrBusy: false,
      headingDraft: '',
      pickingDirection: false, // next map tap = where the sign is (sets the anchor's direction)
      showingCampusQr: false
    };
  },
  watch: {
    // The Name field follows whichever point is selected.
    selectedId() {
      const n = this.selected;
      this.nameDraft = n ? this.labelOf(n) : '';
      this.nameError = '';
    },
    // Draws the actual QR image once the print dialog's canvas exists.
    async showingCampusQr(open) {
      if (!open || !this.campusAnchor) return;
      await this.$nextTick();
      const el = this.$refs.qrCanvas;
      if (!el || typeof QRCode === 'undefined') return;
      el.innerHTML = '';
      new QRCode(el, { text: this.qrUrlFor(this.campusAnchor.code), width: 180, height: 180 });
    }
  },
  computed: {
    selected() { return this.nodes.find((n) => String(n.id) === String(this.selectedId)) || null; },
    entranceBuildingId() {
      const b = this.buildings.find((x) => this.selectedId !== null && String(x.entrance_node_id) === String(this.selectedId));
      return b ? b.id : '';
    },
    // Name of every point (its own, or "Point X" in creation order for older unnamed ones).
    nodeNames() { return PointNames.map(this.nodes); },
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
    this.loadCampusAnchor();
    AdminOffline.onSynced(async () => { await this.loadAll(); });
    window.addEventListener('pagehide', () => { if (this.recording) this.releaseWalk(); });
    AdminOffline.onChange(() => { this.rebuild(); });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.showingCampusQr) this.showingCampusQr = false;
    });
  },
  methods: {
    async loadCampusAnchor() {
      try {
        const res = await fetch('../../../Backend/api/qr-anchors.php?campus=1');
        const data = await res.json();
        this.campusAnchor = (data.success && data.anchors.length) ? data.anchors[0] : null;
        this.headingDraft = this.campusAnchor && this.campusAnchor.scan_heading != null ? String(this.campusAnchor.scan_heading) : '';
      } catch (e) { /* editor still works without QR state */ }
    },
    qrUrlFor(code) {
      return new URL('../Public/guide-ar.php?qr=' + code, window.location.href).href;
    },
    async setCampusQr() {
      if (this.selectedId === null) return;
      if (!(await AdminOffline.guardOnline('Generating the campus AR anchor QR'))) return;
      const label = this.labelOf(this.selected);
      this.qrBusy = true;
      try {
        const res = await fetch('../../../Backend/api/qr-anchors.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ campus_node_id: this.selectedId, label })
        });
        const data = await res.json();
        if (!data.success) { AdminOffline.toast(data.error || 'Could not create the QR code', 'error'); return; }
        this.campusAnchor = { id: data.id, campus_node_id: this.selectedId, code: data.code, label: data.label, scan_heading: null };
        this.headingDraft = '';
        this.showingCampusQr = true;
      } finally {
        this.qrBusy = false;
      }
    },
    // The direction a person faces while scanning the sign, standing at the anchor point.
    // Easiest to set from the map: select the point the sign is at / straight ahead of it and the
    // bearing is worked out from the two positions (no compass involved).
    async saveHeading(value) {
      if (!this.campusAnchor) return;
      if (!(await AdminOffline.guardOnline('Saving the anchor direction'))) return;
      const res = await fetch('../../../Backend/api/qr-anchors.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anchor_id: this.campusAnchor.id, scan_heading: value })
      });
      const data = await res.json();
      if (!data.success) { AdminOffline.toast(data.error || 'Could not save the direction', 'error'); return; }
      this.campusAnchor = { ...this.campusAnchor, scan_heading: data.scan_heading };
      this.headingDraft = data.scan_heading != null ? String(data.scan_heading) : '';
      AdminOffline.toast('Anchor direction saved', 'success');
    },
    headingFromSelected() {
      const to = this.selected;
      if (to) this.headingToward(to.lat, to.lng);
    },
    // One-tap setup: press "Set direction", then tap where the sign is on the map. The
    // bearing from the anchor point to that spot is saved; no point is added.
    startPickDirection() {
      this.select(null);
      this.pickingDirection = true;
    },
    headingToward(lat, lng) {
      const from = this.nodes.find((n) => String(n.id) === String(this.campusAnchor && this.campusAnchor.campus_node_id));
      if (!from) { AdminOffline.toast('The anchor point is missing from the map', 'error'); return; }
      if (Math.abs(lat - from.lat) < 1e-6 && Math.abs(lng - from.lng) < 1e-6) { AdminOffline.toast('Tap the sign, not the anchor point itself', 'error'); return; }
      const p1 = from.lat * Math.PI / 180, p2 = lat * Math.PI / 180, dl = (lng - from.lng) * Math.PI / 180;
      const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
      this.saveHeading(Math.round(((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360));
    },
    saveHeadingDraft() {
      const v = parseFloat(this.headingDraft);
      if (isNaN(v)) { this.saveHeading(null); return; }
      this.saveHeading(v);
    },
    showCampusQr() {
      if (this.campusAnchor) this.showingCampusQr = true;
    },
    async removeCampusQr() {
      if (!this.campusAnchor) return;
      const result = await Swal.fire({
        title: 'Remove the campus AR anchor?',
        text: 'The printed sign will stop working, and the outdoor AR guide will fall back to GPS-only starting position.',
        icon: 'warning', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#dc2626'
      });
      if (!result.isConfirmed) return;
      await fetch('../../../Backend/api/qr-anchors.php?id=' + this.campusAnchor.id, { method: 'DELETE' });
      this.campusAnchor = null;
      this.showingCampusQr = false;
    },
    initMap() {
      // Amafel Building as a sane default center before real data loads.
      const map = L.map(this.$refs.mapArea).setView([14.3283, 120.9372], 18);
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 21, maxNativeZoom: 19
      });
      // Satellite is the useful one here — walkways are visible on it.
      const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri',
        maxZoom: 21, maxNativeZoom: 19
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

    // ---- drawing ----
    redraw() {
      this.layer.clearLayers();
      const byId = new Map(this.nodes.map((n) => [String(n.id), n]));

      this.edges.forEach((e) => {
        const a = byId.get(String(e.node_a_id)), b = byId.get(String(e.node_b_id));
        if (!a || !b) return;
        const line = L.polyline([[a.lat, a.lng], [b.lat, b.lng]], {
          color: '#22c55e', weight: 5, opacity: 0.9, dashArray: e._pending ? '2 8' : null,
          interactive: !this.locked     // a locked map ignores taps on connections
        });
        line.on('click', (ev) => { L.DomEvent.stopPropagation(ev); this.deleteEdge(e); });
        line.addTo(this.layer);
      });

      // Building pin, plus a dashed leader to its entrance point so a missing
      // or wrong link is visible at a glance.
      const showLabels = this.map.getZoom() >= LABEL_MIN_ZOOM;
      this.buildings.forEach((b) => {
        const icon = L.divIcon({ className: '', html: '<div class="cp-building"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
        L.marker([b.lat, b.lng], { icon, interactive: true, zIndexOffset: -500 })
          .bindTooltip(b.name, { permanent: showLabels, direction: 'top', offset: [0, -8], className: 'cp-label' })
          .addTo(this.layer);
        const ent = b.entrance_node_id !== null && b.entrance_node_id !== undefined ? byId.get(String(b.entrance_node_id)) : null;
        if (ent) L.polyline([[b.lat, b.lng], [ent.lat, ent.lng]], { color: '#7c3aed', weight: 2, dashArray: '4 6' }).addTo(this.layer);
      });

      this.nodes.forEach((n) => {
        const cls = ['cp-node', n.node_type, String(n.id) === String(this.selectedId) ? 'is-selected' : '', n._pending ? 'is-pending' : ''].join(' ');
        const icon = L.divIcon({ className: '', html: `<div class="${cls}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] });
        const m = L.marker([n.lat, n.lng], { icon, draggable: !this.locked, zIndexOffset: 500 });
        // The point's letter, so the map matches the list beside it.
        m.bindTooltip(PointNames.short(this.nodeNames.get(String(n.id))), { permanent: true, direction: 'right', offset: [9, 0], className: 'cp-pt-label' });
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
      const r = await Swal.fire({ title: 'Remove this connection?', icon: 'question', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#dc2626' });
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
        showCancelButton: true, confirmButtonText: 'Remove all', confirmButtonColor: '#dc2626'
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
      if (this.pickingDirection) { this.pickingDirection = false; this.headingToward(node.lat, node.lng); return; }
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
      if (this.pickingDirection) { this.pickingDirection = false; this.headingToward(lat, lng); return; }
      // Tapping empty map while a point is selected just deselects (so a stray
      // tap doesn't drop an unwanted point) — tap again to actually add one.
      if (this.selectedId !== null) { this.select(null); return; }
      if (this.locked) return;            // a locked map never adds points from a tap
      const id = await this.createNode(lat, lng);
      if (id !== null) this.select(id);
    },

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
