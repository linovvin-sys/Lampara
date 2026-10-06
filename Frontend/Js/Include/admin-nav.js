(function () {
  var sidebar = document.getElementById('adminSidebar');
  var backdrop = document.querySelector('[data-sidebar-backdrop]');
  var openBtn = document.querySelector('[data-sidebar-open]');
  var closeBtn = document.querySelector('[data-sidebar-close]');
  if (!sidebar || !backdrop || !openBtn) return;

  function openSidebar() {
    sidebar.classList.add('is-open');
    backdrop.classList.add('is-open');
    openBtn.setAttribute('aria-expanded', 'true');
  }
  function closeSidebar() {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    openBtn.setAttribute('aria-expanded', 'false');
  }

  openBtn.addEventListener('click', openSidebar);
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });
})();

// Confirm before logging out — mirrors the delete confirmations elsewhere
// in the admin panel instead of navigating away on a single misclick.
(function () {
  if (typeof Swal === 'undefined') return;
  document.querySelectorAll('a.admin-logout').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      // Unsynced offline changes stay on this device after logging out, so say so.
      var waiting = (typeof AdminOffline !== 'undefined') ? AdminOffline.count() : 0;
      Swal.fire({
        title: 'Log out?',
        text: waiting
          ? waiting + " offline change" + (waiting === 1 ? ' is' : 's are') + " not synced yet. They stay on this device, and you'll be asked to sync after you sign in again."
          : "You'll need to sign in again to manage the directory.",
        icon: waiting ? 'warning' : 'question',
        showCancelButton: true,
        confirmButtonText: 'Log out',
        confirmButtonColor: '#dc2626',
        cancelButtonColor: '#6b7280'
      }).then(function (result) {
        if (!result.isConfirmed) return;
        // Forget the saved admin pages and data before leaving (shared devices).
        var done = (typeof AdminOffline !== 'undefined') ? AdminOffline.clearPrivateCaches() : null;
        Promise.resolve(done).then(function () { window.location.href = link.href; });
      });
    });
  });
})();
