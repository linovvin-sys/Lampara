<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
require_once __DIR__ . '/../../../Backend/_auth.php';
// This page now runs inside the Buildings workspace; opened on its own it forwards there.
if (!isset($_GET['embed'])) {
    $edit = (int) ($_GET['edit'] ?? 0);
    header('Location: buildings.php?' . ($edit ? 'b=' . $edit . '&tab=details' : 'new=1'));
    exit;
}
$activeNav = 'building-edit';
$workspace = 'building';
$pageTitle = 'Building editor';
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
          <h1>Building editor</h1>
          <p>Register a building, its floors and floor plans, and walkable paths.</p>
        </div>
        <a class="btn btn-secondary" href="../Public/map.php" target="_blank" rel="noopener">Preview as student</a>
      </div>

        <div id="building-app" v-cloak>
          <div class="admin-container narrow u-57ce1f">
            <div class="edit-banner" :class="{ 'is-editing': editingId }" role="status">
              <div class="edit-banner-text">
                <strong>{{ editingId ? 'Editing ' + (form.name || 'building') : 'Registering a new building' }}</strong>
                <span>{{ editingId ? "Change the details, then save. Other buildings stay as they are." : 'Pin it on the map and give it a name. Works offline: changes are saved on this device and synced later. Rooms are added separately.' }}</span>
              </div>
              <div v-if="editingId" class="edit-banner-actions">
                <button type="button" class="btn btn-secondary" @click="tryCancel">Cancel edit</button>
              </div>
            </div>

            <div class="form-grid">
              <form @submit.prevent="submitBuilding" class="card">
                <div class="bform">
                  <div class="bform-main">
                <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1.2"/></svg>Basic Info</div>
                <div class="field">
                  <label>Building name</label>
                  <input v-model="form.name" type="text" required placeholder="e.g. Main Building">
                </div>

                <button type="button" @click="captureLocation" class="btn btn-secondary geo-btn">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#2e3192" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" stroke="#2e3192" stroke-width="1.8"/></svg>
                  Capture My Current Location
                </button>
                <p v-if="geoStatus" class="geo-status" :class="geoError ? 'geo-error' : 'geo-ok'">{{ geoStatus }}</p>

                  <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-8 7"/></svg>Photo</div>
                  <div class="photo-field" :class="{ 'is-over': photoOver }" @dragover.prevent="photoOver = true" @dragleave="photoOver = false" @drop.prevent="dropPhoto($event)">
                    <div class="photo-preview" :class="{ 'is-empty': !photoUrl }">
                      <img v-if="photoUrl" :src="'../../' + photoUrl" :alt="'Photo of ' + (form.name || 'the building')">
                      <div v-else class="photo-empty"><img src="../../assets/illustrations/empty-room.svg" alt="" width="88" height="66"><span>No photo yet</span></div>
                    </div>
                    <div class="photo-side">
                      <template v-if="editingId && !editingIsLocalOnly">
                        <p class="hint">Shown in the buildings list and the quick-edit panel. A clear picture of the front of the building works best.</p>
                        <div class="photo-actions">
                          <button type="button" class="btn btn-secondary" :disabled="photoBusy" @click="choosePhoto()">{{ photoBusy ? 'Saving…' : (photoUrl ? 'Replace photo' : 'Add a photo') }}</button>
                          <button v-if="photoUrl" type="button" class="btn-link danger" :disabled="photoBusy" @click="removePhoto">Remove</button>
                        </div>
                        <p class="hint">You can also drop a picture onto this box.</p>
                      </template>
                      <p v-else class="hint">Save the building first, then add its photo here.</p>
                    </div>
                  </div>
                <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/></svg>Capacity &amp; Numbering</div>
                <label class="open-toggle" :class="{ on: form.is_open }">
                  <input type="checkbox" v-model="form.is_open">
                  <span class="open-switch" aria-hidden="true"></span>
                  <span class="open-text"><strong>Open-type building</strong><small>One standalone building with no hallways, entry point or floor plan. It still has a building number and its rooms.</small></span>
                </label>
                <div class="field open-note" v-if="form.is_open"><p class="hint">No floors, entrance or floor plan to set up. You can still give it a building number and add its rooms with room numbers.</p></div>
                <div class="field field-row">
                  <div v-show="!form.is_open">
                    <label>Number of floors</label>
                    <input class="u-84b2dc" v-model.number="form.floor_count" type="number" min="1" step="1" required>
                  </div>
                  <div>
                    <label>Building number (optional)</label>
                    <input class="u-84b2dc" v-model.trim="form.building_number" type="text" maxlength="6" placeholder="e.g. 1, or 2-A and 2-B for two buildings that share a first digit">
                  </div>
                </div>
                <div class="field" v-show="!form.is_open">
                  <label for="entranceFloor">Entrance floor <small>(optional)</small></label>
                  <select id="entranceFloor" v-model="form.entrance_floor">
                    <option value="">Lowest floor (default)</option>
                    <option v-for="f in floorList" :key="f" :value="f">{{ f }}</option>
                  </select>
                  <p class="hint">Where people walk in. The student guide uses it for "I just arrived at the entrance".</p>
                </div>
                <p style="color: var(--muted); font-size:0.75rem; margin:-0.75rem 0 1rem;">
                  First digit of every room number in this building (e.g. Main Building = 1, so its rooms are 1101, 1204… and may carry a section, like 1101 - A). Leave blank for buildings with no numbered rooms.
                </p>

                <div v-if="nearbyWarnings.length" class="tinted-card warn-card">
                  <div class="u-fd5ed7">
                    <span class="dot dot-amber"></span>
                    <h3 class="u-4e9d62">Close to {{ nearbyWarnings.length > 1 ? 'other buildings' : 'another building' }}</h3>
                  </div>
                  <p v-for="w in nearbyWarnings" :key="w.id" style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0 0 0.35rem;">
                    <strong style="color: var(--fg, #1a1a1a);">{{ w.name }}</strong> is only {{ w.distance }}m away — visitors standing nearby may get the wrong building labeled. Consider spacing GPS points further apart, or double-check both points are accurate.
                  </p>
                </div>

                <div class="field-divider u-5a7715"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-3-6 3Z"/></svg>Description</div>
                <div class="field">
                  <label>Description (optional — general, not room-specific)</label>
                  <textarea v-model="form.directory" rows="4" placeholder="Describe the building: what it is used for, general facts that are not tied to one room."></textarea>
                </div>

                  </div>
                  <div class="bform-map">
                <div class="field-divider u-5a7715"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg>Location</div>
                <p class="pick-hint">Tap the map to pin the building, then drag the pin to fine-tune. The map is the campus topo export.</p>
                <div class="pick-map-wrap">
                  <div ref="pickMap" class="pick-map" role="application" aria-label="Map for pinning the building"></div>
                </div>
                <div class="pick-bar">
                  <p class="pick-status" :class="{ 'is-set': hasPin }">
                    <template v-if="hasPin">Pinned at {{ Number(form.lat).toFixed(6) }}, {{ Number(form.lng).toFixed(6) }}</template>
                    <template v-else>No pin yet &mdash; tap the map where the building is.</template>
                  </p>
                  <button v-if="hasPin" type="button" class="pick-remove" @click="clearPin">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/></svg>
                    Remove pin
                  </button>
                </div>

                  </div>
                </div>
                <div class="form-actions">
                  <button type="submit" :disabled="submitting" class="btn btn-primary" :class="{ 'is-loading': submitting }">
                    <span v-if="submitting" class="btn-spinner"></span>{{ submitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Register Building') }}
                  </button>
                  <button v-if="editingId" type="button" @click="tryCancel" class="btn-link u-1957f0">Cancel</button>
                  <span v-if="dirty && !submitting" class="dirty-note"><span class="dirty-dot"></span>Unsaved changes</span>
                </div>
              </form>

              <div style="display:flex; flex-direction:column; gap:1.25rem;">
                <div class="tinted-card">
                  <div class="u-fd5ed7">
                    <span class="dot dot-green"></span>
                    <h3 class="u-4e9d62">Why this matters</h3>
                  </div>
                  <p class="u-2565fb">
                    The AI chat only answers from facts registered here and per-room — it will refuse
                    ("I don't have that information") rather than guess. After registering the building,
                    add its rooms individually on the <a href="room-edit.php">Rooms page</a>.
                  </p>
                </div>

                <div v-if="setup" class="card setup-card">
                  <div class="card-head"><h3 class="section-title">Setup progress</h3><span class="pill" :class="setup.done === setup.total ? 'pill-ok' : 'pill-blue'">{{ setup.done }} of {{ setup.total }}</span></div>
                  <div class="steps-bar" role="img" :aria-label="setup.done + ' of ' + setup.total + ' steps done'"><span v-for="st in setup.steps" :key="st.key" class="sb" :class="st.done ? 'done' : (setup.next && setup.next.label === st.label ? 'now' : '')"></span></div>
                  <ol class="setup-steps">
                    <li v-for="(st, i) in setup.steps" :key="st.key" :class="{ done: st.done, now: !st.done && setup.next && setup.next.label === st.label }">
                      <span class="ss-dot" aria-hidden="true">{{ st.done ? '✓' : i + 1 }}</span>
                      <span v-if="st.done"><span class="sr-only">Done: </span>{{ st.label }}</span>
                      <a v-else :href="st.href">{{ st.label }}</a>
                    </li>
                  </ol>
                </div>

                <div class="quick-nav">
                  <h3 class="section-title">Registered Buildings ({{ buildings.length }})</h3>
                  <div class="card quick-list">
                    <div v-if="!loaded" aria-hidden="true">
                      <div v-for="n in 4" :key="'sk' + n" class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div>
                    </div>
                    <div v-else-if="buildings.length === 0" class="empty-state">None yet — add one with the form.</div>
                    <div v-for="b in buildings" :key="b.id" class="quick-row" :class="{ 'is-current': editingId === b.id }"
                         role="button" tabindex="0" :aria-current="editingId === b.id ? 'true' : null" @click="tryEdit(b)" @keydown.enter.self="tryEdit(b)">
                      <div class="avatar quick-avatar">{{ b.name.charAt(0) }}</div>
                      <div class="quick-text">
                        <div class="quick-name truncate">{{ b.name }}
                          <span v-if="b._pending" class="quick-pending">Not synced</span>
                        </div>
                        <div class="quick-meta">{{ b.floor_count }} floor(s) &middot; {{ b.building_number !== null ? 'Bldg #' + b.building_number : 'no bldg #' }} &middot; {{ b.room_count }} room(s)</div>
                      </div>
                      <span v-if="editingId === b.id" class="quick-editing">Editing</span>
                      <button v-else type="button" class="btn-link quick-act" @click.stop="tryEdit(b)">Edit</button>
                      <button v-if="!b._pending" type="button" class="btn-link quick-act quick-del" @click.stop="deleteBuilding(b)">Delete</button>
                    </div>
                  </div>
                </div>

                <div v-if="editingId && !editingIsLocalOnly && !form.is_open">
                  <h3 class="section-title">Floor Plans</h3>
                  <div class="card modal-trigger-card" data-modal-open="floorPlansModal" tabindex="0" role="button">
                    <div class="modal-trigger-row">
                      <div class="avatar" style="background: var(--blue-600, #2e3192); flex-shrink:0;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4V4Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 14h16M10 4v16" stroke="#fff" stroke-width="1.6"/></svg>
                      </div>
                      <div class="u-bbf715">
                        <div style="font-weight:700; font-size:0.9375rem;">Manage floor plans &amp; walkable paths</div>
                        <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0.25rem 0 0.6rem;">
                          {{ Object.keys(floorPlans).length }} of {{ floorList.length }} floor(s) have an uploaded plan. Upload photos and edit walkable-path junctions here.
                        </p>
                        <div class="floor-thumbs">
                          <div v-for="floor in floorList" :key="floor" class="floor-thumb">
                            <div class="ft-img" :class="{ 'is-none': !floorPlans[floor] }">
                              <img v-if="floorPlans[floor]" :src="'../../' + floorPlans[floor].image_path" :alt="'Plan of ' + floor">
                              <span v-else>No plan</span>
                            </div>
                            <span class="ft-name">{{ floor }}</span>
                            <span class="ft-chips">
                              <span class="ft-chip" :class="floorStatus(floor).path ? 'ok' : 'bad'">{{ floorStatus(floor).path ? 'Path' : 'No path' }}</span>
                            </span>
                          </div>
                        </div>
                      </div>
                      <svg class="modal-trigger-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="editingIsLocalOnly" class="tinted-card" style="margin-top: 1.5rem;">
              <p class="u-2565fb">
                This building was saved on this device and hasn't synced yet. Floor plans and walkable paths can be added once it has synced.
              </p>
            </div>

            <teleport to="body">
              <div class="modal-overlay" data-modal="floorPlansModal" aria-hidden="true">
                <div class="modal-backdrop" data-modal-close="floorPlansModal"></div>
                <div class="modal-sheet modal-sheet-wide" role="dialog" aria-modal="true" aria-label="Floor plans and walkable paths">
                  <div class="modal-head">
                    <h3>Floor Plans &amp; Walkable Paths</h3>
                    <button type="button" class="modal-close" data-modal-close="floorPlansModal" aria-label="Close">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                  </div>
                  <div class="modal-body">
                <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0 0 1rem;">
                  Upload a photo of each floor's plan (an evacuation map works fine) so the scan
                  result screen can show visitors where a room is instead of only text directions.
                  Optional — floors with no plan just keep the text-only directions.
                </p>
                <div v-for="(floor, fi) in floorList" :key="floor" class="list-row" style="align-items:flex-start;" :data-dropzone="'#planfile-' + fi">
                  <div class="avatar" style="background: var(--green-600); flex-shrink:0;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4V4Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 14h16M10 4v16" stroke="#fff" stroke-width="1.6"/></svg>
                  </div>
                  <div class="u-bbf715">
                    <div style="font-weight:600; font-size:0.875rem; margin-bottom:0.4rem;">{{ floor }}</div>
                    <div v-if="floorPlans[floor]" style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                      <img :src="'../../' + floorPlans[floor].image_path" alt="" style="width:4.5rem; height:4.5rem; object-fit:cover; border-radius:0.5rem; border:1px solid var(--border, #e5e7eb);">
                      <label class="btn btn-secondary u-b3cd78">
                        Replace
                        <input class="u-cb4589" :id="'planfile-' + fi" type="file" accept="image/*" @change="uploadFloorPlan(floor, $event)">
                      </label>
                      <button type="button" @click="pathEditorFloor === floor ? closePathEditor() : openPathEditor(floor)" class="btn-secondary" style="font-size:0.75rem; border:1px solid var(--border,#e5e7eb); border-radius:0.5rem; padding:0.4rem 0.7rem; background:#fff; cursor:pointer;">
                        {{ pathEditorFloor === floor ? 'Close path editor' : 'Edit walkable paths' }}
                      </button>
                      <button type="button" @click="removeFloorPlan(floor)" class="btn-link u-615d80">Remove</button>
                    </div>
                    <label v-else class="btn btn-secondary u-b3cd78" :class="{ 'is-loading': uploadingFloor === floor }">
                      <span v-if="uploadingFloor === floor" class="btn-spinner"></span>
                      {{ uploadingFloor === floor ? 'Uploading…' : 'Upload plan' }}
                      <input class="u-cb4589" :id="'planfile-' + fi" type="file" accept="image/*" :disabled="uploadingFloor === floor" @change="uploadFloorPlan(floor, $event)">
                    </label>

                    <div class="u-1c0307" v-if="pathEditorFloor === floor">
                      <p class="u-32e0ef">
                        Tap empty space to drop a junction along a corridor. Tap one junction, then another, to connect them. Tap a connection line to remove it.
                        <span v-if="selectedNodeId !== null" style="color:#b45309; font-weight:600;"> — junction selected: tap another to connect, or use the × button on it to delete.</span>
                      </p>
                      <div class="lock-bar" :class="{ 'is-locked': pathLocked }">
                        <span class="lock-icon" aria-hidden="true" v-html="pathLocked ? lockIcon.closed : lockIcon.open"></span>
<div class="lock-text"><strong>{{ pathLocked ? 'Editing is locked' : 'Editing is on' }}</strong>
<span class="lock-msg">{{ pathLocked
                          ? 'Points and connections can\'t be added, connected or deleted. You can still select points and scroll.'
                          : 'Editing is on: drag a point to move it. Lock the editor to protect it from accidental taps.' }}</span></div>
<button type="button" class="lock-btn" :class="{ on: pathLocked }" @click="toggleLock">{{ pathLocked ? 'Unlock to edit' : 'Lock editing' }}</button>
                        
                      </div>
                      <div class="path-editor-grid">
                      <div style="min-width:0;">
                      <div @click.self="addPathNode" :class="{ 'is-locked-surface': pathLocked }" style="position:relative; cursor:crosshair; border-radius:0.6rem; overflow:hidden; border:1px solid var(--border,#e5e7eb); user-select:none;">
                        <img class="u-0e7a4e" :src="'../../' + floorPlans[floor].image_path" :alt="'Floor plan for ' + floor + ' with the walkable path drawn over it'">
                        <svg style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;">
                          <line v-for="edge in pathEdges" :key="edge.id"
                                :x1="(pathNodes.find(n => n.id === edge.node_a_id) || {}).x + '%'"
                                :y1="(pathNodes.find(n => n.id === edge.node_a_id) || {}).y + '%'"
                                :x2="(pathNodes.find(n => n.id === edge.node_b_id) || {}).x + '%'"
                                :y2="(pathNodes.find(n => n.id === edge.node_b_id) || {}).y + '%'"
                                stroke="#2e3192" stroke-width="2" :style="{ pointerEvents: pathLocked ? 'none' : 'stroke', cursor: 'pointer' }" @click="deleteEdge(edge)" />
                        </svg>
                        <div v-for="node in pathNodes" :key="node.id" @click.stop="selectNode(node)" @pointerdown="startDrag(node, $event)"
                             :style="{ position: 'absolute', left: node.x + '%', top: node.y + '%', transform: 'translate(-50%, -50%)', width: '14px', height: '14px', borderRadius: '999px', background: selectedNodeId === node.id ? '#ffd100' : '#2e3192', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)', cursor: pathLocked ? 'pointer' : 'grab', touchAction: pathLocked ? 'auto' : 'none' }">
                          <span class="cp-pt-label" style="position:absolute; left:50%; bottom:100%; transform:translate(-50%, -1px); pointer-events:none;">{{ pointShort(node) }}</span>
                        </div>
                        <button v-if="selectedNodeId !== null && !pathLocked" type="button" @click.stop="deleteSelectedNode"
                                :style="{ position: 'absolute', left: (pathNodes.find(n => n.id === selectedNodeId) || {}).x + '%', top: (pathNodes.find(n => n.id === selectedNodeId) || {}).y + '%', transform: 'translate(6px, -26px)' }"
                                style="width:22px; height:22px; border-radius:999px; background:#ff0000; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.3); color:#fff; font-size:13px; line-height:1; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
                          ×
                        </button>
                      </div>
                      </div>

                      <aside class="path-side">
                        <div class="pts-head">
                          <h4 class="side-title u-e3b1d6">Points ({{ pathPointList.length }})</h4>
                          <button type="button" class="btn-remove-all" :disabled="pathLocked || !pathPointList.length" @click="removeAllPathNodes">Remove all</button>
                        </div>
                        <p class="sr-only" role="status" aria-live="polite">{{ pathLive }}</p>
                        <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:0.4rem 0.7rem; margin-bottom:0.6rem;" :disabled="pathLocked" @click="addPathNodeAtCenter">Add point at plan centre</button>
                        <div v-if="pathUndo" class="undo-bar" role="status">
                          <span>{{ pathUndo.label }}</span>
                          <button type="button" @click="undoPathDelete" title="Undo (Ctrl+Z)">Undo</button>
                          <button type="button" class="undo-x" aria-label="Dismiss" @click="pathUndo = null">&times;</button>
                        </div>
                        <p class="u-fc2c90" v-if="!pathPointList.length">No points yet. Tap the plan to add Point A.</p>
                        <div v-else class="points-list" role="list">
                          <button v-for="p in pathPointList" :key="p.id" type="button" role="listitem" class="pt-row" :class="{ sel: p.id === selectedNodeId }" @click="selectFromList(p.id)">
                            <span class="pt-badge">{{ p.short }}</span>
                            <span class="pt-main">
                              <span class="pt-name">{{ p.name }}</span>
                              <span class="pt-sub"><template v-if="p.links.length">to {{ p.links.join(', ') }}</template><template v-else>not connected</template></span>
                            </span>
                          </button>
                        </div>
                        <div v-if="selectedNodeId !== null" style="margin-top:0.7rem;">
                          <label for="path-point-name" style="display:block; font-size:0.75rem; font-weight:600; color:var(--muted); margin-bottom:0.3rem;">Name</label>
                          <div class="name-row">
                            <input id="path-point-name" v-model="pathNameDraft" type="text" maxlength="40" :disabled="pathLocked" @keydown.enter.prevent="renamePathNode">
                            <button type="button" class="btn btn-secondary u-6196eb" :disabled="pathLocked" @click="renamePathNode">Rename</button>
                          </div>
                          <p v-if="pathNameError" class="name-error">{{ pathNameError }}</p>
                          <label class="u-a54822" for="path-connect-to">Connect to</label>
                          <select id="path-connect-to" :disabled="pathLocked" @change="connectPathTo($event.target.value); $event.target.value = ''">
                            <option value="">Choose a point…</option>
                            <option v-for="p in pathPointList.filter(x => x.id !== selectedNodeId)" :key="p.id" :value="p.id">{{ p.name }}</option>
                          </select>
                          <span class="u-a54822" id="path-nudge-label">Move this point</span>
                          <div class="nudge-pad" role="group" aria-labelledby="path-nudge-label">
                            <button type="button" class="btn btn-secondary" :disabled="pathLocked" aria-label="Move up" @click="nudgePath('n', 0.5)">&uarr;</button>
                            <button type="button" class="btn btn-secondary" :disabled="pathLocked" aria-label="Move left" @click="nudgePath('w', 0.5)">&larr;</button>
                            <button type="button" class="btn btn-secondary" :disabled="pathLocked" aria-label="Move down" @click="nudgePath('s', 0.5)">&darr;</button>
                            <button type="button" class="btn btn-secondary" :disabled="pathLocked" aria-label="Move right" @click="nudgePath('e', 0.5)">&rarr;</button>
                          </div>
                          <p class="u-f2993c">Keyboard: Alt+Arrow moves it (Shift for more), Delete removes, Esc deselects.</p>
                        </div>
                      </aside>
                      </div>

                      <div v-if="selectedNodeId !== null" style="margin-top:0.6rem; padding:0.6rem 0.75rem; background:#fffbeb; border:1px solid #fff3b8; border-radius:0.5rem;">
                        <p style="font-size:0.75rem; font-weight:600; color:#92400e; margin:0 0 0.4rem;">Connections to other floors (stairs/elevator)</p>
                        <div v-if="crossLinks.length" style="display:flex; flex-direction:column; gap:0.3rem; margin-bottom:0.5rem;">
                          <div v-for="link in crossLinks" :key="link.edgeId" style="display:flex; align-items:center; justify-content:space-between; font-size:0.75rem; color:#78350f;">
                            <span>↕ {{ link.floor }}</span>
                            <button type="button" @click="unlinkCrossFloor(link)" class="btn-link" style="font-size: 0.75rem; color: var(--red-600);">Remove</button>
                          </div>
                        </div>
                        <p v-else style="font-size:0.75rem; color:#a16207; margin:0 0 0.5rem;">Not connected to any other floor yet.</p>
                        <button type="button" @click="openCrossFloorPicker" :disabled="pathLocked" class="btn btn-secondary u-150f02">+ Connect to another floor</button>

                        <div v-if="crossFloorOptions" style="margin-top:0.6rem; border-top:1px solid #fff3b8; padding-top:0.6rem;">
                          <div v-if="Object.keys(crossFloorOptions).length === 0" style="font-size:0.75rem; color:#a16207;">
                            No junctions exist on any other floor yet — add one there first (Edit walkable paths on that floor).
                          </div>
                          <div v-for="(nodes, floorName) in crossFloorOptions" :key="floorName" style="margin-bottom:0.75rem;">
                            <p style="font-size: 0.75rem; font-weight:700; color:#78350f; margin:0 0 0.3rem;">{{ floorName }}</p>
                            <div v-if="floorPlans[floorName]" style="position:relative; border-radius:0.5rem; overflow:hidden; border:1px solid #fff3b8;">
                              <img :src="'../../' + floorPlans[floorName].image_path" alt="" style="width:100%; display:block;">
                              <button v-for="n in nodes" :key="n.id" type="button" @click="linkAcrossFloors(n.id)"
                                      :style="{ position: 'absolute', left: n.x + '%', top: n.y + '%', transform: 'translate(-50%, -50%)' }"
                                      style="width:20px; height:20px; border-radius:999px; background:#0369a1; border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,0.25); cursor:pointer; padding:0;"
                                      title="Tap to link to this junction">
                              </button>
                            </div>
                            <p v-else style="font-size: 0.75rem; color:#a16207; margin:0;">No plan image found for {{ floorName }}.</p>
                          </div>
                          <button type="button" @click="closeCrossFloorPicker" class="btn-link" style="font-size: 0.75rem; color: var(--muted); margin-top:0.3rem;">Cancel</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              </div>
              </div>
            </teleport>


          </div>

          <transition name="overlay">
            <div v-if="submitting" class="loading-overlay">
              <div class="loading-card">
                <div class="loading-icon">
                  <img class="u-fa9aec" src="../../assets/logo.svg" alt="" width="25" height="25">
                </div>
                <p>{{ editingId ? 'Saving changes…' : 'Registering building…' }}</p>
              </div>
            </div>
          </transition>
        </div>
    </div>
  </main>
</div>

<script src="../../Js/Include/point-names.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/point-names.js') ?>"></script>
<script src="../../Js/Include/editor-lock.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/editor-lock.js') ?>"></script>
<script src="../../Js/Include/photo-upload.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/photo-upload.js') ?>"></script>
<script src="../../Js/Include/topo-base.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/topo-base.js') ?>"></script>
<script src="../../Js/Admin/register-building.js?v=<?= filemtime(__DIR__ . '/../../Js/Admin/register-building.js') ?>"></script>
<script src="../../Js/Admin/buildings-modals.js?v=<?= filemtime(__DIR__ . '/../../Js/Admin/buildings-modals.js') ?>"></script>
</body>
</html>
