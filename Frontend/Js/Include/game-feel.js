/* Tap feel for the student pages: every button, link and menu item answers a tap with a short game-style "pop" sound, a quick
   squash-and-bounce, and a tiny burst of pixel sparks where the finger landed. Needs nothing; uses guide-audio.js for the sound when
   it is on the page. Silent when the student has muted sound; no sparks or bounce with reduced motion. Not used on admin pages. */
(function () {
  'use strict';
  if (window.__lamparaFeel) return;
  window.__lamparaFeel = true;

  var TARGET = 'button, a[href], [role="button"], [role="menuitem"], [role="option"], summary, label[for], .gh-buddy';
  var reduced = function () { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; };

  var st = document.createElement('style');
  st.textContent = '.gf-spark{position:fixed;z-index:3000;width:6px;height:6px;background:#ffd100;box-shadow:0 0 0 2px #15173f;pointer-events:none;will-change:transform,opacity}';
  (document.head || document.documentElement).appendChild(st);

  function burst(x, y) {
    var colors = ['#ffd100', '#fff3b8', '#ffd100', '#ffffff', '#ffd100', '#fff3b8'];
    for (var i = 0; i < 6; i++) {
      var s = document.createElement('i'); s.className = 'gf-spark'; s.style.left = x - 3 + 'px'; s.style.top = y - 3 + 'px'; s.style.background = colors[i];
      var a = (Math.PI * 2 * i) / 6 + Math.random() * 0.5, d = 18 + Math.random() * 14;
      document.body.appendChild(s);
      var an = s.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d - 6) + 'px) scale(0.4)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
      an.onfinish = (function (n) { return function () { n.remove(); }; })(s);
    }
  }
  function squash(el) {
    if (!el.animate) return;
    el.animate([{ transform: 'scale(0.94)' }, { transform: 'scale(1.04)', offset: 0.55 }, { transform: 'scale(1)' }], { duration: 240, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  }

  function feel(el, x, y) {
    if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true' || el.closest('[data-no-feel], .gs-root [disabled]')) return;
    if (window.LamparaAudio && LamparaAudio.click) LamparaAudio.click();
    if (reduced()) return;
    squash(el); burst(x, y);
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.button > 0) return;
    var el = e.target.closest && e.target.closest(TARGET);
    if (el) feel(el, e.clientX, e.clientY);
  }, true);
  document.addEventListener('click', function (e) {          // keyboard activation (Enter or Space) has no pointer position
    if (e.detail !== 0) return;
    var el = e.target.closest && e.target.closest(TARGET);
    if (el) { var r = el.getBoundingClientRect(); feel(el, r.left + r.width / 2, r.top + r.height / 2); }
  }, true);
})();
