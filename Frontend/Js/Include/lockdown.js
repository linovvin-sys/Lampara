/* Close a building or room for maintenance (or open it again). Lockdown.set(type, id, name, currentReason) asks, saves through
   Backend/api/lockdown.php and resolves with { closed_note } (null note = open), or null if cancelled or it failed. */
(function () {
  'use strict';
  var API = '../../../Backend/api/lockdown.php';
  async function post(type, id, reason) {
    var r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: type, id: id, reason: reason }) });
    var d = {}; try { d = await r.json(); } catch (e) { /* handled below */ }
    if (!d.success) throw new Error(d.error || 'Could not save the closure.');
    return d;
  }
  async function set(type, id, name, current) {
    var reason = null;
    if (current) {
      var ok = window.Swal ? (await Swal.fire({ icon: 'question', title: 'Reopen ' + name + '?', text: 'Closed: ' + current, showCancelButton: true, confirmButtonText: 'Reopen' })).isConfirmed : confirm('Reopen ' + name + '?');
      if (!ok) return null; reason = '';
    } else if (window.Swal) {
      var r = await Swal.fire({ icon: 'warning', title: 'Close ' + name + '?', text: 'Students will see it as closed and cannot walk or find a way to it. Say why, in a few words.', input: 'text', inputPlaceholder: 'e.g. Maintenance until Friday', inputAttributes: { maxlength: 160 }, showCancelButton: true, confirmButtonText: 'Close it', confirmButtonColor: '#b3261e', inputValidator: function (v) { return v && v.trim() ? undefined : 'Please give a short reason.'; } });
      if (!r.isConfirmed) return null; reason = r.value.trim();
    } else { reason = prompt('Why is ' + name + ' closed?'); if (!reason) return null; }
    try { return await post(type, id, reason); }
    catch (e) { if (window.Swal) Swal.fire({ icon: 'error', title: 'Not saved', text: e.message }); else alert(e.message); return null; }
  }
  window.Lockdown = { set: set };
})();
