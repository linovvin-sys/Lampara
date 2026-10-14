// Admin UX layer, loaded on every admin page by View/Include/admin-nav.php:
//   1. Dropdowns: every <select> gets an animated, keyboard-friendly menu. The native <select> stays in the page (hidden), so Vue's
//      v-model, forms and the existing page scripts keep working untouched.
//   2. Tips: hovering or focusing any button/link shows what it does (its title/aria-label, or the glossary below).
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var CHEV = '<svg class="ux-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var TICK = '<svg class="ux-tick" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } return null; }

  /* ================= 1. Dropdowns ================= */
  var openSel = null; // { select, trigger, menu, items, active, typed, typedAt }
  var uid = 0;

  function upgradeSelect(sel) {
    if (sel.dataset.uxDone || sel.multiple || sel.size > 1 || sel.hasAttribute('data-native')) return;
    sel.dataset.uxDone = '1';
    var wrap = document.createElement('div');
    wrap.className = 'ux-select';
    var trig = document.createElement('button');
    trig.type = 'button';
    trig.className = 'ux-trigger';
    trig.id = 'ux-t' + (++uid);
    trig.setAttribute('role', 'combobox');
    trig.setAttribute('aria-haspopup', 'listbox');
    trig.setAttribute('aria-expanded', 'false');
    var name = sel.getAttribute('aria-label');
    if (name) trig.setAttribute('aria-label', name);
    else if (sel.id) { var lab = document.querySelector('label[for="' + sel.id + '"]'); if (lab) trig.setAttribute('aria-labelledby', lab.id || (lab.id = 'ux-l' + uid)); }
    trig.innerHTML = '<span class="ux-value"></span>' + CHEV;
    wrap.appendChild(trig);
    sel.classList.add('ux-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    sel.after(wrap); // beside the select, never around it: Vue removes/patches the select where it left it
    wrap._sel = sel; wrap._trig = trig; sel._ux = wrap;
    sel.addEventListener('focus', function () { trig.focus(); }); // a <label for> or a failed "required" check lands on the visible control
    trig.addEventListener('click', function () { openSel && openSel.select === sel ? closeMenu() : openMenu(sel); });
    trig.addEventListener('keydown', function (e) { onKey(e, sel); });
    syncSelect(sel, true);
  }

  function selText(sel) { var o = sel.options[sel.selectedIndex]; return o ? o.text : ''; }
  function syncSelect(sel, force) {
    var wrap = sel._ux; if (!wrap) return;
    var key = sel.selectedIndex + '|' + sel.options.length + '|' + selText(sel) + '|' + sel.disabled;
    if (!force && wrap._key === key) return;
    wrap._key = key;
    var o = sel.options[sel.selectedIndex];
    wrap.querySelector('.ux-value').textContent = o ? o.text : 'Choose…';
    wrap.classList.toggle('is-placeholder', !o || o.value === '');
    wrap.classList.toggle('is-disabled', sel.disabled);
    wrap._trig.disabled = sel.disabled;
  }

  function openMenu(sel) {
    closeMenu(true);
    if (sel.disabled) return;
    var wrap = sel._ux, trig = wrap._trig;
    var menu = document.createElement('ul');
    menu.className = 'ux-menu';
    menu.id = 'ux-m' + (++uid);
    menu.setAttribute('role', 'listbox');
    var items = [], i = 0;
    Array.prototype.forEach.call(sel.children, function (c) {
      var opts = c.tagName === 'OPTGROUP' ? c.children : [c];
      Array.prototype.forEach.call(opts, function (o) {
        var li = document.createElement('li');
        li.className = 'ux-opt'; li.id = menu.id + '-' + items.length; li.setAttribute('role', 'option');
        li.style.setProperty('--i', Math.min(i++, 12));
        li.setAttribute('aria-selected', o.index === sel.selectedIndex ? 'true' : 'false');
        if (o.disabled || c.disabled) li.setAttribute('aria-disabled', 'true');
        li.innerHTML = '<span class="ux-opt-text"></span>' + TICK;
        li.firstChild.textContent = o.text || ' ';
        li._index = o.index;
        li.addEventListener('pointermove', function () { setActive(li); });
        li.addEventListener('click', function () { if (!li.hasAttribute('aria-disabled')) choose(sel, o.index); });
        menu.appendChild(li); items.push(li);
      });
    });
    if (!items.length) { var e = document.createElement('li'); e.className = 'ux-opt-empty'; e.textContent = 'Nothing to choose yet.'; menu.appendChild(e); }
    document.body.appendChild(menu);
    var r = trig.getBoundingClientRect(), vh = window.innerHeight;
    var below = vh - r.bottom - 12, above = r.top - 12, up = below < 200 && above > below;
    menu.style.minWidth = Math.max(r.width, 160) + 'px';
    menu.style.maxHeight = Math.max(120, Math.min(280, up ? above : below)) + 'px';
    menu.style.left = Math.max(8, Math.min(r.left, window.innerWidth - menu.offsetWidth - 8)) + 'px';
    if (up) { menu.classList.add('is-up'); menu.style.bottom = (vh - r.top + 6) + 'px'; } else menu.style.top = (r.bottom + 6) + 'px';
    openSel = { select: sel, trigger: trig, menu: menu, items: items, active: -1, typed: '', typedAt: 0 };
    wrap.classList.add('is-open'); trig.setAttribute('aria-expanded', 'true'); trig.setAttribute('aria-controls', menu.id);
    var cur = items.filter(function (li) { return li._index === sel.selectedIndex; })[0] || items.filter(function (li) { return !li.hasAttribute('aria-disabled'); })[0];
    requestAnimationFrame(function () { menu.classList.add('is-open'); });
    if (cur) setActive(cur, true);
  }

  function closeMenu(instant) {
    if (!openSel) return;
    var s = openSel; openSel = null;
    s.select._ux.classList.remove('is-open');
    s.trigger.setAttribute('aria-expanded', 'false'); s.trigger.removeAttribute('aria-activedescendant');
    s.menu.classList.remove('is-open');
    var gone = function () { if (s.menu.parentNode) s.menu.parentNode.removeChild(s.menu); };
    if (instant || reduce) gone(); else setTimeout(gone, 200);
  }

  function setActive(li, scroll) {
    if (!openSel || !li) return;
    openSel.items.forEach(function (x) { x.classList.remove('is-active'); });
    li.classList.add('is-active');
    openSel.active = openSel.items.indexOf(li);
    openSel.trigger.setAttribute('aria-activedescendant', li.id);
    if (scroll) li.scrollIntoView({ block: 'nearest' });
  }

  function choose(sel, index) {
    var changed = sel.selectedIndex !== index;
    sel.selectedIndex = index;
    if (changed) { sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); }
    syncSelect(sel, true);
    closeMenu();
    sel._ux._trig.focus();
  }

  function move(step) {
    var s = openSel, n = s.items.length, i = s.active;
    for (var k = 0; k < n; k++) { i = (i + step + n) % n; if (!s.items[i].hasAttribute('aria-disabled')) return setActive(s.items[i], true); }
  }

  function onKey(e, sel) {
    var k = e.key;
    if (!openSel || openSel.select !== sel) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ') { e.preventDefault(); openMenu(sel); }
      return;
    }
    var s = openSel;
    if (k === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (k === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (k === 'Home') { e.preventDefault(); s.active = -1; move(1); }
    else if (k === 'End') { e.preventDefault(); s.active = s.items.length; move(-1); }
    else if (k === 'Enter' || k === ' ') { e.preventDefault(); if (s.items[s.active]) choose(sel, s.items[s.active]._index); }
    else if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); closeMenu(); }
    else if (k === 'Tab') closeMenu();
    else if (k.length === 1) { // type-ahead
      var now = Date.now(); s.typed = (now - s.typedAt > 700 ? '' : s.typed) + k.toLowerCase(); s.typedAt = now;
      var hit = s.items.filter(function (li) { return li.textContent.toLowerCase().indexOf(s.typed) === 0 && !li.hasAttribute('aria-disabled'); })[0];
      if (hit) setActive(hit, true);
    }
  }

  document.addEventListener('pointerdown', function (e) { if (openSel && !openSel.menu.contains(e.target) && !openSel.select._ux.contains(e.target)) closeMenu(); }, true);
  window.addEventListener('resize', function () { closeMenu(true); });
  window.addEventListener('scroll', function (e) { if (openSel && !openSel.menu.contains(e.target)) closeMenu(true); }, true);

  function scan() {
    document.querySelectorAll('.admin-main select:not([data-ux-done])').forEach(upgradeSelect);
    document.querySelectorAll('.ux-select').forEach(function (w) {
      if (!w._sel.isConnected) { if (openSel && openSel.select === w._sel) closeMenu(true); w.remove(); } // Vue removed the select (v-if): drop its menu button too
      else syncSelect(w._sel);
    });
  }
  // ponytail: a 250 ms poll keeps the shown label in step with values Vue sets in code (no event fires for those). Fine for ~10 selects per page.
  setInterval(scan, 250);

  /* ================= 2. Tips ================= */
  // What buttons do, by their visible label. Anything with its own title / aria-label / data-tip uses that instead.
  var GLOSSARY = {
    '+ building': 'Register a new building on the campus.',
    'new building': 'Register a new building on the campus.',
    'new room': 'Register a new room or office.',
    '+ room': 'Register a new room or office.',
    '+ add a room': 'Register a new room in this building.',
    'edit': 'Open this to change its details.',
    'open full editor': 'Opens the full building page: map pin, floor plans and walkable paths.',
    'preview as student': 'See this the way students see it. Nothing is changed.',
    'view as student': 'See this the way students see it. Nothing is changed.',
    'view / print': 'Open a clean copy of this map you can print.',
    'lock editing': 'Locks the map so points cannot be moved or deleted by accident.',
    'unlock to edit': 'Lets you add, move and delete points again.',
    'undo': 'Takes back your last change.',
    'remove all': 'Deletes every point on this map. You are asked to confirm first.',
    'add point at map centre': 'Drops a new walking point in the middle of the map. Drag it into place.',
    'add point at plan centre': 'Drops a new walking point in the middle of the floor plan. Drag it into place.',
    'add pin at map centre': 'Drops a new pin in the middle of the map. Drag it into place.',
    'connect': 'Draws a walkable link between the selected point and the one you chose.',
    'delete point': 'Deletes the selected point and every link to it.',
    'deselect': 'Stops editing the selected point.',
    'rename': 'Change the name of the selected point.',
    'save changes': 'Saves what you changed in this panel.',
    'save': 'Saves your changes on this page.',
    'save pin': 'Saves this pin to the campus map.',
    'save doors': 'Saves which points are the building entrance and exit.',
    'cancel': 'Closes this without saving.',
    'done': 'Finishes editing and closes this.',
    'resolve': 'Marks this report as dealt with.',
    'use the entrance as the exit too': 'Uses the same point for people leaving the building.',
    'add a stop': 'Adds another step to the enrollment route.',
    'go back to the built-in steps': 'Throws away your custom steps and uses the standard ones.',
    'change password': 'Saves your new password.',
    'send': 'Sends the message to the chat.',
    'select all shown': 'Ticks every room currently listed.',
    'set hours…': 'Sets opening hours for all ticked rooms at once.',
    'clear marker': 'Removes this room’s marker from the floor plan.'
  };
  var tipEl = null, tipTimer = 0, tipFor = null;
  function norm(s) { return (s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }

  function tipText(el) {
    if (!el.hasAttribute('data-tip') && el.hasAttribute('title')) { // take over native titles so only one bubble shows
      var t = el.getAttribute('title');
      if (!el.getAttribute('aria-label') && !norm(el.textContent)) el.setAttribute('aria-label', t);
      el.setAttribute('data-tip', t); el.removeAttribute('title');
    }
    var side = el.closest('.admin-sidebar nav a');
    if (side) { var g = GUIDES[(side.getAttribute('href') || '').replace(/\.php.*$/, '')]; if (g) return side.textContent.trim() + ': ' + g.hint; }
    return el.getAttribute('data-tip') || (!norm(el.textContent) && el.getAttribute('aria-label')) || GLOSSARY[norm(el.textContent)] || '';
  }
  function showTip(el) {
    var text = tipText(el); if (!text || el.disabled) return;
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'ux-tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.id = 'ux-tip'; document.body.appendChild(tipEl); }
    tipEl.classList.remove('is-on', 'is-below');
    tipEl.textContent = text;
    var r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
    var below = r.top < h + 14;
    tipEl.classList.toggle('is-below', below);
    tipEl.style.left = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, window.innerWidth - w - 8)) + 'px';
    tipEl.style.top = (below ? r.bottom + 8 : r.top - h - 8) + 'px';
    el.setAttribute('aria-describedby', 'ux-tip'); tipFor = el;
    requestAnimationFrame(function () { tipEl && tipEl.classList.add('is-on'); });
  }
  function hideTip() {
    clearTimeout(tipTimer);
    if (tipEl) tipEl.classList.remove('is-on');
    if (tipFor) { tipFor.removeAttribute('aria-describedby'); tipFor = null; }
  }
  var TIPPABLE = 'button, a, [role="button"], [role="tab"], [data-tip], summary';
  document.addEventListener('pointerover', function (e) {
    if (e.pointerType === 'touch') return;
    var el = e.target.closest && e.target.closest(TIPPABLE);
    if (!el || el === tipFor || el.classList.contains('ux-trigger')) return;
    hideTip(); tipTimer = setTimeout(function () { showTip(el); }, 380);
  });
  document.addEventListener('pointerout', function (e) { var el = e.target.closest && e.target.closest(TIPPABLE); if (el && !el.contains(e.relatedTarget)) hideTip(); });
  document.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest(TIPPABLE); if (el && e.target.matches(':focus-visible') && !el.classList.contains('ux-trigger')) { clearTimeout(tipTimer); showTip(el); } });
  document.addEventListener('focusout', hideTip);
  document.addEventListener('pointerdown', hideTip, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hideTip(); });
  window.addEventListener('scroll', hideTip, true);

  /* ================= 3. How this page works ================= */
  // One line per page, shown as the tip on its sidebar link.
  var GUIDES = {
    dashboard: { hint: 'Your starting point: what needs attention and how far along each building is.',
      },
    hazards: { hint: 'Problems visitors reported on campus, such as a blocked path.',
      },
    'enrollment-steps': { hint: 'The stops a new student visits during enrollment, in order.',
      },
    buildings: { hint: 'Every registered building: quick edits, rooms and setup progress.',
      },
    'building-edit': { hint: 'Create a building or change its pin, photo, floor plans and walkable paths.',
      },
    'room-edit': { hint: 'Add a room or office, or change one that already exists.',
      },
    'campus-paths': { hint: 'The walkable paths outdoors that students are guided along.',
      },
    'building-outlines': { hint: 'Link each building outline on the campus map to a registered building.',
      },
    'campus-map': { hint: 'Pins on the campus map: building entrances, gates and key places.',
      },
    doors: { hint: 'Which point is each building’s entrance and exit.',
      },
    account: { hint: 'Your sign-in details and two-step verification.',
      },
    'test-chat': { hint: 'Try the student assistant for a building before students do.',
      }
  };


  /* ================= 3. Jump bar: long editors list their sections so you can go straight to one ================= */
  var jumpKey = '';
  function buildJump() {
    var heads = Array.prototype.filter.call(document.querySelectorAll('.admin-main .field-divider'), function (h) { return h.offsetParent !== null; });
    var form = heads.length ? heads[0].closest('form') : null;
    var old = document.querySelector('.ux-jump');
    if (heads.length < 3 || !form) { if (old) old.remove(); jumpKey = ''; return; }
    var key = heads.map(function (h) { return h.textContent.trim(); }).join('|');
    if (old && key === jumpKey && old.isConnected) return;
    jumpKey = key; if (old) old.remove();
    var nav = document.createElement('nav'); nav.className = 'ux-jump'; nav.setAttribute('aria-label', 'Sections on this page');
    heads.forEach(function (h, i) {
      if (!h.id) h.id = 'ux-sec-' + i;
      var a = document.createElement('a'); a.href = '#' + h.id; a.textContent = h.textContent.trim().replace(/\s+/g, ' ').toLowerCase().replace(/^./, function (c) { return c.toUpperCase(); });
      a.addEventListener('click', function (e) { e.preventDefault(); h.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }); });
      nav.appendChild(a);
    });
    form.insertBefore(nav, form.firstChild);
    spy();
  }
  function spy() {
    var nav = document.querySelector('.ux-jump'); if (!nav) return;
    var links = nav.querySelectorAll('a'), cur = 0;
    links.forEach(function (a, i) { var h = document.getElementById(a.hash.slice(1)); if (h && h.getBoundingClientRect().top < 170) cur = i; });
    links.forEach(function (a, i) { a.classList.toggle('is-on', i === cur); });
  }
  window.addEventListener('scroll', spy, { passive: true });

  setInterval(buildJump, 500);
  function start() { scan(); buildJump(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
