/* The enrollment process, one stop after another (the built-in list below is NCST's, kept as a sample), shared by the Enrollment guide page and the indoor route page.
   Offices are named by room number inside one building (building number 1 = Amafel Building, Main), so the stops follow the real rooms
   in the directory: if an office moves, change its room number here. Plain <script>; exposes `LamparaEnroll`.
   The normal way to change the process is Admin > Enrollment steps (saved in the database). `DEFAULTS` below is what the app shows
   until an admin saves their own list, and what "Reset" returns to. Editing DEFAULTS in code:
   - add / remove / reorder a line: step numbers renumber themselves;
   - `heading` starts a new numbered step (shown as the step's title); a stop without `heading` joins the step above it;
   - `room` is the office's room number in the directory, or `match` a regex on its name; `key` must be unique (progress is saved by key).
   A stop with `room` is walked to on the floor plan; the first stop is the security booth, found by name (seed it with Backend/scripts/seed-enrollment.php). */
const LamparaEnroll = (() => {
  const BUILDING_NO = 1;
  const HOUSES = ['Makadiyos', 'Makakalikasan', 'Makatao', 'Makabayan'];
  // sub = a short label when one step has several stops
  const DEFAULTS = [
    { heading: 'Get the enrollment steps', key: 'entrance', title: 'Get the enrollment steps', match: /security|guard/i, place: 'Security guard booth, just inside the entrance',
      what: 'Ask the guard at the booth, near the entrance, for the steps to enroll. Then go on to the front desk.' },
    { heading: 'Have your documents checked', key: 'verify', title: 'Have your documents checked', room: '1109', place: 'OSA front desk',
      what: 'The front desk checks your documents. This is the first desk of enrollment, so bring everything you have.' },
    { heading: 'Admission: register and choose your House', key: 'admission', title: 'Admission: register and choose your House', room: '1101', place: 'Admission',
      what: 'Admission enters the information from your documents and prints your blue registration form. They also let you choose your House of Hero.',
      houses: HOUSES },
    { heading: 'Pay your tuition or downpayment', key: 'pay', title: 'Pay your tuition or downpayment', room: '1111', place: 'Treasury (collecting)',
      what: 'Pay your tuition or your downpayment here.' },
    { heading: 'House ID lace', key: 'lace-order', sub: 'Buy the lace', title: 'House ID lace: buy it', room: '1105', place: 'Production Office',
      what: 'Ask for your House ID lace. You pay for it at Treasury before you claim it.' },
    { key: 'lace-pay', sub: 'Pay for it', title: 'House ID lace: pay for it', room: '1111', place: 'Treasury (collecting)',
      what: 'Go back to Treasury and pay for the lace first.' },
    { key: 'lace-claim', sub: 'Claim it', title: 'House ID lace: claim it', room: '1105', place: 'Production Office',
      what: 'Show your receipt and claim your House ID lace.' },
    { heading: 'Have your ID picture taken', key: 'photo', title: 'Have your ID picture taken', room: '1109', place: 'OSA front desk',
      what: 'Back at the OSA front desk, they take your picture for your ID.' },
    { heading: 'Get your school email', key: 'email', title: 'Get your school email', room: '1101', place: 'Admission',
      what: 'Admission creates your school email account. That finishes your enrollment.' }
  ];
  // A school that has not saved its own steps starts with none, unless it is the NCST this sample was made for.
  const FALLBACK = (window.LAMPARA_CONFIG && LAMPARA_CONFIG.shortName && LAMPARA_CONFIG.shortName !== 'NCST') ? [] : DEFAULTS;
  // The list in use: an admin's edited copy (kept on this phone so it works offline) or, failing that, the fallback above.
  // `match` arrives from the server as text; it becomes a regex here.
  const CK = 'lampara_enroll_steps', STOPS = [], TITLES = {};
  const norm = (s) => ({ ...s, match: s.match ? new RegExp(s.match, 'i') : undefined, houses: s.houses === true ? HOUSES : s.houses });
  function use(list) {
    STOPS.length = 0; Object.keys(TITLES).forEach((k) => delete TITLES[k]);
    let n = 0;
    list.forEach((s, i) => { const x = norm(s); if (x.heading || !i) { n++; TITLES[n] = x.heading || x.title; } x.step = n; STOPS.push(x); });
  }
  // Plain-text copy of a stop, for the admin editor and for saving.
  const plain = (s) => ({ key: s.key, heading: s.heading, sub: s.sub, title: s.title, room: s.room, room_id: s.room_id, match: s.match && (s.match.source || s.match), place: s.place, what: s.what, houses: s.houses ? true : undefined });
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(CK)); } catch (e) { /* no saved copy */ }
  try { use(Array.isArray(saved) && saved.length ? saved : FALLBACK); } catch (e) { use(FALLBACK); }
  // Ask the server for the current list. Resolves true when the list in use changed. Any failure keeps what we have.
  async function refresh() {
    try {
      const d = await (await fetch('../../../Backend/api/enrollment-steps.php', { cache: 'no-cache' })).json();
      if (!d.success) return false;
      const next = Array.isArray(d.stops) && d.stops.length ? d.stops : null;
      const before = JSON.stringify(STOPS.map(plain));
      use(next || FALLBACK);
      try { next ? localStorage.setItem(CK, JSON.stringify(next)) : localStorage.removeItem(CK); } catch (e) { /* not kept */ }
      return JSON.stringify(STOPS.map(plain)) !== before;
    } catch (e) { use(STOPS.length ? STOPS.map(plain) : FALLBACK); return false; }
  }
  const get = (key) => STOPS.find((s) => s.key === key) || null;
  // Is this the main building? Its number was "1" and is now "1-A", so both count (used only by the built-in DEFAULTS).
  const isMain = (n) => /^1(-A)?$/i.test(String(n == null ? '' : n).trim());
  // The directory room for a stop: the room an admin picked (room_id), or for the built-in list a room number / name in the main building.
  function roomFor(stop, rooms) {
    if (!stop) return null;
    const list = rooms || [];
    const picked = stop.room_id && list.find((r) => String(r.id) === String(stop.room_id));
    if (picked) return picked;
    if (stop.match) return list.find((r) => isMain(r.building_number) && /^1st/i.test(r.floor || '') && stop.match.test(r.room_name || '')) || null;
    if (!stop.room) return null;
    const want = String(stop.room).replace(/\D/g, '');
    return list.find((r) => isMain(r.building_number) && String(r.room_number || '').replace(/\D/g, '') === want) || null;
  }
  const building = (buildings) => (buildings || []).find((b) => isMain(b.building_number)) || null;
  return { STOPS, TITLES, HOUSES, BUILDING_NO, DEFAULTS, get, roomFor, building, refresh, plain };
})();
