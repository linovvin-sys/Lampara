// Editor lock. A locked editor ignores taps that would add, move, connect or delete points,
// so an accidental touch can't change the map. Panning, zooming and selecting still work.
// Every editor STARTS LOCKED each time its page opens: unlocking is a deliberate choice for
// the current visit and is not remembered, so nobody opens the editor already "live".
//
// Plain <script>; exposes `EditorLock`.
const EditorLock = (() => {
  const prefix = 'lampara_editor_lock_';
  function get(key) {
    // An older version remembered "unlocked" in localStorage; that is ignored on purpose.
    return true;
  }
  function set(key, locked) {
    // Nothing is stored any more (see above). Kept so the editors' toggle code stays unchanged.
    try { localStorage.removeItem(prefix + key); } catch (e) { /* storage unavailable */ }
  }
  // Inline padlock icons (open / closed) so pages don't each carry their own SVG.
  const icon = {
    closed: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    open: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>'
  };
  return { get, set, icon };
})();
