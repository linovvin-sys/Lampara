// Dialogs on the building workspace pages (floor plans / paths, room marker placement).
// Plain DOM toggling, independent of each page's Vue app. Delegated on document because the
// trigger cards and close buttons live inside Vue v-if blocks that render after async state loads.
(function () {
  var lastFocus = null;
  function overlayOf(name) { return document.querySelector('.modal-overlay[data-modal="' + name + '"]'); }
  function openModal(name) {
    var overlay = overlayOf(name);
    if (!overlay) return;
    lastFocus = document.activeElement;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    var sheet = overlay.querySelector('.modal-sheet');
    if (sheet) { sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); }
    document.body.style.overflow = 'hidden';
    var first = overlay.querySelector('.modal-close, button, [href], input, select, textarea');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }
  function closeModal(name) {
    var overlay = overlayOf(name);
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-overlay.is-open')) document.body.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-modal-open]');
    if (opener) { openModal(opener.dataset.modalOpen); return; }
    var closer = e.target.closest('[data-modal-close]');
    if (closer) closeModal(closer.dataset.modalClose);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var opener = e.target.closest('[data-modal-open]');
      if (opener) { e.preventDefault(); openModal(opener.dataset.modalOpen); }
      return;
    }
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.modal-overlay.is-open');
    if (open) closeModal(open.dataset.modal);
  });
})();
