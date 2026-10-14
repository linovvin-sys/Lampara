/* Smooth open and close for the admin's folding sections (<details class="dd-anim">, the sidebar's More tools and its groups).
   The section grows and shrinks with a fast ease-out, a little quicker on close. Honors reduced motion. Exposes LamparaDropdown.open/close/toggle. */
(function () {
  'use strict';
  var SEL = 'details.dd-anim, details.nav-more, details.nav-group';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  function run(d, from, to, ms, done) {
    if (d._dd) d._dd.cancel();
    d.style.overflow = 'hidden';
    var a = d._dd = d.animate({ height: [from + 'px', to + 'px'] }, { duration: ms, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    var end = function () { d._dd = null; d.style.height = ''; d.style.overflow = ''; if (done) done(); };
    a.onfinish = end; a.oncancel = function () { d.style.height = ''; d.style.overflow = ''; };
  }
  function open(d) {
    if (d.open && !d._closing) return;
    var from = d.offsetHeight; d._closing = false; d.open = true;
    if (reduce) return;
    run(d, from, d.scrollHeight, 240);
  }
  function close(d) {
    if (!d.open) return;
    if (reduce) { d.open = false; return; }
    var sum = d.querySelector(':scope > summary'), from = d.offsetHeight, to = sum ? sum.offsetHeight : 0;
    d._closing = true;
    run(d, from, to, 180, function () { d.open = false; d._closing = false; });
  }
  function toggle(d) { (d.open && !d._closing) ? close(d) : open(d); }
  document.addEventListener('click', function (e) {
    var s = e.target.closest && e.target.closest('summary'); if (!s || !s.parentElement.matches(SEL)) return;
    e.preventDefault(); toggle(s.parentElement);
  });
  window.LamparaDropdown = { open: open, close: close, toggle: toggle };
})();
