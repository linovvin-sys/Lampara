(function () {
const { createApp } = Vue;
const COLORS = ['#2e3192', '#ffd100', '#ff0000', '#6a6dd0', '#ffe066', '#9b9ce6'];

window.LamparaListApp = createApp({
  data() { return { baseBuildings: [], buildings: [], q: '', map: null, markers: [], loaded: false, health: [], healthLoaded: false, drawer: null, photoBusy: false, photoOver: false, menuFor: null }; },
  computed: {
    filtered() {
      if (!this.q.trim()) return this.buildings;
      const q = this.q.toLowerCase();
      return this.buildings.filter(b => b.name.toLowerCase().includes(q));
    }
  },
  mounted() {
    document.addEventListener('click', () => { this.menuFor = null; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.menuFor = null; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.drawer && !document.querySelector('dialog[open], .swal2-container')) this.closeDrawer(); });
    this.initMap();
    this.loadBuildings();
    this.loadHealth();
    // Buildings saved offline show up here too (marked as not synced) until they sync.
    AdminOffline.onSynced(() => this.loadBuildings());
    AdminOffline.onChange(() => { this.buildings = AdminOffline.overlayBuildings(this.baseBuildings); this.renderMarkers(); });
  },
  methods: {
    // Buildings saved offline have string ids ("t_…"), not numbers.
    colorFor(id) { return COLORS[(Number(id) || 0) % COLORS.length]; },
    initMap() {
      // The campus centre (from the school's settings) until real data loads.
      this.map = L.map(this.$refs.mapArea, CampusBounds.mapOptions()).setView(CampusBounds.CENTER, 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        bounds: CampusBounds.BOUNDS, maxZoom: 19
      }).addTo(this.map);
    },
    renderMarkers() {
      if (!this.map) return;
      this.markers.forEach(m => this.map.removeLayer(m));
      this.markers = [];
      const latlngs = [];
      this.buildings.forEach(b => {
        const marker = L.marker([b.lat, b.lng]).addTo(this.map);
        marker.bindPopup(`<strong>${b.name}</strong><br>${b.room_count} room(s)`);
        this.markers.push(marker);
        latlngs.push([b.lat, b.lng]);
      });
      if (latlngs.length === 1) {
        this.map.setView(latlngs[0], 17);
      } else if (latlngs.length > 1) {
        this.map.fitBounds(latlngs, { padding: [40, 40] });
      }
    },
    // ---- quick-edit drawer ----
    openDrawer(b) {
      this.drawerOpener = document.activeElement;
      this.drawer = {
        id: b.id, name: b.name, photo: b.photo_path || '', saving: false, error: '',
        form: { name: b.name, floor_count: b.floor_count, building_number: b.building_number, directory: b.directory || '' }
      };
      this.$nextTick(() => { if (this.$refs.dName) this.$refs.dName.focus(); });
    },
    closeDrawer() {
      this.drawer = null;
      if (this.drawerOpener && this.drawerOpener.focus) this.drawerOpener.focus();
    },
    async saveDrawer() {
      const d = this.drawer, f = d.form;
      d.error = '';
      if (!String(f.name || '').trim()) { d.error = 'Give the building a name.'; return; }
      if (!Number.isInteger(f.floor_count) || f.floor_count < 1) { d.error = 'Number of floors must be 1 or more.'; return; }
      const b = this.buildings.find((x) => x.id === d.id);
      if (!b) return;
      if (!(await AdminOffline.guardOnline('Saving a building'))) return;
      d.saving = true;
      try {
        const res = await fetch('../../../Backend/api/buildings.php?id=' + d.id, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ name: f.name.trim(), lat: b.lat, lng: b.lng, floor_count: f.floor_count, building_number: f.building_number === '' ? null : f.building_number, directory: f.directory })
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Could not save');
        await this.loadBuildings();
        this.closeDrawer();
        AdminOffline.toast('Building saved', 'success');
      } catch (e) {
        d.error = e.message || 'Could not save';
      } finally { if (this.drawer) this.drawer.saving = false; }
    },
    async choosePhoto(file) {
      if (!this.drawer) return;
      if (!(await AdminOffline.guardOnline('Uploading a photo'))) return;
      const data = await LamparaPhoto.pick({ title: 'Photo of ' + this.drawer.name, file });
      if (!data) return;
      this.photoBusy = true;
      try {
        await LamparaPhoto.upload('building', this.drawer.id, data);
        await this.loadBuildings();
        const b = this.buildings.find((x) => x.id === this.drawer.id);
        if (b) this.drawer.photo = b.photo_path || '';
        AdminOffline.toast('Photo saved', 'success');
      } catch (e) { this.drawer.error = e.message; } finally { this.photoBusy = false; }
    },
    dropPhoto(ev) { this.photoOver = false; const f = ev.dataTransfer && ev.dataTransfer.files[0]; if (f) this.choosePhoto(f); },
    async removePhoto() {
      if (!(await AdminConfirm({ title: 'Remove this photo?', text: 'Students will see no photo for this building.', confirmText: 'Remove photo', danger: true }))) return;
      this.photoBusy = true;
      try { await LamparaPhoto.remove('building', this.drawer.id); await this.loadBuildings(); this.drawer.photo = ''; }
      catch (e) { this.drawer.error = e.message; } finally { this.photoBusy = false; }
    },
    // How many things still block each building (same checks as the dashboard's Setup health card).
    async loadHealth() {
      try {
        const res = await fetch('../../../Backend/api/setup-health.php', { credentials: 'same-origin', cache: 'no-store' });
        const data = await res.json();
        if (data.success) { this.health = data.items; this.healthLoaded = true; }
      } catch (e) { /* offline: the Setup column just stays empty */ }
    },
    // The first thing to fix in this building, in words: "3rd Floor: Not calibrated".
    nextFix(b) {
      const it = this.health.find((i) => i.level === 'fix' && i.building === b.name);
      return it ? [it.floor, it.problem].filter(Boolean).join(': ') : '';
    },
    fixesFor(b) { return this.health.filter((i) => i.level === 'fix' && i.building === b.name).length; },
    async loadBuildings() {
      try {
        const res = await fetch('../../../Backend/api/buildings.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.baseBuildings = data.buildings;
      } catch (e) { /* offline with no saved copy — pending buildings still show */ }
      this.buildings = AdminOffline.overlayBuildings(this.baseBuildings);
      this.loaded = true;
      this.renderMarkers();
    },
    async deleteBuilding(b) {
      if (!(await AdminOffline.guardOnline('Deleting a building'))) return;
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
      if (data.success) await this.loadBuildings();
      else Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
    },
    isStale(updatedAt) {
      if (!updatedAt) return false; // saved offline, not on the server yet
      const days = (Date.now() - new Date(updatedAt).getTime()) / 86400000;
      return days > 90;
    },
    timeAgo(updatedAt) {
      if (!updatedAt) return 'not synced yet';
      const days = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 86400000);
      if (days < 1) return 'today';
      if (days === 1) return '1 day ago';
      if (days < 30) return days + ' days ago';
      const months = Math.floor(days / 30);
      return months === 1 ? '1 month ago' : months + ' months ago';
    }
  }
}).mount('#list-app');
})();
