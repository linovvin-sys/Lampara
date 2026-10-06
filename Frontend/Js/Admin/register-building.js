const { createApp } = Vue;

// Two buildings this close together will fall inside the same wide compass
// cone (guide.php uses up to ±70°) for most of the distance a visitor
// approaches from, risking the Critical misidentification gap.
const NEARBY_WARN_METERS = 40;

function ordinalFloor(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return (s[(v - 20) % 10] || s[v] || s[0]);
}

function haversineMeters(a, b) {
  const R = 6371000;
  const toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

createApp({
  data() {
    return {
      form: { name: '', lat: '', lng: '', floor_count: 1, building_number: null, directory: '' },
      baseBuildings: [],   // last data from the server
      buildings: [],       // server data + changes made offline (shown on the page)
      submitting: false,
      geoStatus: '',
      geoError: false,
      editingId: null,
      // Keyed by floor label ("2nd Floor") -> { id, image_path } once loaded,
      // or absent entirely if that floor has no plan uploaded yet.
      floorPlans: {},
      uploadingFloor: null,
      // Walkable-path graph editor — open for at most one floor at a time.
      pathEditorFloor: null,
      pathNodes: [],
      pathEdges: [],
      selectedNodeId: null,
      // Cross-floor connections (stairs/elevator links) for whichever node
      // is currently selected, and the floor+node picker for creating a new
      // one — both invisible on a single floor's own canvas, see loadCrossLinks.
      crossLinks: [],
      crossFloorOptions: null,
      // Lock: while on, the path editor ignores taps that would add, connect or delete points.
      pathLocked: EditorLock.get('plan-paths'),
      lockIcon: EditorLock.icon,
      pathNameDraft: '',
      pathNameError: '',
      pathUndo: null          // what the last delete removed: { label, snapshot }, for the Undo button
    };
  },
  computed: {
    // Floor plans only make sense for a building that already exists (needs
    // a real building_id to attach to) — this only renders once you're
    // editing, never while filling out a brand-new building.
    floorList() {
      const count = this.form.floor_count || 0;
      return Array.from({ length: count }, (_, i) => `${i + 1}${ordinalFloor(i + 1)} Floor`);
    },
    // A building made offline has no server copy yet, so floor plans and paths
    // (which need one) can't be managed until it has synced.
    editingIsLocalOnly() {
      return this.editingId !== null && AdminOffline.isTemp(this.editingId);
    },
    // "Point A", "Point B" ... for the points of the floor being edited (older unnamed ones are numbered in creation order).
    pathNames() { return PointNames.map(this.pathNodes); },
    // The list beside the plan: one row per point, in name order.
    pathPointList() {
      const names = this.pathNames;
      const label = (id) => names.get(String(id)) || '';
      return this.pathNodes.map((n) => {
        const links = this.pathEdges
          .filter((e) => e.node_a_id === n.id || e.node_b_id === n.id)
          .map((e) => label(e.node_a_id === n.id ? e.node_b_id : e.node_a_id))
          .sort(PointNames.compare);
        return { id: n.id, name: label(n.id), short: PointNames.short(label(n.id)), links };
      }).sort((a, b) => PointNames.compare(a.name, b.name));
    },
    nearbyWarnings() {
      const lat = parseFloat(this.form.lat), lng = parseFloat(this.form.lng);
      if (!isFinite(lat) || !isFinite(lng)) return [];
      const here = { lat, lng };
      return this.buildings
        .filter(b => b.id !== this.editingId)
        .map(b => ({ id: b.id, name: b.name, distance: Math.round(haversineMeters(here, { lat: parseFloat(b.lat), lng: parseFloat(b.lng) })) }))
        .filter(b => b.distance <= NEARBY_WARN_METERS)
        .sort((a, b) => a.distance - b.distance);
    }
  },
  watch: {
    // The Name field follows whichever point is selected.
    selectedNodeId(id) {
      this.pathNameDraft = id === null ? '' : (this.pathNames.get(String(id)) || '');
      this.pathNameError = '';
    }
  },
  async mounted() {
    AdminOffline.onSynced(() => this.loadBuildings());
    AdminOffline.onChange(() => { this.buildings = AdminOffline.overlayBuildings(this.baseBuildings); });
    await this.loadBuildings();
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (editId) {
      const b = this.buildings.find(x => String(x.id) === editId);
      if (b) this.startEdit(b);
    }
  },
  methods: {
    captureLocation() {
      if (!navigator.geolocation) {
        this.geoStatus = 'Geolocation not supported by this browser.';
        this.geoError = true;
        return;
      }
      this.geoStatus = 'Requesting your location...';
      this.geoError = false;
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          this.form.lat = pos.coords.latitude.toFixed(6);
          this.form.lng = pos.coords.longitude.toFixed(6);
          this.geoStatus = `Captured (±${Math.round(pos.coords.accuracy)}m accuracy)`;
          this.geoError = false;
        },
        (err) => { this.geoStatus = 'Location denied or unavailable: ' + err.message; this.geoError = true; },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    },
    async loadBuildings() {
      try {
        const res = await fetch('../../../Backend/api/buildings.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.baseBuildings = data.buildings;
      } catch (e) { /* offline with no saved copy — start from whatever is pending */ }
      this.buildings = AdminOffline.overlayBuildings(this.baseBuildings);
    },
    startEdit(b) {
      this.editingId = b.id;
      this.form = { name: b.name, lat: String(b.lat), lng: String(b.lng), floor_count: b.floor_count || 1, building_number: b.building_number, directory: b.directory || '' };
      this.geoStatus = '';
      if (!AdminOffline.isTemp(b.id)) this.loadFloorPlans(b.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    cancelEdit() {
      this.editingId = null;
      this.form = { name: '', lat: '', lng: '', floor_count: 1, building_number: null, directory: '' };
      this.geoStatus = '';
      this.floorPlans = {};
      this.closePathEditor();
    },
    async loadFloorPlans(buildingId) {
      try {
        const res = await fetch('../../../Backend/api/floor-plans.php?building_id=' + buildingId, { credentials: 'same-origin' });
        const data = await res.json();
        if (!data.success) return;
        const byFloor = {};
        data.plans.forEach((p) => { byFloor[p.floor] = p; });
        this.floorPlans = byFloor;
      } catch (e) { this.floorPlans = {}; } // offline and never opened: floor plans unavailable
    },
    // ---- lock ----
    toggleLock() {
      this.pathLocked = !this.pathLocked;
      EditorLock.set('plan-paths', this.pathLocked);
    },
    // Call first in anything that would change the paths. True (after telling the admin) when locked.
    pathLockedNow(what) {
      if (!this.pathLocked) return false;
      AdminOffline.toast(`The path editor is locked. Unlock it to ${what}.`, 'info');
      return true;
    },
    pointLabel(node) { return this.pathNames.get(String(node.id)) || ''; },
    pointShort(node) { return PointNames.short(this.pointLabel(node)); },
    // Tapping a row in the list selects that point (it never connects anything).
    selectFromList(id) {
      this.selectedNodeId = id;
      this.loadCrossLinks();
    },
    async renamePathNode() {
      if (this.selectedNodeId === null || this.pathLockedNow('rename points')) return;
      if (await this.needsInternet('Renaming a point')) return;
      const id = this.selectedNodeId;
      const name = PointNames.clean(this.pathNameDraft);
      if (!name) { this.pathNameError = 'A point needs a name.'; return; }
      if (name === this.pathNames.get(String(id))) { this.pathNameError = ''; return; }
      if (!PointNames.isFree(name, this.pathNodes, this.pathNames, id)) { this.pathNameError = `Another point on this floor is already named "${name}".`; return; }
      this.pathNameError = '';
      const res = await fetch('../../../Backend/api/floor-plan-graph.php?node_id=' + id, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!data.success) { this.pathNameError = data.error || 'Could not rename that point.'; return; }
      const node = this.pathNodes.find((n) => n.id === id);
      if (node) node.name = name;
      this.pathNameDraft = name;
    },

    // Floor plans, paths and deletes need the live server. One place to say so.
    async needsInternet(what) {
      return !(await AdminOffline.guardOnline(what));
    },
    // Reads the picked file as a base64 data URL — same pattern signage
    // scanning already uses to send a photo to the backend, no separate
    // multipart file-upload handling needed anywhere in this app.
    uploadFloorPlan(floor, event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = ''; // lets picking the same file again re-trigger change
      if (!file) return;
      if (!AdminOffline.reachable()) { AdminOffline.guardOnline('Uploading a floor plan'); return; }
      this.uploadingFloor = floor;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch('../../../Backend/api/floor-plans.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ building_id: this.editingId, floor, image: reader.result })
          });
          const data = await res.json();
          if (data.success) {
            this.floorPlans = { ...this.floorPlans, [floor]: { id: data.id, image_path: data.image_path } };
          } else {
            Swal.fire({ icon: 'error', title: 'Upload failed', text: data.error || 'unknown' });
          }
        } finally {
          this.uploadingFloor = null;
        }
      };
      reader.readAsDataURL(file);
    },
    async openPathEditor(floor) {
      const plan = this.floorPlans[floor];
      if (!plan || !plan.id) return;
      if (await this.needsInternet('Editing walkable paths')) return;
      this.pathEditorFloor = floor;
      this.selectedNodeId = null;
      this.crossLinks = [];
      this.crossFloorOptions = null;
      const res = await fetch('../../../Backend/api/floor-plan-graph.php?floor_plan_id=' + plan.id);
      const data = await res.json();
      this.pathNodes = data.success ? data.nodes : [];
      this.pathEdges = data.success ? data.edges : [];
    },
    closePathEditor() {
      this.pathUndo = null;
      this.pathEditorFloor = null;
      this.pathNodes = [];
      this.pathEdges = [];
      this.selectedNodeId = null;
      this.crossLinks = [];
      this.crossFloorOptions = null;
    },
    // Clicking empty canvas drops a new junction point; clicking an existing
    // node instead selects it (see selectNode) — this handler only fires
    // when the click didn't already land on a node, via @click.self.
    async addPathNode(event) {
      if (this.pathLockedNow('add points')) return;
      if (await this.needsInternet('Editing walkable paths')) return;
      const plan = this.floorPlans[this.pathEditorFloor];
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10;
      const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10;
      const res = await fetch('../../../Backend/api/floor-plan-graph.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floor_plan_id: plan.id, x, y, name: PointNames.next([...this.pathNames.values()]) })
      });
      const data = await res.json();
      if (data.success) this.pathNodes.push({ id: data.id, x, y, name: data.name });
    },
    // First click on a node selects it; clicking a SECOND, different node
    // while one is already selected connects the two with an edge instead
    // of selecting it — this is how a corridor gets traced, click by click.
    async selectNode(node) {
      if (this._justDragged) return;
      if (this.pathLocked) {              // locked: tapping a point only selects it, never connects
        this.selectedNodeId = this.selectedNodeId === node.id ? null : node.id;
        if (this.selectedNodeId !== null) this.loadCrossLinks(); else this.crossLinks = [];
        return;
      }
      if (this.selectedNodeId === null) {
        this.selectedNodeId = node.id;
        this.loadCrossLinks();
        return;
      }
      if (this.selectedNodeId === node.id) {
        this.selectedNodeId = null;
        this.crossLinks = [];
        return;
      }
      if (await this.needsInternet('Editing walkable paths')) return;
      const nodeA = this.selectedNodeId;
      const nodeB = node.id;
      this.selectedNodeId = null;
      this.crossLinks = [];
      const res = await fetch('../../../Backend/api/floor-plan-graph.php?action=edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_a_id: nodeA, node_b_id: nodeB })
      });
      const data = await res.json();
      if (data.success && !this.pathEdges.some((e) => (e.node_a_id === nodeA && e.node_b_id === nodeB) || (e.node_a_id === nodeB && e.node_b_id === nodeA))) {
        this.pathEdges.push({ id: data.id, node_a_id: Math.min(nodeA, nodeB), node_b_id: Math.max(nodeA, nodeB) });
        // Undo for a new connection removes it again.
        if (data.id) this.pathUndo = { label: `Connected ${this.pathNames.get(String(nodeA)) || 'a point'} to ${this.pathNames.get(String(nodeB)) || 'a point'}`, edgeId: data.id };
      }
    },
    // Drag a dot to move it. Pointer events cover mouse, touch and pen; a press that barely moves
    // is still a plain tap (select / connect), so tracing a corridor works as before.
    startDrag(node, e) {
      if (this.pathLocked || (e.pointerType === 'mouse' && e.button !== 0)) return;
      const el = e.currentTarget;
      const canvas = el.parentElement.getBoundingClientRect();
      const from = { x: e.clientX, y: e.clientY }, was = { x: node.x, y: node.y };
      let moved = false;
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* older browsers: window listeners still work */ }
      const move = (ev) => {
        if (!moved && Math.hypot(ev.clientX - from.x, ev.clientY - from.y) < 5) return;
        moved = true;
        node.x = Math.max(0, Math.min(100, (ev.clientX - canvas.left) / canvas.width * 100));
        node.y = Math.max(0, Math.min(100, (ev.clientY - canvas.top) / canvas.height * 100));
      };
      const up = async () => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerup', up);
        el.removeEventListener('pointercancel', up);
        if (!moved) return;
        this._justDragged = true;                 // swallow the click that follows a drag
        setTimeout(() => { this._justDragged = false; }, 0);
        if (!AdminOffline.reachable()) {
          node.x = was.x; node.y = was.y;
          AdminOffline.guardOnline('Moving a point');
          return;
        }
        try {
          const res = await fetch('../../../Backend/api/floor-plan-graph.php?node_id=' + node.id, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: node.x, y: node.y })
          });
          const data = await res.json();
          if (!data.success) throw new Error(data.error || 'Could not move that point');
        } catch (err) {
          node.x = was.x; node.y = was.y;         // put it back where the server still has it
          AdminOffline.toast(err.message || 'Could not move that point', 'error');
        }
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
    },
    async deleteSelectedNode() {
      if (this.selectedNodeId === null || this.pathLockedNow('delete a point')) return;
      if (await this.needsInternet('Editing walkable paths')) return;
      const id = this.selectedNodeId;
      const name = this.pathNames.get(String(id)) || 'point';
      this.selectedNodeId = null;
      this.crossLinks = [];
      const res = await fetch('../../../Backend/api/floor-plan-graph.php?node_id=' + id, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (data.snapshot) this.pathUndo = { label: `Deleted ${name}`, snapshot: data.snapshot };
      this.pathNodes = this.pathNodes.filter((n) => n.id !== id);
      this.pathEdges = this.pathEdges.filter((e) => e.node_a_id !== id && e.node_b_id !== id);
    },
    // Wipes every point on this floor (and so its connections, including stairs links) after a confirmation.
    async removeAllPathNodes() {
      if (this.pathLockedNow('remove all points') || !this.pathNodes.length) return;
      if (await this.needsInternet('Removing all points')) return;
      const plan = this.floorPlans[this.pathEditorFloor];
      const count = this.pathNodes.length;
      const r = await Swal.fire({
        icon: 'warning', title: `Remove all ${count} points on ${this.pathEditorFloor}?`,
        text: 'Every connection is removed too, including stairs links to other floors, and rooms lose their entry point. You can undo it right afterwards.',
        showCancelButton: true, confirmButtonText: 'Remove all', confirmButtonColor: '#dc2626'
      });
      if (!r.isConfirmed) return;
      const res = await fetch('../../../Backend/api/floor-plan-graph.php?floor_plan_id=' + plan.id + '&all=1', { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!data.success) { Swal.fire({ icon: 'error', title: 'Could not remove the points', text: data.error || '' }); return; }
      this.pathUndo = { label: `Removed all ${data.removed} points on ${this.pathEditorFloor}`, snapshot: data.snapshot };
      this.selectedNodeId = null;
      this.crossLinks = [];
      this.pathNodes = [];
      this.pathEdges = [];
    },
    // Puts the last delete back: same points, names, connections and room entry points.
    async undoPathDelete() {
      if (!this.pathUndo) return;
      if (await this.needsInternet('Undo')) return;
      const res = this.pathUndo.edgeId
        ? await fetch('../../../Backend/api/floor-plan-graph.php?edge_id=' + this.pathUndo.edgeId, { method: 'DELETE' })   // undo a new connection
        : await fetch('../../../Backend/api/floor-plan-graph.php?action=restore', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.pathUndo.snapshot)
          });
      const data = await res.json().catch(() => ({}));
      if (!data.success) { Swal.fire({ icon: 'error', title: 'Could not undo', text: data.error || '' }); return; }
      this.pathUndo = null;
      const plan = this.floorPlans[this.pathEditorFloor];
      const g = await (await fetch('../../../Backend/api/floor-plan-graph.php?floor_plan_id=' + plan.id)).json();
      this.pathNodes = g.success ? g.nodes : [];
      this.pathEdges = g.success ? g.edges : [];
      await this.loadCrossLinks();
    },
    async fetchBuildingGraph() {
      const res = await fetch('../../../Backend/api/floor-plan-graph.php?building_id=' + this.editingId);
      const data = await res.json();
      return data.success ? data : { nodes: [], edges: [] };
    },
    // A cross-floor connection is invisible on this floor's own canvas (its
    // other end lives on a different image entirely) — this is the only way
    // an admin can see/manage one: fetch the whole building's graph and pick
    // out edges from the selected node to a node on a DIFFERENT floor plan.
    async loadCrossLinks() {
      this.crossLinks = [];
      if (this.selectedNodeId === null) return;
      const currentPlanId = this.floorPlans[this.pathEditorFloor].id;
      const graph = await this.fetchBuildingGraph();
      const byId = new Map(graph.nodes.map((n) => [n.id, n]));
      this.crossLinks = graph.edges
        .filter((e) => e.node_a_id === this.selectedNodeId || e.node_b_id === this.selectedNodeId)
        .map((e) => {
          const otherId = e.node_a_id === this.selectedNodeId ? e.node_b_id : e.node_a_id;
          const other = byId.get(otherId);
          return (other && other.floor_plan_id !== currentPlanId) ? { edgeId: e.id, floor: other.floor, otherId } : null;
        })
        .filter(Boolean);
    },
    async openCrossFloorPicker() {
      const currentPlanId = this.floorPlans[this.pathEditorFloor].id;
      const graph = await this.fetchBuildingGraph();
      const byFloor = {};
      graph.nodes.forEach((n) => {
        if (n.floor_plan_id === currentPlanId) return; // only other floors are valid targets
        if (!byFloor[n.floor]) byFloor[n.floor] = [];
        byFloor[n.floor].push(n);
      });
      this.crossFloorOptions = byFloor;
    },
    closeCrossFloorPicker() {
      this.crossFloorOptions = null;
    },
    async linkAcrossFloors(otherNodeId) {
      if (this.pathLockedNow('link floors')) return;
      if (await this.needsInternet('Editing walkable paths')) return;
      const res = await fetch('../../../Backend/api/floor-plan-graph.php?action=edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_a_id: this.selectedNodeId, node_b_id: otherNodeId })
      });
      const made = await res.json().catch(() => ({}));
      if (made.success && made.id) this.pathUndo = { label: 'Linked to another floor', edgeId: made.id };
      this.crossFloorOptions = null;
      await this.loadCrossLinks();
    },
    async unlinkCrossFloor(link) {
      if (this.pathLockedNow('remove a floor link')) return;
      if (await this.needsInternet('Editing walkable paths')) return;
      await fetch('../../../Backend/api/floor-plan-graph.php?edge_id=' + link.edgeId, { method: 'DELETE' });
      this.pathUndo = { label: `Removed the link to ${link.floor}`, snapshot: { edges: [{ node_a_id: this.selectedNodeId, node_b_id: link.otherId }] } };
      await this.loadCrossLinks();
    },
    async deleteEdge(edge) {
      if (this.pathLockedNow('remove a connection')) return;
      if (await this.needsInternet('Editing walkable paths')) return;
      await fetch('../../../Backend/api/floor-plan-graph.php?edge_id=' + edge.id, { method: 'DELETE' });
      // Undo for a removed connection draws it again between the same two points.
      this.pathUndo = {
        label: `Removed the connection ${this.pathNames.get(String(edge.node_a_id)) || ''} – ${this.pathNames.get(String(edge.node_b_id)) || ''}`,
        snapshot: { edges: [{ node_a_id: edge.node_a_id, node_b_id: edge.node_b_id }] }
      };
      this.pathEdges = this.pathEdges.filter((e) => e.id !== edge.id);
    },
    async removeFloorPlan(floor) {
      const plan = this.floorPlans[floor];
      if (!plan || !plan.id) return;
      if (await this.needsInternet('Removing a floor plan')) return;
      const result = await Swal.fire({
        title: `Remove the ${floor} plan?`,
        text: 'Rooms on this floor will fall back to text-only directions.',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Remove',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280'
      });
      if (!result.isConfirmed) return;
      const res = await fetch('../../../Backend/api/floor-plans.php?id=' + plan.id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        const updated = { ...this.floorPlans };
        delete updated[floor];
        this.floorPlans = updated;
        // The plan's row is gone (cascades its nodes/edges on the DB side
        // too) — an open editor for this exact floor is now stale.
        if (this.pathEditorFloor === floor) this.closePathEditor();
      } else {
        Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
      }
    },
    // Saves to the server when it's reachable; otherwise keeps the change on this
    // device (AdminOffline) to be synced later with the admin's approval.
    async submitBuilding() {
      this.submitting = true;
      const fields = {
        name: this.form.name, lat: parseFloat(this.form.lat), lng: parseFloat(this.form.lng),
        floor_count: this.form.floor_count, building_number: this.form.building_number, directory: this.form.directory
      };
      const editing = this.editingId;
      const seen = editing ? this.baseBuildings.find((x) => String(x.id) === String(editing)) : null;
      const op = editing
        ? { type: 'building.update', payload: { id: editing, ...fields, base_updated_at: seen ? seen.updated_at : null }, label: `Edited building "${fields.name}"` }
        : { type: 'building.create', payload: { temp_id: AdminOffline.newTempId(), ...fields }, label: `New building "${fields.name}"` };
      try {
        const out = await AdminOffline.run(op, async () => {
          const path = editing ? 'buildings.php?id=' + editing : 'buildings.php';
          const data = await AdminOffline.fetchJson(path, { method: editing ? 'PUT' : 'POST', body: JSON.stringify(fields) });
          if (!data.success) throw new Error(data.error || 'unknown');
          return data;
        });
        this.cancelEdit();
        await this.loadBuildings();
        if (out.queued) AdminOffline.toast("Saved on this device. You'll be asked to sync when you're back online.", 'info');
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Error', text: e.message || 'unknown' });
      } finally {
        this.submitting = false;
      }
    },
    async deleteBuilding(b) {
      if (await this.needsInternet('Deleting a building')) return;
      const result = await Swal.fire({
        title: `Delete "${b.name}"?`,
        text: `This also deletes its ${b.room_count} registered room(s). This can't be undone.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280'
      });
      if (!result.isConfirmed) return;
      const res = await fetch('../../../Backend/api/buildings.php?id=' + b.id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadBuildings();
        if (this.editingId === b.id) this.cancelEdit();
      } else {
        Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
      }
    }
  }
}).mount('#app');
