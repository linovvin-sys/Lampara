<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
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
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= filemtime(__DIR__ . '/../../Css/skeleton.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/utilities.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/utilities.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/design-pass.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/design-pass.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/campus-paths.css?v=<?= $pageCssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/editor-tools.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/editor-tools.css') ?>">
<link rel="stylesheet" href="../../assets/vendor/leaflet/leaflet.css">
<script src="../../assets/vendor/vue.global.prod.js"></script>
<script src="../../assets/vendor/leaflet/leaflet.js"></script>
<script src="../../../Backend/api/institution.php?format=js"></script>
<script src="../../Js/Include/campus-bounds.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/campus-bounds.js') ?>"></script>
<script src="../../assets/vendor/sweetalert2/sweetalert2-11.26.25.all.min.js"></script>
<script src="../../assets/vendor/qrcodejs/qrcode.min.js"></script>
<style>
  .qr-print-canvas { display: inline-block; padding: 1rem; background: #fff; border-radius: 0.75rem; }
  .qr-print-canvas img, .qr-print-canvas canvas { display: block; }
  .modal-overlay { position: fixed; inset: 0; z-index: 60; display: flex; align-items: center; justify-content: center; padding: 1.25rem; visibility: hidden; pointer-events: none; }
  .modal-overlay.is-open { visibility: visible; pointer-events: auto; }
  .modal-backdrop { position: absolute; inset: 0; background: rgba(16, 24, 56, 0.45); backdrop-filter: blur(3px); opacity: 0; transition: opacity 220ms ease; }
  .modal-overlay.is-open .modal-backdrop { opacity: 1; }
  .modal-sheet { position: relative; background: #fff; border-radius: 1.25rem; box-shadow: 0 30px 60px -20px rgba(16,24,56,0.4); width: 100%; max-width: 24rem; display: flex; flex-direction: column; opacity: 0; transform: scale(0.95) translateY(6px); transition: opacity 200ms ease, transform 200ms ease; }
  .modal-overlay.is-open .modal-sheet { opacity: 1; transform: scale(1) translateY(0); }
  .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--line, #e3e3f0); }
  .modal-head h3 { margin: 0; font-size: 1rem; font-weight: 700; }
  .modal-close { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: 999px; border: 0; background: none; color: var(--muted, #55556b); cursor: pointer; }
  .modal-close:hover { background: var(--blue-50, #f1f1fb); }
  .modal-body { padding: 1.25rem; }
  .modal-foot { padding: 1rem 1.25rem; border-top: 1px solid var(--line, #e3e3f0); display: flex; justify-content: flex-end; }
</style>
<link rel="stylesheet" href="../../Css/Admin/fence-toggle.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/fence-toggle.css') ?>">
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container">

      <div class="page-head">
        <div>
          <h1>Campus Paths</h1>
          <p>Draw the walkways the AR ground arrow follows outdoors. {{ nodes.length }} point(s), {{ edges.length }} connection(s).</p>
        </div>
        <div class="fence-toggle" id="fenceToggle">
          <span class="ft-label"><b>Campus-only access</b><small id="ftState">Checking&hellip;</small></span>
          <button type="button" class="ft-switch" id="ftBtn" role="switch" aria-checked="false" aria-label="Only allow visitors who are on the campus"><span class="ft-knob"></span></button>
        </div>
        <a class="btn btn-secondary" href="../Public/guide-ar.php" target="_blank" rel="noopener">Preview as student</a>
      </div>

      <div class="paths-layout">
        <div class="card map-card">
          <p class="hint"><b>Tap the map</b> to add a point &middot; <b>tap two points</b> to join them &middot; <b>drag</b> to move &middot; <b>tap a line</b> to remove it.</p>
          <div class="lock-bar" :class="{ 'is-locked': locked }" :title="locked ? 'Points cannot be added, moved, connected or deleted. You can still pan, zoom and select points.' : 'Lock the map to protect it from accidental taps.'">
            <span class="lock-icon" aria-hidden="true" v-html="locked ? lockIcon.closed : lockIcon.open"></span>
<div class="lock-text"><strong>{{ locked ? 'Editing is locked' : 'Editing is on' }}</strong>
<span class="lock-msg">{{ locked
              ? 'Points can\'t be added, moved, connected or deleted. You can still pan, zoom and select points.'
              : 'Editing is on. Lock the map to protect it from accidental taps.' }}</span></div>
<button type="button" class="lock-btn" :class="{ on: locked }" @click="toggleLock">{{ locked ? 'Unlock to edit' : 'Lock editing' }}</button>
            
          </div>
          <div class="view-bar" role="group" aria-label="What the map shows">
            <label class="view-switch">
              <input type="checkbox" v-model="showNames">
              <span class="view-switch-track" aria-hidden="true"></span>
              <span>Show point names</span>
            </label>
            <label class="view-switch">
              <input type="checkbox" v-model="pathsOnly">
              <span class="view-switch-track" aria-hidden="true"></span>
              <span>Show campus paths only</span>
            </label>
            <div class="view-route">
              <label for="view-from">Show only the path from</label>
              <select id="view-from" v-model="viewFrom">
                <option value="">Everything</option>
                <optgroup label="Buildings"><option v-for="o in viewBuildings" :key="o.value" :value="o.value">{{ o.label }}</option></optgroup>
                <optgroup label="Points"><option v-for="o in viewPoints" :key="o.value" :value="o.value">{{ o.label }}</option></optgroup>
              </select>
              <label for="view-to">to</label>
              <select id="view-to" v-model="viewTo">
                <option value="">Everything</option>
                <optgroup label="Buildings"><option v-for="o in viewBuildings" :key="o.value" :value="o.value">{{ o.label }}</option></optgroup>
                <optgroup label="Points"><option v-for="o in viewPoints" :key="o.value" :value="o.value">{{ o.label }}</option></optgroup>
              </select>
              <button type="button" class="btn btn-secondary" :disabled="!viewFrom && !viewTo" @click="swapView" title="Swap start and end" aria-label="Swap start and end">&#8646; Swap</button>
              <button type="button" class="btn btn-secondary" :disabled="!viewFrom && !viewTo" @click="clearView">Show all</button>
            </div>
            <p v-if="routeView && routeView.ok" class="view-note">Showing only the path from <strong>{{ routeView.from }}</strong> to <strong>{{ routeView.to }}</strong>: {{ routeView.nodeIds.size }} point(s), {{ Math.round(routeView.length) }} m. <span v-if="routeView.via"> It goes {{ routeView.phase === 'exit' ? 'out through' : 'in through' }} <strong>{{ routeView.via }}</strong>, the same rule the AR guide uses.</span> Everything else is hidden, not deleted.</p>
            <p v-else-if="routeView" class="view-note is-warn">No connected path from <strong>{{ routeView.from }}</strong> to <strong>{{ routeView.to }}</strong>. There is a gap in the walkways between them, so everything is still shown.
              <span v-if="viewGap" class="view-gap">
                <strong>{{ viewGap.aName }}</strong> is not joined to the rest. Join it to:
                <select v-model="gapTarget" aria-label="Point to join to">
                  <option value="">{{ viewGap.choices[0].name }} (nearest, {{ viewGap.choices[0].meters }} m)</option>
                  <option v-for="c in viewGap.choices.slice(1)" :key="c.id" :value="c.id">{{ c.name }} ({{ c.meters }} m)</option>
                </select>
                <button type="button" class="btn btn-secondary view-gap-btn" :disabled="locked" @click="connectGap">Connect</button></span></p>
          </div>
          <div ref="mapArea" class="paths-map" aria-label="Campus walkway map. Use the buttons below and the Selected point panel to edit without a mouse."></div>
          <div v-if="multi" class="multi-bar" role="region" aria-label="Selected points">
            <span class="multi-count"><b>{{ pickedIds.length }}</b> selected. Tap points on the map to add or remove them.</span>
            <button type="button" class="btn btn-secondary" @click="pickInView">Select all in view</button>
            <button type="button" class="btn btn-secondary" :disabled="!pickedIds.length" @click="pickedIds = []; redraw()">Clear</button>
            <button type="button" class="btn btn-danger" :disabled="!pickedIds.length || deletingMany" @click="deleteMany">{{ deletingMany ? 'Deleting…' : 'Delete ' + pickedIds.length }}</button>
          </div>
          <p class="sr-only" role="status" aria-live="polite">{{ liveMsg }}</p>
          <div class="here-row ctl-groups">
            <div class="ctl-group" role="group" aria-labelledby="grpAdd"><span class="ctl-title" id="grpAdd">Add points</span><div class="ctl-buttons">
            <button type="button" class="btn" :class="locked ? 'btn-secondary' : 'btn-primary'" :disabled="locating || recording || locked" @click="dropHere">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px; margin-right:0.35rem;"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" stroke="currentColor" stroke-width="2"/></svg>
              {{ locating ? 'Locating…' : 'Drop a point here' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="locked" @click="addAtCenter">Add point at map centre</button>
            <button type="button" class="btn btn-secondary" :disabled="locked || smoothing" @click="smoothSharpTurns" title="Adds extra points to round off sharp corners. Your existing points stay where they are.">{{ smoothing ? 'Smoothing…' : 'Smooth sharp turns' }}</button>
            <button type="button" class="btn btn-secondary" :disabled="locating || recording || locked" @click="captureLocation">
              {{ locating ? 'Locating…' : 'Capture my location' }}
            </button>
            </div></div>
            <div class="ctl-group" role="group" aria-labelledby="grpPick"><span class="ctl-title" id="grpPick">Remove points</span><div class="ctl-buttons">
              <button type="button" class="btn" :class="multi ? 'btn-primary' : 'btn-secondary'" :aria-pressed="multi" :disabled="locked" @click="toggleMulti">{{ multi ? 'Done selecting' : 'Select several' }}</button>
            </div></div>
            <div class="ctl-group" role="group" aria-labelledby="grpWalk"><span class="ctl-title" id="grpWalk">Record a walk</span><div class="ctl-buttons">
            <button type="button" class="btn" :class="recording ? 'btn-rec-on' : 'btn-secondary'" :disabled="locating || locked" @click="toggleWalk">
              <span v-if="recording" class="rec-dot"></span>{{ recording ? 'Stop recording' : 'Record my walk' }}
            </button>
            </div></div>
            <p class="hint u-1386d5">
              <strong>Drop a point here</strong> adds one point where you're standing. <strong>Record my walk</strong> adds the corners for you as you walk.
              Both join an existing point if you're within 6 m of one, connect to the selected point, and work with no signal (changes sync later, after you approve).
            </p>
          </div>
          <p v-if="recording || walkNote" class="hint u-33b881" :class="{ 'rec-note': recording }">{{ walkNote }}</p>
          <p v-if="gpsNote" class="hint u-33b881">{{ gpsNote }}</p>
        </div>

        <div class="side-col">
          <div class="card">
            <h3 class="side-title">Selected point<span v-if="selected"> · {{ labelOf(selected) }}</span></h3>
            <div v-if="!selected" class="side-empty">None. Tap a point on the map or in the list.</div>
            <div v-else>
              <div class="mono">{{ selected.lat.toFixed(6) }}, {{ selected.lng.toFixed(6) }}</div>

              <div class="field u-1c0307">
                <label for="point-name">Name</label>
                <input id="point-name" v-model="nameDraft" type="text" maxlength="40" :disabled="locked" @keydown.enter.prevent="savePoint">
                <p v-if="nameError" class="name-error">{{ nameError }}</p>
              </div>

              <div class="field">
                <label for="connect-to">Connect to</label>
                <select id="connect-to" :disabled="locked" @change="connectSelectedTo($event.target.value); $event.target.value = ''">
                  <option value="">Choose a point…</option>
                  <option v-for="p in pointList.filter(x => String(x.id) !== String(selectedId))" :key="p.id" :value="p.id">{{ p.name }}</option>
                </select>
              </div>

              <div class="field">
                <span class="field-label" id="nudge-label">Move this point</span>
                <div class="nudge-pad" role="group" aria-labelledby="nudge-label">
                  <button type="button" class="btn btn-secondary" :disabled="locked" aria-label="Move 1 metre north" @click="nudge('n', 1)">&uarr;</button>
                  <button type="button" class="btn btn-secondary" :disabled="locked" aria-label="Move 1 metre west" @click="nudge('w', 1)">&larr;</button>
                  <button type="button" class="btn btn-secondary" :disabled="locked" aria-label="Move 1 metre south" @click="nudge('s', 1)">&darr;</button>
                  <button type="button" class="btn btn-secondary" :disabled="locked" aria-label="Move 1 metre east" @click="nudge('e', 1)">&rarr;</button>
                </div>
                <p class="hint u-d93599">1 m per press. Keyboard: Alt+Arrow (Shift for 5 m), Delete removes, Esc deselects.</p>
              </div>

              <div class="field">
                <label>Type</label>
                <select v-model="typeDraft" :disabled="locked">
                  <option value="junction">Junction (turn / fork)</option>
                  <option value="gate">Gate</option>
                  <option value="entrance">Building entrance</option>
                </select>
              </div>

              <div class="field">
                <label>Entrance of building</label>
                <select v-model="entranceDraft" :disabled="locked">
                  <option value="">— none —</option>
                  <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
                <p class="hint u-d93599">The route to that building ends at this point.</p>
              </div>

              <div class="save-bar">
                <button type="button" class="btn btn-primary" :disabled="locked || !pointDirty || savingPoint" @click="savePoint">{{ savingPoint ? 'Saving…' : 'Save point' }}</button>
                <button type="button" class="btn btn-secondary" :disabled="!pointDirty || savingPoint" @click="resetDrafts">Undo edits</button>
                <span class="save-note" role="status">{{ savedNote || (pointDirty ? 'Unsaved changes' : '') }}</span>
              </div>
              <div class="side-actions">
                <button type="button" class="btn btn-secondary" @click="select(null)">Deselect</button>
                <button type="button" class="btn-link danger" :disabled="locked" @click="deleteSelected">Delete point</button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="pts-head">
              <h3 class="side-title">Points ({{ listPoints.length }}<span v-if="listPoints.length !== pointList.length"> of {{ pointList.length }}</span>)</h3>
              <button type="button" class="btn-remove-all" :disabled="locked || !pointList.length" @click="removeAll">Remove all</button>
            </div>
            <div v-if="undo" class="undo-bar" role="status">
              <span>{{ undo.label }}</span>
              <button type="button" @click="undoLast" title="Undo (Ctrl+Z)">Undo</button>
              <button type="button" class="undo-x" aria-label="Dismiss" @click="undo = null">&times;</button>
            </div>
            <p v-if="!pointList.length" class="side-empty">No points yet. Tap the map to add Point A.</p>
            <template v-else>
              <label class="sr-only" for="jump-point">Jump to a point</label>
              <select id="jump-point" class="jump-select" :value="selectedId === null ? '' : String(selectedId)" @change="$event.target.value && focusNode($event.target.value)">
                <option value="">Jump to a point…</option>
                <option v-for="p in listPoints" :key="p.id" :value="String(p.id)">{{ p.name }} ({{ p.typeLabel }})</option>
              </select>
              <details class="dd-anim pts-dd">
                <summary>Show the full list ({{ listPoints.length }})</summary>
                <div class="dd-body"><div class="points-list is-open" role="list">
                  <button v-for="p in listPoints" :key="p.id" type="button" role="listitem" class="pt-row" :class="{ sel: String(p.id) === String(selectedId) }" @click="focusNode(p.id)">
                    <span class="pt-badge" :class="p.type">{{ p.short }}</span>
                    <span class="pt-main">
                      <span class="pt-name">{{ p.name }}<span v-if="p.pending" class="pt-pend">not synced</span></span>
                      <span class="pt-sub">{{ p.typeLabel }}<template v-if="p.entranceOf"> · entrance of {{ p.entranceOf }}</template> · <template v-if="p.links.length">to {{ p.links.join(', ') }}</template><template v-else>not connected</template></span>
                      <span class="pt-coords mono">{{ p.lat.toFixed(5) }}, {{ p.lng.toFixed(5) }}</span>
                    </span>
                  </button>
                </div></div>
              </details>
            </template>
          </div>

          <div class="card">
            <h3 class="side-title">Buildings</h3>
            <div v-for="b in buildings" :key="b.id" class="bld-row">
              <span class="dot" :class="b.entrance_node_id ? 'dot-green' : 'dot-amber'"></span>
              <span class="bld-name truncate">{{ b.name }}</span>
              <button v-if="b.entrance_node_id" type="button" class="btn-link" @click="focusNode(b.entrance_node_id)">Entrance: {{ nodeNames.get(String(b.entrance_node_id)) || 'set' }}</button>
              <span v-else class="side-empty u-1386d5">no entrance</span>
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
<script src="../../Js/Public/campus-route.js?v=<?= filemtime(__DIR__ . '/../../Js/Public/campus-route.js') ?>"></script>
<script src="../../Js/Admin/fence-toggle.js?v=<?= filemtime(__DIR__ . '/../../Js/Admin/fence-toggle.js') ?>"></script>
<script src="../../Js/Admin/campus-paths.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
