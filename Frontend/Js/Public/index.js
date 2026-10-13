// Landing page: the destination quick-pick and the building list.
// Buildings come from the same cached list the guide uses (see offline-cache.js), so this works with a weak signal too.
(function () {
  var API = '../../../Backend/api/buildings.php';
  var qEl = document.getElementById('q');
  var chipsEl = document.getElementById('chips');
  var goEl = document.getElementById('go');
  var hintEl = document.getElementById('quick-hint');
  var bldEl = document.getElementById('bld');
  var emptyEl = document.getElementById('bld-empty');
  var form = document.getElementById('quick');

  var buildings = [];
  var picked = null;               // the building chosen in the quick-pick

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function guideUrl(b) { return 'guide-ar.php' + (b ? '?to=' + encodeURIComponent(b.id) : ''); }

  // The start button always goes to the guide, straight to the chosen building when there is one.
  function syncGo() {
    goEl.href = guideUrl(picked);
    goEl.textContent = picked ? 'Navigate to ' + picked.name : 'Start navigating';
    hintEl.textContent = picked
      ? 'The guide opens with ' + picked.name + ' already chosen.'
      : 'Choose one to start straight to it, or start and search inside the guide.';
  }

  function renderChips() {
    var q = (qEl.value || '').trim().toLowerCase();
    var list = buildings.filter(function (b) { return !q || b.name.toLowerCase().indexOf(q) !== -1; });
    if (!buildings.length) { chipsEl.innerHTML = ''; return; }
    if (!list.length) { chipsEl.innerHTML = '<li class="chip-none">No building matches &ldquo;' + esc(qEl.value.trim()) + '&rdquo;.</li>'; return; }
    chipsEl.innerHTML = list.slice(0, 8).map(function (b) {
      var on = picked && String(picked.id) === String(b.id);
      return '<li><button type="button" class="chip' + (on ? ' on' : '') + '" data-id="' + esc(b.id) + '" aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(b.name) + '</button></li>';
    }).join('');
  }

  function renderGrid() {
    if (!buildings.length) { bldEl.innerHTML = ''; emptyEl.hidden = false; return; }
    emptyEl.hidden = true;
    bldEl.innerHTML = buildings.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (b, i) {
      return '<li class="bld-card" style="--i:' + Math.min(i, 8) + '"><h3>' + esc(b.name) + '</h3>' +
        '<p>' + (b.floor_count > 1 ? b.floor_count + ' floors' : '1 floor') + (b.building_number ? ' &middot; Building ' + esc(b.building_number) : '') + '</p>' +
        '<a class="bld-go" href="' + guideUrl(b) + '">Navigate here<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></a></li>';
    }).join('');
  }

  chipsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-id]');
    if (!btn) return;
    var b = buildings.find(function (x) { return String(x.id) === btn.getAttribute('data-id'); });
    picked = picked && b && String(picked.id) === String(b.id) ? null : b;      // tap again to unpick
    renderChips();
    syncGo();
  });
  qEl.addEventListener('input', renderChips);
  form.addEventListener('submit', function (e) { e.preventDefault(); location.href = goEl.href; });

  function load() {
    if (typeof LamparaCache === 'undefined') { renderGrid(); return; }
    LamparaCache.loadBuildings(API).then(function (list) {
      buildings = Array.isArray(list) ? list : [];
      renderChips();
      renderGrid();
    }).catch(function () { buildings = []; renderGrid(); });
  }
  load();
})();

// Interaction layer: scroll reveals, pointer spotlight on cards, tilting phone, sticky-bar state and the active section link.
// Everything is cosmetic. The page works the same with this file blocked, and motion is skipped under reduced motion.
(function () {
  var calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var root = document.documentElement;

  // Sticky bar gets a shadow once the page has moved.
  var bar = document.querySelector('.top');
  function onScroll() { bar.classList.toggle('stuck', window.scrollY > 8); }
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // Scroll reveal. Children of [data-stagger] reveal in sequence.
  if (!calm && 'IntersectionObserver' in window) {
    document.querySelectorAll('[data-stagger]').forEach(function (g) {
      Array.prototype.forEach.call(g.children, function (c, i) { c.setAttribute('data-reveal', ''); c.style.setProperty('--d', i); });
    });
    var targets = document.querySelectorAll('[data-reveal]');
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    root.classList.add('js-reveal');
    targets.forEach(function (t) { io.observe(t); });
    // After the reveal finishes, drop the delay so hover transitions respond instantly.
    document.addEventListener('transitionend', function (e) { if (e.target.hasAttribute && e.target.hasAttribute('data-reveal') && e.propertyName === 'opacity') e.target.style.setProperty('--d', 0); });
  }

  // Active section link in the top bar.
  var links = {};
  document.querySelectorAll('.top-nav a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window) {
    var so = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        Object.keys(links).forEach(function (k) { links[k].classList.toggle('on', k === e.target.id); });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(links).forEach(function (k) { var s = document.getElementById(k); if (s) so.observe(s); });
  }

  if (calm || !fine) return;

  // Spotlight: the glow on a card follows the pointer. Written straight to the element, no re-render.
  document.addEventListener('pointermove', function (e) {
    var el = e.target.closest && e.target.closest('.ways li, .steps li, .bld-card, .features li, .room-find, .closing');
    if (!el) return;
    var r = el.getBoundingClientRect();
    el.style.setProperty('--mx', (e.clientX - r.left) + 'px');
    el.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  // Phone tilts toward the pointer, a few degrees at most, and settles back on leave.
  var art = document.querySelector('.hero-art'), phone = document.querySelector('.phone');
  if (art && phone) {
    art.addEventListener('pointermove', function (e) {
      var r = art.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      phone.style.setProperty('--ry', (x * 14).toFixed(2) + 'deg');
      phone.style.setProperty('--rx', (-y * 10).toFixed(2) + 'deg');
    });
    art.addEventListener('pointerleave', function () { phone.style.setProperty('--rx', '0deg'); phone.style.setProperty('--ry', '0deg'); });
  }
})();
