<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
require_once __DIR__ . '/../../../Backend/_auth.php';
// This page now runs inside the Buildings workspace; opened on its own it forwards there.
if (!isset($_GET['embed'])) {
    $b = (int) ($_GET['building'] ?? 0);
    $r = (int) ($_GET['room'] ?? 0);
    if (!$b && $r) {
        require_once __DIR__ . '/../../../Backend/config.php';
        $c = (new Database())->connect();
        $st = $c->prepare('SELECT building_id FROM rooms WHERE id = ?');
        $st->bind_param('i', $r);
        $st->execute();
        $row = $st->get_result()->fetch_row();
        $b = (int) ($row[0] ?? 0);
    }
    header('Location: buildings.php?tab=rooms' . ($b ? '&b=' . $b : '') . ($r ? '&room=' . $r : ''));
    exit;
}
$activeNav = 'room-edit';
$workspace = 'room';
$pageTitle = 'Rooms';
$needsMap = true;

include __DIR__ . '/../Include/buildings-head.php';
?>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main wide">
    <div class="admin-container">
      <a class="back-link" href="buildings.php">&larr; All buildings</a>
      <div class="page-head">
        <div>
          <h1>Rooms</h1>
          <p>Add or change a room, set its hours, and place its marker on the floor plan.</p>
        </div>
      </div>

        <div id="room-app" v-cloak>
          <div class="admin-container narrow u-57ce1f">
            <div class="rooms-workspace" :class="{ 'is-plan': viewMode === 'plan' }">

              <aside class="card room-list-panel" :class="{ 'is-plan': viewMode === 'plan' }" aria-labelledby="roomsTitle">
                <div class="rooms-head">
                  <h2 class="rooms-title" id="roomsTitle">Rooms</h2>
                  <div v-if="form.building_id" class="seg-mini" role="group" aria-label="How to show the rooms">
                    <button type="button" :class="{ on: viewMode === 'list' }" :aria-pressed="viewMode === 'list'" @click="setView('list')">List</button>
                    <button v-if="!isOpen" type="button" :class="{ on: viewMode === 'plan' }" :aria-pressed="viewMode === 'plan'" @click="setView('plan')">Floor plan</button>
                  </div>
                </div>
                <div class="field">
                  <label for="pickBuilding">Building</label>
                  <select id="pickBuilding" v-model="form.building_id" @change="onBuildingChange">
                    <option value="" disabled>Choose a building…</option>
                    <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
                  </select>
                </div>

                <template v-if="form.building_id && viewMode === 'list'">
                  <div class="field">
                    <label for="roomSearch" class="sr-only">Search rooms</label>
                    <input id="roomSearch" type="search" v-model="roomQuery" placeholder="Search by number, name or floor">
                  </div>
                  <button type="button" class="btn btn-primary rooms-add" @click="newRoom" :class="{ 'is-current': editingId === null }">+ Add a room</button>
                  <div class="rooms-tools">
                    <p class="rooms-count">{{ visibleRooms.length }} of {{ buildingRooms.length }} room(s)</p>
                    <span>
                      <button v-if="selectMode" type="button" class="link-sm" @click="selectAllShown">Select all shown</button>
                      <button type="button" class="link-sm" @click="toggleSelectMode">{{ selectMode ? 'Done' : 'Select several' }}</button>
                    </span>
                  </div>
                  <div v-if="selectMode && selected.length" class="bulk-bar" role="region" aria-label="Actions for the selected rooms">
                    <strong>{{ selected.length }} selected</strong>
                    <button type="button" class="btn btn-secondary btn-sm-pad" @click="bulk.open = !bulk.open" :aria-expanded="bulk.open">Set hours…</button>
                    <button type="button" class="btn btn-secondary btn-sm-pad is-danger" :disabled="bulk.busy" @click="bulkDelete">Delete</button>
                    <div v-if="bulk.open" class="bulk-hours">
                      <label>Opens <input type="time" v-model="bulk.start"></label>
                      <label>Closes <input type="time" v-model="bulk.end"></label>
                      <label>Days <select v-model="bulk.days"><option>Mon–Fri</option><option>Mon–Sat</option><option>Daily</option></select></label>
                      <button type="button" class="btn btn-primary btn-sm-pad" :disabled="bulk.busy || !bulk.start || !bulk.end" @click="bulkSetHours">{{ bulk.busy ? 'Applying…' : 'Apply' }}</button>
                      <p class="hint">Only offices and canteens have fixed hours. Other selected rooms are left as they are.</p>
                    </div>
                  </div>
                  <div v-if="!loaded" class="rooms-skeleton" aria-hidden="true"><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div></div>
                  <ul v-show="loaded" class="rooms-list" role="list">
                    <li v-for="r in visibleRooms" :key="r.id">
                      <label v-if="selectMode" class="rooms-row" :class="{ 'is-checked': isSelected(r.id) }">
                        <input type="checkbox" :checked="isSelected(r.id)" @change="toggleSelected(r.id)">
                        <span class="rooms-num">{{ r.room_number || '—' }}</span>
                        <span class="rooms-name">{{ r.room_name || 'Unnamed' }}<small v-if="!isOpen">{{ r.floor }}</small></span>
                      </label>
                      <button v-else type="button" class="rooms-row" :class="{ 'is-current': editingId === r.id }" :aria-current="editingId === r.id ? 'true' : null" @click="pickRoom(r.id)">
                        <img v-if="r.photo_path" class="rooms-thumb" :src="'../../' + r.photo_path" alt="">
                        <span class="rooms-num">{{ r.room_number || '—' }}</span>
                        <span class="rooms-name">{{ r.room_name || 'Unnamed' }}<small v-if="!isOpen">{{ r.floor }}</small></span>
                        <span v-if="r.closed_note" class="rooms-flag is-closed" :title="r.closed_note">Closed</span>
                        <span v-if="editingId === r.id" class="rooms-flag">Editing</span>
                      </button>
                    </li>
                  </ul>
                  <p v-if="!buildingRooms.length" class="hint">No rooms in this building yet. Fill in the form to add the first one.</p>
                  <p v-else-if="!visibleRooms.length" class="hint">No rooms match &ldquo;{{ roomQuery }}&rdquo;.</p>
                </template>

                <template v-else-if="form.building_id">
                  <div class="plan-view">
                    <div v-if="planFloors.length" class="plan-tabs" role="group" aria-label="Floor">
                      <button v-for="f in planFloors" :key="f" type="button" :class="{ on: planFloor === f }" :aria-pressed="planFloor === f" @click="planFloor = f">{{ f }}</button>
                    </div>
                    <p v-if="planLoading" class="hint">Loading the plan…</p>
                    <div v-else-if="!planImage" class="plan-empty">
                      <img src="../../assets/illustrations/empty-plan.svg" alt="" width="120" height="90">
                      <strong>{{ planFloors.length ? 'No plan for this floor' : 'No floor plans yet' }}</strong>
                      <span>Upload one on the building page, then place rooms on it here.</span>
                      <a :href="'building-edit.php?edit=' + form.building_id" class="btn btn-secondary btn-sm-pad">Open the building</a>
                    </div>
                    <template v-else>
                      <div class="plan-canvas" :class="{ placing: placing }" @click="planClick($event)">
                        <img :src="'../../' + planImage.image_path" :alt="'Floor plan of ' + planFloor" draggable="false">
                        <button v-for="p in planPins" :key="p.id" type="button" class="plan-pin" :class="{ cur: p.cur }"
                                :style="{ left: p.x + '%', top: p.y + '%' }" :aria-label="p.label" :title="p.label" @click.stop="planPin(p)"><span>{{ p.short }}</span></button>
                      </div>
                      <div class="plan-bar">
                        <button type="button" class="btn btn-sm-pad" :class="placing ? 'btn-primary' : 'btn-secondary'" @click="placing = !placing" :aria-pressed="placing">
                          {{ placing ? 'Click the plan to place it (tap to cancel)' : (editingId !== null ? 'Move this room\'s marker' : 'Place the new room\'s marker') }}
                        </button>
                        <span class="hint">{{ planPins.length }} placed &middot; {{ unplacedOnFloor }} without a marker</span>
                      </div>
                      <p class="hint">Click a marker to edit that room. Markers are saved when you press Save on the room.</p>
                    </template>
                  </div>
                </template>
                <p v-else class="hint">Choose a building to see its rooms and add or edit one.</p>
              </aside>

              <section class="room-form-col" aria-label="Room details">
                <div v-if="form.building_id" class="edit-banner" :class="{ 'is-editing': editingId !== null }" role="status">
                  <div class="edit-banner-text">
                    <strong>{{ editingId !== null ? 'Editing ' + (editingRoom && editingRoom.room_number ? 'Room ' + editingRoom.room_number : (editingRoom ? editingRoom.room_name : 'room')) : 'Adding a new room' }}</strong>
                    <span>in {{ selectedBuilding ? selectedBuilding.name : 'this building' }}</span>
                    <span v-if="editingRoom && editingRoom.closed_note" class="closed-note">Closed: {{ editingRoom.closed_note }}</span>
                  </div>
                  <div v-if="editingId !== null" class="edit-banner-actions">
                    <a :href="'../Student/scan.php?room=' + editingId" class="btn btn-secondary" target="_blank" rel="noopener">Preview as student</a>
                    <button type="button" class="btn btn-secondary" @click="tryCancel">Cancel edit</button>
                    <button v-if="editingRoom && !editingRoom._pending" type="button" class="btn btn-secondary" :class="{ 'is-closed-btn': editingRoom.closed_note }" @click="toggleClosed(editingRoom)">{{ editingRoom.closed_note ? 'Reopen room' : 'Close room' }}</button>
                    <button v-if="editingRoom && !editingRoom._pending" type="button" class="btn btn-secondary room-picker-delete" @click="deleteRoom(editingRoom)">Delete room</button>
                  </div>
                </div>

                <form v-if="form.building_id" @submit.prevent="submitRoom" class="card">
                <div v-if="buildingBlocksRooms" class="tinted-card warn-card" style="margin-bottom:1rem;">
                  <p style="color:#92400e; font-size:0.8125rem; line-height:1.6; margin:0;">
                    <strong>{{ selectedBuilding.name }}</strong> was registered with no building number, meaning it doesn't have numbered rooms. If this is wrong, add a building number for it on the <a href="building-edit.php">Add / Edit Building page</a> first.
                  </p>
                </div>

                <template v-if="!buildingBlocksRooms">
                  <div class="rform"><div class="rform-col">
                  <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M4 21h16M9 12v.01"/></svg>Room Details</div>
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
                             style="font-family:'JetBrains Mono',monospace; color:var(--muted); background:#f4f6f4;">
                      <p v-if="!form.noSignage && !forcesNoNumber && (expectedPrefix || roomNumberError)" style="font-size: 0.75rem; margin:0.3rem 0 0;" :style="{ color: roomNumberError ? '#ff0000' : 'var(--muted)' }">
                        {{ roomNumberError || ('Should start with ' + expectedPrefix + ' — building ' + selectedBuilding.building_number + (isOpen ? '' : ', floor ' + floorDigit) + '. A section can follow a dash, like ' + expectedPrefix + '01 - A.') }}
                      </p>
                      <button v-if="suggestedNumber && !String(form.room_number || '').trim() && !form.noSignage && !forcesNoNumber" type="button" class="btn btn-secondary suggest-btn" @click="form.room_number = suggestedNumber">Use the next free number: {{ suggestedNumber }}</button>
                      <p v-if="roomNumberPreview && !roomNumberError" style="font-size: 0.75rem; margin:0.3rem 0 0; color:var(--green-700, #15803d); font-weight:600;">
                        Will be saved as {{ roomNumberPreview }}
                      </p>
                      <p class="u-f2993c" v-if="forcesNoNumber">CRs and canteens don't get room numbers.</p>
                      <label v-else style="display:flex; align-items:center; gap:0.4rem; margin-top:0.4rem; font-size:0.75rem; font-weight:500; color:var(--muted); cursor:pointer;">
                        <input class="u-4f1589" v-model="form.noSignage" type="checkbox">
                        No number / no signage (e.g. stairwell)
                      </label>
                    </div>
                    <div v-if="!isOpen">
                      <label>Floor</label>
                      <select v-model="form.floor" required :disabled="!form.building_id">
                        <option value="" disabled>{{ form.building_id ? 'Select a floor…' : 'Select a building first' }}</option>
                        <option v-for="f in floorOptions" :key="f" :value="f">{{ f }}</option>
                        <option v-if="form.floor && !floorOptions.includes(form.floor)" :value="form.floor">{{ form.floor }} (existing)</option>
                      </select>
                    </div>
                  </div>

                  <div class="field" v-if="form.floor && !isOpen">
                    <label>Location on floor plan (optional)</label>
                    <p class="u-fc2c90" v-if="loadingPlan">Loading plan…</p>
                    <p class="u-fc2c90" v-else-if="!currentFloorPlan">
                      <template v-if="planUnavailable">The floor plan isn't available offline. Open this page once while connected to keep a copy. The room can still be saved without a marker.</template>
                      <template v-else-if="planForNewBuilding">This building hasn't synced yet, so it has no floor plan.</template>
                      <template v-else>No plan uploaded for {{ form.floor }} yet — add one on the <a href="building-edit.php">Add / Edit Building page</a> to place a marker here.</template>
                    </p>
                    <template v-else>
                      <div class="card modal-trigger-card" data-modal-open="roomMarkerModal" tabindex="0" role="button">
                        <div class="modal-trigger-row">
                          <div class="marker-thumb">
                            <img :src="'../../' + currentFloorPlan.image_path" alt="">
                            <span v-if="form.map_x !== null && form.map_y !== null" class="marker-thumb-dot" :style="{ left: form.map_x + '%', top: form.map_y + '%' }"></span>
                          </div>
                          <div class="u-bbf715">
                            <div style="font-weight:700; font-size:0.875rem;">{{ form.map_x !== null ? 'Marker placed' : 'No marker yet' }}</div>
                            <p style="color: var(--muted); font-size:0.75rem; line-height:1.5; margin:0.2rem 0 0;">Tap to open {{ form.floor }}'s plan and place or move the pin.</p>
                          </div>
                          <button v-if="form.map_x !== null" type="button" @click.stop="clearMarker" class="btn-link u-ca0df7">Clear</button>
                          <svg class="modal-trigger-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                        </div>
                      </div>

                      <teleport to="body">
                      <div class="modal-overlay" data-modal="roomMarkerModal" aria-hidden="true">
                        <div class="modal-backdrop" data-modal-close="roomMarkerModal"></div>
                        <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Place room marker">
                          <div class="modal-head">
                            <h3>Place Marker — {{ form.floor }}</h3>
                            <button type="button" class="modal-close" data-modal-close="roomMarkerModal" aria-label="Close">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                            </button>
                          </div>
                          <div class="modal-body">
                            <div class="map-marker-frame" @click="placeMarker" style="position:relative; cursor:crosshair; border-radius:0.6rem; overflow:hidden; border:1px solid var(--border, #e5e7eb); user-select:none;">
                              <img class="u-0e7a4e" :src="'../../' + currentFloorPlan.image_path" alt="">
                              <div v-for="p in occupiedPins" :key="p.id"
                                   :style="{ position: 'absolute', left: p.map_x + '%', top: p.map_y + '%', transform: 'translate(-50%, -100%)', pointerEvents: 'none' }">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="var(--muted)" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                                <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size: 0.75rem; font-weight:700; background:#55556b; color:#fff; padding:0.05rem 0.3rem; border-radius:0.25rem; white-space:nowrap;">{{ p.room_number || p.room_name }}</span>
                              </div>
                              <div v-if="form.map_x !== null && form.map_y !== null"
                                   :style="{ position: 'absolute', left: form.map_x + '%', top: form.map_y + '%', transform: 'translate(-50%, -100%)', pointerEvents: 'none' }">
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#2e3192" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                              </div>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.6rem;">
                              <p style="font-size: 0.75rem; color:var(--muted); margin:0;">Tap the plan to place the marker. <span v-if="occupiedPins.length">Gray pins are already-placed rooms.</span></p>
                              <button v-if="form.map_x !== null" type="button" @click="clearMarker" class="btn-link u-ca0df7">Clear marker</button>
                            </div>
                          </div>
                          <div class="modal-foot">
                            <button type="button" class="btn btn-primary" data-modal-close="roomMarkerModal">Done</button>
                          </div>
                        </div>
                      </div>
                      </teleport>
                    </template>
                  </div>

                  <div class="field" v-if="form.category === 'classroom'">
                    <label>Room name</label>
                    <select v-model="nameChoice" required>
                      <option value="" disabled>Select a type…</option>
                      <option v-for="n in classroomTypes" :key="n" :value="n">{{ n }}</option>
                      <optgroup label="Other">
                        <option v-for="n in otherRoomTypes" :key="n" :value="n">{{ n }}</option>
                        <option value="__other__">Something else — type a name…</option>
                      </optgroup>
                    </select>
                    <input class="u-b83168" v-if="nameChoice === '__other__'" v-model="form.room_name" type="text" required maxlength="150"
                           placeholder="Type the room name, e.g. Prayer Room">
                  </div>
                  <div class="field" v-else>
                    <label>Room name</label>
                    <input v-model="form.room_name" type="text" required placeholder="Treasury">
                  </div>
                  <div class="field" v-if="form.category === 'cr'">
                    <label for="roomFor">Restroom for</label>
                    <select id="roomFor" v-model="form.subtitle">
                      <option value="">Not set</option>
                      <option value="Men">Men</option>
                      <option value="Women">Women</option>
                    </select>
                    <p class="hint">Students choose Men or Women when they search for a restroom. This is what they are matched on.</p>
                  </div>
                  <div class="field" v-else>
                    <label for="roomSubtitle">Subtitle <small>(optional)</small></label>
                    <input id="roomSubtitle" v-model="form.subtitle" type="text" maxlength="120" placeholder="e.g. Computer Science, 40 seats">
                    <p class="hint">Shown under the name in search, so rooms with the same name can be told apart.</p>
                  </div>

                  <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-8 7"/></svg>Photo</div>
                  <div class="photo-field" :class="{ 'is-over': photoOver }" @dragover.prevent="photoOver = true" @dragleave="photoOver = false" @drop.prevent="dropPhoto($event)">
                    <div class="photo-preview" :class="{ 'is-empty': !roomPhoto }">
                      <img v-if="roomPhoto" :src="photoSrc" :alt="'Photo of ' + (form.room_name || 'the room')" @load="$event.target.classList.toggle('is-portrait', $event.target.naturalHeight > $event.target.naturalWidth)">
                      <div v-else class="photo-empty"><img src="../../assets/illustrations/empty-room.svg" alt="" width="88" height="66"><span>No photo yet</span></div>
                    </div>
                    <div class="photo-side">
                      <p class="hint">{{ adding ? 'Add a photo now: it is saved together with the room.' : "Students see it on the room's result screen, so they know what the door or sign looks like." }}</p>
                      <div class="photo-actions">
                        <button type="button" class="btn btn-secondary" :disabled="photoBusy" @click="choosePhoto()">{{ photoBusy ? 'Saving…' : (roomPhoto ? 'Replace photo' : 'Add a photo') }}</button>
                        <button v-if="roomPhoto" type="button" class="btn-link danger" :disabled="photoBusy" @click="removePhoto">Remove</button>
                      </div>
                      <p class="hint">You can also drop a picture onto this box.</p>
                    </div>
                  </div>

                  </div><div class="rform-col">
<div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>Hours &amp; Description</div>
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
                      <input class="u-4f1589" v-model="form.hasLunchBreak" type="checkbox">
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
                    <input class="u-b83168" v-if="form.hoursDaysPreset === 'Custom'" v-model="form.hoursDaysCustom" type="text" placeholder="e.g. Tue &amp; Thu only">

                    <p v-if="composedHours" style="font-size: 0.75rem; color:var(--muted); margin:0.5rem 0 0;">Saves as: {{ composedHours }}</p>
                  </div>
                  <div v-else class="no-hours-note">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="3 3"/></svg>
                    {{ form.category === 'cr' ? 'No fixed hours for a CR.' : 'No fixed hours for classrooms/labs — class scheduling is a separate scope.' }}
                  </div>

                  <div class="field">
                    <label for="roomNotes">Description (optional)</label>
                    <input id="roomNotes" v-model="form.notes" type="text" placeholder="Describe the room or how to find it, e.g. 3rd floor, past the stairwell">
                  </div>

                  <div class="phone-preview">
                    <div class="pp-label">What students see</div>
                    <div class="phone">
                      <div class="pp-photo" :class="{ empty: !roomPhoto }">
                        <img v-if="roomPhoto" :src="photoSrc" alt="" @load="$event.target.classList.toggle('is-portrait', $event.target.naturalHeight > $event.target.naturalWidth)">
                        <img v-else src="../../assets/illustrations/empty-room.svg" alt="" aria-hidden="true">
                      </div>
                      <div class="pp-body">
                        <span class="pp-chip">{{ categoryLabel }}</span>
                        <div class="pp-num">{{ previewNumber || 'No room number' }}</div>
                        <div class="pp-name">{{ form.room_name || 'Room name' }}</div>
                        <div class="pp-meta">{{ selectedBuilding ? selectedBuilding.name : 'Building' }}<template v-if="!isOpen"> &middot; {{ form.floor || 'Floor' }}</template></div>
                        <div v-if="categoryHasHours" class="pp-line"><b>Hours</b> {{ composedHours || 'Not set yet' }}</div>
                        <div v-if="form.notes" class="pp-line">{{ form.notes }}</div>
                        <div class="pp-line pp-marker" :class="{ on: form.map_x !== null }">{{ form.map_x !== null ? 'Shown on the floor plan' : 'No marker: text directions only' }}</div>
                      </div>
                    </div>
                  </div>
                                  </div></div>
                </template>

                <div class="form-actions">
                  <button type="submit" :disabled="submitting || !!roomNumberError || buildingBlocksRooms" class="btn btn-primary" :class="{ 'is-loading': submitting }">
                    <span v-if="submitting" class="btn-spinner"></span>{{ submitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Room') }}
                  </button>
                  <button v-if="editingId" type="button" @click="tryCancel" class="btn-link u-1957f0">Cancel</button>
                  <span v-if="dirty && !submitting" class="dirty-note"><span class="dirty-dot"></span>Unsaved changes</span>
                </div>
              </form>
                <div v-else class="card empty-card">
                  <img src="../../assets/illustrations/empty-room.svg" alt="" width="130" height="98">
                  <strong>Pick a building first</strong>
                  <p>Rooms belong to a building, so choose one in the list on the left. Its rooms appear there, and you can add a new one or open an existing one to edit it.</p>
                </div>

                <details class="help-note">
                  <summary>Why room numbers, not text?</summary>
                  <p>When the AI reads a sign ("ROOM 204"), it matches that number directly against a room record, not a keyword search through a paragraph. Structured fields also power Manual Search and Nearby suggestions.</p>
                </details>
              </section>

            </div>
          </div>

          <transition name="overlay">
            <div v-if="submitting" class="loading-overlay">
              <div class="loading-card">
                <div class="loading-icon">
                  <img class="u-fa9aec" src="../../assets/logo.svg" alt="" width="25" height="25">
                </div>
                <p>{{ editingId ? 'Saving changes…' : 'Adding room…' }}</p>
              </div>
            </div>
          </transition>
        </div>
    </div>
  </main>
</div>

<script src="../../Js/Include/point-names.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/point-names.js') ?>"></script>
<script src="../../Js/Include/editor-lock.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/editor-lock.js') ?>"></script>
<script src="../../Js/Include/room-number.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/room-number.js') ?>"></script>
<script src="../../Js/Include/photo-upload.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/photo-upload.js') ?>"></script>
<script src="../../Js/Include/lockdown.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/lockdown.js') ?>"></script>
<script src="../../Js/Admin/register-room.js?v=<?= filemtime(__DIR__ . '/../../Js/Admin/register-room.js') ?>"></script>
<script src="../../Js/Admin/buildings-modals.js?v=<?= filemtime(__DIR__ . '/../../Js/Admin/buildings-modals.js') ?>"></script>
</body>
</html>
