/* Lampara — skeleton loading screens.

   Initial load:   put  <script>LamparaSkeleton.show('admin')</script>  where the page content starts.
                   It draws a placeholder immediately and removes it when the page (and its Vue apps) are ready.
   Slow load:      after SLOW_MS a "still loading" note fades in under the skeleton; after RETRY_MS it offers a reload.
   Manual:         LamparaSkeleton.show(kind, { target })  /  LamparaSkeleton.done()  for pages that decide for themselves.

   Kinds: 'admin' (inside the admin main column), 'public' (landing page), 'map' (campus map), 'guide' (dark camera pages).
   The placeholder never blocks anything: a safety timer removes it after MAX_MS no matter what. */
(function () {
  var SLOW_MS = 4500;     // show the "taking longer than usual" note
  var RETRY_MS = 12000;   // ...and a Try again button
  var MAX_MS = 20000;     // safety: never leave a skeleton up forever
  var FADE_MS = 260;

  var current = null;     // { el, timers[], observer }

  function line(w) { return '<span class="sk sk-line w-' + w + '"></span>'; }
  function row() {
    return '<div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack">' + line(60) + line(40) + '</div><span class="sk sk-pill"></span></div>';
  }
  function card(rows) {
    var h = '';
    for (var i = 0; i < rows; i++) h += row();
    return '<div class="sk-card">' + h + '</div>';
  }

  var TEMPLATES = {
    admin: function () {
      return '<div class="sk-body">' +
        '<div class="sk-stack"><span class="sk sk-title"></span>' + line(60) + '</div>' +
        '<div class="sk-grid"><div class="sk-card sk-stack"><span class="sk sk-circle" style="width:2.2rem;height:2.2rem"></span><span class="sk sk-title" style="width:4rem"></span>' + line(40) + '</div>' +
        '<div class="sk-card sk-stack"><span class="sk sk-circle" style="width:2.2rem;height:2.2rem"></span><span class="sk sk-title" style="width:4rem"></span>' + line(40) + '</div>' +
        '<div class="sk-card sk-stack"><span class="sk sk-circle" style="width:2.2rem;height:2.2rem"></span><span class="sk sk-title" style="width:4rem"></span>' + line(40) + '</div></div>' +
        card(4) + '</div>';
    },
    public: function () {
      return '<div class="sk-bar"><span class="sk sk-avatar"></span><span class="sk sk-title" style="width:6rem"></span><span style="flex:1"></span><span class="sk sk-pill"></span><span class="sk sk-pill"></span></div>' +
        '<div class="sk-body"><span class="sk sk-hero" style="height:14rem"></span>' +
        '<div class="sk-stack">' + line(80) + line(60) + '</div>' +
        '<span class="sk sk-btn" style="width:100%;height:3rem"></span><span class="sk sk-btn" style="width:100%;height:3rem"></span></div>';
    },
    map: function () {
      return '<div class="sk-bar"><span class="sk sk-avatar"></span><div class="sk-stack" style="flex:1">' + line(40) + line(25) + '</div><span class="sk sk-pill" style="width:5rem"></span></div>' +
        '<div style="flex:1;position:relative;padding:1rem"><span class="sk sk-box" style="position:absolute;inset:1rem"></span>' +
        '<span class="sk sk-circle" style="position:absolute;left:28%;top:34%;width:1.6rem;height:1.6rem;background:#d9dae9"></span>' +
        '<span class="sk sk-circle" style="position:absolute;left:62%;top:52%;width:1.6rem;height:1.6rem;background:#d9dae9"></span>' +
        '<span class="sk sk-circle" style="position:absolute;left:44%;top:68%;width:1.6rem;height:1.6rem;background:#d9dae9"></span>' +
        '<div class="sk-stack" style="position:absolute;right:1.6rem;bottom:1.6rem"><span class="sk sk-circle" style="width:2.6rem;height:2.6rem;background:#fff"></span><span class="sk sk-circle" style="width:2.6rem;height:2.6rem;background:#fff"></span></div></div>';
    },
    guide: function () {
      return '<div class="sk-body" style="align-items:center;justify-content:center;text-align:center">' +
        '<span class="sk sk-circle" style="width:4rem;height:4rem"></span>' +
        '<span class="sk sk-title" style="width:12rem"></span>' +
        '<div class="sk-stack" style="width:100%;max-width:18rem;align-items:center">' + line(80) + line(60) + '</div>' +
        '<span class="sk sk-btn" style="width:12rem;height:3rem"></span></div>';
    }
  };

  function expectedVueRoots() {
    // every page names its Vue mount points ...-app / #app; Vue 3 marks a mounted one with data-v-app
    return [].slice.call(document.querySelectorAll('#app, [id$="-app"]'));
  }

  function allMounted(roots) {
    for (var i = 0; i < roots.length; i++) if (!roots[i].hasAttribute('data-v-app')) return false;
    return true;
  }

  function done() {
    if (!current) return;
    var c = current;
    current = null;
    c.timers.forEach(clearTimeout);
    if (c.observer) c.observer.disconnect();
    c.el.classList.add('is-hiding');
    setTimeout(function () { if (c.el.parentNode) c.el.parentNode.removeChild(c.el); }, FADE_MS + 40);
  }

  function addSlowNote(el) {
    var note = document.createElement('div');
    note.className = 'sk-slow';
    note.setAttribute('role', 'status');
    note.setAttribute('aria-live', 'polite');
    note.innerHTML = '<strong>Still loading…</strong>This is taking longer than usual. Your connection may be slow.' +
      '<br><button type="button" hidden>Try again</button>';
    note.querySelector('button').addEventListener('click', function () { location.reload(); });
    el.appendChild(note);
    return note;
  }

  function show(kind, opts) {
    opts = opts || {};
    if (current) done();
    var tpl = TEMPLATES[kind] || TEMPLATES.public;
    var el = document.createElement('div');
    el.className = 'sk-page' + (kind === 'guide' ? ' sk-dark' : '') + (kind === 'admin' ? ' in-main' : '');
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = tpl();

    var host = opts.target;
    if (host) {
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.insertBefore(el, host.firstChild);
    } else {
      (document.body || document.documentElement).insertBefore(el, (document.body || document.documentElement).firstChild);
    }

    var note = addSlowNote(el);
    var timers = [
      setTimeout(function () { note.classList.add('show'); }, SLOW_MS),
      setTimeout(function () { var b = note.querySelector('button'); if (b) b.hidden = false; }, RETRY_MS),
      setTimeout(done, MAX_MS)
    ];
    current = { el: el, timers: timers, observer: null };

    if (opts.manual) return; // the page calls LamparaSkeleton.done() itself

    var loaded = document.readyState === 'complete';
    function check() {
      if (!loaded) return;
      var roots = expectedVueRoots();
      if (allMounted(roots)) done();
    }
    if (!loaded) window.addEventListener('load', function () { loaded = true; check(); });
    // Vue apps mount from deferred scripts: watch for the data-v-app marker appearing.
    if (typeof MutationObserver !== 'undefined') {
      var obs = new MutationObserver(check);
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-v-app'], subtree: true, childList: true });
      current.observer = obs;
    }
    // Pages with no Vue app are ready as soon as they have loaded.
    if (loaded) setTimeout(check, 60);
    window.addEventListener('load', function () { setTimeout(check, 120); });
  }

  window.LamparaSkeleton = { show: show, done: done };
})();
