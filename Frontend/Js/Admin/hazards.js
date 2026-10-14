// Admin → Reports: the closed-building and blocked-path reports visitors send, with their photos.
(() => {
  const API = '../../../Backend/api/hazards.php';
  const FE = '../../';
  const KIND = { restricted: 'Closed / off-limits', blocked: 'Path blocked' };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ago = (m) => (m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago');
  let status = 'pending';

  async function call(url, method) {
    const res = await fetch(url, { method, credentials: 'same-origin' });
    return res.json();
  }

  async function load() {
    let d;
    try { d = await (await fetch(API + '?status=' + status, { credentials: 'same-origin', cache: 'no-store' })).json(); } catch (e) { d = null; }
    const list = $('hzList'), empty = $('hzEmpty');
    if (!d || !d.success) { list.innerHTML = ''; empty.textContent = d && d.error ? d.error : 'Could not load the reports.'; empty.hidden = false; return; }
    if (status === 'active') $('hzCount').textContent = d.reports.length ? '(' + d.reports.length + ')' : '';
    if (status === 'pending') $('hzPending').textContent = d.reports.length ? '(' + d.reports.length + ')' : '';
    empty.hidden = d.reports.length > 0;
    empty.textContent = status === 'pending' ? 'No reports are waiting for approval.' : status === 'active' ? 'No warnings are showing to visitors right now.' : 'Nothing has been cleared yet.';
    // Most urgent first (urgent, unverified ones lead), then the newest, so the top card is always the one to deal with.
    d.reports.sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0) || (a.verified ? 1 : 0) - (b.verified ? 1 : 0) || (a.age_min || 0) - (b.age_min || 0));
    list.innerHTML = d.reports.map((r) => {
      const place = r.building_name || 'On the campus grounds';
      const map = r.lat !== null ? '<a class="alt" href="https://www.google.com/maps?q=' + r.lat + ',' + r.lng + '" target="_blank" rel="noopener">Open on map</a>' : '';
      return '<article class="hz-card" data-id="' + r.id + '">'
        + (r.photo_path ? '<a href="' + esc(FE + r.photo_path) + '" target="_blank" rel="noopener"><img src="' + esc(FE + r.photo_path) + '" alt="Photo sent with the report" loading="lazy"></a>' : '<div class="hz-noimg">No photo sent</div>')
        + '<div class="hz-body"><span class="hz-kind ' + esc(r.kind) + '">' + esc(KIND[r.kind] || r.kind) + '</span>' + (r.urgent ? ' <span class="hz-kind">Urgent' + (r.status === 'active' && !r.verified ? ', showing to everyone, not yet checked' : '') + '</span>' : '')
        + '<h3>' + esc(place) + '</h3><div class="hz-meta">' + ago(r.age_min) + ' &middot; ' + esc(r.created_at) + '</div>'
        + (r.note ? '<p class="hz-note">' + esc(r.note) + '</p>' : '') + '</div>'
        + '<div class="hz-actions">' + map
        + (r.status === 'pending' ? '<button type="button" data-act="approve">Approve: show to everyone</button>' : r.status === 'active' ? (!r.verified ? '<button type="button" data-act="verify">Confirm it is real</button>' : '') + '<button type="button" data-act="resolve">Mark as cleared</button>' : '<button type="button" data-act="reopen">Bring back</button>')
        + '<button type="button" class="danger" data-act="delete">' + (r.status === 'pending' ? 'Reject' : 'Delete') + '</button></div></article>';
    }).join('');
  }

  $('hzList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const id = b.closest('[data-id]').dataset.id, act = b.dataset.act;
    const card = b.closest('[data-id]'), place = card.querySelector('h3').textContent, pending = !!card.querySelector('[data-act="approve"]');
    // Each action asks first; clearing and bringing back are easy to undo, so only approving and removing ask.
    const ask = {
      verify: { icon: 'question', title: 'Confirm this report?', text: 'It stays on screen for every visitor, without the not-yet-checked label.', confirmButtonText: 'Yes, it is real', confirmButtonColor: '#161850' },
      approve: { icon: 'question', title: 'Show this to everyone?', text: 'Everyone using the app will see a warning about ' + place + ' right away.', confirmButtonText: 'Yes, show it', confirmButtonColor: '#161850' },
      delete: { icon: 'warning', title: pending ? 'Reject this report?' : 'Delete this report?', text: 'The report and its photo will be removed for good.', confirmButtonText: pending ? 'Reject' : 'Delete', confirmButtonColor: '#ff0000' }
    }[act];
    if (ask) {
      const r = await Swal.fire({ ...ask, showCancelButton: true, cancelButtonText: 'Cancel', reverseButtons: true });
      if (!r.isConfirmed) return;
    }
    b.disabled = true;
    const d = act === 'delete' ? await call(API + '?id=' + id, 'DELETE') : await call(API + '?id=' + id + '&action=' + act, 'PUT');
    if (d && d.success) {
      const done = { verify: 'Confirmed', approve: 'Now showing to everyone', resolve: 'Marked as cleared', reopen: 'Brought back', delete: pending ? 'Report rejected' : 'Report deleted' }[act];
      Swal.fire({ icon: 'success', title: done, timer: 1600, showConfirmButton: false });
      load(); if (window.LamparaHazards) window.LamparaHazards.refresh();
    } else {
      b.disabled = false;
      Swal.fire({ icon: 'error', title: 'That did not work', text: (d && d.error) || 'Please try again.' });
    }
  });

  document.querySelectorAll('.hz-tab').forEach((t) => t.addEventListener('click', () => {
    status = t.dataset.status;
    document.querySelectorAll('.hz-tab').forEach((x) => x.classList.toggle('is-on', x === t));
    load();
  }));

  load();
  setInterval(() => { if (!document.hidden) load(); }, 30000);
})();
