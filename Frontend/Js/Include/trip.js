// Remembers the trip in progress so a reload, a locked phone or a walk through the outside guide does not lose it.
// Plain <script>; exposes `LamparaTrip`. A trip is { to, from, arrived, step, label, ts }; it expires after 3 hours.
const LamparaTrip = (() => {
  const KEY = 'lampara_trip', MAX_AGE_MS = 3 * 60 * 60 * 1000;
  function get() {
    try {
      const t = JSON.parse(localStorage.getItem(KEY));
      if (!t || !t.to || Date.now() - (t.ts || 0) > MAX_AGE_MS) return null;
      return t;
    } catch (e) { return null; }
  }
  function set(patch) {
    try { localStorage.setItem(KEY, JSON.stringify({ ...(get() || {}), ...patch, ts: Date.now() })); } catch (e) { /* storage blocked: the trip just is not remembered */ }
  }
  function clear() { try { localStorage.removeItem(KEY); } catch (e) { /* nothing to clear */ } }
  // The page address that reopens a trip where it stopped.
  function url(t) {
    const p = new URLSearchParams({ to: t.to });
    if (t.from) p.set('from', t.from);
    if (t.arrived) p.set('arrived', '1');
    if (t.step) p.set('step', t.step);
    return 'journey.php?' + p.toString();
  }
  return { get, set, clear, url };
})();
