// Names for walkway points: "Point A", "Point B", ... "Point Z", "Point AA", ...
// A name is stored with the point, so it stays put when another point is deleted.
// Names are unique inside one scope (all campus points, or the points of one floor plan).
// Same sequence as Backend/point_names.php.
//
// Plain <script>; exposes `PointNames`.
const PointNames = (() => {
  const MAX = 40;

  // 0 -> A, 25 -> Z, 26 -> AA, 27 -> AB ...
  function label(index) {
    let i = index, s = '';
    do { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; } while (i >= 0);
    return s;
  }
  // Position in the sequence for "Point AB" style names, or -1 for any other name.
  function indexOf(name) {
    const m = /^point ([a-z]+)$/i.exec(String(name || '').trim());
    if (!m) return -1;
    let n = 0;
    for (const ch of m[1].toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  function clean(value) {
    let s = String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
    if (s.length > MAX) s = s.slice(0, MAX).trim();
    return s;
  }
  const key = (name) => clean(name).toLowerCase();

  // The first "Point X" not in `usedNames` (an array of names already taken in this scope).
  function next(usedNames) {
    const used = new Set((usedNames || []).map(key));
    for (let i = 0; i < 100000; i++) {
      const candidate = 'Point ' + label(i);
      if (!used.has(key(candidate))) return candidate;
    }
    return 'Point ' + Date.now();
  }

  // Name for every node: its own stored name, or (older points saved before names
  // existed) the next free "Point X" in creation order — the same result the
  // backfill script writes to the database. Returns Map(String(id) -> name).
  function map(nodes) {
    const out = new Map();
    const used = [];
    nodes.forEach((n) => { const nm = clean(n.name); if (nm) { out.set(String(n.id), nm); used.push(nm); } });
    const unnamed = nodes.filter((n) => !clean(n.name)).sort((a, b) => {
      const an = Number(a.id), bn = Number(b.id);
      if (isFinite(an) && isFinite(bn)) return an - bn;
      return isFinite(an) ? -1 : (isFinite(bn) ? 1 : 0);
    });
    unnamed.forEach((n) => { const nm = next(used); used.push(nm); out.set(String(n.id), nm); });
    return out;
  }

  // Sorts "Point A" .. "Point Z", "Point AA" .. in order; custom names after, alphabetically.
  function compare(a, b) {
    const ia = indexOf(a), ib = indexOf(b);
    if (ia >= 0 && ib >= 0) return ia - ib;
    if (ia >= 0) return -1;
    if (ib >= 0) return 1;
    return String(a).localeCompare(String(b));
  }

  // What to write on a map dot: "Point C" -> "C"; custom names are shortened.
  function short(name) {
    const m = /^point ([a-z]+)$/i.exec(String(name || '').trim());
    if (m) return m[1].toUpperCase();
    const s = clean(name);
    return s.length > 8 ? s.slice(0, 7) + '…' : s;
  }

  // Is `name` unused by every node except `exceptId`?
  function isFree(name, nodes, namesMap, exceptId) {
    const k = key(name);
    return !nodes.some((n) => String(n.id) !== String(exceptId) && key(namesMap.get(String(n.id))) === k);
  }

  return { label, indexOf, clean, next, map, compare, short, isFree, MAX };
})();
