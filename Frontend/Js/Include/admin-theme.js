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
  function set(dark) {
    if (dark) root.setAttribute('data-admin-theme', 'dark'); else root.removeAttribute('data-admin-theme');
    try { localStorage.setItem(KEY, dark ? 'dark' : 'light'); } catch (e) { /* not remembered */ }
    paint();
  }
  document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('[data-admin-theme-toggle]')) set(!isDark()); });
  window.addEventListener('storage', function (e) { if (e.key === KEY) { if (e.newValue === 'dark') root.setAttribute('data-admin-theme', 'dark'); else root.removeAttribute('data-admin-theme'); paint(); } });
  paint();
})();
