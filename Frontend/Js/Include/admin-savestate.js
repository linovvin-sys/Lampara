// Save status for the whole admin panel. The editors save every change the moment you make it
// (there is no Save button for paths, pins, or calibration points), so this shows what is
// happening instead of leaving you to guess: "Saving…", "All changes saved", or "Couldn't save".
// It watches every write (POST / PUT / DELETE) to the Backend API through fetch.
(function () {
  if (!window.fetch || window.__lamparaSaveState) return;
  window.__lamparaSaveState = true;
  var IGNORE = /(ping|admin_login|setup-health|chat|scan)\.php/;
  var pill = null, hideTimer = null, pending = 0, failed = false;

  function ensure() {
    if (pill && document.body.contains(pill)) return pill;
    pill = document.createElement('div');
    pill.className = 'save-state';
    pill.setAttribute('role', 'status');
    pill.setAttribute('aria-live', 'polite');
    document.body.appendChild(pill);
    return pill;
  }
  // In the top bar when it is visible (desktop); a floating chip otherwise (phones hide that bar).
  function place(el) {
    var host = document.querySelector('.admin-header-actions');
    if (host && host.offsetParent !== null) {
      if (el.parentNode !== host) host.insertBefore(el, host.firstChild);
      el.classList.add('in-header');
    } else {
      if (el.parentNode !== document.body) document.body.appendChild(el);
      el.classList.remove('in-header');
    }
  }
  function show(text, kind, autoHide) {
    var el = ensure();
    place(el);
    clearTimeout(hideTimer);
    el.textContent = text;
    el.className = 'save-state is-' + kind + ' is-visible' + (el.classList.contains('in-header') ? ' in-header' : '');
    if (autoHide) hideTimer = setTimeout(function () { el.classList.remove('is-visible'); }, autoHide);
  }
  function done(ok) {
    pending = Math.max(0, pending - 1);
    if (!ok) failed = true;
    if (pending > 0) return;
    if (failed) { failed = false; show('Couldn\u2019t save the last change', 'error', 8000); return; }
    var t = new Date();
    show('All changes saved \u00b7 ' + t.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }), 'ok', 3200);
  }

  var original = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || '';
    var method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (method === 'GET' || !/Backend\/api\//.test(url) || IGNORE.test(url)) return original(input, init);
    pending++;
    show('Saving\u2026', 'busy');
    return original(input, init).then(function (res) { done(res.ok); return res; }, function (err) { done(false); throw err; });
  };
})();
