(function () {
  var sidebar = document.getElementById('adminSidebar');
  var backdrop = document.querySelector('[data-sidebar-backdrop]');
  var openBtns = document.querySelectorAll('[data-sidebar-open]');
  var openBtn = openBtns[0];
  var closeBtn = document.querySelector('[data-sidebar-close]');
  if (!sidebar || !backdrop || !openBtn) return;

  function openSidebar() {
    sidebar.classList.add('is-open');
    backdrop.classList.add('is-open');
    openBtns.forEach(function (b) { b.setAttribute('aria-expanded', 'true'); });
  }
  function closeSidebar() {
    sidebar.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    openBtns.forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
  }

  openBtns.forEach(function (b) { b.addEventListener('click', openSidebar); });
  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  backdrop.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeSidebar();
  });
})();

// Dropdown groups in the sidebar ("Campus Editor"). A group holding the current page starts open;
// otherwise the last choice is remembered (localStorage may be blocked, so every access is guarded).
(function () {
  var groups = document.querySelectorAll('[data-nav-group]');
  groups.forEach(function (group) {
    var key = 'lampara_nav_' + group.getAttribute('data-nav-group');
    var btn = group.querySelector('.nav-group-toggle');
    if (!btn) return;
    function setOpen(open) {
      group.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (!group.classList.contains('has-active')) {
      try { if (localStorage.getItem(key) === '1') setOpen(true); } catch (e) { /* storage blocked */ }
    }
    btn.addEventListener('click', function () {
      var open = !group.classList.contains('is-open');
      setOpen(open);
      try { localStorage.setItem(key, open ? '1' : '0'); } catch (e) { /* storage blocked */ }
    });
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
        confirmButtonColor: '#ff0000',
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

// Skip link target: the page's <main>, focusable so the jump actually moves keyboard focus.
(function () {
  var main = document.querySelector('.admin-main');
  if (!main) return;
  if (!main.id) main.id = 'adminMain';
  else if (main.id !== 'adminMain') main.setAttribute('data-skip-id', main.id);
  main.setAttribute('tabindex', '-1');
  var link = document.querySelector('.skip-link');
  if (link) link.setAttribute('href', '#' + main.id);
})();

// Collapse the sidebar to an icon rail on a computer (remembered on this device). A phone uses the drawer instead.
(function () {
  var btn = document.querySelector('[data-sidebar-collapse]');
  if (!btn) return;
  var root = document.documentElement;
  function sync() {
    var collapsed = root.classList.contains('sb-collapsed');
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    var label = collapsed ? 'Expand the sidebar' : 'Collapse the sidebar';
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }
  btn.addEventListener('click', function () {
    var collapsed = root.classList.toggle('sb-collapsed');
    try { localStorage.setItem('lampara_admin_sidebar', collapsed ? '1' : '0'); } catch (e) { /* storage blocked */ }
    sync();
    // Maps and other sized widgets need to re-measure once the page has grown or shrunk.
    setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 260);
  });
  sync();
})();
