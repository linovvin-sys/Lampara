const { createApp } = Vue;

// Two buildings this close together will fall inside the same wide compass
// cone (guide.php uses up to ±70°) for most of the distance a visitor
// approaches from, risking the Critical misidentification gap.
const NEARBY_WARN_METERS = 40;

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
      editingId: null
    };
  },
  computed: {
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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    cancelEdit() {
      this.editingId = null;
      this.form = { name: '', lat: '', lng: '', floor_count: 1, building_number: null, directory: '' };
      this.geoStatus = '';
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
