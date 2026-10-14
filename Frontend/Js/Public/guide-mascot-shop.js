/* The mascot shop and achievements list for the AR guide. Points come from tutorial achievements (see mascots.js);
   everything is kept on this phone only, so it needs no account and works offline. */
(function () {
  'use strict';

  var M = window.LamparaMascots;
  var OUT = [   // achievements earned by really using the app
    { id: 'explorer', name: 'Campus Explorer', about: 'Arrive at every building', pts: 50 },
    { id: 'first-question', name: 'First Question', about: 'Ask Lampara something', pts: 5 },
    { id: 'streak3', name: 'Three Day Streak', about: 'Open the guide 3 days in a row', pts: 10 },
    { id: 'streak7', name: 'Week Warrior', about: 'Open the guide 7 days in a row', pts: 30 },
    { id: 'quiz-perfect', name: 'Perfect Score', about: 'Answer every quiz question right', pts: 15 },
    { id: 'orient:done', name: 'Orientation Complete', about: 'Collect every orientation stamp', pts: 50 }
  ];
    var sndBtn = null, isOwner = false;
  // Owner tools show only for a logged-in admin: the server says so (the same answer the campus-only check uses), the page cannot fake it.
  try { fetch('../../../Backend/api/fence.php', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) { isOwner = !!(d && d.bypass); }).catch(function () {}); } catch (e) { /* no owner tools */ }
  var root, panel, body, pointsEl, closeBtn, tabs = {}, tab = 'mascots', opener = null, open = false;

  function el(tag, cls, parent, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; if (parent) parent.appendChild(n); return n; }
  function A() { return window.LamparaAudio || { chime: function () {} }; }

  function build() {
    if (root) return;
    root = el('div', 'gs-root'); root.hidden = true;
    root.addEventListener('click', function (e) { if (e.target === root) close(); });
    panel = el('div', 'gs-panel', root); panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-modal', 'true'); panel.setAttribute('aria-label', 'Mascots and achievements');
    var face = el('div', 'gs-face', panel);
    var head = el('div', 'gs-head', face);
    var left = el('div', 'gs-hl', head), right = el('div', 'gs-hr', head);
    el('h2', 'gs-title', left, 'Mascots');
    pointsEl = el('p', 'gs-points', left);
    sndBtn = el('button', 'gt-btn gs-snd', right); sndBtn.type = 'button'; sndBtn.addEventListener('click', function () { var A_ = window.LamparaAudio; if (!A_) return; A_.setEnabled(!A_.enabled()); applyMusic(); });
    var shareBtn = el('button', 'gt-btn gs-share', right, 'Share'); shareBtn.type = 'button'; shareBtn.addEventListener('click', share);
    closeBtn = el('button', 'gt-btn gs-close', right, 'Close'); closeBtn.type = 'button'; closeBtn.addEventListener('click', close);
    var bar = el('div', 'gs-tabs', face); bar.setAttribute('role', 'tablist');
    [['mascots', 'Mascots'], ['themes', 'Themes'], ['quests', 'Quests'], ['pass', 'Passport'], ['quiz', 'Quiz'], ['ach', 'Awards']].forEach(function (t) {
      var b = el('button', 'gt-btn gs-tab', bar, t[1]); b.type = 'button'; b.setAttribute('role', 'tab');
      b.addEventListener('click', function () { tab = t[0]; render(); }); tabs[t[0]] = b;
    });
    body = el('div', 'gs-body', face);
    document.body.appendChild(root);
    document.addEventListener('keydown', function (e) {
      if (!open) return;
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
      else if (e.key === 'Tab') {                                       // keep focus inside the panel
        var f = panel.querySelectorAll('button:not([disabled])'); if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    }, true);
    M.onChange(function () { if (open) render(); });
  }

  function star(parent) { var s = el('span', 'gt-star', parent); s.setAttribute('aria-hidden', 'true'); return s; }

  function render() {
    var pts = M.points(), eq = M.equipped(), keep = document.activeElement && document.activeElement.getAttribute('data-k');
    pointsEl.textContent = ''; star(pointsEl); pointsEl.appendChild(document.createTextNode(pts + ' points'));
    for (var t in tabs) { tabs[t].setAttribute('aria-selected', String(t === tab)); tabs[t].classList.toggle('on', t === tab); }
    body.textContent = '';
    if (tab === 'mascots') {
      if (isOwner) {   // a logged-in admin can try every mascot without earning the points
        var own = el('div', 'gs-owner', body);
        el('span', '', own, 'Owner tools');
        var all = el('button', 'gt-btn', own, 'Unlock all mascots'); all.type = 'button';
        all.addEventListener('click', function () { M.list.forEach(function (m) { M.grant(m.id); }); M.grant('guardian'); M.grantThemes(); });
      }
      var grid = el('ul', 'gs-grid', body);
      M.list.forEach(function (m) {
        var li = el('li', 'gs-item' + (m.id === eq ? ' eq' : '') + (m.rarity ? ' ' + m.rarity : ''), grid), owned = M.has(m.id);
        var tile = el('div', 'gs-tile', li); tile.setAttribute('aria-hidden', 'true'); tile.innerHTML = M.svg(m.id, 64);
        el('p', 'gs-name', li, m.name); if (m.rarity) el('span', 'gs-rarity', li, 'MYTHIC'); el('p', 'gs-blurb', li, m.blurb);
        var b = el('button', 'gt-btn' + ((owned || pts >= m.price) && m.id !== eq ? ' primary' : ''), li); b.type = 'button'; b.setAttribute('data-k', m.id);
        if (m.id === eq) { b.textContent = 'In use'; b.disabled = true; b.setAttribute('aria-label', m.name + ', in use'); }
        else if (owned) { b.textContent = 'Use'; b.setAttribute('aria-label', 'Use ' + m.name); b.addEventListener('click', function () { M.equip(m.id); }); }
        else if (pts >= m.price) { b.textContent = 'Buy ' + m.price; b.setAttribute('aria-label', 'Buy ' + m.name + ' for ' + m.price + ' points'); b.addEventListener('click', function () { if (M.buy(m.id)) A().chime(); }); }
        else { b.textContent = m.price + ' pts'; b.disabled = true; b.setAttribute('aria-label', m.name + ', needs ' + m.price + ' points, you have ' + pts); }
      });
    } else if (tab === 'themes') {
      var cur = M.theme(), tg = el('ul', 'gs-grid', body);
      M.themes.forEach(function (t) {
        var li = el('li', 'gs-item' + (t.id === cur ? ' eq' : ''), tg), owned = M.themeOwned(t.id);
        var tile = el('div', 'gs-tile gs-swatch', li); tile.setAttribute('aria-hidden', 'true'); tile.style.background = t.sw[1]; el('i', '', tile).style.background = t.sw[0];
        el('p', 'gs-name', li, t.name); el('p', 'gs-blurb', li, t.season ? t.note + '. In season: half price!' : t.note);
        var b = el('button', 'gt-btn' + ((owned || pts >= t.price) && t.id !== cur ? ' primary' : ''), li); b.type = 'button'; b.setAttribute('data-k', 'th:' + t.id);
        if (t.id === cur) { b.textContent = 'In use'; b.disabled = true; }
        else if (owned) { b.textContent = 'Use'; b.setAttribute('aria-label', 'Use the ' + t.name + ' theme'); b.addEventListener('click', function () { M.equipTheme(t.id); }); }
        else if (pts >= t.price) { b.textContent = 'Buy ' + t.price; b.setAttribute('aria-label', 'Buy the ' + t.name + ' theme for ' + t.price + ' points'); b.addEventListener('click', function () { if (M.buyTheme(t.id)) A().chime(); }); }
        else { b.textContent = t.price + ' pts'; b.disabled = true; b.setAttribute('aria-label', t.name + ', needs ' + t.price + ' points, you have ' + pts); }
      });
    } else if (tab === 'quests') {
      renderQuests();
    } else if (tab === 'pass') {
      renderPassport();
    } else if (tab === 'quiz') {
      renderQuiz();
    } else {
      var list = (window.LamparaTutorial && LamparaTutorial.achievements) || [], got = M.earnedList(), done = 0;
      list.forEach(function (a) { if (got[a.id] !== undefined) done++; });
      var vm = window.LamparaGuide, nb = vm && vm.buildings ? vm.buildings.length : 0, st = M.streak();
      el('p', 'gs-sum', body, 'Buildings reached: ' + M.visited() + (nb ? ' of ' + nb : '') + '. Day streak: ' + st + (st === 1 ? ' day' : ' days') + '. Each building you reach earns 10 points, and each day you visit earns a bonus.');
      el('h3', 'gs-sub', body, 'Out and about');
      var ul0 = el('ul', 'gs-ach', body);
      OUT.concat(M.achievements).forEach(function (a) { achRow(ul0, a, got); });
      el('h3', 'gs-sub', body, 'Tutorial (' + done + ' of ' + list.length + ')');
      var ul = el('ul', 'gs-ach', body);
      list.forEach(function (a) { achRow(ul, a, got); });
    }
    if (keep) { var again = body.querySelector('[data-k="' + keep + '"]'); if (again && !again.disabled) again.focus(); }
  }

  // ---- Weekly quests: three goals each Monday, ticked off by really using the app ----
  function renderQuests() {
    var qs = M.quests(), done = 0;
    qs.forEach(function (q) { if (q.done) done++; });
    el('p', 'gs-sum', body, done + ' of ' + qs.length + ' quests done this week. New ones every Monday.');
    var ul = el('ul', 'gs-quests', body);
    qs.forEach(function (q) {
      var li = el('li', q.done ? 'on' : '', ul), top = el('div', 'gs-qtop', li);
      var mark = el('span', 'gs-mark', top); mark.setAttribute('aria-hidden', 'true'); if (q.done) star(mark);
      el('strong', '', top, q.text); el('em', '', top, '+' + q.pts);
      var bar = el('div', 'gs-bar', li); bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', String(q.target)); bar.setAttribute('aria-valuenow', String(q.have)); bar.setAttribute('aria-label', q.text);
      for (var i = 0; i < q.target; i++) el('span', i < q.have ? 'on' : '', bar);
      el('small', '', li, q.done ? 'Done. Points added.' : q.have + ' of ' + q.target);
    });
  }

  // ---- Campus passport: a stamp for every building you have really reached, and a trail of the offices a new student needs ----
  var TRAIL = [['registrar', 'Registrar'], ['library', 'Library'], ['clinic', 'Clinic'], ['cashier', 'Cashier'], ['guidance', 'Guidance'], ['student affairs', 'Student affairs']];
  function renderPassport() {
    var vm = window.LamparaGuide, bs = (vm && vm.buildings) || [], got = M.earnedList(), n = 0;
    bs.forEach(function (b) { if (got['visit:' + b.id] !== undefined) n++; });
    el('p', 'gs-sum', body, n + ' of ' + bs.length + ' stamps. Walk to a building with Lampara to stamp it.');
    var grid = el('ul', 'gs-stamps', body);
    bs.forEach(function (b) {
      var on = got['visit:' + b.id] !== undefined, li = el('li', on ? 'on' : '', grid);
      var mark = el('span', 'gs-stamp', li); mark.setAttribute('aria-hidden', 'true'); if (on) star(mark);
      el('span', 'gs-sname', li, b.name); li.setAttribute('aria-label', b.name + ', ' + (on ? 'stamped' : 'not stamped yet'));
    });
    var trail = M.trail((vm && vm.rooms) || []);
    if (!trail.length) return;
    var got2 = 0; trail.forEach(function (t) { if (t.done) got2++; });
    el('h3', 'gs-sub', body, 'Orientation week: ' + got2 + ' of ' + trail.length);
    el('p', 'gs-sum', body, 'Find each office with an indoor route. Finish a route to its room and you get the stamp, 15 points each, and 50 more for the full set.');
    var ul = el('ul', 'gs-ach', body);
    trail.forEach(function (t) {
      var li = el('li', t.done ? 'on' : '', ul);
      var mark = el('span', 'gs-mark', li); mark.setAttribute('aria-hidden', 'true'); if (t.done) star(mark);
      var txt = el('span', 'gs-atxt', li); el('strong', '', txt, t.label); el('small', '', txt, t.room.building_name + (t.room.floor ? ', ' + t.room.floor : ''));
      var go = el('button', 'gt-btn', li, t.done ? 'Again' : 'Go'); go.type = 'button'; go.setAttribute('aria-label', (t.done ? 'Go again to ' : 'Go to ') + t.label + ', ' + t.room.building_name);
      go.addEventListener('click', function () { close(); if (vm.pickRoomHud) vm.pickRoomHud(t.room); });
    });
  }

  // ---- Campus quiz: five "where is it?" questions from the school's own directory. Points once a day, practice any time. ----
  var quiz = null;
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  // Questions come from the school's own directory, and only about things that have one clear answer: a named office (never "Lecture
  // Room" or "Comfort Room", which exist in many buildings), the floor it is on, or which building has which number.
  var GENERIC = /^(lecture|laboratory|computer|classroom|comfort|room|cr)\b|\b(lecture room|laboratory room|comfort room)$/i;
  function newQuiz() {
    var vm = window.LamparaGuide, all = (vm && vm.rooms) || [], bs = (vm && vm.buildings) || [], count = {}, qs = [];
    all.forEach(function (r) { var k = String(r.room_name || '').trim().toLowerCase(); count[k] = (count[k] || 0) + 1; });
    var named = shuffle(all.filter(function (r) { var n = String(r.room_name || '').trim(); return n && r.building_name && count[n.toLowerCase()] === 1 && r.category !== 'cr' && !GENERIC.test(n); }));
    var names = bs.map(function (b) { return b.name; });
    var kinds = shuffle(['where', 'where', 'floor', 'floor', 'number']), used = {};
    function pickNamed(test) { for (var i = 0; i < named.length; i++) if (!used[named[i].id] && (!test || test(named[i]))) { used[named[i].id] = 1; return named[i]; } return null; }
    kinds.forEach(function (kind) {
      var r, others;
      if (kind === 'where' && names.length >= 4 && (r = pickNamed())) {
        others = shuffle(names.filter(function (x) { return x !== r.building_name; })).slice(0, 3);
        qs.push({ text: 'Which building is ' + r.room_name + ' in?', answer: r.building_name, options: shuffle(others.concat([r.building_name])), fb: r.room_name + ' is in ' + r.building_name + '.' });
      } else if (kind === 'floor' && (r = pickNamed(function (x) { return x.floor && all.filter(function (y) { return y.building_id === x.building_id && y.floor; }).map(function (y) { return y.floor; }).filter(function (v, i, a2) { return a2.indexOf(v) === i; }).length >= 2; }))) {
        var floors = shuffle(all.filter(function (y) { return y.building_id === r.building_id && y.floor && y.floor !== r.floor; }).map(function (y) { return y.floor; }).filter(function (v, i, a2) { return a2.indexOf(v) === i; })).slice(0, 3);
        qs.push({ text: 'Which floor is ' + r.room_name + ' on, in ' + r.building_name + '?', answer: r.floor, options: shuffle(floors.concat([r.floor])), fb: r.room_name + ' is on the ' + r.floor + '.' });
      } else if (kind === 'number') {
        var nb = shuffle(bs.filter(function (b) { return b.building_number; }));
        if (nb.length >= 2) {
          var b0 = nb[0], nums = shuffle(bs.map(function (b) { return b.building_number; }).filter(function (n, i, a2) { return n && n !== b0.building_number && a2.indexOf(n) === i; })).slice(0, 3);
          if (nums.length >= 2) qs.push({ text: 'What is the building number of ' + b0.name + '?', answer: String(b0.building_number), options: shuffle(nums.map(String).concat([String(b0.building_number)])), fb: b0.name + ' is building number ' + b0.building_number + '.' });
        }
      }
    });
    while (qs.length < 5 && names.length >= 4 && (r = pickNamed())) {      // top up with "which building" questions
      others = shuffle(names.filter(function (x) { return x !== r.building_name; })).slice(0, 3);
      qs.push({ text: 'Which building is ' + r.room_name + ' in?', answer: r.building_name, options: shuffle(others.concat([r.building_name])), fb: r.room_name + ' is in ' + r.building_name + '.' });
    }
    if (qs.length < 3) return null;
    return { i: 0, score: 0, picked: null, over: false, qs: shuffle(qs).slice(0, 5) };
  }
  function quizPts() { return quiz.score * 2 + (quiz.score === quiz.qs.length ? 5 : 0); }
  function renderQuiz() {
    if (!quiz) quiz = newQuiz();
    if (!quiz) { el('p', 'gs-sum', body, 'The quiz needs the building and room directory. Open the guide once with a connection and it will be ready, even offline.'); return; }
    var q = quiz.qs[quiz.i];
    if (quiz.over) {
      var full = quiz.score === quiz.qs.length, pts = quizPts(), msg;
      msg = quiz.paid ? 'You earned ' + pts + ' points.' : 'Points for today are already collected. This one was for practice.';
      el('h3', 'gs-sub', body, 'You got ' + quiz.score + ' of ' + quiz.qs.length);
      el('p', 'gs-sum', body, msg + (full ? ' Perfect round!' : ''));
      var again = el('button', 'gt-btn primary', body, 'Play again'); again.type = 'button'; again.addEventListener('click', function () { quiz = null; render(); });
      return;
    }
    el('p', 'gs-sum', body, 'Question ' + (quiz.i + 1) + ' of ' + quiz.qs.length + '. One round a day earns points.');
    el('h3', 'gs-q', body, q.text);
    var ul = el('ul', 'gs-opts', body);
    q.options.forEach(function (o) {
      var li = el('li', '', ul), b = el('button', 'gt-btn' + (quiz.picked !== null && o === q.answer ? ' primary' : ''), li, o); b.type = 'button'; b.setAttribute('data-k', 'q');
      if (quiz.picked !== null) { b.disabled = true; if (o === q.answer) b.setAttribute('aria-label', o + ', correct'); else if (o === quiz.picked) b.setAttribute('aria-label', o + ', wrong'); }
      b.addEventListener('click', function () { quiz.picked = o; if (o === q.answer) quiz.score++; render(); });
    });
    if (quiz.picked !== null) {
      el('p', 'gs-sum gs-fb', body, quiz.picked === q.answer ? 'Correct!' : 'Not quite. ' + (q.fb || 'It is ' + q.answer + '.')).setAttribute('role', 'status');
      var nx = el('button', 'gt-btn primary', body, quiz.i + 1 >= quiz.qs.length ? 'See score' : 'Next'); nx.type = 'button';
      nx.addEventListener('click', function () {
        quiz.picked = null;
        if (quiz.i + 1 >= quiz.qs.length) {
          quiz.over = true; quiz.paid = false;     // paid before drawing: earning points redraws the shop
          var pts = quizPts();
          if (quiz.score === quiz.qs.length && M.award('quiz-perfect', 15)) toast('Perfect Score', 15);
          if (pts > 0 && M.award('quiz:' + M.today(), pts)) { quiz.paid = true; toast('Campus Quiz', pts); M.event('quiz', M.today()); }
        } else quiz.i++;
        render();
      });
    }
  }

  // ---- Share picture: your mascot, points, stamps and streak on a card. Made on this phone, shared or saved by the phone. ----
  function share() {
    var c = document.createElement('canvas'), x = c.getContext('2d'), W = 720, H = 400, vm = window.LamparaGuide, nb = vm && vm.buildings ? vm.buildings.length : 0;
    c.width = W; c.height = H;
    x.fillStyle = '#ffd100'; x.fillRect(0, 0, W, H); x.fillStyle = '#15173f'; x.fillRect(12, 12, W - 24, H - 24);
    x.fillStyle = '#dcddf4'; x.fillRect(48, 70, 256, 256); M.draw(x, M.equipped(), 56, 78, 240 / M.get(M.equipped()).rows.length);
    var f = "'Pixelify Sans','Outfit',monospace"; x.textBaseline = 'alphabetic';
    x.fillStyle = '#ffffff'; x.font = '700 54px ' + f; x.fillText('Lampara', 340, 120);
    x.fillStyle = '#ffd100'; x.font = '600 34px ' + f; x.fillText(M.points() + ' points', 340, 184);
    x.fillStyle = '#ffffff'; x.font = '500 28px ' + f;
    x.fillText('Buildings reached: ' + M.visited() + (nb ? ' of ' + nb : ''), 340, 238);
    x.fillText('Day streak: ' + M.streak(), 340, 282);
    x.fillText('Buddy: ' + M.get(M.equipped()).name, 340, 326);
    c.toBlob(function (blob) {
      if (!blob) return;
      var file = null; try { file = new File([blob], 'lampara-card.png', { type: 'image/png' }); } catch (e) { /* old browser */ }
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'My Lampara card', text: 'Finding my way around campus with Lampara.' }).catch(function () { /* cancelled */ }); return; }
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'lampara-card.png'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
    }, 'image/png');
  }

  function achRow(ul, a, got) {
    var on = got[a.id] !== undefined, li = el('li', on ? 'on' : '', ul);
    var mark = el('span', 'gs-mark', li); mark.setAttribute('aria-hidden', 'true'); if (on) star(mark);
    var txt = el('span', 'gs-atxt', li); el('strong', '', txt, a.name); el('small', '', txt, a.about);
    el('em', '', li, '+' + a.pts); li.setAttribute('aria-label', a.name + ', ' + a.about + ', ' + (on ? 'earned' : 'not earned yet') + ', ' + a.pts + ' points');
  }

  function toast(text, pts) { M.toast(text, pts); }   // the pop-up lives in mascots.js so every page can use it

  // Background music while the shop is open (a chill loop), unless the student has muted music. One tap on the speaker mutes it everywhere.
  function applyMusic() {
    var A_ = window.LamparaAudio; if (!A_ || !sndBtn) { if (sndBtn) sndBtn.hidden = true; return; }
    var on = A_.enabled();
    sndBtn.setAttribute('aria-pressed', String(on)); sndBtn.setAttribute('aria-label', on ? 'Music is on. Tap to mute' : 'Music is off. Tap to turn on');
    sndBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4Z"/>' + (on ? '<path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>' : '<path d="m16 9.5 5 5m0-5-5 5"/>') + '</svg>';
    A_.mute(!on);
    if (on && open) A_.play('shop'); else if (!(window.LamparaTutorial && LamparaTutorial.active)) A_.stop();
  }

  function close() {
    if (!open) return;
    open = false; root.hidden = true;
    if (window.LamparaAudio && !(window.LamparaTutorial && LamparaTutorial.active)) LamparaAudio.stop();
    if (opener && opener.focus) { try { opener.focus({ preventScroll: true }); } catch (e) { /* gone */ } }
  }

  // Opening the guide counts as today's visit: the streak grows, and the milestones pay out.
  (function () {
    var vm = window.LamparaGuide;
    if (!M || !vm || !vm.$watch) return;
    vm.$watch(function () { return vm.started; }, function (ok) {
      if (!ok) return;
      var d = M.daily(); if (!d) return;
      setTimeout(function () {          // after the tutorial has had its moment to start
        toast('Day ' + d.count + ' streak', d.pts);
        if (d.count >= 3 && M.award('streak3', 10)) toast('Three Day Streak', 10);
        if (d.count >= 7 && M.award('streak7', 30)) toast('Week Warrior', 30);
      }, 1500);
    }, { immediate: true });
  })();

  // A link like guide-ar.php?shop=1 (from the landing page's player strip) lands with the shop open.
  if (/[?&]shop=1(&|$)/.test(location.search)) setTimeout(function () { if (window.LamparaMascotShop && !(window.LamparaTutorial && LamparaTutorial.active)) LamparaMascotShop.open('quests'); }, 700);

  window.LamparaMascotShop = {
    toast: toast,
    isOpen: function () { return open; },
    open: function (which) {
      if (!M) return;
      build();
      opener = document.activeElement; tab = ['ach', 'quests', 'pass', 'quiz', 'themes'].indexOf(which) >= 0 ? which : 'mascots';
      open = true; root.hidden = false; render(); applyMusic();
      closeBtn.focus({ preventScroll: true });
    }
  };
})();
