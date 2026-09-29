<?php
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'register-building';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/register-building.js');
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

      <div v-if="editingId" style="margin-top: 2.5rem;">
        <h3 class="section-title">Floor Plans</h3>
        <div class="card">
          <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0 0 1rem;">
            Upload a photo of each floor's plan (an evacuation map works fine) so the scan
            result screen can show visitors where a room is instead of only text directions.
            Optional — floors with no plan just keep the text-only directions.
          </p>
          <div v-for="floor in floorList" :key="floor" class="list-row" style="align-items:flex-start;">
            <div class="avatar" style="background: var(--green-600); flex-shrink:0;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4V4Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 14h16M10 4v16" stroke="#fff" stroke-width="1.6"/></svg>
            </div>
            <div style="flex:1; min-width:0;">
              <div style="font-weight:600; font-size:0.875rem; margin-bottom:0.4rem;">{{ floor }}</div>
              <div v-if="floorPlans[floor]" style="display:flex; align-items:center; gap:0.75rem;">
                <img :src="'../../' + floorPlans[floor].image_path" alt="" style="width:4.5rem; height:4.5rem; object-fit:cover; border-radius:0.5rem; border:1px solid var(--border, #e5e7eb);">
                <label class="btn btn-secondary" style="font-size:0.75rem; cursor:pointer;">
                  Replace
                  <input type="file" accept="image/*" style="display:none;" @change="uploadFloorPlan(floor, $event)">
                </label>
                <button type="button" @click="pathEditorFloor === floor ? closePathEditor() : openPathEditor(floor)" class="btn-secondary" style="font-size:0.75rem; border:1px solid var(--border,#e5e7eb); border-radius:0.5rem; padding:0.4rem 0.7rem; background:#fff; cursor:pointer;">
                  {{ pathEditorFloor === floor ? 'Close path editor' : 'Edit walkable paths' }}
                </button>
                <button type="button" @click="removeFloorPlan(floor)" class="btn-link" style="font-size:0.75rem; color: var(--red-600);">Remove</button>
              </div>
              <label v-else class="btn btn-secondary" style="font-size:0.75rem; cursor:pointer;" :class="{ 'is-loading': uploadingFloor === floor }">
                <span v-if="uploadingFloor === floor" class="btn-spinner"></span>
                {{ uploadingFloor === floor ? 'Uploading…' : 'Upload plan' }}
                <input type="file" accept="image/*" style="display:none;" :disabled="uploadingFloor === floor" @change="uploadFloorPlan(floor, $event)">
              </label>

              <!-- Walkable-path graph editor: click empty space to drop a
                   junction, click two junctions in a row to connect them,
                   click a connection line to delete it. This graph is what
                   pathfinding runs over to draw an actual route line on the
                   scan result screen, instead of just two disconnected pins. -->
              <div v-if="pathEditorFloor === floor" style="margin-top:0.75rem;">
                <p style="font-size:0.75rem; color:var(--muted); margin:0 0 0.5rem;">
                  Tap empty space to drop a junction along a corridor. Tap one junction, then another, to connect them. Tap a connection line to remove it.
                  <span v-if="selectedNodeId !== null" style="color:#b45309; font-weight:600;"> — junction selected: tap another to connect, or use the × button on it to delete.</span>
                </p>
                <div @click.self="addPathNode" style="position:relative; cursor:crosshair; border-radius:0.6rem; overflow:hidden; border:1px solid var(--border,#e5e7eb); user-select:none;">
                  <img :src="'../../' + floorPlans[floor].image_path" alt="" style="width:100%; display:block; pointer-events:none;">
                  <svg style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;">
                    <line v-for="edge in pathEdges" :key="edge.id"
                          :x1="(pathNodes.find(n => n.id === edge.node_a_id) || {}).x + '%'"
                          :y1="(pathNodes.find(n => n.id === edge.node_a_id) || {}).y + '%'"
                          :x2="(pathNodes.find(n => n.id === edge.node_b_id) || {}).x + '%'"
                          :y2="(pathNodes.find(n => n.id === edge.node_b_id) || {}).y + '%'"
                          stroke="#16a34a" stroke-width="2" style="pointer-events:stroke; cursor:pointer;" @click="deleteEdge(edge)" />
                  </svg>
                  <div v-for="node in pathNodes" :key="node.id" @click.stop="selectNode(node)"
                       :style="{ position: 'absolute', left: node.x + '%', top: node.y + '%', transform: 'translate(-50%, -50%)', width: '14px', height: '14px', borderRadius: '999px', background: selectedNodeId === node.id ? '#f59e0b' : '#16a34a', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)', cursor: 'pointer' }">
                  </div>
                  <!-- Delete button lives right on the selected node itself —
                       a link buried in a sentence above the image was easy to
                       miss and didn't read as an actionable control. -->
                  <button v-if="selectedNodeId !== null" type="button" @click.stop="deleteSelectedNode"
                          :style="{ position: 'absolute', left: (pathNodes.find(n => n.id === selectedNodeId) || {}).x + '%', top: (pathNodes.find(n => n.id === selectedNodeId) || {}).y + '%', transform: 'translate(6px, -26px)' }"
                          style="width:22px; height:22px; border-radius:999px; background:#dc2626; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.3); color:#fff; font-size:13px; line-height:1; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
                    ×
                  </button>
                </div>

                <!-- Stairs/elevator links to OTHER floors — invisible on this
                     floor's own image (the other end is a different picture
                     entirely), so this is the only place to see/manage them.
                     This is what lets a route span more than one floor plan. -->
                <div v-if="selectedNodeId !== null" style="margin-top:0.6rem; padding:0.6rem 0.75rem; background:#fffbeb; border:1px solid #fde68a; border-radius:0.5rem;">
                  <p style="font-size:0.75rem; font-weight:600; color:#92400e; margin:0 0 0.4rem;">Connections to other floors (stairs/elevator)</p>
                  <div v-if="crossLinks.length" style="display:flex; flex-direction:column; gap:0.3rem; margin-bottom:0.5rem;">
                    <div v-for="link in crossLinks" :key="link.edgeId" style="display:flex; align-items:center; justify-content:space-between; font-size:0.75rem; color:#78350f;">
                      <span>↕ {{ link.floor }}</span>
                      <button type="button" @click="unlinkCrossFloor(link.edgeId)" class="btn-link" style="font-size:0.7rem; color: var(--red-600);">Remove</button>
                    </div>
                  </div>
                  <p v-else style="font-size:0.75rem; color:#a16207; margin:0 0 0.5rem;">Not connected to any other floor yet.</p>
                  <button type="button" @click="openCrossFloorPicker" class="btn btn-secondary" style="font-size:0.75rem; padding:0.35rem 0.6rem;">+ Connect to another floor</button>

                  <div v-if="crossFloorOptions" style="margin-top:0.6rem; border-top:1px solid #fde68a; padding-top:0.6rem;">
                    <div v-if="Object.keys(crossFloorOptions).length === 0" style="font-size:0.75rem; color:#a16207;">
                      No junctions exist on any other floor yet — add one there first (Edit walkable paths on that floor).
                    </div>
                    <div v-for="(nodes, floorName) in crossFloorOptions" :key="floorName" style="margin-bottom:0.75rem;">
                      <p style="font-size:0.7rem; font-weight:700; color:#78350f; margin:0 0 0.3rem;">{{ floorName }}</p>
                      <!-- Shows the ACTUAL floor plan with each candidate junction
                           marked on it — a bare "(30%, 45%)" coordinate means
                           nothing to a human; seeing the dot sitting on that
                           floor's real stairwell is how you actually confirm
                           you're linking to the right spot. -->
                      <div v-if="floorPlans[floorName]" style="position:relative; border-radius:0.5rem; overflow:hidden; border:1px solid #fde68a;">
                        <img :src="'../../' + floorPlans[floorName].image_path" alt="" style="width:100%; display:block;">
                        <button v-for="n in nodes" :key="n.id" type="button" @click="linkAcrossFloors(n.id)"
                                :style="{ position: 'absolute', left: n.x + '%', top: n.y + '%', transform: 'translate(-50%, -50%)' }"
                                style="width:20px; height:20px; border-radius:999px; background:#0369a1; border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,0.25); cursor:pointer; padding:0;"
                                title="Tap to link to this junction">
                        </button>
                      </div>
                      <p v-else style="font-size:0.6875rem; color:#a16207; margin:0;">No plan image found for {{ floorName }}.</p>
                    </div>
                    <button type="button" @click="closeCrossFloorPicker" class="btn-link" style="font-size:0.7rem; color: var(--muted); margin-top:0.3rem;">Cancel</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
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

<script src="../../Js/Admin/register-building.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
