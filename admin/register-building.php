<?php
require_once __DIR__ . '/_auth.php';
$activeNav = 'register-building';
$cssVer = filemtime(__DIR__ . '/../assets/css/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Register Building</title>
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/admin.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/_nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container narrow">

      <div class="page-head">
        <div>
          <h1>{{ editingId ? 'Edit Building' : 'Register a Building' }}</h1>
          <p>{{ editingId ? "Update this building's details." : 'Add a new building with its GPS location. Rooms are added separately.' }}</p>
        </div>
      </div>

      <div class="form-grid">
        <form @submit.prevent="submitBuilding" class="card">
          <div class="field">
            <label>Building name</label>
            <input v-model="form.name" type="text" required placeholder="e.g. Amafel Building (NCST)">
          </div>

          <div class="field field-row">
            <div>
              <label>Latitude</label>
              <input v-model="form.lat" type="text" required placeholder="14.328300" style="font-family:'JetBrains Mono',monospace;">
            </div>
            <div>
              <label>Longitude</label>
              <input v-model="form.lng" type="text" required placeholder="120.937200" style="font-family:'JetBrains Mono',monospace;">
            </div>
          </div>

          <button type="button" @click="captureLocation" class="btn btn-secondary geo-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#15803d" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" stroke="#15803d" stroke-width="1.8"/></svg>
            Capture My Current Location
          </button>
          <p v-if="geoStatus" class="geo-status" :class="geoError ? 'geo-error' : 'geo-ok'">{{ geoStatus }}</p>

          <div class="field" style="margin-top:1rem;">
            <label>Notes (optional — general, not room-specific)</label>
            <textarea v-model="form.directory" rows="4" placeholder="Any campus-wide facts not tied to a specific room."></textarea>
          </div>

          <div style="display:flex; align-items:center; gap:0.75rem;">
            <button type="submit" :disabled="submitting" class="btn btn-primary">
              {{ submitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Register Building') }}
            </button>
            <button v-if="editingId" type="button" @click="cancelEdit" class="btn-link" style="color: var(--muted); font-size:0.8125rem;">Cancel</button>
          </div>
        </form>

        <div class="tinted-card">
          <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.5rem;">
            <span class="dot dot-green"></span>
            <h3 style="font-weight:600; font-size:0.875rem; margin:0;">Why this matters</h3>
          </div>
          <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0;">
            The AI chat only answers from facts registered here and per-room — it will refuse
            ("I don't have that information") rather than guess. After registering the building,
            add its rooms individually on the Register Room page.
          </p>
        </div>
      </div>

      <div style="margin-top: 2.5rem;">
        <h3 class="section-title">Registered Buildings ({{ buildings.length }})</h3>
        <div class="card">
          <div v-if="buildings.length === 0" class="empty-state">None yet — add one above.</div>
          <div v-for="b in buildings" :key="b.id" class="list-row">
            <div class="avatar" style="background: var(--green-600);">{{ b.name.charAt(0) }}</div>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:0.875rem;" class="truncate">{{ b.name }}</div>
              <div style="font-family:'JetBrains Mono',monospace; font-size:0.6875rem; color:#9aa79f;">{{ b.lat }}, {{ b.lng }} &middot; {{ b.room_count }} room(s)</div>
            </div>
            <button @click="startEdit(b)" class="btn-link" style="font-size:0.75rem; color: var(--muted);">Edit</button>
            <button @click="deleteBuilding(b)" class="btn-link" style="font-size:0.75rem; color: var(--red-600); margin-left:0.75rem;">Delete</button>
          </div>
        </div>
      </div>

    </div>
  </main>
</div>

<style>
  .form-grid { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
  @media (min-width: 800px) { .form-grid { grid-template-columns: 1.3fr 1fr; align-items: start; } }
  .geo-btn { margin-bottom: 0.5rem; font-size: 0.8125rem; padding: 0.6rem 1rem; }
  .geo-status { font-family: 'JetBrains Mono', monospace; font-size: 0.75rem; margin: 0.4rem 0 0; }
  .geo-ok { color: var(--green-700); }
  .geo-error { color: var(--red-600); }
  .dot { width: 0.4rem; height: 0.4rem; border-radius: 999px; display:inline-block; }
  .dot-green { background: var(--green-500); }
  .truncate { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

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
