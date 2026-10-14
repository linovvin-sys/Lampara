/* "Show more / Show less" for long text, on student and admin pages alike. A long paragraph is folded to a few lines with a small
   toggle under it; short text is left alone. Works on text that Vue or other scripts add later. Opt in anywhere with data-clamp="4"
   (lines), opt out with data-clamp="off". Needs nothing; styles are injected here. */
(function () {
  'use strict';
  var LINES = { '.ch-bubble': 7, '.wy-note': 3, '.bld-dir': 3, '.room-dlg-line': 3, '.room-sub': 2, '.hint': 3, '.pick-hint': 3, '.lh-body': 4 };
  var SEL = Object.keys(LINES).concat('[data-clamp]').join(',');
  var css = document.createElement('style');
  css.textContent =
    '.rm-clamp{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:var(--rm-lines,3);overflow:hidden}' +
    '.rm-toggle{display:inline-block;margin:.25rem 0 0;padding:.35rem .1rem;min-height:2rem;border:0;background:none;color:inherit;font:inherit;font-size:.85em;font-weight:700;text-decoration:underline;text-underline-offset:3px;cursor:pointer;opacity:.9}' +
    '.rm-toggle:focus-visible{outline:3px solid currentColor;outline-offset:2px;border-radius:4px}';
  document.head.appendChild(css);

  function lines(el) {
    var d = el.getAttribute('data-clamp');
    if (d === 'off') return 0;
    if (d && +d > 0) return +d;
    for (var k in LINES) if (el.matches(k)) return LINES[k];
    return 3;
  }
  function process(el) {
    var n = lines(el); if (!n || el.closest('.rm-skip')) return;
    var sig = el.textContent.length + ':' + el.clientWidth;
    if (el._rmSig === sig && el._rmBtn) return;
    el._rmSig = sig;
    if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;   // hidden right now: measured when it shows
    var open = el.classList.contains('rm-open');
    el.style.setProperty('--rm-lines', n);
    if (!open) el.classList.add('rm-clamp');
    var over = open || el.scrollHeight > el.clientHeight + 2;
    var btn = el._rmBtn;
    if (!over) { el.classList.remove('rm-clamp'); if (btn) { btn.remove(); el._rmBtn = null; } return; }
    if (!btn) {
      btn = document.createElement('button'); btn.type = 'button'; btn.className = 'rm-toggle';
      btn.addEventListener('click', function (e) {
        e.preventDefault(); e.stopPropagation();
        var o = el.classList.toggle('rm-open'); el.classList.toggle('rm-clamp', !o);
        btn.textContent = o ? 'Show less' : 'Show more'; btn.setAttribute('aria-expanded', o);
      });
      el.insertAdjacentElement('afterend', btn); el._rmBtn = btn;
    }
    btn.textContent = open ? 'Show less' : 'Show more'; btn.setAttribute('aria-expanded', open);
  }
  var timer = 0;
  function scan() {
    mo.disconnect();
    try { document.querySelectorAll(SEL).forEach(process); } finally { watch(); }
  }
  function later() { clearTimeout(timer); timer = setTimeout(scan, 200); }
  var mo = new MutationObserver(later);
  function watch() { mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'open', 'class'] }); }
  function init() { scan(); window.addEventListener('resize', function () { document.querySelectorAll(SEL).forEach(function (e) { e._rmSig = null; }); later(); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.LamparaReadMore = { scan: later };
})();
