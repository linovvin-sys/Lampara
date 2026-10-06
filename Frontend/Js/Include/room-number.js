// Room numbers may carry a section, e.g. "1101 - A". People type that many ways
// ("1101-a", "1101 A", "1101A", "1101 - A"), so anything that saves a room number
// stores ONE canonical form, and anything that looks one up compares with compact(),
// which ignores case, spaces and dashes.
// Keep in step with Backend/room_number.php (same rules, same output).
//
// Plain <script>; exposes `RoomNumber`.
const RoomNumber = (() => {
  // Canonical form: upper case, single spaces, " - " around any dash, and a short
  // trailing section glued to the digits ("1101A" / "1101 A") gets the dash.
  // Returns '' for an empty value.
  function normalize(value) {
    let s = String(value === null || value === undefined ? '' : value).trim();
    if (!s) return '';
    s = s.replace(/\s+/g, ' ').toUpperCase();
    s = s.replace(/\s*[-–—]\s*/g, ' - ');
    s = s.replace(/^[\s\-–—]+|[\s\-–—]+$/g, '');
    const m = /^(\d+) ?([A-Z][A-Z0-9]{0,3})$/.exec(s);
    if (m) s = m[1] + ' - ' + m[2];
    return s;
  }

  // Comparison key: "1101 - A", "1101-a" and "1101A" all become "1101A".
  function compact(value) {
    return String(value === null || value === undefined ? '' : value).toUpperCase().replace(/[\s\-–—]+/g, '');
  }

  // Digits, optionally followed by " - " and a short section: "1101" or "1101 - A".
  function isValidFormat(normalized) {
    return /^\d+( - [A-Z0-9]{1,4})?$/.test(normalized);
  }

  // The number before any section: "1101 - A" -> "1101".
  function base(normalized) {
    return String(normalized).split(' - ')[0];
  }

  // Does this room number match what a person typed in a search box?
  function matches(roomNumber, query) {
    const q = compact(query);
    return q !== '' && compact(roomNumber).includes(q);
  }

  return { normalize, compact, isValidFormat, base, matches };
})();
