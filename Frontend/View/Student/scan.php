<?php
$cssVer = filemtime(__DIR__ . '/../../assets/css/tailwind.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Student/scan.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Student/scan.js');
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
      <input v-model="manualNumber" type="text" placeholder="e.g. 204" maxlength="10"
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
      <div v-if="room" style="padding-top:1.25rem;">
        <div style="display:flex; flex-direction:column; align-items:center;">
          <div class="confirm-badge">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" fill="#16a34a"/><path d="M8 12.3l2.7 2.7L16.3 9" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <span v-if="detectedNumber" class="source-tag ai"><span class="dot"></span> READ BY AI</span>
          <span v-else class="source-tag manual">MANUALLY ENTERED</span>
        </div>

        <!-- "you are here" confirmation, not just a data card — uses the room's
             actual registered notes for spatial context (e.g. "Near Exit Stairs")
             instead of the AI guessing anything about physical layout. -->
        <div class="result-heading">
          <h1>You're at Room {{ room.room_number }}!</h1>
          <p>{{ room.room_name }} &middot; {{ room.floor }}</p>
          <div v-if="room.notes">
            <span class="notes-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg>
              {{ room.notes }}
            </span>
          </div>
        </div>

        <div class="info-card">
          <div v-if="room.room_type === 'office'" class="hours-badge"><span class="dot"></span> {{ room.hours || 'Hours not set' }}</div>
          <div v-else class="no-hours">Classroom/Lab — no fixed hours</div>
          <div class="building-line">{{ room.building_name }}</div>
        </div>

        <button @click="reportOutdated" :disabled="reported" class="report-btn">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3.5 22 20.5H2L12 3.5Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.3" r="0.9" fill="currentColor" stroke="none"/></svg>
          {{ reported ? 'Thanks — reported to the campus admin' : 'This seems outdated — report it' }}
        </button>

        <!-- Destination picker: current room is confirmed, now let the
             student search where they actually want to GO. This gives a
             relative hint (same floor/building vs a different one), not
             real turn-by-turn steps — no corridor/floor-plan data exists
             to generate an actual route, that's the thesis's pathfinding
             scope, not this feature's. -->
        <div class="info-card" style="margin-top:0.25rem;">
          <p style="font-size:0.8125rem; font-weight:700; color:var(--ink); margin:0 0 0.6rem;">Where do you want to go?</p>
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

          <div v-if="destination" style="margin-top:0.75rem; padding-top:0.75rem; border-top:1px solid var(--line);">
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
          </div>
        </div>

        <button @click="reset" class="btn-dark">Scan Another</button>
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

<script src="../../Js/Student/scan.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
