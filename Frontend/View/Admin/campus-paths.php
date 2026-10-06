<?php
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'campus-paths';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/campus-paths.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/campus-paths.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Campus Paths</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/campus-paths.css?v=<?= $pageCssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/editor-tools.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/editor-tools.css') ?>">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container">

      <div class="page-head">
        <div>
          <h1>Campus Paths</h1>
          <p>Draw the walkways the AR ground arrow follows outdoors. {{ nodes.length }} point(s), {{ edges.length }} connection(s).</p>
        </div>
      </div>

      <div class="paths-layout">
        <div class="card map-card">
          <p class="hint">
            Tap the map to drop a point along a walkway. Tap a point, then another, to connect them
            (the second stays selected so you can keep chaining along the path). Drag a point to move it.
            Tap a line to remove it.
          </p>
          <div class="lock-bar" :class="{ 'is-locked': locked }">
            <button type="button" class="lock-btn" :class="{ on: locked }" :aria-pressed="locked ? 'true' : 'false'" @click="toggleLock">
              <span v-html="locked ? lockIcon.closed : lockIcon.open"></span>{{ locked ? 'Locked' : 'Unlocked' }}
            </button>
            <span class="lock-msg">{{ locked
              ? 'Points can\'t be added, moved, connected or deleted. You can still pan, zoom and select points.'
              : 'Editing is on. Lock the map to protect it from accidental taps.' }}</span>
          </div>
          <div ref="mapArea" class="paths-map" :class="{ 'is-locked-surface': locked }"></div>
          <div class="here-row">
            <button type="button" class="btn btn-primary" :disabled="locating || recording || locked" @click="dropHere">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px; margin-right:0.35rem;"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" stroke="currentColor" stroke-width="2"/></svg>
              {{ locating ? 'Locating…' : 'Drop a point here' }}
            </button>
            <button type="button" class="btn" :class="recording ? 'btn-rec-on' : 'btn-secondary'" :disabled="locating || locked" @click="toggleWalk">
              <span v-if="recording" class="rec-dot"></span>{{ recording ? 'Stop recording' : 'Record my walk' }}
            </button>
            <p class="hint" style="margin:0;">
              <strong>Drop a point here</strong> adds one point where you're standing. <strong>Record my walk</strong> adds the corners for you as you walk.
              Both join an existing point if you're within 6 m of one, connect to the selected point, and work with no signal (changes sync later, after you approve).
            </p>
          </div>
          <p v-if="recording || walkNote" class="hint" :class="{ 'rec-note': recording }" style="margin:0.5rem 0 0;">{{ walkNote }}</p>
          <p v-if="gpsNote" class="hint" style="margin:0.5rem 0 0;">{{ gpsNote }}</p>
        </div>

        <div class="side-col">
          <div class="card">
            <h3 class="side-title">Selected point<span v-if="selected"> · {{ labelOf(selected) }}</span></h3>
            <div v-if="!selected" class="side-empty">None. Tap a point on the map or in the list.</div>
            <div v-else>
              <div class="mono">{{ selected.lat.toFixed(6) }}, {{ selected.lng.toFixed(6) }}</div>

              <div class="field" style="margin-top:0.75rem;">
                <label for="point-name">Name</label>
                <div class="name-row">
                  <input id="point-name" v-model="nameDraft" type="text" maxlength="40" :disabled="locked" @keydown.enter.prevent="renameSelected">
                  <button type="button" class="btn btn-secondary" :disabled="locked" @click="renameSelected">Rename</button>
                </div>
                <p v-if="nameError" class="name-error">{{ nameError }}</p>
              </div>

              <div class="field">
                <label>Type</label>
                <select :value="selected.node_type" :disabled="locked" @change="changeType($event.target.value)">
                  <option value="junction">Junction (turn / fork)</option>
                  <option value="gate">Gate</option>
                  <option value="entrance">Building entrance</option>
                </select>
              </div>

              <div class="field">
                <label>Entrance of building</label>
                <select :value="entranceBuildingId" :disabled="locked" @change="setEntrance($event.target.value)">
                  <option value="">— none —</option>
                  <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <p class="hint" style="margin:0.4rem 0 0;">The route to that building ends at this point.</p>
              </div>

              <div class="side-actions">
                <button type="button" class="btn btn-secondary" @click="select(null)">Deselect</button>
                <button type="button" class="btn-link danger" :disabled="locked" @click="deleteSelected">Delete point</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="pts-head">
              <h3 class="side-title">Points ({{ pointList.length }})</h3>
              <button type="button" class="btn-remove-all" :disabled="locked || !pointList.length" @click="removeAll">Remove all</button>
            </div>
            <div v-if="undo" class="undo-bar" role="status">
              <span>{{ undo.label }}</span>
              <button type="button" @click="undoLast">Undo</button>
              <button type="button" class="undo-x" aria-label="Dismiss" @click="undo = null">&times;</button>
            </div>
            <p v-if="!pointList.length" class="side-empty">No points yet. Tap the map to add Point A.</p>
            <div v-else class="points-list" role="list">
              <button v-for="p in pointList" :key="p.id" type="button" role="listitem" class="pt-row" :class="{ sel: String(p.id) === String(selectedId) }" @click="focusNode(p.id)">
                <span class="pt-badge" :class="p.type">{{ p.short }}</span>
                <span class="pt-main">
                  <span class="pt-name">{{ p.name }}<span v-if="p.pending" class="pt-pend">not synced</span></span>
                  <span class="pt-sub">{{ p.typeLabel }}<template v-if="p.entranceOf"> · entrance of {{ p.entranceOf }}</template> · <template v-if="p.links.length">to {{ p.links.join(', ') }}</template><template v-else>not connected</template></span>
                  <span class="pt-coords mono">{{ p.lat.toFixed(5) }}, {{ p.lng.toFixed(5) }}</span>
                </span>
              </button>
            </div>
          </div>

          <div class="card">
            <h3 class="side-title">Buildings</h3>
            <div v-for="b in buildings" :key="b.id" class="bld-row">
              <span class="dot" :class="b.entrance_node_id ? 'dot-green' : 'dot-amber'"></span>
              <span class="bld-name truncate">{{ b.name }}</span>
              <button v-if="b.entrance_node_id" type="button" class="btn-link" @click="focusNode(b.entrance_node_id)">Entrance: {{ nodeNames.get(String(b.entrance_node_id)) || 'set' }}</button>
              <span v-else class="side-empty" style="margin:0;">no entrance</span>
            </div>
            <p v-if="buildings.length === 0" class="side-empty">No buildings registered yet.</p>
          </div>
        </div>
      </div>

    </div>
  </main>
</div>

<script src="../../Js/Include/point-names.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/point-names.js') ?>"></script>
<script src="../../Js/Include/editor-lock.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/editor-lock.js') ?>"></script>
<script src="../../Js/Admin/campus-paths.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
