<?php
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
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=2">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=2">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=2">
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
<script src="../../Js/Include/campus-bounds.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/campus-bounds.js') ?>"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
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
          <p class="hint">
            Tap the map to drop a point along a walkway. Tap a point, then another, to connect them
            (the second stays selected so you can keep chaining along the path). Drag a point to move it.
            Tap a line to remove it.
          </p>
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
              <button type="button" class="btn btn-secondary" :disabled="!viewFrom && !viewTo" @click="swapView" title="Swap start and end">&#8646;</button>
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
          <div ref="mapArea" class="paths-map" :class="{ 'is-locked-surface': locked }" aria-label="Campus walkway map. Use the buttons below and the Selected point panel to edit without a mouse."></div>
          <p class="sr-only" role="status" aria-live="polite">{{ liveMsg }}</p>
          <div class="here-row ctl-groups">
            <div class="ctl-group" role="group" aria-labelledby="grpAdd"><span class="ctl-title" id="grpAdd">Add points</span><div class="ctl-buttons">
            <button type="button" class="btn" :class="locked ? 'btn-secondary' : 'btn-primary'" :disabled="locating || recording || locked" @click="dropHere">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style="vertical-align:-2px; margin-right:0.35rem;"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" stroke="currentColor" stroke-width="2"/></svg>
              {{ locating ? 'Locating…' : 'Drop a point here' }}
            </button>
            <button type="button" class="btn btn-secondary" :disabled="locked" @click="addAtCenter">Add point at map centre</button>
            <button type="button" class="btn btn-secondary" :disabled="locating || recording || locked" @click="captureLocation">
              {{ locating ? 'Locating…' : 'Capture my location' }}
            </button>
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
                <div class="name-row">
                  <input id="point-name" v-model="nameDraft" type="text" maxlength="40" :disabled="locked" @keydown.enter.prevent="renameSelected">
                  <button type="button" class="btn btn-secondary" :disabled="locked" @click="renameSelected">Rename</button>
                </div>
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
                <p class="hint u-d93599">The route to that building ends at this point.</p>
              </div>

              <div class="side-actions">
                <button type="button" class="btn btn-secondary" @click="select(null)">Deselect</button>
                <button type="button" class="btn-link danger" :disabled="locked" @click="deleteSelected">Delete point</button>
              </div>
            </div>
          </div>

          <!-- Outdoor AR anchors — one QR per gate/junction/entrance, so a
               student who skips the main gate can still scan whichever
               outdoor node they actually pass to fix their starting
               position instead of trusting GPS alone near buildings. -->
          <div class="tinted-card" style="padding:0.9rem 1rem;">
            <p class="u-c7d2f6">Outdoor AR anchors ({{ campusAnchors.length }})</p>

            <p class="u-32e0ef" v-if="!campusAnchors.length">
              None yet. Select a point on the map — a gate, junction, or entrance — and set it as an AR anchor. Add one at every spot students actually enter from, not just the main gate.
            </p>

            <div v-for="(a, i) in campusAnchors" :key="a.id" style="padding:0.6rem 0;" :style="{ borderTop: i > 0 ? '1px solid var(--line, #e5e7eb)' : 'none' }">
              <p style="font-size:0.75rem; color:var(--muted); margin:0 0 0.4rem;">
                <button type="button" class="btn-link" style="font-size:0.75rem; padding:0;" @click="focusNode(a.campus_node_id)"><strong>{{ a.label || 'this point' }}</strong></button>
              </p>
              <div class="u-a6db54">
                <button type="button" class="btn btn-secondary u-6196eb" @click="showCampusQr(a)">View / print</button>
                <button type="button" class="btn-link u-615d80" @click="removeCampusQr(a)">Remove</button>
              </div>
              <!-- Which way a person faces while scanning the sign. With this the AR guide
                   lines the paths up the instant the QR is scanned; without it, only the
                   position is fixed. -->
              <div style="margin-top:0.6rem;">
                <p style="font-size:0.75rem; font-weight:700; color:var(--ink); margin:0 0 0.25rem;">
                  Direction faced when scanning:
                  <span v-if="a.scan_heading != null">{{ a.scan_heading }}°</span>
                  <span v-else style="color:var(--red-600);">not set</span>
                </p>
                <template v-if="pickingDirectionFor !== a.id">
                  <button type="button" class="btn btn-primary" style="font-size:0.75rem; padding:0.45rem 0.8rem;" @click="startPickDirection(a)">
                    {{ a.scan_heading != null ? 'Change direction' : 'Set direction' }}
                  </button>
                  <p style="font-size: 0.75rem; color:var(--muted); margin:0.35rem 0 0;">Then tap the map where the sign is. That's it.</p>
                </template>
                <template v-else>
                  <p style="font-size:0.8rem; font-weight:700; color:var(--ink); margin:0 0 0.35rem;">Now tap the map where the sign is.</p>
                  <button type="button" class="btn-link" style="font-size:0.75rem;" @click="pickingDirectionFor = null">Cancel</button>
                </template>
                <div style="display:flex; gap:0.4rem; align-items:center; margin-top:0.4rem;">
                  <input type="number" min="0" max="359.99" step="1" v-model="headingDrafts[a.id]" placeholder="or type degrees (optional)" style="font-size:0.75rem; flex:1; padding:0.35rem 0.5rem;">
                  <button type="button" class="btn btn-secondary u-150f02" @click="saveHeadingDraft(a)">Save</button>
                </div>
              </div>
            </div>

            <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:0.4rem 0.7rem; margin-top:0.75rem;" :disabled="selectedId === null || qrBusy || !!selectedAnchor" @click="setCampusQr">
              {{ qrBusy ? 'Generating…' : (selectedAnchor ? 'Selected point already has an anchor' : (selectedId === null ? 'Select a point first' : 'Set selected point as AR anchor')) }}
            </button>
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
            <div v-else class="points-list" role="list">
              <button v-for="p in listPoints" :key="p.id" type="button" role="listitem" class="pt-row" :class="{ sel: String(p.id) === String(selectedId) }" @click="focusNode(p.id)">
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
              <span v-else class="side-empty u-1386d5">no entrance</span>
            </div>
            <p v-if="buildings.length === 0" class="side-empty">No buildings registered yet.</p>
          </div>
        </div>
      </div>

      <teleport to="body">
        <div class="modal-overlay" :class="{ 'is-open': showingCampusQr }" :aria-hidden="!showingCampusQr">
          <div class="modal-backdrop" @click="showingCampusQr = false"></div>
          <div class="modal-sheet" style="text-align:center;" role="dialog" aria-modal="true" aria-label="Outdoor AR anchor QR">
            <div class="modal-head">
              <h3>Outdoor AR anchor</h3>
              <button type="button" class="modal-close" @click="showingCampusQr = false" aria-label="Close">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
              </button>
            </div>
            <div class="modal-body u-82c013">
              <div class="qr-print-canvas" ref="qrCanvas"></div>
              <p class="u-2565fb">
                Print this and post it at <strong>{{ qrModalAnchor ? (qrModalAnchor.label || 'this spot') : '' }}</strong>. Scanning it when starting the outdoor AR guide sets the exact starting anchor instead of relying on GPS alone.
              </p>
            </div>
            <div class="modal-foot">
              <button type="button" class="btn btn-primary" @click="showingCampusQr = false">Done</button>
            </div>
          </div>
        </div>
      </teleport>

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
