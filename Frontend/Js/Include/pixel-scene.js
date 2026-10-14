/* A pixel-art night scene, drawn with squares (no image files, so it works offline): twinkling stars, a moon, drifting clouds, a little
   campus skyline with lit windows, trees and lamp posts, and (optionally) the student's mascot strolling along the ground.
   LamparaPixelScene.mount(element, { walker: true, moon: true, stars: 46, seed: 7 }); the element needs the class "ps" (see pixel-scene.css). */
(function () {
  'use strict';
  function html(o) {
    o = o || {};
    var seed = o.seed || 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    var out = '', n = o.stars === undefined ? 46 : o.stars;
    for (var i = 0; i < n; i++) {
      var big = rnd() < 0.18;
      out += '<i class="ps-star' + (big ? ' big' : '') + '" style="left:' + (rnd() * 100).toFixed(1) + '%;top:' + (rnd() * 52).toFixed(1) + '%;animation-delay:' + (rnd() * 4).toFixed(2) + 's"></i>';
    }
    if (o.moon !== false) out += '<svg class="ps-moon" viewBox="0 0 12 12" width="54" height="54" shape-rendering="crispEdges"><path fill="#fff3b8" d="M4 0h4v1h2v1h1v2h1v4h-1v2h-1v1H8v1H4v-1H2v-1H1V8H0V4h1V2h1V1h2z"/><path fill="#e6d38a" d="M3 3h2v2H3zM7 6h2v2H7zM4 8h1v1H4z"/></svg>';
    var cloud = '<svg viewBox="0 0 16 7" shape-rendering="crispEdges"><path fill="#3b3fa3" d="M3 3h3V1h4v1h2v1h2v1h1v2H1V4h2z"/><path fill="#4a4eb0" d="M3 3h3V1h4v1h2v1H3z"/></svg>';
    [[8, 70, 64], [22, 90, 40], [34, 60, 84]].forEach(function (c, i) {
      out += '<div class="ps-cloud" style="top:' + c[0] + '%;width:' + c[2] + 'px;animation-duration:' + c[1] + 's;animation-delay:-' + (i * 23) + 's">' + cloud + '</div>';
    });
    // the skyline on a 120 x 56 grid (one square = one unit)
    var W = 120, H = 56, g = 48, r = '';
    function rect(x, y, w, h, c) { r += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" ' + (c.charAt(0) === '#' || c.indexOf('rgba') === 0 ? 'fill="' + c + '"' : 'class="' + c + '"') + '/>'; }
    [[2, 16, 22, 'b1'], [20, 14, 30, 'b2'], [36, 18, 18, 'b3'], [56, 20, 26, 'b1'], [78, 14, 20, 'b2'], [94, 18, 28, 'b3'], [110, 12, 16, 'b1']].forEach(function (b) {
      rect(b[0], g - b[2], b[1], b[2], b[3]); rect(b[0], g - b[2], b[1], 1, 'roof');
      for (var y = g - b[2] + 3; y < g - 4; y += 4) for (var x = b[0] + 2; x < b[0] + b[1] - 2; x += 4) rect(x, y, 2, 2, rnd() < 0.42 ? 'win' : 'off');
      rect(b[0] + Math.floor(b[1] / 2) - 1, g - 4, 3, 4, 'win');
    });
    [[16, 0], [52, 1], [90, 0], [108, 1]].forEach(function (t) { var x = t[0], d = t[1] ? '#15803d' : '#22c55e'; rect(x + 2, g - 9, 2, 9, '#7a4b24'); rect(x, g - 14, 6, 6, d); rect(x + 1, g - 16, 4, 3, d); });
    [30, 72, 100].forEach(function (x) { rect(x, g - 14, 1, 14, '#8a8fb8'); rect(x - 1, g - 16, 3, 3, 'win'); rect(x - 2, g - 17, 5, 5, 'glow'); });
    rect(0, g, W, H - g, 'ground'); rect(0, g, W, 1, 'roof'); for (var p = 2; p < W; p += 8) rect(p, g + 4, 4, 1, 'path');
    // seasonal touches: always drawn, but the CSS only shows the ones for the theme that is on
    var props = '';
    function prop(cls, x, y, rows, pal) { rows.forEach(function (row, j) { for (var i = 0; i < row.length; i++) if (row[i] !== '.') props += '<rect class="' + cls + '" x="' + (x + i) + '" y="' + (y + j) + '" width="1" height="1" fill="' + pal[row[i]] + '"/>'; }); }
    var PUMP = ['..g..', '.ooo.', 'ooooo', 'okook', 'ooooo', '.ooo.'], PP = { g: '#3f7d1f', o: '#ff8a1f', k: '#1a0f06' };
    var TREE = ['..y..', '..g..', '.ggg.', '.rgg.', 'ggggg', 'gggrg', '..b..'], TP = { y: '#ffd100', g: '#1f8a4c', r: '#ff5a5f', b: '#7a4b24' };
    var HEART = ['.r.r.', 'rrrrr', 'rrrrr', '.rrr.', '..r..'], HP = { r: '#ff7aa8' };
    var STAR = ['..y..', '.yyy.', 'yyyyy', '.yyy.', '.y.y.'], SP = { y: '#ffd100' };
    [8, 34, 66, 100].forEach(function (x) { prop('hw', x, g - 6, PUMP, PP); });
    [10, 48, 84, 112].forEach(function (x) { prop('xm', x, g - 7, TREE, TP); });
    [14, 40, 70, 98].forEach(function (x) { prop('vd', x, g - 5, HEART, HP); });
    [12, 44, 76, 104].forEach(function (x) { prop('ny', x, g - 5, STAR, SP); });
    var deco = '', k;
    for (k = 0; k < 26; k++) deco += '<i class="ps-flake" style="left:' + (rnd() * 100).toFixed(1) + '%;animation-delay:-' + (rnd() * 9).toFixed(1) + 's;animation-duration:' + (6 + rnd() * 6).toFixed(1) + 's"></i>';
    for (k = 0; k < 9; k++) deco += '<i class="ps-heart" style="left:' + (rnd() * 100).toFixed(1) + '%;animation-delay:-' + (rnd() * 10).toFixed(1) + 's;animation-duration:' + (8 + rnd() * 6).toFixed(1) + 's"></i>';
    for (k = 0; k < 4; k++) deco += '<i class="ps-bat" style="top:' + (6 + rnd() * 30).toFixed(0) + '%;animation-delay:-' + (rnd() * 14).toFixed(1) + 's;animation-duration:' + (12 + rnd() * 8).toFixed(1) + 's"></i>';
    [[18, 14], [72, 10], [46, 24], [88, 30]].forEach(function (q, j) {
      deco += '<b class="ps-fw" style="left:' + q[0] + '%;top:' + q[1] + '%;animation-delay:-' + (j * 1.1).toFixed(1) + 's">';
      for (var a = 0; a < 8; a++) deco += '<i style="--a:' + (a * 45) + 'deg"></i>';
      deco += '</b>';
    });
    out += deco;
    out += '<svg class="ps-city" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">' + r + '</svg><svg class="ps-props" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMax slice" shape-rendering="crispEdges">' + props + '</svg>';
    if (o.walker !== false) out += '<img data-mascot class="ps-walker" alt="" width="40" height="40">';
    return out;
  }
  function mount(box, o) { if (box) box.innerHTML = html(o); }
  window.LamparaPixelScene = { mount: mount, html: html };
})();
