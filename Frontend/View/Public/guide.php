<?php $cssVer = filemtime(__DIR__ . '/../../assets/css/tailwind.css'); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Guide</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<link rel="manifest" href="manifest.json">
<link rel="apple-touch-icon" href="../../assets/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../assets/css/tailwind.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<link rel="stylesheet" href="../../Css/Public/guide.css">
</head>
<body class="bg-black">

<div id="app" class="relative w-screen h-screen text-white select-none overflow-hidden">

  <!-- live camera background -->
  <video id="camera-feed" autoplay playsinline muted></video>
  <div class="absolute inset-0 z-0 fade-bg"></div>

  <!-- Camera turned off mid-session (see toggleCamera) — replaces the live
       feed with a plain placeholder + a way back on, instead of the browser
       permission needing to be reset. Sits under the ambient/target AR
       layer (same z-10) so GPS-based info still shows even with no camera. -->
  <div v-if="started && !cameraOn" class="absolute inset-0 z-10 bg-zinc-950 flex flex-col items-center justify-center gap-4 px-8 text-center">
    <div class="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3.2" stroke="#fff" stroke-width="1.6"/><path d="M3 3l18 18" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/></svg>
    </div>
    <div>
      <p class="font-semibold text-sm">Camera is off</p>
      <p class="text-white/50 text-xs mt-1">Turn it back on to see the live outdoor view.</p>
    </div>
    <button @click="toggleCamera" class="press bg-emerald-500 text-zinc-900 text-xs font-semibold rounded-full px-5 py-2.5">Turn camera on</button>
  </div>

  <!-- Pre-app overlay: silent permission check, then (if needed) the gate
       screen — both live under one transition so the whole thing cross-fades
       smoothly into the live camera/AR view instead of cutting instantly. -->
  <transition name="gate-transition">
    <div v-if="checking || quickStart || !started" class="absolute inset-0 z-30 flex items-center justify-center bg-zinc-950">
      <!-- brief silent check for an already-granted permission — avoids a
           flash of the full gate screen for returning users who'll skip it -->
      <div v-if="checking" class="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center lamp-glow lamp-breathe">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
      </div>

      <!-- returning visitor, permission already granted — one lightweight
           tap (not the full explanation) still gets a real gesture for the
           compass permission request inside start() -->
      <div v-else-if="quickStart" class="text-center">
        <button @click="start" class="gate-icon press w-16 h-16 mx-auto rounded-2xl bg-emerald-500 flex items-center justify-center lamp-glow">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
        </button>
        <p class="gate-heading text-white/50 text-xs mt-3">Tap to continue</p>
      </div>

      <!-- setup / permission screen — only reached on a genuine first visit,
           or if permission was previously denied/reset -->
      <div v-else class="text-center max-w-sm px-6">
        <div class="gate-icon w-14 h-14 mx-auto mb-5 rounded-2xl bg-emerald-500 flex items-center justify-center lamp-glow">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
        </div>
        <h1 class="gate-heading text-2xl font-bold mb-2">Start Lampara</h1>
        <p class="gate-desc text-white/60 text-sm mb-6 leading-relaxed">Needs camera, location, and compass permission to point you toward nearby registered buildings.</p>
        <button @click="start" class="gate-button press bg-emerald-500 hover:bg-emerald-400 text-zinc-900 rounded-2xl px-6 py-3.5 font-semibold w-full transition">
          Enable Camera &amp; Location
        </button>
        <p v-if="statusText && !statusOk" class="text-red-400 text-xs font-mono mt-4">{{ statusText }}</p>
      </div>
    </div>
  </transition>

  <!-- top status row + search -->
  <div v-if="started" class="main-fade-in relative z-20 p-4 flex flex-col gap-2">
    <div class="flex items-center gap-2 flex-wrap">
      <button @click="toggleCamera" class="press flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full pl-2.5 pr-3 py-1.5">
        <span class="w-1.5 h-1.5 rounded-full" :class="cameraOn ? 'bg-emerald-400' : 'bg-white/40'"></span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="12.5" r="3" stroke="#fff" stroke-width="1.5"/></svg>
        <span class="text-xs font-medium text-white">Camera {{ cameraOn ? 'on' : 'off' }}</span>
      </button>
      <button @click="toggleLocation" class="press flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full pl-2.5 pr-3 py-1.5">
        <span class="w-1.5 h-1.5 rounded-full" :class="!locationOn ? 'bg-white/40' : ((statusOk && headingInit) ? 'bg-emerald-400' : 'bg-white')"></span>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2" stroke="#fff" stroke-width="1.5"/></svg>
        <span class="text-xs font-medium text-white">{{ !locationOn ? 'Location off' : (!statusOk ? 'GPS + Compass' : (headingInit ? 'GPS + Compass' : 'GPS ready · Compass…')) }}</span>
      </button>
    </div>
    <a href="../Student/manual-search.php" class="self-start flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-full px-3 py-1.5 text-xs font-medium text-white hover:bg-white/20 transition">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M3 3l18 18M8.5 8.7a9.9 9.9 0 0 1 10.9 2M5 12a9.9 9.9 0 0 1 3-2.2M12 19.5a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6ZM8.8 15.2a5.5 5.5 0 0 1 6.6.1" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      No signal? Search manually
    </a>
    <div class="flex items-center gap-2 bg-white/10 border border-white/15 rounded-full px-3.5 py-2.5">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" class="flex-shrink-0"><circle cx="10.5" cy="10.5" r="6.5" stroke="#fff" stroke-opacity="0.5" stroke-width="1.8"/><path d="M20 20l-4.5-4.5" stroke="#fff" stroke-opacity="0.5" stroke-width="1.8" stroke-linecap="round"/></svg>
      <input v-model="searchQuery" type="text" placeholder="Search a building to get directions…"
             class="flex-1 bg-transparent text-sm text-white placeholder-white/40 focus:outline-none">
      <button v-if="searchQuery" @click="searchQuery = ''" class="text-white/50 text-xs font-medium flex-shrink-0">Clear</button>
    </div>

    <!-- Disambiguation: several buildings match the query, so don't silently
         pick one (the Critical misidentification gap) — ask instead. -->
    <div v-if="searchMatches.length > 1 && !(target && searchMatches.some(b => b.id === target.id))" class="bg-white/10 border border-white/15 rounded-2xl overflow-hidden">
      <div class="px-3.5 pt-2.5 pb-1 text-[11px] font-medium text-white/50">Did you mean…</div>
      <button v-for="b in searchMatches" :key="b.id" @click="selectBuilding(b)"
              class="press w-full text-left px-3.5 py-2.5 text-sm text-white hover:bg-white/10 transition border-t border-white/10">
        {{ b.name }}
      </button>
    </div>
  </div>

  <!-- Location turned off mid-session (see toggleLocation) — ambient labels
       and the target arrow both depend on live GPS, so replace them with a
       simple way back on instead of silently freezing stale positions. -->
  <div v-if="started && !locationOn" class="absolute top-[30%] inset-x-0 z-10 flex justify-center px-8">
    <button @click="toggleLocation" class="press flex items-center gap-2 bg-black/60 text-white text-xs font-medium rounded-full px-4 py-2.5">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2" stroke="#fff" stroke-width="1.6"/></svg>
      Location is off — tap to turn on for directions
    </button>
  </div>

  <!-- ambient idle labels: every nearby building's name, dim, positioned left/right by
       relative compass bearing so it roughly matches the direction you'd turn to face it -->
  <div v-if="started && locationOn" class="absolute inset-0 z-10 pointer-events-none">
    <div v-for="b in ambientBuildings" :key="b.id"
         class="absolute top-[30%] -translate-x-1/2 transition-all duration-300 bg-black/40 text-white/70 text-xs font-medium rounded-full px-3 py-1.5 whitespace-nowrap"
         :style="{ left: 'clamp(70px, ' + b.leftPercent + '%, calc(100% - 70px))' }">
      {{ b.name }}
    </div>
  </div>

  <!-- target building: bouncing arrow + card, promoted once search finds a match -->
  <div v-if="started && locationOn && target" class="absolute top-[36%] -translate-x-1/2 z-10 text-center transition-all duration-300" :style="{ left: 'clamp(140px, ' + target.leftPercent + '%, calc(100% - 140px))' }">
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" class="mx-auto mb-2 lamp-glow ar-bounce" :style="{ transform: 'rotate(' + (target.offscreen ? (target.offscreen === 'left' ? -90 : 90) : 0) + 'deg)' }">
      <path d="M12 3.5 L19.5 16 L12 12.7 L4.5 16 Z" fill="#10b981"/>
    </svg>
    <div class="bg-white text-zinc-900 rounded-2xl px-4 py-3 inline-block shadow-2xl">
      <div class="font-semibold text-base">{{ target.name }}</div>
      <div class="text-xs mt-0.5">
        <span class="font-mono font-medium text-emerald-600">{{ target.distance }}m</span>
        <span class="text-zinc-500">{{ target.offscreen ? '— turn to face it' : 'away' }}</span>
      </div>
    </div>
  </div>

  <!-- bottom action row: only once a search finds a target building -->
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

  <!-- chat panel -->
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

<script src="../../Js/Public/guide.js"></script>

</body>
</html>
