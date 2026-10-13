/* Lampara mascots: 12 original pixel lamp characters, plus the points and unlocks that go with them.
   Everything lives in this phone's localStorage (no account, no server), so it works offline. If storage is blocked it
   still works for the visit, it just is not remembered.
   <img data-mascot> anywhere on a page (the chat avatar) is filled with the mascot the student has equipped. */
(function () {
  'use strict';

  var KEY = 'lampara_mascots';
  var PAL = { k: '#161850', y: '#ffd100', Y: '#fff3b8', o: '#d4ab00', w: '#ffffff', b: '#2e3192', n: '#23267a', l: '#dcddf4', r: '#ff0000', R: '#9b1c1c', e: '#22c55e', a: '#f59e0b', g: '#8a8fb8', s: '#7a4b24' };

  // 16 x 16 sprites. '.' is see-through; the letters are the colours in PAL. Faces are two eyes and a mouth.
  var LIST = [
    { id: 'lumi', name: 'Lumi', price: 0, blurb: 'The classic lantern. Your first buddy.', rows: [
      '......kkkk......',
      '.....k....k.....',
      '.......yy.......',
      '......yYYy......',
      '....kkkkkkkk....',
      '...kYYYYYYYYk...',
      '..kYYyyyyyyYYk..',
      '..kYykyyyykyYk..',
      '..kYykyyyykyYk..',
      '..kYyyykkyyyYk..',
      '..kYyyyyyyyyYk..',
      '...kYyyyyyyYk...',
      '....kkkkkkkk....',
      '...kbbbbbbbbk...',
      '...kkkkkkkkkk...',
      '................'] },
    { id: 'bulby', name: 'Bulby', price: 20, blurb: 'Bright idea, always on.', rows: [
      '................',
      '.....kkkkkk.....',
      '...kkYYYYYYkk...',
      '..kYYYYYYYYYYk..',
      '..kYYkYYYYkYYk..',
      '..kYYkYYYYkYYk..',
      '..kYYYYkkYYYYk..',
      '..kYYYYYYYYYYk..',
      '...kYYYYYYYYk...',
      '....kkYYYYkk....',
      '.....kyyyyk.....',
      '.....kkkkkk.....',
      '.....kgggk......',
      '.....kkkkk......',
      '......kkk.......',
      '................'] },
    { id: 'shade', name: 'Shade', price: 20, blurb: 'A cosy table lamp.', rows: [
      '................',
      '.....kkkkkk.....',
      '...kkYYYYYYkk...',
      '..kYYYYYYYYYYk..',
      '.kYYkYYYYYYkYYk.',
      '.kYYkYYYYYYkYYk.',
      '.kYYYYYkkYYYYYk.',
      '.kkkkkkkkkkkkkk.',
      '.......kk.......',
      '......kbbk......',
      '......kbbk......',
      '......kbbk......',
      '.....kbbbbk.....',
      '....kbbbbbbk....',
      '....kkkkkkkk....',
      '................'] },
    { id: 'waxy', name: 'Waxy', price: 30, blurb: 'A little candle with a big glow.', rows: [
      '.......a........',
      '......aya.......',
      '......ayya......',
      '.......kk.......',
      '.....kkwwkk.....',
      '....kwwwwwwk....',
      '....kwkwwkwk....',
      '....kwkwwkwk....',
      '....kwwkkwwk....',
      '....kwwwwwwk....',
      '....kwwwwwwk....',
      '..kkkkkkkkkkkk..',
      '..kbbbbbbbbbbk..',
      '...kbbbbbbbbk...',
      '....kkkkkkkk....',
      '................'] },
    { id: 'parol', name: 'Parol', price: 40, blurb: 'A Filipino star lantern.', rows: [
      '.......kk.......',
      '......kyyk......',
      '......kyyk......',
      '..kkkkkyykkkkk..',
      '.kyyyyyyyyyyyyk.',
      '..kyyykyykyyyk..',
      '...kyyyykkyyk...',
      '....kyyyyyyk....',
      '...kyyyyyyyyk...',
      '..kyyyykkyyyyk..',
      '..kyyyk..kyyyk..',
      '..kyyk....kyyk..',
      '..kkk..rr..kkk..',
      '......rRRr......',
      '......rRRr......',
      '.......rr.......'] },
    { id: 'farol', name: 'Farol', price: 50, blurb: 'A round paper lantern.', rows: [
      '.......kk.......',
      '.....kkkkkk.....',
      '...kkrrrrrrkk...',
      '..krrrrrrrrrrk..',
      '.krrkrrrrrrkrrk.',
      '.krrkrrrrrrkrrk.',
      '.krrrrrkkrrrrrk.',
      '.krrrrrrrrrrrrk.',
      '..krrrrrrrrrrk..',
      '...kkrrrrrrkk...',
      '.....kkkkkk.....',
      '.......yy.......',
      '......yyyy......',
      '.......yy.......',
      '.......yy.......',
      '................'] },
    { id: 'genie', name: 'Genie', price: 60, blurb: 'Rub the lamp, make a wish.', rows: [
      '.........a......',
      '........aya.....',
      '.........a......',
      '...k....kkk.....',
      '...kk..kyyyk....',
      '....kkkyyyyyk.kk',
      '.....kyyykyykk.k',
      '.....kyykyykyk.k',
      '.....kyyyyyyyk.k',
      '......kyyyyykkk.',
      '.......kyyyyk...',
      '........kkkk....',
      '.......kyyyyk...',
      '......kkkkkkkk..',
      '................',
      '................'] },
    { id: 'desk', name: 'Deskie', price: 80, blurb: 'Studies late, glows bright.', rows: [
      '................',
      '..kkkkkkkk......',
      '.kYYYYYYYYk.....',
      'kYYkYYYYkYYk....',
      'kYYkYYYYkYYk....',
      'kYYYYkkYYYYYk...',
      '.kkkkkkkkkkk....',
      '......kb........',
      '.......kb.......',
      '.......kb.......',
      '......kb........',
      '.....kb.........',
      '.....kb.........',
      '..kkkkbkkkk.....',
      '.kbbbbbbbbbk....',
      '.kkkkkkkkkkk....'] },
    { id: 'jar', name: 'Glowjar', price: 100, blurb: 'Fireflies in a jar.', rows: [
      '................',
      '....kkkkkkkk....',
      '....kbbbbbbk....',
      '....kkkkkkkk....',
      '...kllllllllk...',
      '..kllYllllllllk.',
      '..kllkllllkllk..',
      '..kllkllllkllk..',
      '..klllllkklllk..',
      '..kllllYlllllk..',
      '..kllllllllYlk..',
      '..kllllllllllk..',
      '...kllllllllk...',
      '....kkkkkkkk....',
      '................',
      '................'] },
    { id: 'post', name: 'Lampost', price: 120, blurb: 'Keeps the campus path lit.', rows: [
      '.....kkkkkk.....',
      '....kbbbbbbk....',
      '...kkkkkkkkkk...',
      '..kYYYYYYYYYYk..',
      '..kYkYYYYYYkYk..',
      '..kYkYYYYYYkYk..',
      '..kYYYYkkYYYYk..',
      '..kYYYYYYYYYYk..',
      '...kkkkkkkkkk...',
      '......kbbk......',
      '......kbbk......',
      '......kbbk......',
      '......kbbk......',
      '.....kbbbbk.....',
      '....kbbbbbbk....',
      '....kkkkkkkk....'] },
    { id: 'torch', name: 'Blaze', price: 150, blurb: 'A brave little torch.', rows: [
      '.......a........',
      '......aaa.......',
      '.....aayaa......',
      '....aayyyaa.....',
      '....ayykyyka....',
      '....ayykyyka....',
      '....ayyykkya....',
      '.....ayyyya.....',
      '......kkkk......',
      '......kssk......',
      '......kssk......',
      '......kssk......',
      '......kssk......',
      '......kssk......',
      '.......kk.......',
      '................'] },
    { id: 'beacon', name: 'Beacon', price: 200, blurb: 'A lighthouse that guides everyone home.', rows: [
      '.....kkkkkk.....',
      '....krrrrrrk....',
      '...kkkkkkkkkk...',
      '...kYYYYYYYYk...',
      '..YkYkYYYYkYkY..',
      '..YkYkYYYYkYkY..',
      '...kYYYkkYYYk...',
      '...kkkkkkkkkk...',
      '....kwwwwwwk....',
      '....krrrrrrk....',
      '....kwwwwwwk....',
      '...krrrrrrrrk...',
      '...kwwwwwwwwk...',
      '..kkkkkkkkkkkk..',
      '..kbbbbbbbbbbk..',
      '..kkkkkkkkkkkk..'] }
  ];

  var mem = null, listeners = [], cache = {};

  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { s = null; }
    if (!s || typeof s !== 'object') s = mem || {};
    s.earned = s.earned || {}; s.owned = s.owned || ['lumi']; s.spent = s.spent || 0;
    if (s.owned.indexOf('lumi') < 0) s.owned.push('lumi');
    if (!get(s.eq) || s.owned.indexOf(s.eq) < 0) s.eq = 'lumi';
    return s;
  }
  function save(s) {
    mem = s;
    try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* not remembered after this visit */ }
    refreshImages();
    listeners.forEach(function (f) { try { f(s); } catch (e) { /* ignore */ } });
  }
  function dayKey(offset) {
    var d = new Date(); d.setDate(d.getDate() + offset);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }
  function get(id) { for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i]; return null; }

  // Sprite to SVG: one rect per run of same-coloured pixels.
  function svg(id, size) {
    var m = get(id) || LIST[0], key = m.id + ':' + size;
    if (cache[key]) return cache[key];
    var out = '';
    m.rows.forEach(function (row, y) {
      var x = 0;
      while (x < row.length) {
        var c = row[x], x2 = x;
        while (x2 < row.length && row[x2] === c) x2++;
        if (c !== '.') out += '<rect x="' + x + '" y="' + y + '" width="' + (x2 - x) + '" height="1" fill="' + PAL[c] + '"/>';
        x = x2;
      }
    });
    return (cache[key] = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="' + size + '" height="' + size + '" shape-rendering="crispEdges" role="img" aria-label="' + m.name + '">' + out + '</svg>');
  }
  function uri(id) { return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg(id, 64)); }

  function refreshImages() {
    var eq = load().eq, imgs = document.querySelectorAll('img[data-mascot]');
    for (var i = 0; i < imgs.length; i++) { var u = uri(eq); if (imgs[i].getAttribute('src') !== u) imgs[i].setAttribute('src', u); }
  }

  var api = {
    list: LIST,
    get: get,
    svg: svg,
    uri: uri,
    equipped: function () { return load().eq; },
    // Daily streak: the first visit of each calendar day (the phone's own date) earns a little more the longer the run, up to 7 days.
    // Returns null if today already counted, else { count, pts }.
    daily: function () {
      var s = load(), t = dayKey(0);
      if (s.last === t) return null;
      s.streak = s.last === dayKey(-1) ? (s.streak || 0) + 1 : 1; s.last = t;
      var pts = 5 + 2 * (Math.min(s.streak, 7) - 1);
      s.earned['day:' + t] = pts; save(s);
      return { count: s.streak, pts: pts };
    },
    today: function () { return dayKey(0); },
    // Paints a mascot onto a canvas (for the share picture).
    draw: function (cx, id, x, y, scale) {
      (get(id) || LIST[0]).rows.forEach(function (row, j) { for (var i = 0; i < row.length; i++) if (row[i] !== '.') { cx.fillStyle = PAL[row[i]]; cx.fillRect(x + i * scale, y + j * scale, scale, scale); } });
    },
    streak: function () { var s = load(); return s.last === dayKey(0) || s.last === dayKey(-1) ? s.streak || 0 : 0; },
    visited: function () { var n = 0, e = load().earned; for (var k in e) if (k.indexOf('visit:') === 0) n++; return n; },
    points: function () { var s = load(), t = 0; for (var k in s.earned) t += s.earned[k]; return t - s.spent; },
    has: function (id) { return load().owned.indexOf(id) >= 0; },
    earnedList: function () { return load().earned; },
    onChange: function (f) { listeners.push(f); },
    // Gives points for an achievement, once. Returns true the first time only.
    award: function (id, pts) {
      var s = load();
      if (s.earned[id] !== undefined) return false;
      s.earned[id] = pts; save(s); return true;
    },
    buy: function (id) {
      var s = load(), m = get(id);
      if (!m || s.owned.indexOf(id) >= 0 || api.points() < m.price) return false;
      s.spent += m.price; s.owned.push(id); s.eq = id; save(s); return true;
    },
    equip: function (id) { var s = load(); if (s.owned.indexOf(id) < 0) return false; s.eq = id; save(s); return true; }
  };
  window.LamparaMascots = api;

  // Chat avatars (and any other <img data-mascot>) follow the equipped mascot, even ones a framework draws later.
  function watch() {
    refreshImages();
    if (window.MutationObserver) new MutationObserver(function (list) {
      for (var i = 0; i < list.length; i++) if (list[i].addedNodes.length) { refreshImages(); return; }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
})();
