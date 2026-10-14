<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'campus-map';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/campus-map.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/campus-map.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Campus Map</title>
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
<link rel="stylesheet" href="../../Css/Admin/campus-map.css?v=<?= $pageCssVer ?>">
<script src="../../assets/vendor/vue.global.prod.js"></script>
<script src="../../assets/vendor/sweetalert2/sweetalert2-11.26.25.all.min.js"></script>
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container">

      <div class="page-head flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div>
          <h1>Campus Map</h1>
          <p>The maps students see under Campus Map on the landing page. Pick 2D or 3D to manage it.</p>
        </div>
        <a class="btn btn-secondary" href="../Public/map.php" target="_blank" rel="noopener">View as student</a>
      </div>

      <nav class="top-tabs" role="tablist" aria-label="Map type">
        <button v-for="k in kinds" :key="k.kind" type="button" role="tab" class="top-tab" :class="{ on: mkKind === k.kind }" :aria-selected="mkKind === k.kind" @click="selectTab(k.kind)">
          <svg v-if="k.kind === '2d'" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4 3 6.5v13L9 17l6 3 6-2.5v-13L15 7 9 4Z"/><path d="M9 4v13M15 7v13"/></svg>
          <svg v-else width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>
          {{ k.short }} Map
          <span class="tab-dot" :class="maps[k.kind] ? 'live' : 'empty'" :title="maps[k.kind] ? 'Uploaded' : 'Not uploaded'"></span>
        </button>
      </nav>

      <div class="map-grid">
        <section v-for="k in kinds" :key="k.kind" v-show="mkKind === k.kind" class="card map-card" role="tabpanel">
          <div class="map-card-head">
            <div>
              <h2>{{ k.label }}</h2>
            </div>
            <span v-if="maps[k.kind]" class="chip chip-live">Live</span>
            <span v-else class="chip chip-empty">Not uploaded</span>
          </div>

          <div class="preview-box" :class="{ empty: !maps[k.kind], busy: busy === k.kind }" :data-dropzone="'#file-' + k.kind">
            <span v-if="!loaded" class="sk sk-box" style="position:absolute;inset:0;border-radius:0" aria-hidden="true"></span>
            <img v-else-if="previewSrc(k.kind)" :src="previewSrc(k.kind)" :alt="k.label + ' preview'">
            <div v-else-if="maps[k.kind] && maps[k.kind].format === 'obj'" class="preview-empty obj-card">
              <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m12 2 9 5v10l-9 5-9-5V7l9-5Z"/><path d="m3 7 9 5 9-5M12 12v10"/></svg>
              <strong>3D model (.obj)</strong>
              <span>Students can rotate and zoom it.</span>
            </div>
            <div v-else-if="maps[k.kind] && maps[k.kind].format === 'pdf'" class="preview-empty">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z"/><path d="M14 3v5h5"/></svg>
              <span>PDF map</span>
            </div>
            <div v-else class="preview-empty">
              <img src="../../assets/illustrations/empty-map.svg" alt="" width="120" height="90">
              <span>No {{ k.short }} map yet</span>
              <span class="drop-hint">Drop a file here, or press Upload file</span>
            </div>
            <span v-if="maps[k.kind]" class="fmt">{{ (maps[k.kind].format || '').toUpperCase() }}</span>
            <div v-if="busy === k.kind" class="busy-overlay"><span class="spinner"></span> {{ busyText }}</div>
          </div>

          <div class="map-side">
          <div class="field">
            <label :for="'title-' + k.kind">Caption <span class="opt">(optional, shown to students)</span></label>
            <input :id="'title-' + k.kind" type="text" maxlength="100" v-model="titles[k.kind]" :placeholder="k.placeholder" @change="saveTitle(k.kind)" :disabled="!maps[k.kind]">
          </div>

          <div class="map-actions">
            <label class="btn btn-primary" :class="{ disabled: busy }" :for="'file-' + k.kind">
              {{ maps[k.kind] ? 'Replace file' : 'Upload file' }}
            </label>
            <input :id="'file-' + k.kind" type="file" :accept="k.accept" class="file-hidden" :disabled="!!busy" @change="pick(k.kind, $event)">
            <button v-if="maps[k.kind]" type="button" class="btn btn-secondary danger" :disabled="!!busy" @click="remove(k.kind)">Remove</button>
          </div>
          <p v-if="maps[k.kind]" class="meta">Last updated {{ when(maps[k.kind].updated_at) }}</p>
          <p class="hint accepts">{{ k.help }}</p>
          </div>
        </section>
      </div>


      <section class="card mk-card" id="markers" v-if="mkKind === '2d' || (maps['3d'] && maps['3d'].format !== 'obj')">
        <div class="map-card-head">
          <div>
            <h2>Entrances &amp; gates</h2>
            <p class="hint">Pin each building's entrance and the campus gates, and highlight key places such as Admission, Treasury, Clinic or the Faculty room. Students see the pins on the Campus Map, labelled with the building name (for example &ldquo;Main Building &ndash; Entrance&rdquo;); key places stand out with a star.</p>
          </div>
        </div>

        <p v-if="!maps[mkKind]" class="empty-note">Upload the {{ mkKind === '2d' ? '2D' : '3D' }} map above first, then you can pin entrances on it.</p>
        <p v-else-if="maps[mkKind].format === 'obj'" class="empty-note">Pins can be placed on a picture, SVG or PDF map. A 3D .obj model can&rsquo;t be pinned &mdash; pin the 2D map instead.</p>
        <p v-else-if="maps[mkKind].format === 'pdf' && !thumbs[mkKind]" class="empty-note">Preparing the PDF page&hellip;</p>

        <div v-else class="mk-layout">
          <div class="mk-main">
            <div class="mk-tools">
              <div class="seg" role="tablist">
                <button type="button" :class="{ on: mkType === 'entrance' }" @click="mkType = 'entrance'">Building entrance</button>
                <button type="button" :class="{ on: mkType === 'gate' }" @click="mkType = 'gate'">Campus gate</button>
                <button type="button" :class="{ on: mkType === 'landmark' }" @click="mkType = 'landmark'">&#9733; Key place</button>
              </div>
              <select v-if="mkType !== 'gate'" v-model="mkBuilding" aria-label="Building">
                <option value="">{{ mkType === 'landmark' ? 'Building (optional)' : 'Choose a building…' }}</option>
                <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
              </select>
              <input type="text" maxlength="100" v-model="mkLabel" :placeholder="mkType === 'entrance' ? 'Optional, e.g. North door' : (mkType === 'landmark' ? 'Name, e.g. Admission' : 'e.g. Main Gate')">
            </div>
            <div v-if="mkType === 'landmark'" class="mk-quick">
              <span>Quick pick:</span>
              <button v-for="q in quickPlaces" :key="q" type="button" @click="mkLabel = q">{{ q }}</button>
            </div>
            <p class="hint">Click the map to drop a pin with these settings. Drag a pin to move it; click a pin to edit or delete it.</p>

            <div class="map-actions" style="margin-bottom:0.6rem;">
              <button type="button" class="btn btn-secondary" :disabled="mkBusy" @click="addPinAtCenter">Add pin at map centre</button>
              <span class="hint u-1386d5">Or click the map. Then use the arrow keys on the pin to place it exactly.</span>
            </div>
            <div class="mk-canvas" ref="canvas" @click="canvasClick">
              <img ref="mkImg" :src="markerBase" alt="Campus map with the pins placed on it" draggable="false">
              <button v-for="m in markersOf(mkKind)" :key="m.id" type="button" class="mk-pin" :class="[m.marker_type, { sel: selectedId === m.id }]"
                      :style="{ left: m.x + '%', top: m.y + '%' }" :title="m.name"
                      @click.stop="selectedId = m.id" @pointerdown.stop="startDrag(m, $event)" @keydown="onPinKey(m, $event)" :aria-label="m.name + '. Arrow keys move it, Delete removes it.'">
                <span class="mk-dot"></span>
                <span class="mk-tag">{{ m.name }}</span>
              </button>
            </div>
          </div>

          <aside class="mk-side">
            <h3>Pins on the {{ mkKind === '2d' ? '2D' : '3D' }} map</h3>
            <p v-if="!markersOf(mkKind).length" class="hint">None yet.</p>
            <ul class="mk-list">
              <li v-for="m in markersOf(mkKind)" :key="m.id" :class="{ sel: selectedId === m.id }">
                <button type="button" class="mk-row" :aria-pressed="selectedId === m.id" @click="selectedId = m.id">
                  <span class="mk-chip" :class="m.marker_type"></span>
                  <span class="mk-name">{{ m.name }}</span>
                </button>
              </li>
            </ul>

            <div v-if="selected" class="mk-edit">
              <h3>Edit pin</h3>
              <div class="field">
                <label for="pinType">Type</label>
                <select id="pinType" v-model="selected.marker_type">
                  <option value="entrance">Building entrance</option>
                  <option value="gate">Campus gate</option>
                  <option value="landmark">&#9733; Key place</option>
                </select>
              </div>
              <div v-if="selected.marker_type !== 'gate'" class="field">
                <label for="pinBuilding">Building{{ selected.marker_type === 'landmark' ? ' (optional)' : '' }}</label>
                <select id="pinBuilding" v-model="selected.building_id">
                  <option :value="null">{{ selected.marker_type === 'landmark' ? 'No building' : 'Choose a building…' }}</option>
                  <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
                </select>
              </div>
              <div class="field">
                <label for="pinLabel">{{ selected.marker_type === 'gate' ? 'Gate name' : (selected.marker_type === 'landmark' ? 'Name' : 'Label (optional)') }}</label>
                <input id="pinLabel" type="text" maxlength="100" v-model="selected.label" :placeholder="selected.marker_type === 'gate' ? 'Main Gate' : (selected.marker_type === 'landmark' ? 'Admission' : 'North door')">
              </div>
              <div class="map-actions">
                <button type="button" class="btn btn-primary" :disabled="mkBusy" @click="saveSelected">Save pin</button>
                <button type="button" class="btn btn-secondary danger" :disabled="mkBusy" @click="removeSelected">Delete</button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <p class="hint footnote">
        Accepted: 2D map &mdash; PNG, JPG, WebP, SVG or PDF (a PDF shows its pages; students can flip through them). 3D map &mdash; an .obj model (students rotate and zoom it) or a PNG, JPG or WebP picture. Large pictures are shrunk automatically (longest side 4000 px) so they load quickly on phones.
        Saved maps are also kept on students' phones, so they still open without a signal.
      </p>

    </div>
  </main>
</div>

<script src="../../Js/Admin/campus-map.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
