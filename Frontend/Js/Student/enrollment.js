// Enrollment guide: the seven steps (nine stops) of enrolling at NCST, with a button at each stop that opens the indoor route to that
// office (Student/journey.php), and a tick for every stop you finish. Progress is kept only on this phone. The steps themselves are in
// Js/Include/enrollment-steps.js. Needs offline-cache.js, enrollment-steps.js and mascots.js.
(() => {
  const API = '../../../Backend/api/';
  const KEY = 'lampara_enroll';
  const $ = (id) => document.getElementById(id);
  const M = window.LamparaMascots;
  let rooms = [], buildings = [], done = {};

  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) { /* not remembered after this visit */ } };

  async function getJson(file) {
    try { const r = await fetch(API + file); const d = await r.json(); if (d.success) return d; } catch (e) { /* offline: use the saved copy */ }
    return null;
  }

  function el(tag, cls, parent, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; if (parent) parent.appendChild(n); return n; }

  // Where "Show me the way" goes: from the room of the stop before (you are standing there), or from the door for the first office.
  function routeHref(stop, i) {
    const room = LamparaEnroll.roomFor(stop, rooms);
    // the booth is not in the directory yet: for step 1, at least walk to the building outside
    if (!room && stop.key === 'entrance') { const b = LamparaEnroll.building(buildings); return b ? '../Public/guide-ar.php?to=' + b.id : '../Public/guide-ar.php'; }
    if (!room) return null;
    const prev = LamparaEnroll.STOPS[i - 1], prevRoom = prev && LamparaEnroll.roomFor(prev, rooms);
    const base = 'journey.php?to=' + room.id + '&enroll=' + encodeURIComponent(stop.key);
    return prevRoom && prevRoom.id !== room.id ? base + '&from=' + prevRoom.id : base + '&arrived=1';
  }

  function render() {
    const S = LamparaEnroll.STOPS, total = S.length, n = S.filter((s) => done[s.key]).length;
    const next = S.findIndex((s) => !done[s.key]);
    // Undo only the stop finished last, and nothing once everything is done (then only "Start over" clears it)
    const last = n === total ? null : S.reduce((a, s) => (done[s.key] && (!a || done[s.key] >= done[a.key]) ? s : a), null);
    $('enFill').style.width = Math.round(n / total * 100) + '%';
    $('enBar').setAttribute('aria-valuenow', String(Math.round(n / total * 100)));
    $('enCount').textContent = n === total ? 'All done. You are enrolled!' : n + ' of ' + total + ' stops done. ' + (next >= 0 ? 'Next: ' + S[next].title + '.' : '');
    const list = $('enSteps'); list.textContent = '';
    let step = 0, li = null, inner = null;
    S.forEach((s, i) => {
      if (s.step !== step) {                                  // a new numbered step
        step = s.step;
        li = el('li', 'en-step', list);
        const allDone = S.filter((x) => x.step === step).every((x) => done[x.key]);
        li.classList.toggle('is-done', allDone);
        const head = el('div', 'en-step-head', li);
        el('span', 'en-num', head, allDone ? '✓' : String(step));
        el('h2', '', head, LamparaEnroll.TITLES[step]);
        inner = el('ul', 'en-stops', li);
      }
      const room = LamparaEnroll.roomFor(s, rooms), href = routeHref(s, i), isNext = i === next;
      const row = el('li', 'en-stop' + (done[s.key] ? ' is-done' : '') + (isNext ? ' is-next' : ''), inner);
      if (isNext) el('span', 'en-now', row, 'You are here');
      if (s.sub) el('p', 'en-sub', row, s.sub);
      el('p', 'en-where', row, s.place + (room && room.room_number ? ' · Room ' + room.room_number : '') + (room && room.floor ? ' · ' + room.floor : ''));
      el('p', 'en-what', row, s.what);
      if (s.houses) {
        const h = el('p', 'en-houses', row); h.appendChild(document.createTextNode('Houses of Hero: '));
        s.houses.forEach((x) => el('span', 'en-house', h, x));
      }
      if (room && room.hours) el('p', 'en-hours', row, 'Open ' + room.hours);
      const acts = el('div', 'en-acts', row);
      if (href && !done[s.key]) { const a = el('a', 'en-btn primary', acts, (!room && s.key === 'entrance') ? 'Walk to the building (outside)' : 'Show me the way'); a.href = href; }
      else if (!href && !done[s.key]) el('p', 'en-missing', acts, 'This office is not in the directory yet. Ask at the front desk.');
      if (done[s.key] && s !== last) return;
      const b = el('button', 'en-btn' + (done[s.key] ? '' : ' alt'), acts, done[s.key] ? 'Undo' : 'I am done here');
      b.type = 'button';
      b.addEventListener('click', () => { setDone(s, !done[s.key]); });
    });
  }

  function setDone(stop, on) {
    if (on) {
      done[stop.key] = Date.now();
      if (M) {
        if (M.award('enroll:' + stop.key, 5)) M.toast('Enrollment step', 5);
        if (LamparaEnroll.STOPS.every((s) => done[s.key]) && M.award('enroll:done', 30)) M.toast('Enrollment complete', 30);
      }
    } else delete done[stop.key];
    save(); render();
    const next = document.querySelector('.en-stop.is-next');
    if (on && next) next.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  async function init() {
    done = load();
    // coming back from the indoor route: mark the stop that was just reached
    const q = new URLSearchParams(location.search), back = q.get('done');
    if (back && LamparaEnroll.get(back)) { done[back] = done[back] || Date.now(); save(); if (M) { if (M.award('enroll:' + back, 5)) M.toast('Enrollment step', 5); if (LamparaEnroll.STOPS.every((s) => done[s.key]) && M.award('enroll:done', 30)) M.toast('Enrollment complete', 30); } }
    if (back) history.replaceState(null, '', location.pathname);

    const b = await getJson('buildings.php'), r = await getJson('rooms.php');
    buildings = b ? b.buildings : (window.LamparaCache ? LamparaCache.getBuildings() : []);
    rooms = r ? r.rooms : (window.LamparaCache ? LamparaCache.getRooms() : []);
    // an older saved copy of the directory may not say each room's building number
    const bn = {}; buildings.forEach((x) => { bn[x.id] = x.building_number; });
    rooms = rooms.map((x) => (x.building_number === undefined ? { ...x, building_number: bn[x.building_id] } : x));
    if (!LamparaEnroll.building(buildings)) { $('enError').textContent = 'The directory is not loaded yet. Connect once so the guide can find the offices, then come back.'; $('enError').hidden = false; }
    render();
    LamparaEnroll.refresh().then((changed) => { if (changed) render(); });      // an admin may have edited the steps
    $('enReset').addEventListener('click', () => {
      if ($('enReset').dataset.sure !== '1') { $('enReset').dataset.sure = '1'; $('enReset').textContent = 'Tap again to clear your progress'; setTimeout(() => { $('enReset').dataset.sure = ''; $('enReset').textContent = 'Start over'; }, 4000); return; }
      done = {}; save(); render(); $('enReset').dataset.sure = ''; $('enReset').textContent = 'Start over';
    });
  }
  init();
})();
