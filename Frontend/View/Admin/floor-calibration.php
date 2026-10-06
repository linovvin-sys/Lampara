<?php
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
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/floor-calibration.css?v=<?= $pageCssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/editor-tools.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/editor-tools.css') ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container">

      <div class="page-head">
        <div>
          <h1>Floor Calibration</h1>
          <p>Tell the indoor AR guide how big each floor plan is and which way it points, so it can turn plan positions into real steps and directions. Works offline: the compass reading needs no signal, and the result is saved on this device until you sync it.</p>
        </div>
      </div>

      <div class="card">
        <div class="field-row-2">
          <div class="field">
            <label>Building</label>
            <select v-model="buildingId" @change="loadPlans">
              <option value="">Choose a building…</option>
              <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>
          <div class="field">
            <label>Floor</label>
            <select v-model="planId" @change="pickPlan" :disabled="!plans.length">
              <option value="">{{ buildingId && !plans.length ? (plansNote ? 'Not available' : 'No floor plans uploaded') : 'Choose a floor…' }}</option>
              <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.floor }}{{ isCalibrated(p) ? ' ✓' : '' }}</option>
            </select>
          </div>
        </div>
        <p v-if="plansNote" class="hint" style="margin:0.6rem 0 0;">{{ plansNote }}</p>
      </div>

      <div v-if="plan" class="cal-layout">
        <div class="card">
          <p class="hint">
            <strong>Step 1.</strong> Tap two points at the two ends of a long, straight hallway on the plan —
            first the point you'll start from (A), then the far end (B). Pick a hallway you can actually walk and measure.
          </p>
          <div class="lock-bar" :class="{ 'is-locked': locked }">
            <button type="button" class="lock-btn" :class="{ on: locked }" :aria-pressed="locked ? 'true' : 'false'" @click="toggleLock">
              <span v-html="locked ? lockIcon.closed : lockIcon.open"></span>{{ locked ? 'Locked' : 'Unlocked' }}
            </button>
            <span class="lock-msg">{{ locked
              ? 'Points A and B can\'t be placed, replaced or cleared. Unlock to change them.'
              : 'Editing is on: drag A or B to move them. Lock the plan once they are right, so a stray tap can\'t move them.' }}</span>
          </div>
          <div class="plan-wrap" :class="{ 'is-locked-surface': locked }" @click="tapPlan">
            <img ref="img" :src="'../../' + plan.image_path" alt="" @load="onImgLoad" draggable="false">
            <svg v-if="pts.length" class="plan-svg">
              <line v-if="pts.length === 2" :x1="pts[0].x + '%'" :y1="pts[0].y + '%'" :x2="pts[1].x + '%'" :y2="pts[1].y + '%'" stroke="#f59e0b" stroke-width="3" />
            </svg>
            <div v-for="(p, i) in pts" :key="i" class="pt" :class="{ draggable: !locked }" :style="{ left: p.x + '%', top: p.y + '%' }" @click.stop @pointerdown="startDrag(i, $event)">{{ i ? 'B' : 'A' }}</div>
          </div>
          <button v-if="pts.length" type="button" class="btn-link" :disabled="locked" @click="clearPoints">Clear points</button>
        </div>

        <div class="card">
          <div class="pts-head">
            <h3 class="side-title" style="margin:0; font-size:0.875rem;">Points ({{ pointList.length }})</h3>
            <button type="button" class="btn-remove-all" :disabled="locked || !pointList.length" @click="clearPoints">Remove all</button>
          </div>
          <div v-if="undoPts" class="undo-bar" role="status">
            <span>Points removed</span>
            <button type="button" @click="undoClear">Undo</button>
            <button type="button" class="undo-x" aria-label="Dismiss" @click="undoPts = null">&times;</button>
          </div>
          <p v-if="!pointList.length" class="hint" style="margin:0 0 0.9rem;">None yet. Tap the plan to place Point A.</p>
          <div v-else class="points-list" role="list" style="margin-bottom:0.9rem;">
            <div v-for="p in pointList" :key="p.i" role="listitem" class="pt-row static">
              <span class="pt-badge">{{ p.short }}</span>
              <span class="pt-main">
                <span class="pt-name">{{ p.name }}</span>
                <span class="pt-coords mono">{{ p.x.toFixed(1) }}%, {{ p.y.toFixed(1) }}% of the plan</span>
              </span>
              <button type="button" class="pt-remove" :disabled="locked" @click="removePoint(p.i)">Remove</button>
            </div>
          </div>
          <p class="status" :class="isCalibrated(plan) ? 'ok' : 'todo'">
            <template v-if="plan._pending">Saved on this device, not synced yet &middot; plan is about {{ (plan.meters_per_unit_x * 100).toFixed(1) }} m wide, plan-up points to {{ plan.north_offset.toFixed(0) }}° from north</template>
            <template v-else-if="isCalibrated(plan)">Calibrated &middot; plan is about {{ (plan.meters_per_unit_x * 100).toFixed(1) }} m wide, plan-up points to {{ plan.north_offset.toFixed(0) }}° from north</template>
            <template v-else>Not calibrated yet — the AR guide is off for this floor.</template>
          </p>

          <div v-if="pts.length === 2" class="measure">
            <div class="measure-head">
              <strong>Measure it for me</strong>
              <div class="seg" role="tablist">
                <button type="button" role="tab" :class="{ on: measure === 'walk' }" :aria-selected="measure === 'walk'" @click="measure = 'walk'">Walk it</button>
                <button type="button" role="tab" :class="{ on: measure === 'gps' }" :aria-selected="measure === 'gps'" @click="measure = 'gps'">GPS</button>
              </div>
            </div>

            <div v-if="measure === 'walk'">
              <p class="hint" style="margin:0.5rem 0;">
                Stand at <strong>A</strong> with the phone flat, its top edge pointing toward B. Tap Start, walk to <strong>B</strong> at a normal pace, then tap "I'm at B".
                The app counts your steps for the distance and reads the compass for the direction.
              </p>
              <div class="stride-row">
                <label for="stride">Your step length (m)</label>
                <input id="stride" v-model.number="stride" type="number" min="0.3" max="1.4" step="0.05" @change="setStride" :disabled="walking">
              </div>
              <button v-if="!walking" type="button" class="btn btn-primary" id="walk-start" @click="startWalk">Start at A</button>
              <template v-else>
                <div class="walk-live" role="status"><strong>{{ steps }}</strong> steps · about {{ (steps * stride).toFixed(1) }} m<span v-if="liveHeading !== null"> · facing {{ Math.round(liveHeading) }}°</span></div>
                <button type="button" class="btn btn-primary" id="walk-finish" @click="finishWalk">I'm at B</button>
                <button type="button" class="btn-link" @click="cancelWalk">Cancel</button>
              </template>
              <p v-if="walkNote" class="hint" style="margin:0.5rem 0 0;">{{ walkNote }}</p>
              <p class="hint" style="margin:0.4rem 0 0;">Not sure of your step length? Walk 10 steps along a tape and divide. Most adults are 0.6 to 0.8 m.</p>
            </div>

            <div v-else>
              <p class="hint" style="margin:0.5rem 0;">
                Stand at <strong>A</strong>, tap "Mark A here", walk to <strong>B</strong>, tap "Mark B here". GPS is only good to 5 to 20 m, so it only works for points far apart, outdoors or in a large open hall. Indoors in a house, use "Walk it".
              </p>
              <div class="gps-row">
                <button type="button" class="btn btn-secondary" :disabled="!!gpsBusy" @click="grabFix('a')">{{ gpsBusy === 'a' ? 'Reading…' : (gps.a ? 'Re-mark A' : 'Mark A here') }}</button>
                <button type="button" class="btn btn-secondary" :disabled="!!gpsBusy" @click="grabFix('b')">{{ gpsBusy === 'b' ? 'Reading…' : (gps.b ? 'Re-mark B' : 'Mark B here') }}</button>
                <button v-if="gps.a || gps.b" type="button" class="btn-link" @click="clearGps">Clear</button>
              </div>
              <p v-if="gpsNote" class="hint" style="margin:0.5rem 0 0;">{{ gpsNote }}</p>
            </div>
          </div>

          <div class="field">
            <label><strong>Step 2.</strong> Real distance from A to B (meters)</label>
            <input v-model.number="distance" type="number" min="1" step="0.1" placeholder="e.g. 24.5" :disabled="pts.length < 2">
            <p class="hint" style="margin-top:0.35rem;">Pace it or use a measuring tape. A rough number (±10%) is fine.</p>
          </div>

          <div class="field">
            <label><strong>Step 3.</strong> Compass direction from A toward B (degrees)</label>
            <div class="compass-row">
              <input v-model.number="bearing" type="number" min="0" max="360" step="1" placeholder="0–360" :disabled="pts.length < 2">
              <button type="button" class="btn btn-secondary" @click="toggleCompass" :disabled="pts.length < 2">
                {{ compassOn ? 'Use ' + (liveHeading !== null ? Math.round(liveHeading) + '°' : '…') : 'Read my compass' }}
              </button>
            </div>
            <p class="hint" style="margin-top:0.35rem;">
              Stand at A, hold the phone flat with its top edge pointing toward B, tap “Read my compass”, then tap the button again
              to take the reading. Or type the bearing in (N = 0, E = 90, S = 180, W = 270).
            </p>
          </div>

          <div v-if="preview" class="preview">
            Plan is about <strong>{{ preview.widthM.toFixed(1) }} m</strong> wide &times; <strong>{{ preview.heightM.toFixed(1) }} m</strong> tall,
            and “up” on the plan points to <strong>{{ preview.north.toFixed(0) }}°</strong>.
          </div>

          <button type="button" class="btn btn-primary" :disabled="!preview || saving" @click="save">
            {{ saving ? 'Saving…' : 'Save calibration' }}
          </button>
        </div>
      </div>

    </div>
  </main>
</div>

<script src="../../Js/Include/point-names.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/point-names.js') ?>"></script>
<script src="../../Js/Include/editor-lock.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/editor-lock.js') ?>"></script>
<script src="../../Js/Include/indoor-nav.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/indoor-nav.js') ?>"></script>
<script src="../../Js/Admin/floor-calibration.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
