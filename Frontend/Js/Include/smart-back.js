/* Back buttons that go back to where you came from (the guide, the map, the directory, home...) instead of a fixed page.
   Any link marked data-back, or with one of the back classes below, uses the browser's history when the previous page is on this site;
   its own href is the fallback for a fresh tab or a shared link. */
(function () {
  'use strict';
  var SEL = 'a[data-back], a.back, a.back-btn, a.wy-back, a.ch-icon[href$="index.php"], a.round-btn[aria-label^="Back"]';
  function fromHere() { try { return !!document.referrer && new URL(document.referrer).origin === location.origin && history.length > 1; } catch (e) { return false; } }
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey) return;
    var a = e.target.closest && e.target.closest(SEL); if (!a || !fromHere()) return;
    e.preventDefault(); history.back();
  }, true);
})();
