/* Game touches for the student screens: a player strip (points, streak, weekly quests), a mascot buddy that talks, and pixel icons.
   Needs mascots.js. Everything comes from this phone's own save, so it works offline and needs no account.
   On a plain page: <div data-game-hud data-href="guide-ar.php?shop=1"> and <div data-game-buddy data-lines="One|Two|Three">,
   and data-px-icon="tree" on any element to draw a pixel icon in it. Inside Vue: v-html="LamparaGameHud.strip({ local: true })". */
(function () {
  'use strict';
  var M = window.LamparaMascots;
  if (!M) return;

  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function strip(opts) {
    opts = opts || {};
    var qs = M.quests(), done = 0, segs = '';
    qs.forEach(function (q) { if (q.done) done++; segs += '<span class="gh-seg' + (q.done ? ' on' : '') + '"></span>'; });
    var days = M.streak(), pts = M.points();
    var label = 'Your progress: ' + pts + ' points, ' + (days ? days + ' day streak' : 'no streak yet') + ', ' + done + ' of ' + qs.length + ' quests done this week. Opens your mascots and quests.';
    return '<a class="gh-strip" ' + (opts.local ? 'data-shop="local" ' : '') + 'href="' + esc(opts.href || '#') + '" aria-label="' + esc(label) + '">' +
      '<span class="gh-in">' +
        '<span class="gh-mascot" aria-hidden="true">' + M.svg(M.equipped(), 44) + '</span>' +
        '<span class="gh-stats" aria-hidden="true">' +
          '<span class="gh-stat">' + M.icon('star', 18) + '<b>' + pts + '</b><small>pts</small></span>' +
          '<span class="gh-stat">' + M.icon('flame', 18) + '<b>' + days + '</b><small>' + (days === 1 ? 'day' : 'days') + '</small></span>' +
          '<span class="gh-stat gh-quests"><span class="gh-segs">' + segs + '</span><small>Quests ' + done + '/' + qs.length + '</small></span>' +
        '</span>' +
        '<span class="gh-go" aria-hidden="true">&rsaquo;</span>' +
      '</span></a>';
  }

  function buddy(lines) {
    var list = String(lines || '').split('|').filter(Boolean);
    return '<div class="gh-buddy" data-lines="' + esc(list.join('|')) + '" data-i="0" role="button" tabindex="0" aria-label="Your mascot says: ' + esc(list[0] || '') + '. Tap for another tip.">' +
      '<span class="gh-sprite" aria-hidden="true">' + M.svg(M.equipped(), 64) + '</span>' +
      '<p class="gh-bubble">' + esc(list[0] || '') + '</p></div>';
  }

  // Tap the buddy for the next line; tap the strip on the guide itself to open the shop.
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('.gh-buddy');
    if (b) {
      var list = (b.getAttribute('data-lines') || '').split('|').filter(Boolean);
      if (list.length > 1) {
        var i = (parseInt(b.getAttribute('data-i'), 10) + 1) % list.length;
        b.setAttribute('data-i', String(i)); b.querySelector('.gh-bubble').textContent = list[i];
        b.setAttribute('aria-label', 'Your mascot says: ' + list[i] + '. Tap for another tip.');
      }
      return;
    }
    var s = e.target.closest && e.target.closest('.gh-strip[data-shop="local"]');
    if (s && window.LamparaMascotShop) { e.preventDefault(); window.LamparaMascotShop.open('quests'); }
  });
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('gh-buddy')) { e.preventDefault(); e.target.click(); }
  });

  function mount() {
    var hud = document.querySelectorAll('[data-game-hud]'), bud = document.querySelectorAll('[data-game-buddy]'), px = document.querySelectorAll('[data-px-icon]');
    function paint() { for (var i = 0; i < hud.length; i++) hud[i].innerHTML = strip({ href: hud[i].getAttribute('data-href') }); }
    paint(); M.onChange(paint);
    for (var j = 0; j < bud.length; j++) bud[j].innerHTML = buddy(bud[j].getAttribute('data-lines'));
    for (var k = 0; k < px.length; k++) px[k].innerHTML = M.icon(px[k].getAttribute('data-px-icon'), parseInt(px[k].getAttribute('data-px-size'), 10) || 36);
  }
  window.LamparaGameHud = { strip: strip, buddy: buddy };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
