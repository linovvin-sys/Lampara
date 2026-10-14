/* Puts the student's chosen seasonal theme on <html data-theme="..."> before the page paints (so there is no flash of the old colours).
   The choice lives on this phone (see mascots.js, which keeps it up to date). Student pages only. */
(function () {
  var t = (window.LAMPARA_CONFIG && LAMPARA_CONFIG.theme) || 'default';   // the school's default look
  try { t = localStorage.getItem('lampara_theme') || t; } catch (e) { /* default look */ }
  if (t !== 'default') document.documentElement.setAttribute('data-theme', t);
})();
