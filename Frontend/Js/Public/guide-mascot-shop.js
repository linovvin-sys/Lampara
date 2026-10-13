/* The mascot shop and achievements list for the AR guide. Points come from tutorial achievements (see mascots.js);
   everything is kept on this phone only, so it needs no account and works offline. */
(function () {
  'use strict';

  var M = window.LamparaMascots;
  var OUT = [   // achievements earned by really using the app
    { id: 'explorer', name: 'Campus Explorer', about: 'Arrive at every building', pts: 50 },
    { id: 'first-question', name: 'First Question', about: 'Ask Lampara something', pts: 5 },
    { id: 'streak3', name: 'Three Day Streak', about: 'Open the guide 3 days in a row', pts: 10 },
    { id: 'streak7', name: 'Week Warrior', about: 'Open the guide 7 days in a row', pts: 30 }
  ];
  var tq = [], showing = false, toastEl = null;
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
    var shareBtn = el('button', 'gt-btn gs-share', right, 'Share'); shareBtn.type = 'button'; shareBtn.addEventListener('click', share);
    closeBtn = el('button', 'gt-btn gs-close', right, 'Close'); closeBtn.type = 'button'; closeBtn.addEventListener('click', close);
    var bar = el('div', 'gs-tabs', face); bar.setAttribute('role', 'tablist');
    [['mascots', 'Mascots'], ['ach', 'Awards'], ['pass', 'Passport'], ['quiz', 'Quiz']].forEach(function (t) {
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
      var grid = el('ul', 'gs-grid', body);
      M.list.forEach(function (m) {
        var li = el('li', 'gs-item' + (m.id === eq ? ' eq' : ''), grid), owned = M.has(m.id);
        var tile = el('div', 'gs-tile', li); tile.setAttribute('aria-hidden', 'true'); tile.innerHTML = M.svg(m.id, 64);
        el('p', 'gs-name', li, m.name); el('p', 'gs-blurb', li, m.blurb);
        var b = el('button', 'gt-btn' + ((owned || pts >= m.price) && m.id !== eq ? ' primary' : ''), li); b.type = 'button'; b.setAttribute('data-k', m.id);
        if (m.id === eq) { b.textContent = 'In use'; b.disabled = true; b.setAttribute('aria-label', m.name + ', in use'); }
        else if (owned) { b.textContent = 'Use'; b.setAttribute('aria-label', 'Use ' + m.name); b.addEventListener('click', function () { M.equip(m.id); }); }
        else if (pts >= m.price) { b.textContent = 'Buy ' + m.price; b.setAttribute('aria-label', 'Buy ' + m.name + ' for ' + m.price + ' points'); b.addEventListener('click', function () { if (M.buy(m.id)) A().chime(); }); }
        else { b.textContent = m.price + ' pts'; b.disabled = true; b.setAttribute('aria-label', m.name + ', needs ' + m.price + ' points, you have ' + pts); }
      });
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
      OUT.forEach(function (a) { achRow(ul0, a, got); });
      el('h3', 'gs-sub', body, 'Tutorial (' + done + ' of ' + list.length + ')');
      var ul = el('ul', 'gs-ach', body);
      list.forEach(function (a) { achRow(ul, a, got); });
    }
    if (keep) { var again = body.querySelector('[data-k="' + keep + '"]'); if (again && !again.disabled) again.focus(); }
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
    var rooms = (vm && vm.rooms) || [], trail = [];
    TRAIL.forEach(function (t) {
      for (var i = 0; i < rooms.length; i++) if (String(rooms[i].room_name || '').toLowerCase().indexOf(t[0]) >= 0) { trail.push({ label: t[1], room: rooms[i] }); return; }
    });
    if (!trail.length) return;
    el('h3', 'gs-sub', body, 'New student trail');
    el('p', 'gs-sum', body, 'The offices to find in your first week. Tap Go and Lampara walks you there.');
    var ul = el('ul', 'gs-ach', body);
    trail.forEach(function (t) {
      var done = got['visit:' + t.room.building_id] !== undefined, li = el('li', done ? 'on' : '', ul);
      var mark = el('span', 'gs-mark', li); mark.setAttribute('aria-hidden', 'true'); if (done) star(mark);
      var txt = el('span', 'gs-atxt', li); el('strong', '', txt, t.label); el('small', '', txt, t.room.building_name + (t.room.floor ? ', ' + t.room.floor : ''));
      var go = el('button', 'gt-btn', li, 'Go'); go.type = 'button'; go.setAttribute('aria-label', 'Go to ' + t.label + ', ' + t.room.building_name);
      go.addEventListener('click', function () { close(); if (vm.pickRoomHud) vm.pickRoomHud(t.room); });
    });
  }

  // ---- Campus quiz: five "where is it?" questions from the school's own directory. Points once a day, practice any time. ----
  var quiz = null;
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function newQuiz() {
    var vm = window.LamparaGuide, rooms = shuffle(((vm && vm.rooms) || []).filter(function (r) { return r.room_name && r.building_name; })), seen = {}, qs = [];
    var names = []; ((vm && vm.buildings) || []).forEach(function (b) { names.push(b.name); });
    rooms.forEach(function (r) { if (qs.length < 5 && !seen[r.building_id]) { seen[r.building_id] = 1; qs.push(r); } });
    if (qs.length < 3 || names.length < 4) return null;
    return { i: 0, score: 0, picked: null, over: false, qs: qs.map(function (r) {
      var others = shuffle(names.filter(function (x) { return x !== r.building_name; })).slice(0, 3);
      return { text: 'Where is ' + r.room_name + '?', answer: r.building_name, options: shuffle(others.concat([r.building_name])) };
    }) };
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
      el('p', 'gs-sum gs-fb', body, quiz.picked === q.answer ? 'Correct!' : 'Not quite. It is in ' + q.answer + '.').setAttribute('role', 'status');
      var nx = el('button', 'gt-btn primary', body, quiz.i + 1 >= quiz.qs.length ? 'See score' : 'Next'); nx.type = 'button';
      nx.addEventListener('click', function () {
        quiz.picked = null;
        if (quiz.i + 1 >= quiz.qs.length) {
          quiz.over = true; quiz.paid = false;     // paid before drawing: earning points redraws the shop
          var pts = quizPts();
          if (pts > 0 && M.award('quiz:' + M.today(), pts)) { quiz.paid = true; A().chime(); toast('Campus Quiz', pts); }
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
    x.fillStyle = '#dcddf4'; x.fillRect(48, 70, 256, 256); M.draw(x, M.equipped(), 56, 78, 15);
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

  // A small pixel pop-up for points earned while using the app. Waits its turn, and waits for the tutorial to finish.
  function toast(text, pts) { tq.push({ text: text, pts: pts }); pump(); }
  function pump() {
    if (showing || !tq.length) return;
    if (window.LamparaTutorial && LamparaTutorial.active) { setTimeout(pump, 1000); return; }
    var t = tq.shift(); showing = true;
    if (!toastEl) { toastEl = el('p', 'gs-toast', document.body); toastEl.setAttribute('role', 'status'); }
    toastEl.textContent = ''; star(toastEl); toastEl.appendChild(document.createTextNode(t.text + ' +' + t.pts + ' pts')); toastEl.hidden = false;
    A().chime();
    setTimeout(function () { toastEl.hidden = true; showing = false; setTimeout(pump, 300); }, 3600);
  }

  function close() {
    if (!open) return;
    open = false; root.hidden = true;
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

  window.LamparaMascotShop = {
    toast: toast,
    isOpen: function () { return open; },
    open: function (which) {
      if (!M) return;
      build();
      opener = document.activeElement; tab = which === 'ach' ? 'ach' : 'mascots';
      open = true; root.hidden = false; render();
      closeBtn.focus({ preventScroll: true });
    }
  };
})();
