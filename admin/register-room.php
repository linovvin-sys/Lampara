<?php require_once __DIR__ . '/_auth.php'; $cssVer = filemtime(__DIR__ . '/../assets/css/tailwind.css'); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Register Room</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/tailwind.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>body { font-family: 'Outfit', sans-serif; }</style>
</head>
<body class="bg-white min-h-screen">

<div id="app">
  <div class="bg-zinc-900 px-4 sm:px-6 py-3.5 sm:py-4">
    <div class="flex items-center justify-between mb-2.5">
      <h1 class="text-white font-semibold text-sm sm:text-base">Admin · Register Room</h1>
      <a href="logout.php" class="text-white/40 hover:text-white/70 text-xs font-medium flex-shrink-0">Logout</a>
    </div>
    <nav class="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
      <a href="register-building.php" class="flex-shrink-0 text-xs font-medium rounded-full px-3.5 py-2 bg-white/10 text-white/70">Register Building</a>
      <a href="manage-buildings.php" class="flex-shrink-0 text-xs font-medium rounded-full px-3.5 py-2 bg-white/10 text-white/70">Manage Buildings</a>
      <a href="register-room.php" class="flex-shrink-0 text-xs font-semibold rounded-full px-3.5 py-2 bg-amber-500 text-zinc-900">Register Room</a>
    </nav>
  </div>

  <div class="max-w-4xl mx-auto p-4 sm:p-7 relative overflow-hidden">
    <div class="absolute -top-24 -right-24 w-72 h-72 bg-amber-400/10 rounded-full blur-3xl pointer-events-none"></div>

    <h2 class="text-2xl font-bold text-zinc-900 relative">{{ editingId ? 'Edit Room' : 'Register a Room' }}</h2>
    <p class="text-zinc-500 text-xs mt-1 mb-6 relative">Structured fields — this is what signage scanning matches against.</p>
    <div class="border-t border-zinc-200 mb-6 relative"></div>

    <div class="grid md:grid-cols-2 gap-6 sm:gap-8 relative">
      <form @submit.prevent="submitRoom">
        <div class="mb-4">
          <label class="block text-xs font-medium text-zinc-500 mb-1.5">Building</label>
          <select v-model="form.building_id" required class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
            <option value="" disabled>Select a building…</option>
            <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>

        <div class="mb-4">
          <label class="block text-xs font-medium text-zinc-500 mb-1.5">Room type</label>
          <div class="inline-flex bg-zinc-100 rounded-lg p-1">
            <button type="button" @click="form.room_type = 'office'"
                    :class="form.room_type === 'office' ? 'bg-white shadow text-zinc-900' : 'text-zinc-500'"
                    class="text-xs font-semibold rounded-md px-4 py-2 transition">Office</button>
            <button type="button" @click="form.room_type = 'classroom'"
                    :class="form.room_type === 'classroom' ? 'bg-amber-500 text-white shadow' : 'text-zinc-500'"
                    class="text-xs font-semibold rounded-md px-4 py-2 transition">Classroom / Lab</button>
          </div>
        </div>

        <div class="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label class="block text-xs font-medium text-zinc-500 mb-1.5">Room number</label>
            <input v-model="form.room_number" type="text" required placeholder="204" class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
          </div>
          <div>
            <label class="block text-xs font-medium text-zinc-500 mb-1.5">Floor</label>
            <input v-model="form.floor" type="text" required placeholder="2nd Floor" class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
          </div>
        </div>

        <div class="mb-4">
          <label class="block text-xs font-medium text-zinc-500 mb-1.5">Room name</label>
          <input v-model="form.room_name" type="text" required placeholder="Treasury" class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
        </div>

        <div v-if="form.room_type === 'office'" class="mb-4">
          <label class="block text-xs font-medium text-zinc-500 mb-1.5">Hours</label>
          <input v-model="form.hours" type="text" placeholder="8:00 AM – 5:00 PM, Mon–Fri" class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
        </div>
        <div v-else class="mb-4 flex items-center gap-2 bg-zinc-50 rounded-lg px-3 py-2.5 text-xs text-zinc-400">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="#a1a1aa" stroke-width="1.6" stroke-dasharray="3 3"/></svg>
          No fixed hours for classrooms/labs — class scheduling is a separate scope.
        </div>

        <div class="mb-6">
          <label class="block text-xs font-medium text-zinc-500 mb-1.5">Notes (optional)</label>
          <input v-model="form.notes" type="text" placeholder="e.g. 3rd floor, past the stairwell" class="w-full border border-zinc-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400">
        </div>

        <div class="flex items-center gap-3">
          <button type="submit" :disabled="submitting"
                  class="bg-zinc-900 hover:bg-zinc-800 text-amber-400 rounded-lg px-8 py-2.5 font-semibold transition disabled:opacity-50">
            {{ submitting ? 'Saving...' : (editingId ? 'Save Changes' : 'Add Room') }}
          </button>
          <button v-if="editingId" type="button" @click="cancelEdit" class="text-zinc-500 text-sm font-medium">Cancel</button>
        </div>
      </form>

      <div class="space-y-4">
        <div class="bg-white border border-zinc-200 rounded-2xl p-5 shadow-sm">
          <div class="flex items-center gap-1.5 mb-2">
            <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
            <h3 class="font-semibold text-sm text-zinc-900">Why room numbers, not text</h3>
          </div>
          <p class="text-xs text-zinc-500 leading-relaxed">When the AI reads a signage ("ROOM 204"), it matches that number directly against a room record — not a keyword search through a paragraph. Structured fields also power Manual Search and Nearby suggestions.</p>
        </div>

        <div class="bg-zinc-900 rounded-2xl p-5">
          <p class="text-[10px] font-bold tracking-widest text-zinc-400 mb-3">ROOMS {{ form.building_id ? 'IN THIS BUILDING' : '' }} ({{ filteredRooms.length }})</p>
          <div v-if="filteredRooms.length === 0" class="text-zinc-500 text-xs italic">None yet.</div>
          <div v-for="r in filteredRooms" :key="r.id" class="flex items-center gap-2.5 py-1.5 text-sm group">
            <span class="font-mono text-[11px] bg-zinc-800 text-amber-400 rounded px-1.5 py-0.5">{{ r.room_number }}</span>
            <span class="text-white flex-1 truncate">{{ r.room_name }}</span>
            <span class="text-[10px] font-semibold" :class="r.room_type === 'office' ? 'text-amber-400' : 'text-emerald-400'">{{ r.room_type === 'office' ? 'Office' : 'Room' }}</span>
            <button @click="startEdit(r)" class="text-[10px] font-semibold text-zinc-400 hover:text-amber-400 ml-2">Edit</button>
            <button @click="deleteRoom(r)" class="text-[10px] font-semibold text-zinc-400 hover:text-red-400">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<script>
const { createApp } = Vue;
createApp({
  data() {
    return {
      form: { building_id: '', room_number: '', room_name: '', floor: '', room_type: 'office', hours: '', notes: '' },
      buildings: [],
      rooms: [],
      submitting: false,
      editingId: null
    };
  },
  computed: {
    filteredRooms() {
      if (!this.form.building_id) return this.rooms;
      return this.rooms.filter(r => r.building_id == this.form.building_id);
    }
  },
  mounted() { this.loadBuildings(); this.loadRooms(); },
  methods: {
    async loadBuildings() {
      const res = await fetch('../api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;
    },
    async loadRooms() {
      const res = await fetch('../api/rooms.php');
      const data = await res.json();
      if (data.success) this.rooms = data.rooms;
    },
    startEdit(r) {
      this.editingId = r.id;
      this.form = {
        building_id: r.building_id, room_number: r.room_number, room_name: r.room_name,
        floor: r.floor, room_type: r.room_type, hours: r.hours || '', notes: r.notes || ''
      };
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    cancelEdit() {
      this.editingId = null;
      const keepBuilding = this.form.building_id;
      this.form = { building_id: keepBuilding, room_number: '', room_name: '', floor: '', room_type: 'office', hours: '', notes: '' };
    },
    async submitRoom() {
      this.submitting = true;
      try {
        const url = this.editingId ? '../api/rooms.php?id=' + this.editingId : '../api/rooms.php';
        const method = this.editingId ? 'PUT' : 'POST';
        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.form) });
        const data = await res.json();
        if (data.success) {
          this.cancelEdit();
          await this.loadRooms();
        } else {
          alert('Error: ' + (data.error || 'unknown'));
        }
      } finally {
        this.submitting = false;
      }
    },
    async deleteRoom(r) {
      if (!confirm(`Delete Room ${r.room_number} — ${r.room_name}? This can't be undone.`)) return;
      const res = await fetch('../api/rooms.php?id=' + r.id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadRooms();
        if (this.editingId === r.id) this.cancelEdit();
      } else {
        alert('Error: ' + (data.error || 'unknown'));
      }
    }
  }
}).mount('#app');
</script>

</body>
</html>
