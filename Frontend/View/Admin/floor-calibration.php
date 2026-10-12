<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'floor-calibration';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/floor-calibration.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/floor-calibration.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Floor Calibration</title>
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
<link rel="stylesheet" href="../../Css/Admin/floor-calibration.css?v=<?= $pageCssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/editor-tools.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/editor-tools.css') ?>">
<script src="../../assets/vendor/vue.global.prod.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="app" v-cloak>
    <div class="admin-container fc">

      <header class="page-head">
        <div>
          <h1>Floor Calibration</h1>
          <p>Teach the indoor AR how big a floor plan is and which way it points, in three short steps.</p>
        </div>
        <a class="btn btn-secondary" href="../Student/manual-search.php" target="_blank" rel="noopener">Preview as student</a>
      </header>

      <!-- Which floor -->
      <section v-if="!plan || pickerOpen" class="fc-card" aria-labelledby="fc-pick-h">
        <h2 id="fc-pick-h" class="fc-h">Choose a floor</h2>
        <label class="fc-label" for="fc-building">Building</label>
        <select id="fc-building" class="fc-select" v-model="buildingId" @change="loadPlans">
          <option value="">Choose a building&hellip;</option>
          <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
        </select>
        <p v-if="plansNote" class="fc-note">{{ plansNote }}</p>
        <p v-else-if="buildingId && !plans.length" class="fc-note">This building has no floor plans uploaded yet. Add one in Buildings first.</p>
        <template v-if="plans.length">
          <div class="fc-floors" role="tablist" aria-label="Floors">
            <button v-for="p in plans" :key="p.id" type="button" role="tab" class="fc-floor" :class="{ on: String(planId) === String(p.id), done: isCalibrated(p) }" :aria-selected="String(planId) === String(p.id)" @click="chooseFloor(p)">
              <span>{{ p.floor }}</span><svg v-if="isCalibrated(p)" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-label="calibrated"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
          <div class="fc-progress" role="status">
            <span class="fc-progress-bar"><i :style="{ width: (calibratedCount / plans.length * 100) + '%' }"></i></span>
            <span><b>{{ calibratedCount }} of {{ plans.length }}</b> floors calibrated</span>
          </div>
        </template>
      </section>

      <!-- once a floor is chosen the picker folds away, so the steps start right at the top of the screen -->
      <section v-else class="fc-card fc-summary" aria-label="Chosen floor">
        <div><span class="fc-sub">Building and floor</span><strong>{{ buildingName }} &middot; {{ plan.floor }}</strong></div>
        <button type="button" class="btn btn-secondary" @click="pickerOpen = true">Change</button>
      </section>

      <div v-if="!plan" class="fc-card fc-empty">
        <img src="../../assets/illustrations/empty-plan.svg" alt="" width="150" height="112">
        <strong>Pick a building and a floor</strong>
        <p>The floor plan shows up here. It takes about two minutes per floor.</p>
      </div>

      <template v-if="plan">
        <!-- Where you are in the three steps -->
        <ol class="fc-steps" aria-label="Steps">
          <li v-for="n in 3" :key="n">
            <button type="button" :class="{ on: step === n, done: stepDone(n) && step !== n }" :disabled="n > maxStep" :aria-current="step === n ? 'step' : null" @click="goStep(n)">
              <span class="fc-step-n">{{ stepDone(n) && step !== n ? '\u2713' : n }}</span>
              <span class="fc-step-t">{{ ['Mark a hallway', 'Measure it', 'Check and save'][n - 1] }}</span>
            </button>
          </li>
        </ol>
        <p class="fc-floor-now">{{ plan.floor }} &middot; <span :class="isCalibrated(plan) ? 'ok' : 'todo'">{{ plan._pending ? 'saved on this device, not synced yet' : (isCalibrated(plan) ? 'already calibrated (you can redo it)' : 'not calibrated yet') }}</span></p>

        <!-- Step 1: two points on the plan -->
        <section v-show="step === 1" class="fc-card" aria-labelledby="fc-s1">
          <h2 id="fc-s1" class="fc-h">Mark a long hallway</h2>
          <p class="fc-help">Tap the plan at the two ends of a long, straight hallway you can walk: <b>A</b> first, then <b>B</b>. Drag a point to adjust it.</p>
          <div class="fc-actions">
            <button type="button" class="btn btn-primary" :disabled="locked || suggesting" @click="suggestHallway">{{ suggesting ? 'Looking…' : 'Suggest a hallway for me' }}</button>
            <button v-if="pts.length" type="button" class="btn btn-secondary" :disabled="locked" @click="clearPoints">Clear points</button>
          </div>
          <p v-if="suggestNote" class="fc-note">{{ suggestNote }}</p>
          <div class="plan-wrap fc-plan" :class="{ 'is-locked-surface': locked }" @click="tapPlan">
            <img ref="img" :src="'../../' + plan.image_path" :alt="'Floor plan for ' + plan.floor + '. Points A and B mark the two ends of a hallway.'" @load="onImgLoad" draggable="false">
            <svg v-if="pts.length" class="plan-svg">
              <line v-if="pts.length === 2" :x1="pts[0].x + '%'" :y1="pts[0].y + '%'" :x2="pts[1].x + '%'" :y2="pts[1].y + '%'" stroke="#ffd100" stroke-width="4" />
            </svg>
            <div v-for="(p, i) in pts" :key="i" class="pt fc-pt" :class="{ draggable: !locked }" :style="{ left: p.x + '%', top: p.y + '%' }" @click.stop @pointerdown="startDrag(i, $event)" @keydown="onPointKey(i, $event)" tabindex="0" role="button" :aria-label="'Point ' + (i ? 'B' : 'A') + ', ' + p.x.toFixed(1) + ' percent across, ' + p.y.toFixed(1) + ' percent down. Arrow keys move it.'">{{ i ? 'B' : 'A' }}</div>
          </div>
          <div class="fc-chips" aria-live="polite">
            <span class="fc-chip" :class="{ on: pts.length > 0 }"><b>A</b>{{ pts.length > 0 ? 'placed' : 'tap the plan' }}</span>
            <span class="fc-chip" :class="{ on: pts.length > 1 }"><b>B</b>{{ pts.length > 1 ? 'placed' : (pts.length ? 'tap the far end' : 'next') }}</span>
          </div>
          <div class="fc-actions fc-small">
            <button type="button" class="fc-toggle" :class="{ on: locked }" :aria-pressed="locked" @click="toggleLock">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path :d="locked ? 'M8 11V8a4 4 0 0 1 8 0v3' : 'M8 11V8a4 4 0 0 1 7.5-2'"/></svg>
              {{ locked ? 'Points locked. Tap to unlock' : 'Lock A and B once they are right' }}
            </button>
            <button type="button" class="btn-link" :disabled="locked" @click="placeBoth">Place A and B with the keyboard</button>
          </div>
          <div v-if="undoPts" class="undo-bar" role="status">
            <span>Points changed</span>
            <button type="button" @click="undoClear">Undo</button>
            <button type="button" class="undo-x" aria-label="Dismiss" @click="undoPts = null">&times;</button>
          </div>
        </section>

        <!-- Step 2: the real distance and direction -->
        <section v-show="step === 2" class="fc-card" aria-labelledby="fc-s2">
          <h2 id="fc-s2" class="fc-h">Measure the hallway</h2>
          <p class="fc-help">Give the real length of A to B and the compass direction you face walking from A to B.</p>
          <div class="fc-seg" role="tablist" aria-label="How to measure">
            <button type="button" role="tab" :class="{ on: measure === 'walk' }" :aria-selected="measure === 'walk'" @click="measure = 'walk'">Walk it</button>
            <button type="button" role="tab" :class="{ on: measure === 'type' }" :aria-selected="measure === 'type'" @click="measure = 'type'">Type it in</button>
            <button type="button" role="tab" :class="{ on: measure === 'gps' }" :aria-selected="measure === 'gps'" @click="measure = 'gps'">GPS</button>
          </div>

          <div v-if="measure === 'walk'" class="fc-method">
            <ol class="fc-howto">
              <li>Stand at <b>A</b>. Hold the phone <b>flat</b>, top edge pointing toward <b>B</b>.</li>
              <li>Tap <b>Start at A</b> and walk to <b>B</b> at a normal pace.</li>
              <li>Tap <b>I'm at B</b>. The distance and direction fill in below.</li>
            </ol>
            <div class="fc-stride">
              <label for="stride">Your step length (m)</label>
              <input id="stride" v-model.number="stride" type="number" min="0.3" max="1.4" step="0.05" inputmode="decimal" @change="setStride" :disabled="walking">
              <span class="fc-sub">Most adults: 0.6 to 0.8 m</span>
            </div>
            <button v-if="!walking" type="button" class="btn btn-primary fc-big" id="walk-start" @click="startWalk">Start at A</button>
            <template v-else>
              <div class="fc-live" role="status"><strong>{{ steps }}</strong> steps<span> &middot; about {{ (steps * stride).toFixed(1) }} m</span><span v-if="liveHeading !== null"> &middot; facing {{ Math.round(liveHeading) }}&deg;</span></div>
              <button type="button" class="btn btn-primary fc-big" id="walk-finish" @click="finishWalk">I'm at B</button>
              <button type="button" class="btn-link" @click="cancelWalk">Cancel the walk</button>
            </template>
            <p v-if="walkNote" class="fc-note">{{ walkNote }}</p>
          </div>

          <div v-else-if="measure === 'gps'" class="fc-method">
            <ol class="fc-howto">
              <li>Stand at <b>A</b> and tap <b>Mark A here</b>.</li>
              <li>Walk to <b>B</b> and tap <b>Mark B here</b>.</li>
            </ol>
            <p class="fc-sub">GPS is only good to 5 to 20 m, so use it for far-apart points outdoors or in a big open hall. Indoors, use &ldquo;Walk it&rdquo;.</p>
            <div class="fc-actions">
              <button type="button" class="btn btn-secondary" :disabled="!!gpsBusy" @click="grabFix('a')">{{ gpsBusy === 'a' ? 'Reading…' : (gps.a ? 'Re-mark A' : 'Mark A here') }}</button>
              <button type="button" class="btn btn-secondary" :disabled="!!gpsBusy" @click="grabFix('b')">{{ gpsBusy === 'b' ? 'Reading…' : (gps.b ? 'Re-mark B' : 'Mark B here') }}</button>
              <button v-if="gps.a || gps.b" type="button" class="btn-link" @click="clearGps">Clear</button>
            </div>
            <p v-if="gpsNote" class="fc-note">{{ gpsNote }}</p>
          </div>

          <div v-else class="fc-method">
            <p class="fc-sub">Measure the hallway with a tape or by pacing, and type the numbers below. A rough distance (within 10%) is fine.</p>
          </div>

          <div class="fc-fields">
            <div class="fc-field">
              <label for="fc-dist">Real distance from A to B</label>
              <div class="fc-input"><input id="fc-dist" v-model.number="distance" type="number" min="1" step="0.1" inputmode="decimal" placeholder="e.g. 24.5"><span>m</span></div>
            </div>
            <div class="fc-field">
              <label for="fc-bear">Direction from A toward B</label>
              <div class="fc-input"><input id="fc-bear" v-model.number="bearing" type="number" min="0" max="360" step="1" inputmode="numeric" placeholder="0 to 360"><span>&deg;</span></div>
              <button type="button" class="btn btn-secondary fc-compass" @click="toggleCompass">
                {{ compassOn ? 'Tap to use ' + (liveHeading !== null ? Math.round(liveHeading) + '°' : '…') : 'Read my compass' }}
              </button>
              <p class="fc-sub">Hold the phone flat, top edge toward B, tap once to start and again to take the reading. North is 0, east 90, south 180, west 270.</p>
            </div>
          </div>
        </section>

        <!-- Step 3: check it, save it -->
        <section v-show="step === 3" class="fc-card" aria-labelledby="fc-s3">
          <h2 id="fc-s3" class="fc-h">Check and save</h2>
          <div v-if="preview" class="fc-result">
            <div><span class="fc-big-n">{{ preview.widthM.toFixed(1) }} &times; {{ preview.heightM.toFixed(1) }} m</span><span class="fc-sub">the plan is about this wide and tall</span></div>
            <div><span class="fc-big-n">{{ preview.north.toFixed(0) }}&deg;</span><span class="fc-sub">&ldquo;up&rdquo; on the plan points this far from north</span></div>
          </div>
          <p v-else class="fc-note">Something is still missing: {{ missing.join(', ') }}. Go back and fill it in.</p>
          <ul v-if="warnings.length" class="fc-warn" role="alert">
            <li v-for="w in warnings" :key="w">{{ w }}</li>
          </ul>
          <p v-if="preview && !warnings.length" class="fc-ok">These numbers look sensible.</p>
          <p class="fc-sub">Indoor AR on this floor uses these numbers right away. A longer hallway gives a more accurate result.</p>
          <div v-if="justSaved && nextPlan" class="next-floor">
            <span>Saved. {{ nextPlan.floor }} is not calibrated yet.</span>
            <button type="button" class="btn btn-secondary" @click="goNext">Calibrate {{ nextPlan.floor }} &rarr;</button>
          </div>
          <p v-else-if="justSaved" class="fc-ok">Saved. Every floor in this building is calibrated.</p>
        </section>

        <!-- Always at the bottom of the screen, within thumb reach -->
        <div class="fc-bar">
          <button v-if="step > 1" type="button" class="btn btn-secondary" @click="backStep">Back</button>
          <button v-if="step < 3" type="button" class="btn btn-primary fc-grow" :disabled="!canNext" @click="nextStep">{{ step === 1 ? 'Next: measure it' : 'Next: check it' }}</button>
          <button v-else type="button" class="btn btn-primary fc-grow" :disabled="!preview || saving" @click="save">{{ saving ? 'Saving…' : 'Save calibration' }}</button>
          <span v-if="step < 3 && !canNext" class="fc-need">{{ step === 1 ? 'Place A and B to continue' : 'Enter the distance and direction' }}</span>
        </div>
      </template>

    </div>
  </main>
</div>

<script src="../../Js/Include/point-names.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/point-names.js') ?>"></script>
<script src="../../Js/Include/editor-lock.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/editor-lock.js') ?>"></script>
<script src="../../Js/Include/indoor-nav.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/indoor-nav.js') ?>"></script>
<script src="../../Js/Admin/floor-calibration.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
