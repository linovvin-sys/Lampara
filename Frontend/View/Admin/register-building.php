<?php
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'register-building';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Register Building</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/register-building.css">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

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

          <div class="field field-row">
            <div>
              <label>Number of floors</label>
              <input v-model.number="form.floor_count" type="number" min="1" step="1" required style="max-width:8rem;">
            </div>
            <div>
              <label>Building number (optional)</label>
              <input v-model.number="form.building_number" type="number" min="1" step="1" placeholder="e.g. 1" style="max-width:8rem;">
            </div>
          </div>
          <p style="color: var(--muted); font-size:0.75rem; margin:-0.75rem 0 1rem;">
            First digit of every room number in this building (e.g. Amafel = 1, so its rooms are 1101, 1204…). Leave blank for buildings with no numbered rooms.
          </p>

          <button type="button" @click="captureLocation" class="btn btn-secondary geo-btn">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#15803d" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" stroke="#15803d" stroke-width="1.8"/></svg>
            Capture My Current Location
          </button>
          <p v-if="geoStatus" class="geo-status" :class="geoError ? 'geo-error' : 'geo-ok'">{{ geoStatus }}</p>

          <!-- Nearby-building warning: two GPS points close enough that a visitor's
               compass cone could catch both, risking the misidentification gap
               flagged Critical in the project proposal. Advisory only — never blocks saving. -->
          <div v-if="nearbyWarnings.length" class="tinted-card warn-card">
            <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.5rem;">
              <span class="dot dot-amber"></span>
              <h3 style="font-weight:600; font-size:0.875rem; margin:0;">Close to {{ nearbyWarnings.length > 1 ? 'other buildings' : 'another building' }}</h3>
            </div>
            <p v-for="w in nearbyWarnings" :key="w.id" style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0 0 0.35rem;">
              <strong style="color: var(--fg, #1a1a1a);">{{ w.name }}</strong> is only {{ w.distance }}m away — visitors standing nearby may get the wrong building labeled. Consider spacing GPS points further apart, or double-check both points are accurate.
            </p>
          </div>

          <div class="field" style="margin-top:1rem;">
            <label>Notes (optional — general, not room-specific)</label>
            <textarea v-model="form.directory" rows="4" placeholder="Any campus-wide facts not tied to a specific room."></textarea>
          </div>

          <div style="display:flex; align-items:center; gap:0.75rem;">
            <button type="submit" :disabled="submitting" class="btn btn-primary" :class="{ 'is-loading': submitting }">
              <span v-if="submitting" class="btn-spinner"></span>{{ submitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Register Building') }}
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
              <div style="font-family:'JetBrains Mono',monospace; font-size:0.6875rem; color:#9aa79f;">{{ b.lat }}, {{ b.lng }} &middot; {{ b.floor_count }} floor(s) &middot; {{ b.building_number !== null ? 'Bldg #' + b.building_number : 'no building #' }} &middot; {{ b.room_count }} room(s)</div>
            </div>
            <button @click="startEdit(b)" class="btn-link" style="font-size:0.75rem; color: var(--muted);">Edit</button>
            <button @click="deleteBuilding(b)" class="btn-link" style="font-size:0.75rem; color: var(--red-600); margin-left:0.75rem;">Delete</button>
          </div>
        </div>
      </div>

    </div>

    <transition name="overlay">
      <div v-if="submitting" class="loading-overlay">
        <div class="loading-card">
          <div class="loading-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
          </div>
          <p>{{ editingId ? 'Saving changes…' : 'Registering building…' }}</p>
        </div>
      </div>
    </transition>
  </main>
</div>

<script src="../../Js/Admin/register-building.js"></script>

</body>
</html>
