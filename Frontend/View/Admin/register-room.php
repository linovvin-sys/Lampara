<?php
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'register-room';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Register Room</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/register-room.css">
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
          <h1>{{ editingId ? 'Edit Room' : 'Register a Room' }}</h1>
          <p>Structured fields — this is what signage scanning matches against.</p>
        </div>
      </div>

      <div class="form-grid">
        <form @submit.prevent="submitRoom" class="card">
          <div class="field">
            <label>Building</label>
            <select v-model="form.building_id" @change="form.floor = ''" required>
              <option value="" disabled>Select a building…</option>
              <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <!-- Buildings with no building_number were explicitly marked as
               having no numbered rooms at all (e.g. the Gymnasium — it's
               just a court) — block registering one here instead of
               silently allowing a room that shouldn't exist. -->
          <div v-if="buildingBlocksRooms" class="tinted-card warn-card" style="margin-bottom:1rem;">
            <p style="color:#92400e; font-size:0.8125rem; line-height:1.6; margin:0;">
              <strong>{{ selectedBuilding.name }}</strong> was registered with no building number, meaning it doesn't have numbered rooms. If this is wrong, add a building number for it on Register Building first.
            </p>
          </div>

          <template v-if="!buildingBlocksRooms">
            <div class="field">
              <label>Category</label>
              <div class="toggle-group">
                <button type="button" @click="setCategory('office')" :class="form.category === 'office' ? 'is-active' : ''">Office</button>
                <button type="button" @click="setCategory('classroom')" :class="form.category === 'classroom' ? 'is-active' : ''">Classroom / Lab</button>
                <button type="button" @click="setCategory('cr')" :class="form.category === 'cr' ? 'is-active' : ''">CR</button>
                <button type="button" @click="setCategory('canteen')" :class="form.category === 'canteen' ? 'is-active' : ''">Canteen</button>
              </div>
            </div>

            <div class="field field-row">
              <div>
                <label>Room number</label>
                <input v-if="!form.noSignage && !forcesNoNumber" v-model="form.room_number" type="text" required
                       :placeholder="expectedPrefix ? expectedPrefix + '01' : '204'"
                       style="font-family:'JetBrains Mono',monospace;">
                <input v-else type="text" value="No number" disabled
                       style="font-family:'JetBrains Mono',monospace; color:#9aa79f; background:#f4f6f4;">
                <p v-if="!form.noSignage && !forcesNoNumber && (expectedPrefix || roomNumberError)" style="font-size:0.6875rem; margin:0.3rem 0 0;" :style="{ color: roomNumberError ? '#dc2626' : '#9aa79f' }">
                  {{ roomNumberError || ('Should start with ' + expectedPrefix + ' — building ' + selectedBuilding.building_number + ', floor ' + floorDigit) }}
                </p>
                <!-- CRs and canteens are never numbered — a hard rule, not a
                     togglable default, so no checkbox here at all for them. -->
                <p v-if="forcesNoNumber" style="font-size:0.75rem; color:var(--muted); margin:0.4rem 0 0;">CRs and canteens don't get room numbers.</p>
                <!-- Offices/classrooms sometimes genuinely have no signage
                     either (e.g. a stairwell mistakenly filed as a
                     classroom) — that's an edge case worth a togglable
                     exception, unlike CR/canteen above. -->
                <label v-else style="display:flex; align-items:center; gap:0.4rem; margin-top:0.4rem; font-size:0.75rem; font-weight:500; color:var(--muted); cursor:pointer;">
                  <input v-model="form.noSignage" type="checkbox" style="width:auto;">
                  No number / no signage (e.g. stairwell)
                </label>
              </div>
              <div>
                <label>Floor</label>
                <select v-model="form.floor" required :disabled="!form.building_id">
                  <option value="" disabled>{{ form.building_id ? 'Select a floor…' : 'Select a building first' }}</option>
                  <option v-for="f in floorOptions" :key="f" :value="f">{{ f }}</option>
                  <!-- Same "keep the existing value selectable" rule as room name —
                       a room filed under a floor before the building's floor count
                       was set (or was set too low) shouldn't silently lose its value. -->
                  <option v-if="form.floor && !floorOptions.includes(form.floor)" :value="form.floor">{{ form.floor }} (existing)</option>
                </select>
              </div>
            </div>

            <div class="field" v-if="form.category === 'classroom'">
              <label>Room name</label>
              <select v-model="form.room_name" required>
                <option value="" disabled>Select a type…</option>
                <option value="Lecture Room">Lecture Room</option>
                <option value="Laboratory Room">Laboratory Room</option>
                <!-- Older rooms registered before this dropdown existed (e.g. seed
                     data like "Physics Lecture Hall") won't match either option
                     above — keep the existing value selectable so editing one
                     doesn't silently blank it out. -->
                <option v-if="form.room_name && form.room_name !== 'Lecture Room' && form.room_name !== 'Laboratory Room'" :value="form.room_name">{{ form.room_name }} (existing)</option>
              </select>
            </div>
            <div class="field" v-else>
              <label>Room name</label>
              <input v-model="form.room_name" type="text" required placeholder="Treasury">
            </div>

            <div class="field" v-if="categoryHasHours">
              <label>Hours</label>
              <div class="field-row">
                <div>
                  <input v-model="form.hoursStart" type="time" aria-label="Opens">
                </div>
                <div>
                  <input v-model="form.hoursEnd" type="time" aria-label="Closes">
                </div>
              </div>

              <label style="display:flex; align-items:center; gap:0.4rem; margin-top:0.6rem; font-size:0.8125rem; font-weight:500; color:var(--muted); cursor:pointer;">
                <input v-model="form.hasLunchBreak" type="checkbox" style="width:auto;">
                Closed for lunch
              </label>
              <div v-if="form.hasLunchBreak" class="field-row" style="margin-top:0.4rem;">
                <div>
                  <input v-model="form.lunchStart" type="time" aria-label="Lunch starts">
                </div>
                <div>
                  <input v-model="form.lunchEnd" type="time" aria-label="Lunch ends">
                </div>
              </div>

              <label style="display:block; font-size:0.75rem; font-weight:600; color:var(--muted); margin:0.75rem 0 0.4rem;">Days</label>
              <div class="toggle-group">
                <button type="button" @click="form.hoursDaysPreset = 'Mon–Fri'" :class="form.hoursDaysPreset === 'Mon–Fri' ? 'is-active' : ''">Mon–Fri</button>
                <button type="button" @click="form.hoursDaysPreset = 'Mon–Sat'" :class="form.hoursDaysPreset === 'Mon–Sat' ? 'is-active' : ''">Mon–Sat</button>
                <button type="button" @click="form.hoursDaysPreset = 'Daily'" :class="form.hoursDaysPreset === 'Daily' ? 'is-active' : ''">Daily</button>
                <button type="button" @click="form.hoursDaysPreset = 'Custom'" :class="form.hoursDaysPreset === 'Custom' ? 'is-active' : ''">Custom</button>
              </div>
              <input v-if="form.hoursDaysPreset === 'Custom'" v-model="form.hoursDaysCustom" type="text" placeholder="e.g. Tue &amp; Thu only" style="margin-top:0.5rem;">

              <p v-if="composedHours" style="font-size:0.6875rem; color:#9aa79f; margin:0.5rem 0 0;">Saves as: {{ composedHours }}</p>
            </div>
            <div v-else class="no-hours-note">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="#9aa79f" stroke-width="1.6" stroke-dasharray="3 3"/></svg>
              {{ form.category === 'cr' ? 'No fixed hours for a CR.' : 'No fixed hours for classrooms/labs — class scheduling is a separate scope.' }}
            </div>

            <div class="field">
              <label>Notes (optional)</label>
              <input v-model="form.notes" type="text" placeholder="e.g. 3rd floor, past the stairwell">
            </div>
          </template>

          <div style="display:flex; align-items:center; gap:0.75rem; margin-top:0.5rem;">
            <button type="submit" :disabled="submitting || !!roomNumberError || buildingBlocksRooms" class="btn btn-primary" :class="{ 'is-loading': submitting }">
              <span v-if="submitting" class="btn-spinner"></span>{{ submitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Room') }}
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
              <span class="room-num">{{ r.room_number || 'no #' }}</span>
              <span class="room-name truncate">{{ r.room_name }}</span>
              <span class="room-type" :class="r.room_type === 'office' ? 'type-office' : 'type-classroom'">{{ { office: 'Office', classroom: 'Room', cr: 'CR', canteen: 'Canteen' }[r.category] || 'Room' }}</span>
              <button @click="startEdit(r)" class="btn-link room-action">Edit</button>
              <button @click="deleteRoom(r)" class="btn-link room-action room-delete">Delete</button>
            </div>
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
          <p>{{ editingId ? 'Saving changes…' : 'Adding room…' }}</p>
        </div>
      </div>
    </transition>
  </main>
</div>

<script src="../../Js/Admin/register-room.js"></script>

</body>
</html>
