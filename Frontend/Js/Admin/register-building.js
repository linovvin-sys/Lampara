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
      buildings: [],
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
      crossFloorOptions: null
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
  async mounted() {
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
      const res = await fetch('../../../Backend/api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;
    },
    startEdit(b) {
      this.editingId = b.id;
      this.form = { name: b.name, lat: String(b.lat), lng: String(b.lng), floor_count: b.floor_count || 1, building_number: b.building_number, directory: b.directory || '' };
      this.geoStatus = '';
      this.loadFloorPlans(b.id);
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
      const res = await fetch('../../../Backend/api/floor-plans.php?building_id=' + buildingId);
      const data = await res.json();
      if (!data.success) return;
      const byFloor = {};
      data.plans.forEach((p) => { byFloor[p.floor] = p; });
      this.floorPlans = byFloor;
    },
    // Reads the picked file as a base64 data URL — same pattern signage
    // scanning already uses to send a photo to the backend, no separate
    // multipart file-upload handling needed anywhere in this app.
    uploadFloorPlan(floor, event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = ''; // lets picking the same file again re-trigger change
      if (!file) return;
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
      const plan = this.floorPlans[this.pathEditorFloor];
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10;
      const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10;
      const res = await fetch('../../../Backend/api/floor-plan-graph.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floor_plan_id: plan.id, x, y })
      });
      const data = await res.json();
      if (data.success) this.pathNodes.push({ id: data.id, x, y });
    },
    // First click on a node selects it; clicking a SECOND, different node
    // while one is already selected connects the two with an edge instead
    // of selecting it — this is how a corridor gets traced, click by click.
    async selectNode(node) {
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
      }
    },
    async deleteSelectedNode() {
      if (this.selectedNodeId === null) return;
      const id = this.selectedNodeId;
      this.selectedNodeId = null;
      this.crossLinks = [];
      await fetch('../../../Backend/api/floor-plan-graph.php?node_id=' + id, { method: 'DELETE' });
      this.pathNodes = this.pathNodes.filter((n) => n.id !== id);
      this.pathEdges = this.pathEdges.filter((e) => e.node_a_id !== id && e.node_b_id !== id);
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
          return (other && other.floor_plan_id !== currentPlanId) ? { edgeId: e.id, floor: other.floor } : null;
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
      await fetch('../../../Backend/api/floor-plan-graph.php?action=edge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ node_a_id: this.selectedNodeId, node_b_id: otherNodeId })
      });
      this.crossFloorOptions = null;
      await this.loadCrossLinks();
    },
    async unlinkCrossFloor(edgeId) {
      await fetch('../../../Backend/api/floor-plan-graph.php?edge_id=' + edgeId, { method: 'DELETE' });
      await this.loadCrossLinks();
    },
    async deleteEdge(edge) {
      await fetch('../../../Backend/api/floor-plan-graph.php?edge_id=' + edge.id, { method: 'DELETE' });
      this.pathEdges = this.pathEdges.filter((e) => e.id !== edge.id);
    },
    async removeFloorPlan(floor) {
      const plan = this.floorPlans[floor];
      if (!plan || !plan.id) return;
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
    async submitBuilding() {
      this.submitting = true;
      const body = JSON.stringify({
        name: this.form.name, lat: parseFloat(this.form.lat), lng: parseFloat(this.form.lng),
        floor_count: this.form.floor_count, building_number: this.form.building_number, directory: this.form.directory
      });
      try {
        const url = this.editingId ? '../../../Backend/api/buildings.php?id=' + this.editingId : '../../../Backend/api/buildings.php';
        const method = this.editingId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body });
        const data = await res.json();
        if (data.success) {
          this.cancelEdit();
          await this.loadBuildings();
        } else {
          Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
        }
      } finally {
        this.submitting = false;
      }
    },
    async deleteBuilding(b) {
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
