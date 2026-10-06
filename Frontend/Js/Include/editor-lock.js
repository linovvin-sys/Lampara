// Remembers whether an editor is locked. A locked editor ignores taps that would add,
// move, connect or delete points, so an accidental touch can't change the map. Panning,
// zooming and selecting still work. The choice is kept in this browser per editor.
//
// Plain <script>; exposes `EditorLock`.
const EditorLock = (() => {
  const prefix = 'lampara_editor_lock_';
  function get(key) {
    try { return localStorage.getItem(prefix + key) === '1'; } catch (e) { return false; }
  }
  function set(key, locked) {
    try { localStorage.setItem(prefix + key, locked ? '1' : '0'); } catch (e) { /* storage unavailable: lock just isn't remembered */ }
  }
  // Inline padlock icons (open / closed) so pages don't each carry their own SVG.
  const icon = {
    closed: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    open: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>'
  };
  return { get, set, icon };
})();
