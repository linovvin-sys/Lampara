/* Dark mode switch for the admin pages. The choice is kept in this browser; with no choice yet, the phone or computer's own setting is used. */
(function () {
  'use strict';
  var KEY = 'lampara_admin_theme', root = document.documentElement;
  function isDark() { return root.getAttribute('data-admin-theme') === 'dark'; }
  function paint() {
    document.querySelectorAll('[data-admin-theme-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', isDark() ? 'true' : 'false');
      b.setAttribute('aria-label', isDark() ? 'Switch to light mode' : 'Switch to dark mode');
      b.title = isDark() ? 'Light mode' : 'Dark mode';
    });
  }
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function apply(dark) {
    if (dark) root.setAttribute('data-admin-theme', 'dark'); else root.removeAttribute('data-admin-theme');
    try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (e) { /* not remembered */ }
    paint();
  }
  // The new theme spreads out from the switch like a ripple (View Transitions); older browsers get a soft cross-fade.
  function set(dark, from) {
    if (reduce) return apply(dark);
    if (document.startViewTransition) {
      var r = from ? from.getBoundingClientRect() : null;
      var x = r ? r.left + r.width / 2 : innerWidth - 40, y = r ? r.top + r.height / 2 : 30;
      var end = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      var t = document.startViewTransition(function () { apply(dark); });
      t.ready.then(function () {
        root.animate({ clipPath: ['circle(0px at ' + x + 'px ' + y + 'px)', 'circle(' + end + 'px at ' + x + 'px ' + y + 'px)'] },
          { duration: 520, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', pseudoElement: '::view-transition-new(root)' });
      }).catch(function () { /* the theme still switched */ });
    } else {
      root.classList.add('theme-fade'); apply(dark); setTimeout(function () { root.classList.remove('theme-fade'); }, 500);
    }
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('[data-admin-theme-toggle]'); if (b) set(!isDark(), b); });
  window.addEventListener('storage', function (e) { if (e.key === KEY) { if (e.newValue === 'dark') root.setAttribute('data-admin-theme', 'dark'); else root.removeAttribute('data-admin-theme'); paint(); } });
  paint();
})();
