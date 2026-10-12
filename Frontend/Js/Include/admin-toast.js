// Admin toasts: one non-blocking feedback pattern for the whole admin panel.
//
//   AdminToast.success('Saved')   AdminToast.info('Pick a building first')   AdminToast.error('Could not save', 'Server said no')
//
// Hints, successes and errors no longer open a modal that steals focus. Modals are kept
// only for decisions (delete / discard / confirm). To avoid rewriting ~50 call sites, the
// block at the bottom routes plain Swal.fire({ icon, title, text }) notices to toasts and
// leaves anything that asks a question (cancel button, input, html, preConfirm) alone.
(function () {
  var region = null;
  var DURATION = { success: 2600, info: 4500, warning: 6000, error: 8000 };
  var ICON = {
    success: '<path d="M5 13l4 4L19 7"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',
    warning: '<path d="M12 3 2 20h20L12 3Z"/><path d="M12 10v4M12 17v.01"/>',
    error: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'
  };

  function ensureRegion() {
    if (region && document.body.contains(region)) return region;
    region = document.createElement('div');
    region.className = 'toast-region';
    region.setAttribute('role', 'region');
    region.setAttribute('aria-label', 'Notifications');
    document.body.appendChild(region);
    return region;
  }

  function show(type, title, text, opts) {
    opts = opts || {};
    var el = document.createElement('div');
    el.className = 'toast toast-' + type;
    // Errors interrupt screen readers; everything else waits its turn.
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');

    var icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('width', '18'); icon.setAttribute('height', '18');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor'); icon.setAttribute('stroke-width', '2');
    icon.setAttribute('stroke-linecap', 'round'); icon.setAttribute('stroke-linejoin', 'round');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = ICON[type] || ICON.info;

    var body = document.createElement('div');
    body.className = 'toast-body';
    var t = document.createElement('strong');
    t.textContent = title || '';
    body.appendChild(t);
    if (text) {
      var p = document.createElement('span');
      p.textContent = text;
      body.appendChild(p);
    }

    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'toast-close';
    close.setAttribute('aria-label', 'Dismiss notification');
    close.innerHTML = '&times;';

    el.appendChild(icon); el.appendChild(body); el.appendChild(close);
    ensureRegion().appendChild(el);
    requestAnimationFrame(function () { el.classList.add('is-in'); });

    var timer = null;
    function dismiss() {
      clearTimeout(timer);
      el.classList.remove('is-in');
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 220);
    }
    function arm() { timer = setTimeout(dismiss, opts.duration || DURATION[type] || 4500); }
    close.addEventListener('click', dismiss);
    // Pausing on hover/focus gives people time to read a long error.
    el.addEventListener('mouseenter', function () { clearTimeout(timer); });
    el.addEventListener('mouseleave', arm);
    el.addEventListener('focusin', function () { clearTimeout(timer); });
    el.addEventListener('focusout', arm);
    arm();
    return { dismiss: dismiss };
  }

  // One confirmation dialog for every "are you sure": Cancel is the focused default, so a stray
  // Enter keeps things as they are. Resolves true only when the admin confirms.
  //   if (!(await AdminConfirm({ title: 'Replace the map?', text: '...', confirmText: 'Replace' }))) return;
  window.AdminConfirm = async function (o) {
    if (!window.Swal) return window.confirm((o.title || '') + '\n' + (o.text || ''));
    var r = await window.Swal.fire({
      icon: o.icon || 'warning', title: o.title || 'Are you sure?', text: o.text || '',
      showCancelButton: true, focusCancel: true,
      confirmButtonText: o.confirmText || 'Yes, continue', cancelButtonText: o.cancelText || 'Cancel',
      confirmButtonColor: o.danger ? '#ff0000' : '#2e3192'
    });
    return !!r.isConfirmed;
  };

  window.AdminToast = {
    success: function (title, text, o) { return show('success', title, text, o); },
    info:    function (title, text, o) { return show('info', title, text, o); },
    warning: function (title, text, o) { return show('warning', title, text, o); },
    error:   function (title, text, o) { return show('error', title, text, o); }
  };

  // Route plain notices through toasts; keep real dialogs.
  function wrapSwal() {
    if (!window.Swal || window.Swal.__toastWrapped) return;
    var original = window.Swal.fire.bind(window.Swal);
    window.Swal.fire = function (a) {
      var isNotice = a && typeof a === 'object' && !Array.isArray(a) &&
        ['success', 'info', 'error', 'warning'].indexOf(a.icon) !== -1 &&
        !a.showCancelButton && !a.showDenyButton && !a.input && !a.html && !a.preConfirm && !a.footer;
      if (!isNotice) return original.apply(null, arguments);
      var text = typeof a.text === 'string' ? a.text : '';
      window.AdminToast[a.icon](a.title || '', text, a.timer ? { duration: Math.max(a.timer, 2200) } : undefined);
      return Promise.resolve({ isConfirmed: true, isDismissed: false });
    };
    window.Swal.__toastWrapped = true;
  }
  wrapSwal();
  document.addEventListener('DOMContentLoaded', wrapSwal);
})();
