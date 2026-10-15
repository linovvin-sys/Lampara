/* Close a building or room for maintenance (or open it again). Lockdown.set(type, id, name, currentReason) asks, saves through
   Backend/api/lockdown.php and resolves with { closed_note } (null note = open), or null if cancelled or it failed. */
(function () {
  'use strict';
  var API = '../../../Backend/api/lockdown.php';
  async function post(type, id, reason, until) {
    var r = await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: type, id: id, reason: reason, until: until || '' }) });
    var d = {}; try { d = await r.json(); } catch (e) { /* handled below */ }
    if (!d.success) throw new Error(d.error || 'Could not save the closure.');
    return d;
  }
  async function set(type, id, name, current) {
    var reason = null, until = '';
    if (current) {
      var ok = window.Swal ? (await Swal.fire({ icon: 'question', title: 'Reopen ' + name + '?', text: 'Closed: ' + current, showCancelButton: true, confirmButtonText: 'Reopen' })).isConfirmed : confirm('Reopen ' + name + '?');
      if (!ok) return null; reason = '';
    } else if (window.Swal) {
      var pad = function (n) { return (n < 10 ? '0' : '') + n; }, soon = new Date(Date.now() + 36e5), stamp = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
      var r = await Swal.fire({ icon: 'warning', title: 'Close ' + name + '?', showCancelButton: true, confirmButtonText: 'Close it', confirmButtonColor: '#b3261e',
        html: '<p style="margin:0 0 .75rem">Students will see it as closed and cannot walk or find a way to it.</p>'
          + '<label for="lkWhy" style="display:block;text-align:left;font-weight:600;margin-bottom:.25rem">Why? (a few words)</label>'
          + '<input id="lkWhy" class="swal2-input" style="margin:0 0 .75rem;width:100%" maxlength="160" placeholder="e.g. Maintenance">'
          + '<label for="lkUntil" style="display:block;text-align:left;font-weight:600;margin-bottom:.25rem">Reopens on (date and time)</label>'
          + '<input id="lkUntil" type="datetime-local" class="swal2-input" style="margin:0;width:100%" min="' + stamp(soon) + '">'
          + '<small style="display:block;text-align:left;margin-top:.35rem;opacity:.75">After this time it opens by itself. You can still reopen it sooner.</small>',
        preConfirm: function () {
          var why = document.getElementById('lkWhy').value.trim(), until = document.getElementById('lkUntil').value;
          if (!why) { Swal.showValidationMessage('Please give a short reason.'); return false; }
          if (!until) { Swal.showValidationMessage('Please choose the date and time it reopens.'); return false; }
          if (new Date(until) <= new Date()) { Swal.showValidationMessage('The reopening time must be in the future.'); return false; }
          return { why: why, until: until };
        } });
      if (!r.isConfirmed) return null; reason = r.value.why; until = r.value.until;
    } else { reason = prompt('Why is ' + name + ' closed?'); if (!reason) return null; }
    try { return await post(type, id, reason, until); }
    catch (e) { if (window.Swal) Swal.fire({ icon: 'error', title: 'Not saved', text: e.message }); else alert(e.message); return null; }
  }
  window.Lockdown = { set: set };
})();
