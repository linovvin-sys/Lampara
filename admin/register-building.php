<?php require_once __DIR__ . '/_auth.php'; ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Register Building</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/tailwind.css">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>body { font-family: 'Outfit', sans-serif; }</style>
</head>
<body class="bg-white min-h-screen">

<div id="app">
  <div class="bg-zinc-900 px-4 sm:px-6 py-3.5 sm:py-4">
    <div class="flex items-center justify-between mb-2.5">
      <h1 class="text-white font-semibold text-sm sm:text-base">Admin · Register Building</h1>
      <a href="logout.php" class="text-white/40 hover:text-white/70 text-xs font-medium flex-shrink-0">Logout</a>
    </div>
    <nav class="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <a href="register-building.php" class="flex-shrink-0 text-xs font-semibold rounded-full px-3.5 py-2 bg-amber-500 text-zinc-900">Register Building</a>
      <a href="manage-buildings.php" class="flex-shrink-0 text-xs font-medium rounded-full px-3.5 py-2 bg-white/10 text-white/70">Manage Buildings</a>
      <a href="register-room.php" class="flex-shrink-0 text-xs font-medium rounded-full px-3.5 py-2 bg-white/10 text-white/70">Register Room</a>
    </nav>
  </div>

  <div class="max-w-4xl mx-auto p-4 sm:p-7 relative overflow-hidden">
    <div class="absolute -top-24 -right-24 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl pointer-events-none"></div>

    <h2 class="text-2xl font-bold text-zinc-900 relative">{{ editingId ? 'Edit Building' : 'Register a Building' }}</h2>
    <p class="text-zinc-500 text-xs mt-1 mb-6 relative">{{ editingId ? 'Update this building\'s details.' : 'Add a new building with its GPS location. Rooms are added separately.' }}</p>
    <div class="border-t border-zinc-200 mb-6 relative"></div>

    <div class="grid md:grid-cols-2 gap-6 sm:gap-8 relative">
      <form @submit.prevent="submitBuilding">
        <div class="mb-4">
          <label class="block text-xs font-medium text-zinc-500 mb-1.5">Building name</label>
          <input v-model="form.name" type="text" required placeholder="e.g. Amafel Building (NCST)"
                 class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
        </div>

        <div class="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-zinc-500 mb-1.5">Latitude</label>
            <input v-model="form.lat" type="text" required placeholder="14.328300"
                   class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-500 mb-1.5">Longitude</label>
            <input v-model="form.lng" type="text" required placeholder="120.937200"
                   class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
          </div>
        </div>

        <button type="button" @click="captureLocation"
                class="mb-4 flex items-center gap-2 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg px-3 py-2 text-xs font-semibold hover:bg-amber-100 transition">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#92400e" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" stroke="#92400e" stroke-width="1.8"/></svg>
          Capture My Current Location
        </button>
        <p v-if="geoStatus" class="text-xs font-mono mb-4" :class="geoError ? 'text-red-600' : 'text-emerald-600'">{{ geoStatus }}</p>

        <div class="mb-6">
          <label class="block text-xs font-medium text-zinc-500 mb-1.5">Notes (optional — general, not room-specific)</label>
          <textarea v-model="form.directory" rows="4"
                    placeholder="Any campus-wide facts not tied to a specific room."
                    class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"></textarea>
        </div>

        <div class="flex items-center gap-3">
          <button type="submit" :disabled="submitting"
                  class="bg-amber-500 hover:bg-amber-400 text-white rounded-lg px-8 py-2.5 font-semibold transition disabled:opacity-50 shadow-lg shadow-amber-500/25">
            {{ submitting ? 'Saving...' : (editingId ? 'Save Changes' : 'Register Building') }}
          </button>
          <button v-if="editingId" type="button" @click="cancelEdit" class="text-zinc-500 text-sm font-medium">Cancel</button>
        </div>
      </form>

      <div class="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm h-fit">
        <div class="flex items-center gap-1.5 mb-2">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <h3 class="font-semibold text-sm text-zinc-900">Why this matters</h3>
        </div>
        <p class="text-xs text-zinc-500 leading-relaxed">The AI chat only answers from facts registered here and per-room — it will refuse ("I don't have that information") rather than guess. After registering the building, add its rooms individually on the Register Room page.</p>
      </div>
    </div>

    <div class="mt-10 relative">
      <h3 class="text-sm font-bold text-zinc-900 mb-3">Registered Buildings ({{ buildings.length }})</h3>
      <div v-if="buildings.length === 0" class="text-zinc-400 text-sm italic">None yet — add one above.</div>
      <div v-for="b in buildings" :key="b.id" class="flex items-center gap-3 border-b border-zinc-100 py-3 last:border-0">
        <div class="w-8 h-8 rounded-lg bg-amber-500 text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">{{ b.name.charAt(0) }}</div>
        <div class="flex-1">
          <div class="font-medium text-sm text-zinc-900">{{ b.name }}</div>
          <div class="text-xs font-mono text-zinc-400">{{ b.lat }}, {{ b.lng }} · {{ b.room_count }} room(s)</div>
        </div>
        <button @click="startEdit(b)" class="text-xs font-semibold text-zinc-700 hover:text-amber-600">Edit</button>
        <button @click="deleteBuilding(b)" class="text-xs font-semibold text-red-600 hover:text-red-700">Delete</button>
      </div>
    </div>
  </div>
</div>

<script>
const { createApp } = Vue;
createApp({
  data() {
    return {
      form: { name: '', lat: '', lng: '', directory: '' },
      buildings: [],
      submitting: false,
      geoStatus: '',
      geoError: false,
      editingId: null
    };
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
      const res = await fetch('../api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;
    },
    startEdit(b) {
      this.editingId = b.id;
      this.form = { name: b.name, lat: String(b.lat), lng: String(b.lng), directory: b.directory || '' };
      this.geoStatus = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    cancelEdit() {
      this.editingId = null;
      this.form = { name: '', lat: '', lng: '', directory: '' };
      this.geoStatus = '';
    },
    async submitBuilding() {
      this.submitting = true;
      const body = JSON.stringify({ name: this.form.name, lat: parseFloat(this.form.lat), lng: parseFloat(this.form.lng), directory: this.form.directory });
      try {
        const url = this.editingId ? '../api/buildings.php?id=' + this.editingId : '../api/buildings.php';
        const method = this.editingId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body });
        const data = await res.json();
        if (data.success) {
          this.cancelEdit();
          await this.loadBuildings();
        } else {
          alert('Error: ' + (data.error || 'unknown'));
        }
      } finally {
        this.submitting = false;
      }
    },
    async deleteBuilding(b) {
      if (!confirm(`Delete "${b.name}"? This also deletes its ${b.room_count} registered room(s). This can't be undone.`)) return;
      const res = await fetch('../api/buildings.php?id=' + b.id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadBuildings();
        if (this.editingId === b.id) this.cancelEdit();
      } else {
        alert('Error: ' + (data.error || 'unknown'));
      }
    }
  }
}).mount('#app');
</script>

</body>
</html>
