<?php
$cssVer = filemtime(__DIR__ . '/../../assets/css/tailwind.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/scan.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Student/scan.js');
$cacheJsVer = filemtime(__DIR__ . '/../../Js/Include/offline-cache.js');
$routeJsVer = filemtime(__DIR__ . '/../../Js/Include/floor-route.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Scan Signage</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#09090b">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/css/tailwind.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Student/scan.css?v=<?= $pageCssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js"></script>
</head>
<body style="background:#09090b;">

<!-- overflow:hidden is only actually needed for Stage 1's fullscreen fixed
     camera view — Stage 2 (result screen) is real scrollable content that
     can legitimately grow past one viewport (e.g. a long destination-search
     list), and inheriting "hidden" from here made it permanently stuck with
     no way to reach anything below the fold. -->
<div id="app" :style="{ position: 'relative', width: '100vw', height: '100vh', color: '#fff', overflow: stage === 'result' ? 'auto' : 'hidden' }">

  <!-- ===== STAGE 1: camera + tap-to-scan (AR chrome kept, recolored) ===== -->
  <template v-if="stage === 'scan'">
    <video id="camera-feed" ref="video" autoplay playsinline muted></video>
    <div class="absolute inset-0 bg-gradient-to-b from-black/70 via-transparent to-black/80"></div>

    <div class="relative z-10 p-4">
      <a href="../Public/guide-ar.php" class="inline-flex items-center gap-1.5 text-xs text-white/70">&larr; Back to guide</a>
    </div>

    <div class="absolute top-16 left-4 flex items-center gap-2 bg-white/10 border border-white/15 rounded-full pl-2.5 pr-3 py-1.5 z-10">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><rect x="3.5" y="3.5" width="6" height="6" rx="1" stroke="#22c55e" stroke-width="1.6"/><rect x="14.5" y="3.5" width="6" height="6" rx="1" stroke="#22c55e" stroke-width="1.6"/><rect x="3.5" y="14.5" width="6" height="6" rx="1" stroke="#22c55e" stroke-width="1.6"/><rect x="14.5" y="14.5" width="6" height="6" rx="1" stroke="#22c55e" stroke-width="1.6"/></svg>
      <span class="text-xs font-medium">Point camera at a room signage</span>
    </div>

    <!-- Stage 1 of signage reading: a local text detector (Tesseract.js) runs
         periodically on the live frame and boxes whatever text it finds —
         purely a visual aid to help you aim. Stage 2, the actual accurate
         read, only happens on tap and is done by Gemini (see performScan). -->
    <div v-if="liveBox" class="absolute z-10 pointer-events-none rounded-lg transition-all duration-200"
         :style="{ left: liveBox.left + 'px', top: liveBox.top + 'px', width: liveBox.width + 'px', height: liveBox.height + 'px', border: '2px solid #22c55e', boxShadow: '0 0 0 2px rgba(34,197,94,0.25)' }">
      <span class="absolute -top-6 left-0 bg-emerald-500 text-zinc-900 text-[10px] font-bold px-2 py-0.5 rounded whitespace-nowrap">TEXT DETECTED</span>
    </div>

    <div class="absolute inset-0 flex flex-col items-center justify-center z-10 px-8 pointer-events-none">
      <p class="text-white/50 text-sm text-center mb-6">Not sure of the exact number? Type it manually below.</p>
      <input v-model="manualNumber" type="text" placeholder="e.g. 204 or 204 - A" maxlength="16" style="width:13rem;"
             class="w-40 text-center bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-lg font-mono tracking-widest text-white placeholder-white/30 focus:outline-none scan-input mb-4 pointer-events-auto">
    </div>

    <div class="absolute bottom-10 inset-x-0 flex flex-col items-center gap-4 z-10">
      <button @click="performScan" :disabled="scanning"
              class="w-20 h-20 rounded-full bg-white border-4 scan-ring flex items-center justify-center lamp-glow disabled:opacity-60">
        <span v-if="!scanning" class="w-12 h-12 rounded-full bg-emerald-50"></span>
        <span v-else class="text-zinc-900 text-xs font-semibold">…</span>
      </button>
      <p v-if="scanning" class="text-xs text-white/70">Reading sign with AI…</p>
      <p v-else-if="onCampus === false && !manualNumber" class="text-xs text-white/70 font-medium px-8 text-center">AI scanning only works on campus grounds — type the room number manually instead</p>
      <p v-else class="text-xs text-white/70">Tap to read this sign with AI</p>
    </div>
  </template>

  <!-- ===== STAGE 2: result (full white/green card redesign) ===== -->
  <template v-else-if="stage === 'result'">
    <div class="result-shell">
      <!-- Entered from Manual Search: the room the visitor tapped is the
           DESTINATION, not "where they are" — there was no scan to establish
           that, so asking "where are you now?" comes first instead of the
           scanned flow's "You're at X" framing. -->
      <div v-if="planningMode && destination && !room" style="padding-top:1.25rem;">
        <div class="result-heading">
          <h1>Where are you now?</h1>
          <p>Going to {{ destination.room_number ? destination.room_number + ' — ' : '' }}{{ destination.room_name }} — search your current room to see the way there.</p>
        </div>
        <div class="info-card" style="margin-top:0.25rem;">
          <input v-model="originQuery" @input="searchOrigin" type="text"
                 placeholder="Search your current room…"
                 style="width:100%; box-sizing:border-box; padding:0.7rem 0.9rem; border:1px solid var(--line); border-radius:0.75rem; font-family:inherit; font-size:0.875rem;">
          <div v-if="originResults.length" style="margin-top:0.5rem; display:flex; flex-direction:column; gap:0.4rem; max-height:16rem; overflow-y:auto;">
            <button v-for="r in originResults" :key="r.id" @click="pickOrigin(r)"
                    style="text-align:left; background:var(--green-50); border:none; border-radius:0.6rem; padding:0.55rem 0.75rem; font-family:inherit; cursor:pointer;">
              <span style="font-weight:700; font-size:0.8125rem; color:var(--ink);">{{ r.room_number ? r.room_number + ' — ' : '' }}{{ r.room_name }}</span>
              <span style="display:block; font-size:0.75rem; color:var(--muted);">{{ r.building_name }} &middot; {{ r.floor }}</span>
            </button>
          </div>
          <div v-if="originQuery && !originResults.length" style="margin-top:0.5rem; font-size:0.8125rem; color:var(--muted);">No matching room found.</div>
        </div>
        <a href="manual-search.php" class="back-link">Pick a different destination</a>
      </div>

      <!-- The destination itself couldn't be found — bad link, or truly
           offline with a directory that's never been cached on this device. -->
      <div v-else-if="planningMode && !destination" class="not-found">
        <p class="primary">Couldn't find that room.</p>
        <p class="secondary">It may not be registered, or you're offline and it hasn't loaded here before.</p>
        <a href="manual-search.php" class="link-btn">Back to the directory &rarr;</a>
      </div>

      <div v-else-if="room" style="padding-top:1.25rem;">
        <!-- Deliberately NOT a headline. Scanning exists to let the SYSTEM
             confirm which room you're at (there's no indoor GPS — this is
             the only way it can anchor itself) — a human standing in front
             of the sign already knows that. Leading with "You're at Room
             X!" as the big moment was redundant and buried the actually
             useful next step underneath it. This is now a quiet, compact
             confirmation; "where do you want to go" (below) is the headline.
             Skipped entirely in planning mode — nothing was actually scanned. -->
        <div v-if="!planningMode" class="here-pill">
          <span class="here-pill-check">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <span class="here-pill-text">
            You're at <strong>{{ room.room_number ? room.room_number + ' — ' : '' }}{{ room.room_name }}</strong>
            <span class="here-pill-sub">{{ room.floor }} &middot; {{ room.building_name }}</span>
          </span>
          <span v-if="detectedNumber" class="source-tag ai here-pill-source"><span class="dot"></span> AI</span>
          <span v-else class="source-tag manual here-pill-source">Manual</span>
        </div>

        <!-- Destination picker — THIS is the actual headline now. Gives a
             relative hint (same floor/building vs a different one), not
             real turn-by-turn steps — no corridor/floor-plan data exists
             to generate an actual route, that's the thesis's pathfinding
             scope, not this feature's. -->
        <div v-if="!planningMode" class="result-heading">
          <h1>Where do you want to go?</h1>
          <p>Search a room, office, or lab to get directions from here.</p>
        </div>
        <!-- Planning-mode heading: both ends are already picked, so this is
             just a compact confirmation, not a prompt. -->
        <div v-else class="result-heading" style="text-align:left;">
          <h1 style="font-size:1.375rem;">{{ room.room_name }} &rarr; {{ destination.room_name }}</h1>
          <p>{{ room.floor }}, {{ room.building_name }} &middot; {{ destination.floor }}, {{ destination.building_name }}</p>
        </div>

        <div v-if="!planningMode" class="info-card" style="margin-top:0.25rem;">
          <input v-model="destQuery" @input="searchDestinations" type="text"
                 placeholder="Search a room, office, or lab…"
                 style="width:100%; box-sizing:border-box; padding:0.7rem 0.9rem; border:1px solid var(--line); border-radius:0.75rem; font-family:inherit; font-size:0.875rem;">
          <div v-if="destResults.length" style="margin-top:0.5rem; display:flex; flex-direction:column; gap:0.4rem; max-height:16rem; overflow-y:auto;">
            <button v-for="d in destResults" :key="d.id" @click="pickDestination(d)"
                    style="text-align:left; background:var(--green-50); border:none; border-radius:0.6rem; padding:0.55rem 0.75rem; font-family:inherit; cursor:pointer;">
              <span style="font-weight:700; font-size:0.8125rem; color:var(--ink);">{{ d.room_number ? d.room_number + ' — ' : '' }}{{ d.room_name }}</span>
              <span style="display:block; font-size:0.75rem; color:var(--muted);">{{ d.building_name }} &middot; {{ d.floor }}</span>
            </button>
          </div>
          <!-- Was silently truncated with no signal before — now says so,
               so "why don't I see room X" has an obvious answer: type more
               to narrow it down, instead of wondering if the room exists. -->
          <div v-if="destResultsTruncated" style="margin-top:0.4rem; font-size:0.75rem; color:var(--muted);">More matches exist — keep typing to narrow it down.</div>
          <div v-if="destQuery && !destResults.length" style="margin-top:0.5rem; font-size:0.8125rem; color:var(--muted);">No matching room found.</div>
        </div>

        <div v-if="destination" class="info-card" :style="{ marginTop: planningMode ? '0.25rem' : '1rem' }">
          <p style="font-weight:800; font-size:0.9375rem; color:var(--ink); margin:0 0 0.2rem;">
            {{ destination.room_number ? destination.room_number + ' — ' : '' }}{{ destination.room_name }}
          </p>
          <p style="font-size:0.8125rem; color:var(--green-700); font-weight:700; margin:0;">{{ directionHint }}</p>
          <!-- The admin's own notes on THIS room are the real "how to find it"
               info (e.g. "up the stairs, end of the hall") — more specific
               than the generic same-floor/different-building hint above, so
               show it whenever it exists instead of leaving it unread. -->
          <p v-if="destination.notes" class="notes-pill" style="margin-top:0.5rem; display:inline-flex;">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg>
            {{ destination.notes }}
          </p>

          <!-- Visual map — only when both rooms sit on a floor with an
               uploaded plan and a placed marker; directionHint above
               always covers the gap otherwise, so this never blocks. -->
          <p v-if="loadingFloorPlan" style="font-size:0.75rem; color:var(--muted); margin-top:0.6rem;">Loading floor plan…</p>

          <div v-if="mapMode === 'same-floor'" style="margin-top:0.75rem; position:relative; border-radius:0.75rem; overflow:hidden; border:1px solid var(--line);">
            <img :src="floorPlans.room.imageDataUrl || ('../../' + floorPlans.room.image_path)" alt="" style="width:100%; display:block;">
            <!-- Every other registered room on this floor — small, muted,
                 non-interactive dots for orientation, so the destination
                 isn't the only landmark on an otherwise-blank plan. -->
            <div v-for="r in roomsOnFloor(room.floor)" :key="r.id"
                 :style="{ position: 'absolute', left: r.map_x + '%', top: r.map_y + '%', transform: 'translate(-50%, -100%)' }">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#9aa79f" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
              <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.375rem; font-weight:600; background:#9aa79f; color:#fff; padding:0.03rem 0.2rem; border-radius:0.15rem; white-space:nowrap; line-height:1.4;">{{ r.room_number || r.room_name }}</span>
            </div>
            <!-- Actual walkable route, drawn from the walkable-path graph
                 (Register Building) — quietly absent whenever either room
                 isn't linked to a junction or the graph doesn't connect
                 them; the two pins below always work on their own regardless. -->
            <svg v-if="routePath" viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%;">
              <polyline :points="routePath.map(p => p.x + ',' + p.y).join(' ')" fill="none" stroke="#16a34a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3,2" vector-effect="non-scaling-stroke" />
            </svg>
            <div :style="{ position: 'absolute', left: room.map_x + '%', top: room.map_y + '%', transform: 'translate(-50%, -100%)' }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#14251c" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
              <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.4375rem; font-weight:700; background:#14251c; color:#fff; padding:0.05rem 0.25rem; border-radius:0.2rem; white-space:nowrap; line-height:1.4;">{{ planningMode ? 'Start' : 'You' }}</span>
            </div>
            <div :style="{ position: 'absolute', left: destination.map_x + '%', top: destination.map_y + '%', transform: 'translate(-50%, -100%)' }">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#16a34a" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
              <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.4375rem; font-weight:700; background:#16a34a; color:#fff; padding:0.05rem 0.25rem; border-radius:0.2rem; white-space:nowrap; line-height:1.4;">{{ destination.room_number || 'Here' }}</span>
            </div>
          </div>

          <!-- Multi-floor route: one floor's plan + its own sub-route at a
               time, paged with Next/Previous — a route spanning floors
               can't be one continuous line across two separate images, so
               each page is its own floor plan with a "take the stairs"
               marker at the page break instead. -->
          <div v-else-if="mapMode === 'multi-floor'" style="margin-top:0.75rem;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.4rem;">
              <p style="font-size:0.75rem; font-weight:700; color:var(--muted); margin:0;">{{ segmentFloorLabel(currentSegment) }}</p>
              <p style="font-size:0.6875rem; color:var(--muted); margin:0;">Floor {{ currentSegmentIndex + 1 }} of {{ routeSegments.length }}</p>
            </div>

            <div v-if="segmentImage(currentSegment)" style="position:relative; border-radius:0.75rem; overflow:hidden; border:1px solid var(--line);">
              <img :src="segmentImage(currentSegment)" alt="" style="width:100%; display:block;">
              <div v-for="r in roomsOnFloor(segmentFloorLabel(currentSegment))" :key="r.id"
                   :style="{ position: 'absolute', left: r.map_x + '%', top: r.map_y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#9aa79f" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.375rem; font-weight:600; background:#9aa79f; color:#fff; padding:0.03rem 0.2rem; border-radius:0.15rem; white-space:nowrap; line-height:1.4;">{{ r.room_number || r.room_name }}</span>
              </div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%;">
                <polyline :points="currentSegment.points.map(p => p.x + ',' + p.y).join(' ')" fill="none" stroke="#16a34a" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="3,2" vector-effect="non-scaling-stroke" />
              </svg>
              <!-- Start pin — only on the first page, at the room's own dot -->
              <div v-if="currentSegmentIndex === 0" :style="{ position: 'absolute', left: currentSegment.points[0].x + '%', top: currentSegment.points[0].y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#14251c" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.4375rem; font-weight:700; background:#14251c; color:#fff; padding:0.05rem 0.25rem; border-radius:0.2rem; white-space:nowrap; line-height:1.4;">{{ planningMode ? 'Start' : 'You' }}</span>
              </div>
              <!-- Destination pin — only on the last page -->
              <div v-if="currentSegmentIndex === routeSegments.length - 1" :style="{ position: 'absolute', left: currentSegment.points[currentSegment.points.length - 1].x + '%', top: currentSegment.points[currentSegment.points.length - 1].y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#16a34a" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.4375rem; font-weight:700; background:#16a34a; color:#fff; padding:0.05rem 0.25rem; border-radius:0.2rem; white-space:nowrap; line-height:1.4;">{{ destination.room_number || 'Here' }}</span>
              </div>
              <!-- Stairs marker where this page's route continues onto the next floor -->
              <div v-if="currentSegmentIndex < routeSegments.length - 1" :style="{ position: 'absolute', left: currentSegment.points[currentSegment.points.length - 1].x + '%', top: currentSegment.points[currentSegment.points.length - 1].y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" fill="#0369a1" stroke="#fff" stroke-width="1.5"/><path d="M8 15l4-8 4 8" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
              <!-- Stairs marker where this page's route arrived FROM the previous floor -->
              <div v-if="currentSegmentIndex > 0" :style="{ position: 'absolute', left: currentSegment.points[0].x + '%', top: currentSegment.points[0].y + '%', transform: 'translate(-50%, -100%)' }">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="3" width="18" height="18" rx="4" fill="#0369a1" stroke="#fff" stroke-width="1.5"/><path d="M8 9l4 8 4-8" stroke="#fff" stroke-width="1.7" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </div>
            <p v-else style="font-size:0.75rem; color:var(--muted); margin:0.5rem 0;">Loading this floor's plan…</p>

            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.5rem;">
              <button type="button" @click="currentSegmentIndex--" :disabled="currentSegmentIndex === 0" class="btn-link" :style="{ fontSize: '0.8125rem', opacity: currentSegmentIndex === 0 ? 0.35 : 1 }">&larr; Previous floor</button>
              <button type="button" @click="currentSegmentIndex++" :disabled="currentSegmentIndex === routeSegments.length - 1" class="btn-link" :style="{ fontSize: '0.8125rem', opacity: currentSegmentIndex === routeSegments.length - 1 ? 0.35 : 1 }">Next floor &rarr;</button>
            </div>
          </div>
        </div>

        <!-- Only offered once every floor on the route has been calibrated by an
             admin (Floor Calibration) — otherwise there's no way to turn plan
             coordinates into real walking distance and direction. -->
        <a v-if="arGuideUrl" :href="arGuideUrl" class="btn-dark" style="margin-top:1rem; text-decoration:none;">Start AR guide</a>

        <!-- Secondary: details about the CURRENT room — still useful, just
             no longer competing with "where do you want to go" for top billing. -->
        <div class="info-card">
          <div v-if="room.notes">
            <span class="notes-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg>
              {{ room.notes }}
            </span>
          </div>
          <div v-if="room.room_type === 'office'" class="hours-badge" :style="{ marginTop: room.notes ? '0.6rem' : '0' }"><span class="dot"></span> {{ room.hours || 'Hours not set' }}</div>
          <div v-else class="no-hours" :style="{ marginTop: room.notes ? '0.6rem' : '0' }">Classroom/Lab — no fixed hours</div>
        </div>

        <template v-if="!planningMode">
          <button @click="reportOutdated" :disabled="reported" class="report-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3.5 22 20.5H2L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none"/></svg>
            {{ reported ? 'Thanks — reported to the campus admin' : 'This seems outdated — report it' }}
          </button>
          <button @click="reset" class="btn-dark">Scan Another</button>
        </template>
        <template v-else>
          <button @click="changeOrigin" class="btn-dark">Change current room</button>
          <a href="manual-search.php" class="back-link">Pick a different destination</a>
        </template>
        <a href="../Public/guide-ar.php" class="back-link">Back to outdoor guide</a>
      </div>

      <div v-else class="not-found">
        <p v-if="aiReadFailed" class="primary">Couldn't read a clear room number from that sign.</p>
        <p v-else-if="detectedNumber" class="primary">Read "<span style="font-family:'JetBrains Mono',monospace; font-weight:600; color:var(--ink);">{{ detectedNumber }}</span>" — no room registered with that number yet.</p>
        <p v-else class="primary">No room registered with that number yet.</p>
        <p class="secondary">Try repositioning the camera, or type the number manually.</p>
        <button @click="reset" class="link-btn">Try again &rarr;</button>
        <a href="manual-search.php" class="link-btn">Browse the directory instead &rarr;</a>
      </div>
    </div>
  </template>

</div>

<script src="../../Js/Include/offline-cache.js?v=<?= $cacheJsVer ?>"></script>
<script src="../../Js/Include/student-offline.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Include/floor-route.js?v=<?= $routeJsVer ?>"></script>
<script src="../../Js/Include/room-number.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/room-number.js') ?>"></script>
<script src="../../Js/Student/scan.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
