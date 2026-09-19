<?php
require_once __DIR__ . '/_auth.php';
$activeNav = 'register-room';
$cssVer = filemtime(__DIR__ . '/../assets/css/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Register Room</title>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/admin.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/_nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container narrow">

      <div class="page-head">
        <div>
          <h1>{{ editingId ? 'Edit Room' : 'Register a Room' }}</h1>
          <p>Structured fields — this is what signage scanning matches against.</p>
        </div>
      </div>

      <div class="form-grid">
        <form @submit.prevent="submitRoom" class="card">
          <div class="field">
            <label>Building</label>
            <select v-model="form.building_id" required>
              <option value="" disabled>Select a building…</option>
              <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div class="field">
            <label>Room type</label>
            <div class="toggle-group">
              <button type="button" @click="form.room_type = 'office'" :class="form.room_type === 'office' ? 'is-active' : ''">Office</button>
              <button type="button" @click="form.room_type = 'classroom'" :class="form.room_type === 'classroom' ? 'is-active' : ''">Classroom / Lab</button>
            </div>
          </div>

          <div class="field field-row">
            <div>
              <label>Room number</label>
              <input v-model="form.room_number" type="text" required placeholder="204" style="font-family:'JetBrains Mono',monospace;">
            </div>
            <div>
              <label>Floor</label>
              <input v-model="form.floor" type="text" required placeholder="2nd Floor">
            </div>
          </div>

          <div class="field">
            <label>Room name</label>
            <input v-model="form.room_name" type="text" required placeholder="Treasury">
          </div>

          <div class="field" v-if="form.room_type === 'office'">
            <label>Hours</label>
            <input v-model="form.hours" type="text" placeholder="8:00 AM – 5:00 PM, Mon–Fri">
          </div>
          <div v-else class="no-hours-note">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="#9aa79f" stroke-width="1.6" stroke-dasharray="3 3"/></svg>
            No fixed hours for classrooms/labs — class scheduling is a separate scope.
          </div>

          <div class="field">
            <label>Notes (optional)</label>
            <input v-model="form.notes" type="text" placeholder="e.g. 3rd floor, past the stairwell">
          </div>

          <div style="display:flex; align-items:center; gap:0.75rem; margin-top:0.5rem;">
            <button type="submit" :disabled="submitting" class="btn btn-primary">
              {{ submitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Room') }}
            </button>
            <button v-if="editingId" type="button" @click="cancelEdit" class="btn-link" style="color: var(--muted); font-size:0.8125rem;">Cancel</button>
          </div>
        </form>

        <div class="side-col">
          <div class="tinted-card">
            <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.5rem;">
              <span class="dot dot-green"></span>
              <h3 style="font-weight:600; font-size:0.875rem; margin:0;">Why room numbers, not text</h3>
            </div>
            <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0;">
              When the AI reads a signage ("ROOM 204"), it matches that number directly against a
              room record — not a keyword search through a paragraph. Structured fields also power
              Manual Search and Nearby suggestions.
            </p>
          </div>

          <div class="rooms-panel">
            <p class="rooms-panel-label">ROOMS {{ form.building_id ? 'IN THIS BUILDING' : '' }} ({{ filteredRooms.length }})</p>
            <div v-if="filteredRooms.length === 0" class="empty-state" style="color: rgba(255,255,255,0.4);">None yet.</div>
            <div v-for="r in filteredRooms" :key="r.id" class="room-row">
              <span class="room-num">{{ r.room_number }}</span>
              <span class="room-name truncate">{{ r.room_name }}</span>
              <span class="room-type" :class="r.room_type === 'office' ? 'type-office' : 'type-classroom'">{{ r.room_type === 'office' ? 'Office' : 'Room' }}</span>
              <button @click="startEdit(r)" class="btn-link room-action">Edit</button>
              <button @click="deleteRoom(r)" class="btn-link room-action room-delete">Delete</button>
            </div>
          </div>
        </div>
      </div>

    </div>
  </main>
</div>

<style>
  .form-grid { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
  @media (min-width: 800px) { .form-grid { grid-template-columns: 1.3fr 1fr; align-items: start; } }
  .side-col { display: flex; flex-direction: column; gap: 1.25rem; }
  .no-hours-note {
    display: flex; align-items: center; gap: 0.5rem;
    background: var(--green-50); border-radius: 0.65rem;
    padding: 0.7rem 0.85rem; font-size: 0.75rem; color: #9aa79f;
    margin-bottom: 1rem;
  }
  .dot { width: 0.4rem; height: 0.4rem; border-radius: 999px; display:inline-block; }
  .dot-green { background: var(--green-500); }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .rooms-panel { background: var(--ink); border-radius: 1rem; padding: 1.25rem; }
  .rooms-panel-label { font-size: 0.625rem; font-weight: 700; letter-spacing: 0.08em; color: rgba(255,255,255,0.45); margin: 0 0 0.75rem; }
  .room-row { display: flex; align-items: center; gap: 0.6rem; padding: 0.4rem 0; font-size: 0.875rem; }
  .room-num { font-family: 'JetBrains Mono', monospace; font-size: 0.6875rem; background: rgba(255,255,255,0.1); color: var(--green-500); border-radius: 0.3rem; padding: 0.1rem 0.4rem; flex-shrink: 0; }
  .room-name { color: #ffffff; flex: 1; min-width: 0; }
  .room-type { font-size: 0.625rem; font-weight: 700; flex-shrink: 0; }
  .type-office { color: var(--green-200); }
  .type-classroom { color: var(--green-500); }
  .room-action { font-size: 0.625rem; font-weight: 700; color: rgba(255,255,255,0.4); }
  .room-action:hover { color: var(--green-500); }
  .room-delete:hover { color: #f87171; }
</style>

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
          Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
        }
      } finally {
        this.submitting = false;
      }
    },
    async deleteRoom(r) {
      const result = await Swal.fire({
        title: `Delete Room ${r.room_number} — ${r.room_name}?`,
        text: "This can't be undone.",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Delete',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280'
      });
      if (!result.isConfirmed) return;
      const res = await fetch('../api/rooms.php?id=' + r.id, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        await this.loadRooms();
        if (this.editingId === r.id) this.cancelEdit();
      } else {
        Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
      }
    }
  }
}).mount('#app');
</script>

</body>
</html>
