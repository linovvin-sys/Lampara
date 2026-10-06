const { createApp } = Vue;
const COLORS = ['#22c55e', '#16a34a', '#15803d', '#86efac', '#65a30d', '#14532d'];

createApp({
  data() { return { baseBuildings: [], buildings: [], q: '', map: null, markers: [] }; },
  computed: {
    filtered() {
      if (!this.q.trim()) return this.buildings;
      const q = this.q.toLowerCase();
      return this.buildings.filter(b => b.name.toLowerCase().includes(q));
    }
  },
  mounted() {
    this.initMap();
    this.loadBuildings();
    // Buildings saved offline show up here too (marked as not synced) until they sync.
    AdminOffline.onSynced(() => this.loadBuildings());
    AdminOffline.onChange(() => { this.buildings = AdminOffline.overlayBuildings(this.baseBuildings); this.renderMarkers(); });
  },
  methods: {
    // Buildings saved offline have string ids ("t_…"), not numbers.
    colorFor(id) { return COLORS[(Number(id) || 0) % COLORS.length]; },
    initMap() {
      // Amafel Building as a sane default center before real data loads.
      this.map = L.map(this.$refs.mapArea).setView([14.3283, 120.9372], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19
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
    async loadBuildings() {
      try {
        const res = await fetch('../../../Backend/api/buildings.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.baseBuildings = data.buildings;
      } catch (e) { /* offline with no saved copy — pending buildings still show */ }
      this.buildings = AdminOffline.overlayBuildings(this.baseBuildings);
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
        confirmButtonColor: '#dc2626',
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
}).mount('#app');
