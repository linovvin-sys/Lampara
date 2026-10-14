/* Searching the room directory, shared by Manual Search and the walking guide, so both find the same things the same way.
   Every word typed must match somewhere (room number, name, subtitle, building, floor, kind of room); a partial room number works
   ("110" finds 1101, 1103...), filler words are ignored ("room 1103"), initials work ("hr" finds Human Resources), and one typo
   is forgiven. Runs on the cached directory, so it works offline too. Needs room-number.js. Plain <script>; exposes `RoomSearch`. */
const RoomSearch = (() => {
  const KIND_WORDS = { office: 'office offices', classroom: 'classroom classrooms class lab laboratory room', cr: 'cr comfort restroom bathroom toilet', canteen: 'canteen cafeteria food eat' };
  const FILLER = { room: 1, rm: 1, no: 1, number: 1, num: 1, '#': 1 };             // "room 1103", "rm 204", "no. 12"
  const SMALL = { of: 1, the: 1, and: 1, for: 1, to: 1, a: 1, an: 1, in: 1 };       // left out when making initials
  const norm = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  // The words of a search, without the filler (unless that would leave nothing).
  function words(q) {
    const all = norm(q).replace(/[.,#]/g, ' ').split(/\s+/).filter(Boolean);
    const kept = all.filter((w) => !FILLER[w]);
    return kept.length ? kept : all;
  }
  function within1(a, b) {            // edit distance <= 1 (typo tolerance)
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, miss = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++miss > 1) return false;
      if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
    }
    return miss + (a.length - i) + (b.length - j) <= 1;
  }
  const splitWords = (s) => s.split(/[^a-z0-9]+/).filter(Boolean);

  // How well one word fits one room: 0 = no match. Higher is better.
  function wordScore(w, r) {
    const name = norm(r.room_name), num = RoomNumber.compact(r.room_number).toLowerCase();
    const nameWords = splitWords(name);
    if (num && (num === w || RoomNumber.matches(r.room_number, w))) return num === w ? 9 : 7;
    if (name === w) return 10;
    if (nameWords.some((x) => x === w)) return 8;
    if (nameWords.some((x) => x.startsWith(w))) return 6;
    if (name.includes(w)) return 4;
    const sub = norm(r.subtitle);
    if (sub && sub.includes(w)) return 5;
    if (w.length >= 2) {              // initials: "hr" = Human Resources, "osa" = Office of Student Affairs
      const ini = nameWords.filter((x) => !SMALL[x]).map((x) => x[0]).join('');
      if (ini.length >= 2 && ini.startsWith(w)) return 5;
    }
    const bld = norm(r.building_name), flr = norm(r.floor), kind = KIND_WORDS[r.category] || KIND_WORDS[r.room_type] || '';
    if (bld.includes(w) || flr.includes(w) || kind.split(' ').some((x) => x.startsWith(w))) return 3;
    if (w.length >= 4 && [...nameWords, ...splitWords(bld)].some((x) => within1(w, x))) return 2;
    return 0;
  }
  // Best matches first. `limit` cuts the list.
  function rank(rooms, query, limit) {
    const ws = words(query);
    if (!ws.length) return [];
    const scored = [];
    (rooms || []).forEach((r) => {
      let total = 0;
      for (const w of ws) { const s = wordScore(w, r); if (!s) return; total += s; }
      scored.push({ r, total });
    });
    scored.sort((a, b) => b.total - a.total || String(a.r.room_name).localeCompare(String(b.r.room_name)));
    const out = scored.map((x) => x.r);
    return limit ? out.slice(0, limit) : out;
  }
  // Cut the matched words out of a name so the page can bold them.
  function highlight(text, q) {
    const ws = words(q);
    const src = String(text || ''), low = norm(src);
    if (!ws.length || low.length !== src.length) return [{ t: src, hit: false }];
    const mark = new Array(src.length).fill(false);
    ws.forEach((w) => { let i = low.indexOf(w); while (i !== -1) { for (let k = i; k < i + w.length; k++) mark[k] = true; i = low.indexOf(w, i + w.length); } });
    const out = [];
    for (let i = 0; i < src.length; i++) {
      if (out.length && out[out.length - 1].hit === mark[i]) out[out.length - 1].t += src[i];
      else out.push({ t: src[i], hit: mark[i] });
    }
    return out;
  }
  return { norm, words, wordScore, rank, highlight };
})();
