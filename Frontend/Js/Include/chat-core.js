/* The brains of the chat screens (the Ask page and the walking guide's chat), so both behave the same:
   ask() sends the question to Backend/api/chat.php and gets back an answer plus real room cards and follow-up questions;
   if the AI cannot be reached (offline, over quota, down) it answers from the room directory kept on this phone instead,
   so a student is never left with nothing. Needs room-number.js and room-search.js. Plain <script>; exposes `LamparaChat`. */
const LamparaChat = (() => {
  const API = '../../../Backend/api/chat.php';
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Answers + room cards come back from the server; the link for a room's card depends on which folder this page is in.
  const roomHref = (id) => (location.pathname.indexOf('/Public/') !== -1 ? '../Student/' : '') + 'scan.php?room=' + encodeURIComponent(id);

  // **bold**, "- " bullet lists and paragraphs; everything else is plain text (so nothing the AI writes can inject markup).
  function format(text) {
    const bolded = esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    return bolded.split(/\n\s*\n/).map((block) => {
      const lines = block.split('\n').filter((l) => l.trim() !== '');
      if (!lines.length) return '';
      if (lines.every((l) => /^[-*]\s+/.test(l.trim()))) return '<ul>' + lines.map((l) => '<li>' + l.trim().replace(/^[-*]\s+/, '') + '</li>').join('') + '</ul>';
      return '<p>' + lines.join('<br>') + '</p>';
    }).join('');
  }

  // The answer, built from the directory on this phone: the best matching rooms, with their floor, building and hours.
  function localAnswer(message, buildingId) {
    let rooms = [];
    try { rooms = LamparaCache.getRooms() || []; } catch (e) { rooms = []; }
    if (buildingId) rooms = rooms.filter((r) => String(r.building_id) === String(buildingId));
    const found = RoomSearch.rank(rooms, message, 4);
    if (!found.length) {
      return { reply: "I can't reach the AI right now, and I couldn't find a matching room in the directory on this phone. Try a room name or number, or use Find a room.", rooms: [], followups: [], offline: true };
    }
    const lines = found.map((r) => '- **' + (r.room_number ? r.room_number + ' ' : '') + r.room_name + '**, ' + r.floor + ', ' + r.building_name + (r.hours ? ' (open ' + r.hours + ')' : ''));
    return { reply: "I can't reach the AI right now, but here is what the directory on this phone says:\n\n" + lines.join('\n'), rooms: found, followups: [], offline: true };
  }

  async function ask({ buildingId, message, history }) {
    const body = { message, history: history || [] };
    if (buildingId) body.building_id = buildingId;
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data && data.success && data.reply) return { reply: data.reply, rooms: data.rooms || [], gates: data.gates || [], followups: data.followups || [], source: data.source || 'ai' };
      if (data && data.reply && !data.fallback) return { reply: data.reply, rooms: [], followups: [] };   // a setup message from the server
    } catch (e) { /* fall through to the phone's own directory */ }
    return localAnswer(message, buildingId);
  }

  // Questions to offer before anyone types, made from this school's real rooms so they always have an answer.
  function starters(rooms, buildingId) {
    const list = (rooms || []).filter((r) => !buildingId || String(r.building_id) === String(buildingId));
    const offices = list.filter((r) => (r.category || r.room_type) === 'office');
    const out = [];
    const reg = offices.find((r) => /registrar|admission/i.test(r.room_name)) || offices[0];
    if (reg) out.push('Where is ' + reg.room_name + '?');
    const timed = offices.find((r) => r.hours && r !== reg);
    if (timed) out.push('What time does ' + timed.room_name + ' open?');
    out.push(buildingId ? 'What offices are in this building?' : 'Where are the restrooms?');
    if (!buildingId) out.push('Where are the campus gates?');
    out.push('How do I find my room inside a building?');
    out.push('Is anything blocked or closed right now?');
    return out.slice(0, 5);
  }
  return { ask, format, localAnswer, starters, roomHref };
})();
