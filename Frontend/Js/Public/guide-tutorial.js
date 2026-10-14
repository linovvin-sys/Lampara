/* First-time tutorial for the student AR guide (guide-ar.php). Students only.
   Spotlights one real control at a time; the next step unlocks only when that control is really used.
   It never keeps a change to the saved settings (voice, mini-map, camera, clear-nav): they are put back on exit. */
(function () {
  'use strict';

  // Two short tours share this engine: the outdoor guide (default) and the manual room search (window.LamparaTour = 'manual').
  var TOUR = window.LamparaTour === 'manual' ? 'manual' : 'guide';

  // All the words live here. text: what to do. after: what the control is for, shown once it has been used (then Next).
  // ach: the achievement earned for finishing the step.
  var GUIDE_STEPS = [
    { id: 'search', ach: 'Destination Picker', title: 'Pick a building',  text: 'Tap the search box and choose a building.', after: 'That is your destination. Lampara draws the path and gives you turn-by-turn directions.' },
    { id: 'turn',   ach: 'Turn Reader',        title: 'Your next turn',   text: 'Tap the directions card.', note: 'Safe to tap: nothing changes during the tour.', after: 'Big words are your next move, the number is how far. Voice, Refresh and All steps sit right under it.' },
    { id: 'voice',  ach: 'Loud and Clear',     title: 'Voice directions', text: 'Tap the speaker button.', after: 'Turns are read out loud as you get close, so you can keep your eyes up. Tap again to turn it off.' },
    { id: 'more',   ach: 'Menu Opener',        title: 'More options',     text: 'Tap the three dots.', after: 'Camera, mini-map, scan a room sign, search by hand, report a problem, and this tour all live here.' },
    { id: 'done',   ach: 'Tour Complete',      title: "You're ready",     text: 'Follow the path. Replay this tour any time from the three dots.' }
  ];
  var MANUAL_STEPS = [
    { id: 'mSearch', ach: 'Room Hunter',   title: 'Search',          text: 'Tap the box and type a room, office or number.', after: 'Results narrow as you type. Rooms, offices and buildings all match.' },
    { id: 'mFilter', ach: 'Filter Fan',    title: 'Narrow it down',  text: 'Tap a kind of room.', after: 'Handy for finding the nearest restroom, library or office without typing.' },
    { id: 'mFloor',  ach: 'Floor Finder',  title: 'Where are you?',  text: 'Tap to choose your floor.', after: 'Tell us your floor and every room says whether to go up, down or stay put.' },
    { id: 'mFind',   ach: 'Inside Expert', title: 'Find inside',     text: 'Tap Find inside on a room.', note: 'Safe to tap: it does not open anything during the tour.', after: 'That opens the floor plan with the way to the door. The map button shows it on campus.' },
    { id: 'done', key: 'mDone', ach: 'Search Complete', title: "That's it",     text: 'Type a room and go. Tap the ? button to replay this tour.' }
  ];
  var GUIDE_B = {
    search: { targets: ['.search-pill', '.dd-panel'], allow: ['.search-pill input', '.dd-panel'], tap: '.dd-item', afterTargets: ['.search-pill'] },
    turn:   { targets: ['.nav-card'], needsTarget: true, shield: 'Directions card' },
    voice:  { targets: ['[data-tut=voice]'], needsTarget: true, tap: true },
    more:   { targets: ['[data-tut=more]'], needsTarget: true, tap: true, afterTargets: ['.menu-pop'] },
    done:   { targets: [] }
  };
  var MANUAL_B = {
    mSearch: { targets: ['.search-box'], tap: true },
    mFilter: { targets: ['.filter-row'], tap: '.filter-pill' },
    mFloor:  { targets: ['.here-card'], tap: '.here-pick' },
    mFind:   { targets: ['.room-card .act-inside'], force: { filterType: 'all', picking: false }, shield: 'Find inside' },
    done:    { targets: [] }
  };
  var CFG = {
    guide:  { flag: 'lampara_tutorial_done',        steps: GUIDE_STEPS,  B: GUIDE_B,  pts: 8, donePts: 12, snap: ['voiceOn', 'miniMapOn', 'clearNav', 'cameraOn', 'locationOn'], keys: ['lampara_ar_voice', 'lampara_ar_minimap', 'lampara_ar_clear'], base: { menuOpen: false, directionsOpen: false, showAllBuildings: false, searchOpen: false }, skip: 'Skip the tutorial? You can replay it from the three dots.' },
    manual: { flag: 'lampara_tutorial_manual_done', steps: MANUAL_STEPS, B: MANUAL_B, pts: 5, donePts: 8,  snap: ['q', 'filterType', 'picking'], keys: [], base: { picking: false }, skip: 'Skip the tour? Tap the ? button to replay it.' }
  };
  var FLAG = CFG[TOUR].flag, SETTING_KEYS = CFG[TOUR].keys, STEPS = CFG[TOUR].steps, B = CFG[TOUR].B, SKIP_ASK = CFG[TOUR].skip;
  var n = 0; STEPS.forEach(function (x) { n++; x.step = n; x.pts = x.id === 'done' ? CFG[TOUR].donePts : CFG[TOUR].pts; });
  var SAMPLE_NOTE = 'No destination yet, so we are using {name} as a sample.';
  var SAMPLE_GPS_NOTE = 'These are sample directions. Real ones need a location fix.';

  // How each step works. targets: what to spotlight (the first must exist). allow: what may be tapped (defaults to targets).
  // tap: any tap on an allowed control finishes it; tap as a selector: only a tap on that does. shield: tap to continue without
  // running the real control. until: finishes when this turns true. ui: menus/sheets that must be open. needsTarget: uses a destination.
  // afterTargets: what to spotlight while the explanation shows (default: the same control).

  var A = window.LamparaAudio || { play: function () {}, stop: function () {}, blip: function () {}, chime: function () {} };
  var M = window.LamparaMascots || null;

  var PAD = 6, GAP = 10, MARGIN = 12, WAIT_MS = 2500;
  var vm = null, active = false, idx = 0, snap = null, sample = null, sampleBuilding = null;
  var root, fill, ring, blocks, shield, card, inner, probe, els = {};
  var learned = false, toast = null, typer = 0, typeSkip = null;
  var raf = 0, lastSig = '', armedAt = 0, missingSince = 0, advancing = 0, confirming = false, askedThisSession = false;

  function store(fn) { try { return fn(); } catch (e) { return null; } }
  function isDone() { return store(function () { return localStorage.getItem(FLAG) === '1'; }) === true; }
  function setDone() { store(function () { localStorage.setItem(FLAG, '1'); }); }

  function visible(sel) {
    var list = document.querySelectorAll(sel);
    for (var i = 0; i < list.length; i++) { var r = list[i].getBoundingClientRect(); if (r.width > 0 && r.height > 0) return list[i]; }
    return null;
  }
  function el(tag, cls, parent) { var n = document.createElement(tag); if (cls) n.className = cls; if (parent) parent.appendChild(n); return n; }

  // ---- DOM, built once ----
  function build() {
    if (root) return;
    root = el('div', 'gt-root'); root.hidden = true;
    fill = el('div', 'gt-fill', root);
    blocks = [0, 1, 2, 3].map(function () { return el('div', 'gt-block', root); });   // four panels around the hole: taps outside never reach the page
    ring = el('div', 'gt-ring', root);
    shield = el('button', 'gt-shield', root); shield.type = 'button';
    card = el('div', 'gt-card', root); card.setAttribute('role', 'dialog'); card.tabIndex = -1;
    inner = el('div', 'gt-inner', card);                       // the card is two stepped-corner boxes: a coloured rim, then the face
    els.buddy = el('div', 'gt-buddy', inner); els.buddy.setAttribute('aria-hidden', 'true');
    els.count = el('p', 'gt-count', inner);
    els.title = el('h2', 'gt-title', inner);
    els.text = el('p', 'gt-text', inner);
    els.toast = el('p', 'gt-toast', inner);
    els.note = el('p', 'gt-note', inner);
    var row = el('div', 'gt-actions', inner);
    els.back = el('button', 'gt-btn', row); els.back.type = 'button'; els.back.textContent = 'Back';
    els.skip = el('button', 'gt-btn', row); els.skip.type = 'button'; els.skip.textContent = 'Skip';
    els.shop = el('button', 'gt-btn', row); els.shop.type = 'button'; els.shop.textContent = 'Mascots';
    els.next = el('button', 'gt-btn primary', row); els.next.type = 'button';
    probe = el('div', 'gt-probe', root);
    document.body.appendChild(root);

    els.back.addEventListener('click', function () { if (!confirming && idx > 0) go(idx - 1); });
    els.skip.addEventListener('click', function () { if (confirming) finish(); else askSkip(); });
    els.next.addEventListener('click', function () {
      if (confirming) { confirming = false; render(); } else if (idx >= STEPS.length - 1) finish(); else go(idx + 1);
    });
    els.shop.addEventListener('click', function () { if (window.LamparaMascotShop) LamparaMascotShop.open(); });
    shield.addEventListener('click', function () { complete(); });
    els.text.addEventListener('click', function () { if (typeSkip) typeSkip(); });
    card.addEventListener('keydown', cardKeys);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', function () { if (!active) return; document.hidden ? A.stop() : A.play(); });
    window.addEventListener('pagehide', function () { if (active) restore(); });
  }

  // ---- settings snapshot: nothing the tutorial toggles is kept ----
  function snapshot() {
    snap = { vm: {}, raw: {} };
    CFG[TOUR].snap.forEach(function (k) { snap.vm[k] = vm[k]; });
    SETTING_KEYS.forEach(function (k) { snap.raw[k] = store(function () { return localStorage.getItem(k); }); });
  }
  function restore() {
    if (!snap) return;
    SETTING_KEYS.forEach(function (k) {
      var v = snap.raw[k];
      store(function () { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); });
    });
    for (var k in snap.vm) vm[k] = snap.vm[k];
    if (TOUR === 'guide' && !snap.vm.voiceOn) store(function () { window.speechSynthesis && window.speechSynthesis.cancel(); });
    snap = null;
  }

  // ---- start / stop ----
  function start(force) {
    vm = window.LamparaGuide;
    if (!vm || active || (TOUR === 'guide' && !vm.started)) return;
    build();
    snapshot();
    sample = null; sampleBuilding = null;
    if (TOUR === 'guide') vm.clearNav = false;            // with a destination, "Clear navigation" would hide the very controls we point at (not saved)
    active = true; confirming = false;
    root.hidden = false;
    A.play();
    go(0);
    loop();
  }
  function finish() {
    if (!active) return;
    active = false;
    cancelAnimationFrame(raf); clearTimeout(advancing); A.stop(); if (typer) clearInterval(typer);
    setDone();
    resetUi({});
    if (vm.chatOpenFor) vm.chatOpenFor = null;
    restore();
    if (TOUR === 'guide' && sample && vm.target && vm.target.id === sample) vm.clearNavigation();
    root.hidden = true;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  function askSkip() { confirming = true; render(); }

  // ---- steps ----
  var BASE_UI = CFG[TOUR].base;
  function resetUi(want) {
    for (var k in BASE_UI) { var v = want && k in want ? want[k] : BASE_UI[k]; if (vm[k] !== v) vm[k] = v; }
  }
  function ensureTarget() {
    if (vm.target || !vm.buildings || !vm.buildings.length) return;
    sampleBuilding = vm.buildings[0]; sample = sampleBuilding.id;
    vm.selectBuilding(sampleBuilding);
  }
  function go(i) {
    clearTimeout(advancing); advancing = 0;
    idx = i; confirming = false; learned = false; toast = null; lastSig = ''; missingSince = 0;
    var b = B[STEPS[i].id];
    if (document.activeElement && document.activeElement !== document.body && document.activeElement.blur) document.activeElement.blur();
    if (b.force) for (var k in b.force) vm[k] = b.force[k];
    if (b.needsTarget) ensureTarget();
    resetUi(b.ui);
    if (b.chat) { if (!vm.chatOpenFor && vm.target) vm.openChat(vm.target); } else if (vm.chatOpenFor) vm.chatOpenFor = null;
    armedAt = Date.now() + 400;     // give Vue a moment to draw what this step needs before checking whether it is done
    if (STEPS[i].id === 'done') { learned = true; award(STEPS[i]); }
    setTimeout(function () { var t = active && visible(curTargets()[0] || '#none'); if (t && t.closest('.menu-pop') && t.scrollIntoView) t.scrollIntoView({ block: 'nearest' }); }, 80);   // a tall menu on a short screen
    render();
  }
  // The student used the control: it really ran, so now say what it is for and wait for Next.
  function complete() {
    if (advancing || confirming || learned) return;
    advancing = setTimeout(function () { advancing = 0; learned = true; award(STEPS[idx]); render(); }, 120);   // after the real control has run
  }
  function award(s) {
    toast = null;
    if (M && M.award('t:' + (s.key || s.id), s.pts)) { toast = s; A.chime(); }
  }
  // The words appear a letter at a time with a game-style chirp. The full text is already in the box (hidden), so the card
  // never changes size, and screen readers get the whole sentence at once.
  function typeText(text) {
    if (typer) clearInterval(typer); typer = 0; typeSkip = null;
    els.text.textContent = '';
    var sr = el('span', 'gt-sr', els.text), shown = el('span', 'gt-shown', els.text), rest = el('span', 'gt-rest', els.text);
    sr.textContent = text; shown.setAttribute('aria-hidden', 'true'); rest.setAttribute('aria-hidden', 'true'); rest.textContent = text;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) { shown.textContent = text; rest.textContent = ''; return; }
    var i = 0;
    typeSkip = function () { clearInterval(typer); typer = 0; typeSkip = null; shown.textContent = text; rest.textContent = ''; };
    typer = setInterval(function () {
      i++; shown.textContent = text.slice(0, i); rest.textContent = text.slice(i);
      var ch = text.charAt(i - 1); if (ch.trim() && i % 2 === 0) A.blip(ch);
      if (i >= text.length) typeSkip();
    }, 30);
  }
  function render() {
    var s = STEPS[idx], b = B[s.id], last = idx === STEPS.length - 1;
    var total = STEPS[STEPS.length - 1].step;
    var body = confirming ? SKIP_ASK : (learned && s.after) ? s.after : s.text;
    card.setAttribute('aria-label', confirming ? 'Skip the tutorial?' : 'Tutorial, ' + s.title);
    els.buddy.innerHTML = M ? M.svg(M.equipped(), 56) : '';
    els.count.textContent = confirming ? '' : 'Step ' + s.step + ' of ' + total;
    els.title.textContent = confirming ? 'Skip?' : s.title;
    typeText(body);
    els.toast.textContent = ''; els.toast.hidden = confirming || !toast;
    if (!els.toast.hidden) { var star = el('span', 'gt-star', els.toast); star.setAttribute('aria-hidden', 'true'); els.toast.appendChild(document.createTextNode('Achievement: ' + toast.ach + ' +' + toast.pts + ' pts')); }
    var note = confirming || learned ? '' : (s.note || '');
    if (!confirming && sample && b.needsTarget && vm.target && vm.target.id === sample) note = SAMPLE_NOTE.replace('{name}', sampleBuilding.name);
    else if (!confirming && s.id === 'turn' && vm.guidance && vm.guidance.sample) note = SAMPLE_GPS_NOTE;
    if (!confirming && last && M) note = 'You have ' + M.points() + ' points. Spend them on new mascots.';
    els.note.textContent = note; els.note.hidden = !note;
    els.back.hidden = confirming || idx === 0;
    els.skip.hidden = !confirming && last;
    els.shop.hidden = confirming || !last || !window.LamparaMascotShop;
    els.next.hidden = !confirming && !learned;
    els.next.textContent = confirming ? 'Keep going' : last ? 'Done' : 'Next';
    shield.hidden = !b.shield || confirming || learned;
    shield.setAttribute('aria-label', b.shield || '');
    card.classList.remove('gt-in'); void card.offsetWidth; card.classList.add('gt-in');
    ring.classList.remove('in'); void ring.offsetWidth;
    lastSig = '';
    layout(true);
    if (confirming || learned) els.next.focus({ preventScroll: true }); else card.focus({ preventScroll: true });
  }

  // ---- geometry: re-measured every frame while open, so resize, rotation and late-rendered controls all just work ----
  function insets() {
    var cs = getComputedStyle(probe);
    return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 };
  }
  function curTargets() { var b = B[STEPS[idx].id]; return learned && b.afterTargets ? b.afterTargets : b.targets; }
  function measure() {
    var tg = curTargets(), list = [];
    tg.forEach(function (sel) { var n = visible(sel); if (n) list.push(n); });
    if (!list.length || (tg.length && !visible(tg[0]))) return { missing: tg.length > 0, rect: null, list: [] };
    var r = null;
    list.forEach(function (n) {
      var q = n.getBoundingClientRect();
      r = r ? { l: Math.min(r.l, q.left), t: Math.min(r.t, q.top), r: Math.max(r.r, q.right), b: Math.max(r.b, q.bottom) } : { l: q.left, t: q.top, r: q.right, b: q.bottom };
    });
    r = { l: Math.max(0, r.l), t: Math.max(0, r.t), r: Math.min(innerWidth, r.r), b: Math.min(innerHeight, r.b) };   // a tall menu in landscape runs off screen
    return { missing: false, rect: r, list: list };
  }
  function px(n) { return Math.round(n * 10) / 10 + 'px'; }
  function place(n, x, y, w, h) { n.style.left = px(x); n.style.top = px(y); n.style.width = px(Math.max(0, w)); n.style.height = px(Math.max(0, h)); }

  function layout(force) {
    var m = measure(), r = m.rect, vw = innerWidth, vh = innerHeight;
    var sig = [r ? [r.l, r.t, r.r, r.b].map(Math.round).join() : 'none', vw, vh, inner.scrollHeight, confirming, learned].join('|');
    if (!force && sig === lastSig) return m;
    lastSig = sig;
    var sa = insets();
    fill.classList.toggle('on', !r);
    if (r) {
      place(blocks[0], 0, 0, vw, r.t);
      place(blocks[1], 0, r.b, vw, vh - r.b);
      place(blocks[2], 0, r.t, r.l, r.b - r.t);
      place(blocks[3], r.r, r.t, vw - r.r, r.b - r.t);
      var radius = m.list.length === 1 ? parseFloat(getComputedStyle(m.list[0]).borderRadius) || 0 : 0;
      ring.style.width = px(r.r - r.l + PAD * 2); ring.style.height = px(r.b - r.t + PAD * 2);
      ring.style.transform = 'translate(' + px(r.l - PAD) + ',' + px(r.t - PAD) + ')';
      ring.style.borderRadius = px(Math.max(radius + PAD, 14));
      ring.classList.add('in');
      place(shield, r.l, r.t, r.r - r.l, r.b - r.t);
    } else {
      blocks.forEach(function (n) { place(n, 0, 0, 0, 0); });
      ring.classList.remove('in');
    }
    // card: above or below the hole, whichever has room, always inside the safe area
    var w = Math.min(352, vw - MARGIN * 2 - sa.l - sa.r), x = sa.l + (vw - sa.l - sa.r - w) / 2;
    card.style.width = px(w); card.style.left = px(x); card.style.maxHeight = '';
    var ch = card.offsetHeight, top0 = sa.t + MARGIN, bot0 = vh - sa.b - MARGIN, y;
    if (!r) y = Math.max(top0, (vh - ch) / 2);
    else {
      var below = bot0 - (r.b + PAD + GAP), above = r.t - PAD - GAP - top0;
      if (ch <= below) y = r.b + PAD + GAP;
      else if (ch <= above) y = r.t - PAD - GAP - ch;
      else if (sideRoom(r, sa, vw) >= 220) {   // landscape: beside the hole
        var sl = r.l - PAD - GAP - sa.l - MARGIN, sr = vw - sa.r - MARGIN - (r.r + PAD + GAP), sw = Math.min(352, Math.max(sl, sr));
        card.style.width = px(sw); card.style.left = px(sl >= sr ? r.l - PAD - GAP - sw : r.r + PAD + GAP);
        card.style.maxHeight = px(bot0 - top0); ch = Math.min(card.offsetHeight, bot0 - top0);
        y = Math.min(bot0 - ch, Math.max(top0, (r.t + r.b) / 2 - ch / 2));
      } else if (Math.max(below, above) >= 110) {
        var room = Math.max(below, above); card.style.maxHeight = px(room);
        y = below >= above ? r.b + PAD + GAP : r.t - PAD - GAP - Math.min(ch, room);
      } else { card.style.maxHeight = px(Math.min(ch, vh * 0.45)); y = bot0 - Math.min(ch, vh * 0.45); }   // no room either side: overlay the bottom
    }
    card.style.top = px(Math.max(top0, y));
    return m;
  }

  function sideRoom(r, sa, vw) { return Math.max(r.l - PAD - GAP - sa.l - MARGIN, vw - sa.r - MARGIN - (r.r + PAD + GAP)); }

  function loop() {
    if (!active) return;
    var m = layout(false), b = B[STEPS[idx].id], now = Date.now();
    if (m.missing && !confirming && !learned) {            // a control that never appears (offline, no buildings): skip its step rather than trap the student
      if (!missingSince) missingSince = now;
      else if (now - missingSince > WAIT_MS && idx < STEPS.length - 1) go(idx + 1);
    } else missingSince = 0;
    if (b.until && !confirming && !learned && now > armedAt && b.until(vm)) complete();
    raf = requestAnimationFrame(loop);
  }

  // ---- input ----
  function allowed(node) {
    var b = B[STEPS[idx].id], sels = b.allow || b.targets;
    for (var i = 0; i < sels.length; i++) { var l = document.querySelectorAll(sels[i]); for (var j = 0; j < l.length; j++) if (l[j].contains(node)) return true; }
    return false;
  }
  function onClick(e) {
    if (!active) return;
    A.play();              // phones can hold the sound back until the first tap
    if (root.contains(e.target) || e.target.closest('.gs-root')) return;
    var b = B[STEPS[idx].id];
    if (confirming || learned || !allowed(e.target)) { e.preventDefault(); e.stopPropagation(); return; }   // once used, nothing else is tappable until Next
    if (b.tap === true || (typeof b.tap === 'string' && e.target.closest(b.tap))) complete();
  }
  function onKey(e) {
    if (!active || e.key !== 'Escape' || (window.LamparaMascotShop && LamparaMascotShop.isOpen())) return;
    e.preventDefault(); e.stopPropagation();
    if (confirming) { confirming = false; render(); } else askSkip();
  }
  // Tab from the card walks on to the highlighted control, so keyboard users can do the step too.
  function cardKeys(e) {
    if (e.key !== 'Tab' || e.shiftKey || confirming) return;
    var btns = [els.back, els.skip, els.shop, els.next].filter(function (n) { return !n.hidden; });
    if (e.target !== btns[btns.length - 1]) return;
    var t = !shield.hidden ? shield : learned ? null : visible(curTargets()[0] || '#none');
    if (!t) return;
    var f = t.matches('button,a,input,[tabindex]') ? t : t.querySelector('button,a,input,[tabindex]');
    if (f) { e.preventDefault(); f.focus(); }
  }

  window.LamparaTutorial = {
    get active() { return active; },
    start: start,
    // The list of achievements the tour can give, for the mascot shop.
    achievements: GUIDE_STEPS.map(function (x) { return { id: 't:' + x.id, name: x.ach, about: x.title, pts: x.pts || (x.id === 'done' ? CFG.guide.donePts : CFG.guide.pts) }; }).concat(MANUAL_STEPS.map(function (x) { return { id: 't:' + (x.key || x.id), name: x.ach, about: x.title, pts: x.id === 'done' ? CFG.manual.donePts : CFG.manual.pts }; })),
    // Stand-in directions for when there is no location fix (indoors, offline): the real card needs a position.
    sampleGuidance: function () {
      return { icon: 'straight', title: 'Continue straight', dist: 'for 40 m', detail: 'then turn left at the next corner', badge: '', facing: null, totalM: 120, etaMin: 2, step: -1, sample: true };
    }
  };

  // First run: when the guide UI is showing (after Start navigation, and once any QR scan screen has gone).
  function boot() {
    vm = window.LamparaGuide;
    if (!vm || !vm.$watch) return;
    var forced = /[?&]tutorial=1(&|$)/.test(location.search);
    if (!forced && isDone()) return;
    vm.$watch(function () { return TOUR === 'manual' ? !vm.loading : vm.started && !vm.scanningAnchor; }, function (ready) {
      if (!ready || askedThisSession) return;
      askedThisSession = true;          // storage blocked or not, once per visit
      setTimeout(function () { start(forced); }, 500);
    }, { immediate: true });
  }
  boot();
})();
