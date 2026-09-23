<?php
$cssVer = filemtime(__DIR__ . '/../../assets/css/tailwind.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Public/guide-ar.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Public/guide-ar.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1, user-scalable=no">
<title>Lampara — AR Guide (test)</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/css/tailwind.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://aframe.io/releases/1.4.0/aframe.min.js"></script>
<script src="../../assets/vendor/threex-device-orientation-controls.js"></script>
<script src="../../assets/vendor/aframe-ar.js"></script>
<link rel="stylesheet" href="../../Css/Public/guide-ar.css?v=<?= $pageCssVer ?>">
</head>
<body class="bg-black">

<div id="app" class="w-screen select-none overflow-hidden">

  <!-- AR.js scene: the actual live camera + 3D-anchored building labels —
       only mounted after `started`, so permission prompts happen right
       after the tap, not before the user knows why. -->
  <a-scene v-if="started" ref="arScene" embedded
           vr-mode-ui="enabled: false"
           arjs="sourceType: webcam; debugUIEnabled: false;"
           renderer="antialias: true; alpha: true">
    <a-camera gps-new-camera="gpsMinDistance: 2; initialPositionAsOrigin: true;" rotation-reader
              cursor="rayOrigin: mouse" raycaster="objects: .ar-clickable; far: 2000"></a-camera>
  </a-scene>
  <div v-if="started" class="fade-bg"></div>

  <!-- Camera turned off mid-session. Unlike the stable guide.php (which owns
       its own <video> and can genuinely stop the MediaStream), AR.js manages
       its camera feed internally with no clean public "stop" API — messing
       with its video element directly risks breaking its render loop. This
       is a visual-only toggle: it covers the feed, the underlying AR.js
       camera and GPS tracking keep running underneath regardless. Disclosed
       in the copy below, not just in code comments. -->
  <div v-if="started && !cameraOn" class="absolute inset-0 z-[15] bg-zinc-950 flex flex-col items-center justify-center gap-4 px-8 text-center">
    <div class="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.2" stroke="#fff" stroke-width="1.6"/><path d="M3 3l18 18" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>
    </div>
    <div>
      <p class="font-semibold text-sm">Camera view hidden</p>
      <p class="text-white/50 text-xs mt-1 max-w-[240px]">AR.js's own camera feed can't be fully stopped without a page reload — this just hides it from view.</p>
    </div>
    <button @click="toggleCamera" class="press bg-emerald-500 text-zinc-900 text-xs font-semibold rounded-full px-5 py-2.5">Show camera</button>
  </div>

  <!-- Pre-app overlay: silent permission check, then (if needed) the gate screen. -->
  <transition name="gate-transition">
    <div v-if="checking || quickStart || !started" class="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950">
      <div v-if="checking" class="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center lamp-glow lamp-breathe">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
      </div>
      <div v-else-if="quickStart" class="text-center">
        <button @click="start" class="gate-icon press w-16 h-16 mx-auto rounded-2xl bg-emerald-500 flex items-center justify-center lamp-glow">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <p class="gate-heading text-white/50 text-xs mt-3">Tap to continue</p>
      </div>
      <div v-else class="text-center max-w-sm px-6">
        <div class="gate-icon w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-500 flex items-center justify-center lamp-glow">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <h1 class="gate-heading text-2xl font-bold mb-2">Start Lampara (AR test)</h1>
        <p class="gate-desc text-white/60 text-sm mb-6 leading-relaxed">Real AR.js build — needs camera, location, and compass permission, same as the main guide.</p>
        <button @click="start" class="gate-button press bg-emerald-500 hover:bg-emerald-400 text-zinc-900 rounded-2xl px-6 py-3.5 font-semibold w-full transition">
          Enable Camera &amp; Location
        </button>
        <p v-if="statusText && !statusOk" class="text-red-400 text-xs font-mono mt-4">{{ statusText }}</p>
      </div>
    </div>
  </transition>

  <!-- top status row + search (identical to the main guide) -->
  <!-- pointer-events-none on the outer overlay: its own empty flex-gap space
       must NOT swallow taps meant for the 3D scene underneath (that's what
       was intercepting arrow taps — this row's real content is short, but
       the container itself still spans a wide invisible hit-box). Each
       actual control below re-enables pointer-events-auto individually. -->
  <div v-if="started" class="main-fade-in relative z-20 p-4 flex flex-col gap-2 pointer-events-none">
    <div class="flex items-center gap-2 flex-wrap pointer-events-auto">
      <button @click="toggleCamera" class="press flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full pl-2.5 pr-3 py-1.5">
        <span class="w-1.5 h-1.5 rounded-full" :class="cameraOn ? 'bg-emerald-400' : 'bg-white/40'"></span>
        <span class="text-xs font-medium text-white">Camera {{ cameraOn ? 'on' : 'off' }}</span>
      </button>
      <button @click="toggleLocation" class="press flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full pl-2.5 pr-3 py-1.5">
        <span class="w-1.5 h-1.5 rounded-full" :class="!locationOn ? 'bg-white/40' : ((statusOk && headingInit) ? 'bg-emerald-400' : 'bg-white')"></span>
        <span class="text-xs font-medium text-white">{{ !locationOn ? 'Distance off' : (!statusOk ? 'GPS + Compass' : (headingInit ? 'GPS + Compass' : 'GPS ready · Compass…')) }}</span>
      </button>
      <button @click="runArDebug" class="press bg-emerald-500 text-zinc-900 text-xs font-bold rounded-full px-3 py-1.5">AR debug</button>
    </div>
    <a href="../Student/manual-search.php" class="self-start pointer-events-auto flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M8.5 8.7a9.9 9.9 0 0 1 10.9 2M5 12a9.9 9.9 0 0 1 3-2.2M12 19.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6ZM8.8 15.2a5.5 5.5 0 0 1 6.6.1" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      No signal? Search manually
    </a>
    <div class="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3.5 py-2.5 pointer-events-auto">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="flex-shrink-0"><circle cx="10.5" cy="10.5" r="6.5" stroke="#fff" stroke-opacity="0.5" stroke-width="1.8"/><path d="M20 20l-4.5-4.5" stroke="#fff" stroke-opacity="0.5" stroke-width="1.8" stroke-linecap="round"/></svg>
      <input v-model="searchQuery" type="text" placeholder="Search a building to get directions…"
             class="flex-1 bg-transparent text-sm text-white placeholder-white/40 focus:outline-none">
      <button v-if="searchQuery" @click="searchQuery = ''" class="text-white/50 text-xs font-medium flex-shrink-0">Clear</button>
      <!-- For anyone who'd rather browse than type — toggles the full list
           below regardless of whatever's (or isn't) in the search box. -->
      <button @click="showAllBuildings = !showAllBuildings" class="text-white/50 flex-shrink-0" aria-label="Browse all buildings">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :style="{ transform: showAllBuildings ? 'rotate(180deg)' : 'none' }" style="transition: transform 160ms ease-out;">
          <path d="M6 9l6 6 6-6" stroke="#fff" stroke-opacity="0.7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
    </div>

    <!-- Always shown for any match (not just when there's more than one) —
         typing never auto-selects now, so this dropdown is the only way to
         actually pick a building. Disappears once the current target is the
         thing being shown, so it doesn't linger over an already-made pick.
         Also opens (showing every building, unfiltered) when the browse
         toggle above is tapped, independent of whatever's in the search box. -->
    <transition name="dropdown">
      <div v-if="dropdownList.length > 0 && !(target && dropdownList.some(b => b.id === target.id))" class="bg-white/10 border border-white/15 rounded-2xl overflow-hidden pointer-events-auto max-h-72 overflow-y-auto">
        <div class="px-3.5 pt-2.5 pb-1 text-[11px] font-medium text-white/50">{{ searchQuery.trim().length >= 2 ? (dropdownList.length > 1 ? 'Did you mean…' : 'Tap to select') : 'All buildings' }}</div>
        <button v-for="b in dropdownList" :key="b.id" @click="selectBuilding(b); showAllBuildings = false"
                class="press w-full text-left px-3.5 py-2.5 text-sm text-white hover:bg-white/10 transition border-t border-white/10">
          {{ b.name }}
        </button>
      </div>
    </transition>
  </div>

  <!-- Location turned off mid-session: pauses OUR OWN distance-tracking GPS
       watch (used only for the 2D card below). AR.js's own internal GPS
       positioning for the 3D-anchored entities keeps running regardless —
       there's no safe way to pause that without touching AR.js internals,
       so this is disclosed as a partial toggle, not pretended to be total. -->
  <div v-if="started && !locationOn" class="absolute top-[30%] inset-x-0 z-10 flex justify-center px-8">
    <button @click="toggleLocation" class="press flex items-center gap-2 bg-black/60 text-white text-xs font-medium rounded-full px-4 py-2.5">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2" stroke="#fff" stroke-width="1.6"/></svg>
      Distance display off — tap to turn back on
    </button>
  </div>

  <!-- target info card: 2D overlay for reliably-readable distance/name —
       the 3D label in the AR scene itself is the "real AR" anchor; this
       card is the trustworthy fallback readout, same discipline as v10's
       distance-in-label design in ar-test.php. -->
  <div v-if="started && target" class="absolute inset-x-0 z-10 flex justify-center px-8" style="bottom: 11.5rem;">
    <div class="bg-white text-zinc-900 rounded-2xl px-4 py-3 inline-block shadow-2xl text-center">
      <div class="font-semibold text-base">{{ target.name }}</div>
      <div class="text-xs mt-0.5">
        <span v-if="locationOn"><span class="font-mono font-medium text-emerald-600">{{ target.distance }}m</span> <span class="text-zinc-500">away</span></span>
        <span v-else class="text-zinc-400 italic">distance display off</span>
      </div>
      <!-- The 3D arrow only exists in real 3D space — if you're not roughly
           facing the target, it's simply not rendered (outside the camera's
           view) with no other hint. This is the fallback: an independent
           compass reading (see startCompassWatch), separate from AR.js's
           own, telling you which way to turn when that happens. -->
      <div v-if="offTargetDirection" class="flex items-center justify-center gap-1.5 mt-1.5 text-emerald-600 font-semibold text-xs">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" :style="{ transform: 'rotate(' + (offTargetDirection === 'left' ? -90 : 90) + 'deg)' }">
          <path d="M12 3.5 L19.5 16 L12 12.7 L4.5 16 Z" fill="#059669"/>
        </svg>
        Turn {{ offTargetDirection }} to find it
      </div>
    </div>
  </div>

  <!-- bottom action row -->
  <div v-if="started && target" class="absolute bottom-10 inset-x-0 z-20 flex flex-col items-center gap-3">
    <a href="../Student/scan.php" class="press flex items-center gap-2 bg-white/95 text-zinc-900 rounded-full px-4 py-2.5 text-xs font-medium shadow-lg">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.2" stroke="#111" stroke-width="1.6"/></svg>
      Scan signage (indoor)
    </a>
    <button @click="openChat(target)" class="press flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-zinc-900 rounded-full px-6 py-3.5 font-semibold shadow-2xl transition lamp-glow">
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M21 12c0 4.418-4.03 8-9 8-1.06 0-2.078-.163-3.024-.463L3 21l1.5-4.5C3.55 15.06 3 13.57 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8Z" stroke="#111" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>
      Ask Lampara
    </button>
  </div>

  <!-- chat panel (identical to the main guide) -->
  <transition name="sheet">
    <div v-if="chatOpenFor" class="absolute inset-0 z-40 bg-zinc-950/60" @click.self="chatOpenFor = null">
      <div class="bg-white text-zinc-900 w-full h-full flex flex-col">
        <div class="flex justify-between items-center px-5 pt-5 pb-3 border-b border-zinc-100">
          <h2 class="font-bold">Ask Lampara</h2>
          <button @click="chatOpenFor = null" class="press text-zinc-400 text-2xl leading-none">&times;</button>
        </div>
        <div class="px-5 pt-3">
          <div class="flex items-center gap-2 bg-emerald-50 text-emerald-700 text-[11px] font-medium rounded-xl px-3 py-2">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></span>
            Grounded on {{ chatOpenFor.name }}'s registered directory only
          </div>
        </div>
        <transition-group tag="div" name="msg" class="flex-1 overflow-y-auto px-5 py-4 space-y-3 text-sm" ref="chatLog">
          <div v-for="(m, i) in chatMessages" :key="i" class="flex items-end gap-2" :class="m.role === 'user' ? 'justify-end' : 'justify-start'">
            <div v-if="m.role !== 'user'" class="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <div class="inline-block px-3.5 py-2.5 rounded-2xl max-w-[75%] text-left" :class="m.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-800'" v-html="formatMessage(m.text)"></div>
          </div>
          <div v-if="chatLoading" key="typing" class="flex items-end gap-2 justify-start">
            <div class="w-7 h-7 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
            </div>
            <span class="inline-flex items-center gap-1 bg-zinc-100 rounded-2xl px-4 py-3.5">
              <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
            </span>
          </div>
        </transition-group>
        <form @submit.prevent="sendChat" class="flex gap-2 p-4 pb-6 border-t border-zinc-100">
          <input v-model="chatInput" type="text" placeholder="Ask about this building…" :disabled="chatLoading"
                 class="flex-1 bg-zinc-100 rounded-full px-4 py-3 text-sm focus:outline-none disabled:opacity-60">
          <button class="press w-11 h-11 rounded-full bg-emerald-500 flex items-center justify-center flex-shrink-0 disabled:opacity-60" :disabled="chatLoading">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 12.5 20 4l-4.5 16-4-6.5L4 12.5Z" stroke="#111" stroke-width="1.7" stroke-linejoin="round"/></svg>
          </button>
        </form>
      </div>
    </div>
  </transition>

</div>

<script src="../../Js/Public/guide-ar.js?v=<?= $pageJsVer ?>"></script>

</body>
</html>
