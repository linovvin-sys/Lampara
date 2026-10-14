(function () {
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

window.LamparaBuildingApp = createApp({
  data() {
    return {
      snap: '',            // the form as last saved / loaded: anything different counts as an unsaved change
      loaded: false,       // first list of buildings has arrived (until then the side list shows a skeleton)
      form: { name: '', lat: '', lng: '', floor_count: 1, entrance_floor: '', is_open: false, building_number: null, directory: '' },
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
      pathLive: '',
      photoBusy: false,
      photoOver: false,
      health: null,           // /setup-health.php: per-building steps and the list of problems
      pathUndo: null,         // what the last delete removed: { label, snapshot }, for the Undo button
      // The ONE AR-anchor QR for the floor currently open in the path editor
      // (null if not set yet) — not per point. This is what the indoor AR
      // guide scans to fix its real starting position, see Backend/api/qr-anchors.php.
      floorQrAnchor: null,     // { id, floor_plan_node_id, code, label } or null
      qrBusy: false,
      showingFloorQr: false
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
    // The photo of the building being edited (from the saved list).
    photoUrl() {
      const b = this.buildings.find((x) => String(x.id) === String(this.editingId));
      return b && b.photo_path ? b.photo_path : '';
    },
    // The eight guided-setup steps for the building being edited.
    setup() {
      if (!this.health || this.editingId === null || this.editingIsLocalOnly) return null;
      return (this.health.buildings || []).find((b) => String(b.id) === String(this.editingId)) || null;
    },
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
    // What counts as the admin's edits (every field of the form).
    dirtyView() { return this.form; },
    dirty() { return JSON.stringify(this.dirtyView) !== this.snap; },
    hasPin() { return isFinite(parseFloat(this.form.lat)) && isFinite(parseFloat(this.form.lng)); },
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
    // Keep the pin on the map in step with the coordinates (typed, captured, loaded for editing or cleared).
    'form.lat'() { this.syncPin(); },
    'form.lng'() { this.syncPin(); },
    buildings() { this.drawOtherBuildings(); },
    // The Name field follows whichever point is selected.
    selectedNodeId(id) {
      this.pathNameDraft = id === null ? '' : (this.pathNames.get(String(id)) || '');
      this.pathNameError = '';
    },
    // Draws the actual QR image once the print dialog's canvas exists.
    async showingFloorQr(open) {
      if (!open || !this.floorQrAnchor) return;
      await this.$nextTick();
      const el = this.$refs.qrCanvas;
      if (!el || typeof QRCode === 'undefined') return;
      el.innerHTML = '';
      new QRCode(el, { text: this.qrUrlFor(this.floorQrAnchor.code), width: 180, height: 180 });
    }
  },
  async mounted() {
    this.markClean();
    // Closing or reloading the tab with unsaved edits asks first (the browser shows its own message).
    window.addEventListener('beforeunload', (e) => { if (this.dirty) { e.preventDefault(); e.returnValue = ''; } });
    this.$nextTick(() => this.initPickMap());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.showingFloorQr) this.showingFloorQr = false;
      this.onPathKey(e);
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && this.pathUndo) {
        const t = e.target; const tag = t && t.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
        e.preventDefault(); this.undoPathDelete();
      }
    });
    AdminOffline.onSynced(() => this.loadBuildings());
    this.loadHealth();
    AdminOffline.onChange(() => { this.buildings = AdminOffline.overlayBuildings(this.baseBuildings); });
    await this.loadBuildings();
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (editId) {
      const b = this.buildings.find(x => String(x.id) === editId);
      if (b) this.startEdit(b);
    }
  },
  methods: {
    // True when it is OK to throw away what is on the form (nothing changed, or the admin agreed).
    async confirmDiscard() {
      if (!this.dirty) return true;
      const r = await Swal.fire({
        icon: 'warning', title: 'Discard your changes?', text: 'You have unsaved changes on this form.',
        showCancelButton: true, confirmButtonText: 'Discard', cancelButtonText: 'Keep editing',
        confirmButtonColor: '#ff0000', cancelButtonColor: '#55556b', reverseButtons: true
      });
      return r.isConfirmed;
    },
    markClean() { this.snap = JSON.stringify(this.dirtyView); },
    async tryEdit(b) {
      if (this.editingId === b.id) return;
      if (!(await this.confirmDiscard())) return;
      this.startEdit(b);
    },
    async tryCancel() {
      if (!(await this.confirmDiscard())) return;
      this.cancelEdit();
    },
    // ---- pin-on-a-map picker ----
    initPickMap() {
      const el = this.$refs.pickMap;
      if (!el || this._pickMap || typeof L === 'undefined') return;
      const map = L.map(el, CampusBounds.mapOptions({ zoomControl: true })).setView(CampusBounds.CENTER, 18);
      TopoBase.add(map);   // the campus 2D topo export, not street or satellite tiles
      this._pickOthers = L.layerGroup().addTo(map);
      map.on('click', (e) => this.setPin(e.latlng.lat, e.latlng.lng));
      this._pickMap = map;
      // The form lives in a tab that starts hidden: re-measure whenever the map becomes visible or resizes,
      // and centre it properly the first time it has a real size.
      if (typeof ResizeObserver !== 'undefined') {
        this._pickRO = new ResizeObserver(() => {
          if (!el.clientWidth) return;
          map.invalidateSize();
          if (!this._pickCentred) { this._pickCentred = true; this.centrePick(); }
        });
        this._pickRO.observe(el);
      }
      this.drawOtherBuildings();
      this.syncPin();
    },
    // Already-registered buildings, shown small and grey so a new pin can be placed relative to them.
    drawOtherBuildings() {
      if (!this._pickOthers) return;
      this._pickOthers.clearLayers();
      this.buildings.filter((b) => b.id !== this.editingId).forEach((b) => {
        const lat = parseFloat(b.lat), lng = parseFloat(b.lng);
        if (!isFinite(lat) || !isFinite(lng)) return;
        L.circleMarker([lat, lng], { radius: 6, weight: 2, color: '#fff', fillColor: '#64748b', fillOpacity: 0.95, interactive: true })
          .bindTooltip(b.name, { direction: 'top', offset: [0, -6] }).addTo(this._pickOthers);
      });
    },
    centrePick() {
      const map = this._pickMap;
      if (!map) return;
      const lat = parseFloat(this.form.lat), lng = parseFloat(this.form.lng);
      if (isFinite(lat) && isFinite(lng)) { map.setView([lat, lng], Math.max(map.getZoom(), 18)); return; }
      const pts = this.buildings.map((b) => [parseFloat(b.lat), parseFloat(b.lng)]).filter((p) => isFinite(p[0]) && isFinite(p[1]));
      if (pts.length) map.fitBounds(L.latLngBounds(pts).pad(0.4), { maxZoom: 18 });
    },
    // Takes the pin off the map again (a mis-tap, or to start over). Saving needs a new pin afterwards.
    clearPin() {
      this.form.lat = '';
      this.form.lng = '';
      this.geoStatus = '';
    },
    setPin(lat, lng) {
      if (!CampusBounds.contains(lat, lng)) {
        AdminOffline.toast('That spot is outside the campus area. Pin the building inside the school grounds.', 'info');
        this.syncPin();
        return;
      }
      this.form.lat = lat.toFixed(6);
      this.form.lng = lng.toFixed(6);
      this.geoStatus = '';
    },
    syncPin() {
      const map = this._pickMap;
      if (!map) return;
      const lat = parseFloat(this.form.lat), lng = parseFloat(this.form.lng);
      if (!isFinite(lat) || !isFinite(lng)) {
        if (this._pickMarker) { map.removeLayer(this._pickMarker); this._pickMarker = null; }
        return;
      }
      if (!this._pickMarker) {
        const icon = L.divIcon({ className: 'pick-pin', html: '<span></span>', iconSize: [30, 38], iconAnchor: [15, 36] });
        this._pickMarker = L.marker([lat, lng], { icon, draggable: true, autoPan: true }).addTo(map);
        this._pickMarker.on('dragend', () => { const p = this._pickMarker.getLatLng(); this.setPin(p.lat, p.lng); });
      } else {
        const cur = this._pickMarker.getLatLng();
        if (Math.abs(cur.lat - lat) > 1e-7 || Math.abs(cur.lng - lng) > 1e-7) this._pickMarker.setLatLng([lat, lng]);
      }
      if (map.getContainer().clientWidth && !map.getBounds().contains([lat, lng])) map.panTo([lat, lng]);
    },
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
          if (!CampusBounds.contains(pos.coords.latitude, pos.coords.longitude)) {
            this.geoStatus = 'Your location is outside the campus area, so it was not used. Tap the map to pin the building instead.';
            this.geoError = true;
            return;
          }
          this.form.lat = pos.coords.latitude.toFixed(6);
          this.form.lng = pos.coords.longitude.toFixed(6);
          if (this._pickMap) this._pickMap.setView([pos.coords.latitude, pos.coords.longitude], Math.max(this._pickMap.getZoom(), 19));
          this.geoStatus = `Captured (±${Math.round(pos.coords.accuracy)}m accuracy). Drag the pin if it is off.`;
          this.geoError = false;
        },
        (err) => { this.geoStatus = 'Location denied or unavailable: ' + err.message; this.geoError = true; },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    },
    // ---- photo ----
    async choosePhoto(file) {
      if (!this.editingId || this.editingIsLocalOnly) return;
      if (!(await AdminOffline.guardOnline('Uploading a photo'))) return;
      const data = await LamparaPhoto.pick({ title: 'Photo of ' + (this.form.name || 'the building'), file });
      if (!data) return;
      this.photoBusy = true;
      try {
        await LamparaPhoto.upload('building', this.editingId, data);
        await this.loadBuildings();
        AdminOffline.toast('Photo saved', 'success');
      } catch (e) {
        Swal.fire({ icon: 'error', title: "Couldn't save the photo", text: e.message });
      } finally { this.photoBusy = false; }
    },
    dropPhoto(ev) {
      this.photoOver = false;
      const f = ev.dataTransfer && ev.dataTransfer.files[0];
      if (f) this.choosePhoto(f);
    },
    async removePhoto() {
      if (!(await AdminOffline.guardOnline('Removing a photo'))) return;
      if (!(await AdminConfirm({ title: 'Remove this photo?', text: 'Students will see no photo for this building.', confirmText: 'Remove photo', danger: true }))) return;
      this.photoBusy = true;
      try {
        await LamparaPhoto.remove('building', this.editingId);
        await this.loadBuildings();
      } catch (e) {
        Swal.fire({ icon: 'error', title: "Couldn't remove the photo", text: e.message });
      } finally { this.photoBusy = false; }
    },
    // ---- setup health (steps, per-floor status) ----
    async loadHealth() {
      try {
        const res = await fetch('../../../Backend/api/setup-health.php', { credentials: 'same-origin', cache: 'no-store' });
        const data = await res.json();
        if (data.success) this.health = data;
      } catch (e) { /* offline: the progress card and floor status just stay hidden */ }
    },
    // Is this floor's path drawn and its calibration done? (calibration is read from the plan itself)
    floorStatus(floor) {
      const plan = this.floorPlans[floor];
      const name = this.form.name;
      const pathProblem = this.health && (this.health.items || []).some((i) => i.building === name && i.floor === floor && i.problem === 'No walkable path');
      return {
        path: !!plan && !pathProblem,
        cal: !!plan && plan.north_offset !== null && plan.north_offset !== undefined && Number(plan.meters_per_unit_x) > 0
      };
    },
    async loadBuildings() {
      try {
        const res = await fetch('../../../Backend/api/buildings.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.baseBuildings = data.buildings;
      } catch (e) { /* offline with no saved copy — start from whatever is pending */ }
      this.buildings = AdminOffline.overlayBuildings(this.baseBuildings);
      this.loaded = true;
    },
    startEdit(b) {
      this.editingId = b.id;
      this.form = { name: b.name, lat: String(b.lat), lng: String(b.lng), floor_count: b.floor_count || 1, entrance_floor: b.entrance_floor || '', is_open: !!b.is_open, building_number: b.building_number, directory: b.directory || '' };
      this.geoStatus = '';
      this.drawOtherBuildings();
      this.$nextTick(() => { this.syncPin(); this.centrePick(); });
      this.markClean();
      // Forget the previous building's plans straight away. They used to stay on screen (and stay there for good for a
      // building made offline or whose request failed), so one building's plan looked like it belonged to every other.
      this.floorPlans = {};
      this._planLoadFor = b.id;
      if (!AdminOffline.isTemp(b.id)) this.loadFloorPlans(b.id);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    cancelEdit() {
      this.editingId = null;
      this.form = { name: '', lat: '', lng: '', floor_count: 1, entrance_floor: '', is_open: false, building_number: null, directory: '' };
      this.geoStatus = '';
      this.floorPlans = {};
      this.closePathEditor();
      this.markClean();
    },
    async loadFloorPlans(buildingId) {
      // A slow answer for a building you have already left must not overwrite the one you are looking at now.
      const stale = () => this._planLoadFor !== buildingId || this.editingId !== buildingId;
      try {
        const res = await fetch('../../../Backend/api/floor-plans.php?building_id=' + buildingId, { credentials: 'same-origin' });
        const data = await res.json();
        if (stale()) return;
        if (!data.success) { this.floorPlans = {}; return; }
        const byFloor = {};
        data.plans.forEach((p) => { byFloor[p.floor] = p; });
        this.floorPlans = byFloor;
      } catch (e) { if (!stale()) this.floorPlans = {}; } // offline and never opened: floor plans unavailable
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
    async uploadFloorPlan(floor, event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = ''; // lets picking the same file again re-trigger change
      if (!file) return;
      if (!AdminOffline.reachable()) { AdminOffline.guardOnline('Uploading a floor plan'); return; }
      // The building is fixed NOW, when the file is picked, not when it has finished reading: switching to another
      // building in between used to send the plan to that other building.
      const buildingId = this.editingId;
      if (!buildingId || AdminOffline.isTemp(buildingId)) { AdminOffline.toast('Save the building first, then upload its floor plans.', 'info'); return; }
      if (this.floorPlans[floor] && !(await AdminConfirm({
        title: 'Replace the ' + floor + ' plan?',
        text: 'The new image replaces the current one. Walkable paths and room markers keep their positions, so check that they still line up with the new picture.',
        confirmText: 'Replace plan' }))) return;
      this.uploadingFloor = floor;
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const res = await fetch('../../../Backend/api/floor-plans.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ building_id: buildingId, floor, image: reader.result })
          });
          const data = await res.json();
          if (data.success) {
            // only show it if that building is still the one on screen
            if (this.editingId === buildingId) this.floorPlans = { ...this.floorPlans, [floor]: { id: data.id, image_path: data.image_path } };
            this.loadHealth();
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
      this.loadFloorQrAnchor(plan.id);
    },
    closePathEditor() {
      this.pathUndo = null;
      this.pathEditorFloor = null;
      this.pathNodes = [];
      this.pathEdges = [];
      this.selectedNodeId = null;
      this.crossLinks = [];
      this.crossFloorOptions = null;
      this.floorQrAnchor = null;
      this.showingFloorQr = false;
    },
    // A floor has AT MOST one AR-anchor QR — this just checks whether it's
    // already been set, so the panel can show "view/print" vs "set one".
    async loadFloorQrAnchor(floorPlanId) {
      try {
        const res = await fetch('../../../Backend/api/qr-anchors.php?floor_plan_id=' + floorPlanId);
        const data = await res.json();
        this.floorQrAnchor = (data.success && data.anchors.length) ? data.anchors[0] : null;
      } catch (e) { /* editor still works without QR state */ }
    },
    // Builds the URL a plain camera app (not just this site's own scanner)
    // would land on when it decodes the printed QR.
    qrUrlFor(code) {
      return new URL('../Student/scan.php?qr=' + code, window.location.href).href;
    },
    async setFloorQr() {
      if (this.selectedNodeId === null) return;
      if (await this.needsInternet('Generating this floor\'s AR anchor QR')) return;
      const point = this.pathPointList.find((p) => p.id === this.selectedNodeId);
      this.qrBusy = true;
      try {
        const res = await fetch('../../../Backend/api/qr-anchors.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ floor_plan_node_id: this.selectedNodeId, label: point ? point.name : '' })
        });
        const data = await res.json();
        if (!data.success) { AdminOffline.toast(data.error || 'Could not create the QR code', 'error'); return; }
        this.floorQrAnchor = { id: data.id, floor_plan_node_id: this.selectedNodeId, code: data.code, label: data.label };
        this.showingFloorQr = true;
      } finally {
        this.qrBusy = false;
      }
    },
    showFloorQr() {
      if (this.floorQrAnchor) this.showingFloorQr = true;
    },
    async removeFloorQr() {
      if (!this.floorQrAnchor) return;
      const result = await Swal.fire({
        title: "Remove this floor's AR anchor?",
        text: 'The printed sign will stop working, and the AR guide will fall back to starting without a scanned anchor.',
        icon: 'warning', showCancelButton: true, confirmButtonText: 'Remove', confirmButtonColor: '#ff0000'
      });
      if (!result.isConfirmed) return;
      await fetch('../../../Backend/api/qr-anchors.php?id=' + this.floorQrAnchor.id, { method: 'DELETE' });
      this.floorQrAnchor = null;
      this.showingFloorQr = false;
    },
    // Clicking empty canvas drops a new junction point; clicking an existing
    // node instead selects it (see selectNode) — this handler only fires
    // when the click didn't already land on a node, via @click.self.
    async addPathNode(event) {
      if (this.pathLockedNow('add points')) return;
      if (await this.needsInternet('Editing walkable paths')) return;
      const rect = event.currentTarget.getBoundingClientRect();
      const x = Math.round(((event.clientX - rect.left) / rect.width) * 1000) / 10;
      const y = Math.round(((event.clientY - rect.top) / rect.height) * 1000) / 10;
      await this.addPathNodeAt(x, y);
    },
    async addPathNodeAt(x, y) {
      const plan = this.floorPlans[this.pathEditorFloor];
      const res = await fetch('../../../Backend/api/floor-plan-graph.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ floor_plan_id: plan.id, x, y, name: PointNames.next([...this.pathNames.values()]) })
      });
      const data = await res.json();
      if (data.success) {
        this.pathNodes.push({ id: data.id, x, y, name: data.name });
        return data.id;
      }
      return null;
    },
    // ---- keyboard / assistive alternatives to tap and drag ----
    // Same as tapping the plan, but at its centre; joins the selected point, like tracing a corridor.
    async addPathNodeAtCenter() {
      if (this.pathLockedNow('add points') || await this.needsInternet('Editing walkable paths')) return;
      const prev = this.selectedNodeId;
      const id = await this.addPathNodeAt(50, 50);
      if (id === null) return;
      if (prev !== null) { this.selectedNodeId = prev; await this.selectNode({ id }); }
      this.selectedNodeId = id;
      this.loadCrossLinks();
      this.pathLive = 'Point added at the centre of the plan';
    },
    // Same as tapping a second point while one is selected.
    async connectPathTo(otherId) {
      if (!otherId || this.selectedNodeId === null) return;
      await this.selectNode({ id: Number(otherId) });
      this.pathLive = 'Points connected';
    },
    async nudgePath(dir, step) {
      const node = this.pathNodes.find((n) => n.id === this.selectedNodeId);
      if (!node || this._nudging || this.pathLockedNow('move points') || await this.needsInternet('Moving a point')) return;
      this._nudging = true;
      const was = { x: node.x, y: node.y };
      node.x = Math.max(0, Math.min(100, Math.round((node.x + (dir === 'e' ? step : dir === 'w' ? -step : 0)) * 10) / 10));
      node.y = Math.max(0, Math.min(100, Math.round((node.y + (dir === 's' ? step : dir === 'n' ? -step : 0)) * 10) / 10));
      try {
        const res = await fetch('../../../Backend/api/floor-plan-graph.php?node_id=' + node.id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ x: node.x, y: node.y })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Could not move that point');
        this.pathLive = 'Moved ' + { n: 'up', s: 'down', e: 'right', w: 'left' }[dir];
      } catch (err) {
        node.x = was.x; node.y = was.y;
        AdminOffline.toast(err.message || 'Could not move that point', 'error');
      } finally { this._nudging = false; }
    },
    onPathKey(e) {
      if (this.pathEditorFloor === null || this.selectedNodeId === null) return;
      const t = e.target, tag = t && t.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable)) return;
      if (document.querySelector('.modal-overlay.is-open, .swal2-container')) return;
      if (e.key === 'Escape') { this.selectedNodeId = null; this.crossLinks = []; return; }
      if (e.key === 'Delete') { e.preventDefault(); this.deleteSelectedNode(); return; }
      const dir = { ArrowUp: 'n', ArrowDown: 's', ArrowLeft: 'w', ArrowRight: 'e' }[e.key];
      if (dir && e.altKey) { e.preventDefault(); this.nudgePath(dir, e.shiftKey ? 2 : 0.5); }
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
      const joins = this.pathEdges.filter((e) => e.node_a_id === id || e.node_b_id === id).length;
      if ((joins > 0 || this.crossLinks.length > 0) && !(await AdminConfirm({
        title: 'Delete ' + name + '?',
        text: 'It is joined to ' + joins + ' other point' + (joins === 1 ? '' : 's') + (this.crossLinks.length ? ' and linked to another floor by stairs' : '') + '. Those connections go with it. You can undo this right afterwards.',
        confirmText: 'Delete point', danger: true }))) return;
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
        showCancelButton: true, confirmButtonText: 'Remove all', confirmButtonColor: '#ff0000'
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
      if (!(await AdminConfirm({ title: 'Remove the link to ' + link.floor + '?', text: 'Routes will no longer be able to use these stairs or this elevator to reach that floor.', confirmText: 'Remove link', danger: true }))) return;
      await fetch('../../../Backend/api/floor-plan-graph.php?edge_id=' + link.edgeId, { method: 'DELETE' });
      this.pathUndo = { label: `Removed the link to ${link.floor}`, snapshot: { edges: [{ node_a_id: this.selectedNodeId, node_b_id: link.otherId }] } };
      await this.loadCrossLinks();
    },
    async deleteEdge(edge) {
      if (this.pathLockedNow('remove a connection')) return;
      if (await this.needsInternet('Editing walkable paths')) return;
      if (!(await AdminConfirm({ title: 'Remove this connection?', text: (this.pathNames.get(String(edge.node_a_id)) || 'A point') + ' and ' + (this.pathNames.get(String(edge.node_b_id)) || 'a point') + ' will no longer be joined. You can undo this right afterwards.', confirmText: 'Remove', danger: true }))) return;
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
        confirmButtonColor: '#ff0000',
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
      if (!this.hasPin) {
        Swal.fire({ icon: 'info', title: 'Pin the building', text: 'Tap the map to drop a pin where this building is, then save.' });
        return;
      }
      this.submitting = true;
      const fields = {
        name: this.form.name, lat: parseFloat(this.form.lat), lng: parseFloat(this.form.lng),
        floor_count: this.form.is_open ? 1 : this.form.floor_count, entrance_floor: this.form.is_open ? '' : (this.form.entrance_floor || ''), is_open: !!this.form.is_open, building_number: this.form.building_number, directory: this.form.directory
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
        this.markClean();   // saved: nothing is unsaved any more, so leaving the page must not ask
        // Inside the Buildings workspace the parent page reloads this editor on the saved building.
        if (window.parent !== window && !out.queued) {
          const id = editing || (out && (out.id || (out.data && out.data.id))) || null;
          window.parent.postMessage({ type: 'lampara-building-saved', id, name: fields.name, created: !editing }, location.origin);
          return;
        }
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
        confirmButtonColor: '#ff0000',
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
}).mount('#building-app');
})();
