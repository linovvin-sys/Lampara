// Data page: export a school, import a pack (replace), add rooms from a spreadsheet (Backend/api/data-pack.php).
(() => {
  const API = '../../../Backend/api/data-pack.php';
  const $ = (id) => document.getElementById(id);
  const LABELS = [['buildings', 'Buildings'], ['rooms', 'Rooms'], ['floor_plans', 'Floor plans'], ['path_points', 'Path points'], ['campus_points', 'Campus walkway points'], ['doors', 'Doors'], ['map_pins', 'Map pins']];
  let importable = false;

  const msg = (t, bad) => { const m = $('dpMsg'); m.textContent = t || ''; m.classList.toggle('bad', !!bad); m.hidden = !t; if (t) m.scrollIntoView({ block: 'nearest' }); };
  const li = (ul, items) => { ul.textContent = ''; items.forEach((t) => { const x = document.createElement('li'); x.textContent = t; ul.append(x); }); };
  // Everything here needs the administrator to prove who they are again (password, plus the two-step code if it is on).
  // Good for 5 minutes on the server; a download uses it up.
  async function verify() {
    for (let tries = 0; tries < 3; tries++) {
      const r = await Swal.fire({
        title: 'Confirm it is you', text: 'Data packs hold your whole directory, so enter your password again.', icon: 'info',
        html: '<input id="vPw" class="swal2-input" type="password" autocomplete="current-password" placeholder="Your password" aria-label="Your password">' +
              '<input id="vCode" class="swal2-input" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="Two-step code (only if you use one)" aria-label="Two-step code">',
        focusConfirm: false, showCancelButton: true, confirmButtonText: 'Confirm',
        preConfirm: () => ({ password: document.getElementById('vPw').value, code: document.getElementById('vCode').value })
      });
      if (!r.isConfirmed) return false;
      const res = await fetch(API + '?action=verify', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(r.value) });
      let d = {}; try { d = await res.json(); } catch (e) { /* handled below */ }
      if (d.success) return true;
      await Swal.fire({ icon: 'error', title: 'Not confirmed', text: d.error || 'Try again.' });
      if (res.status === 429) return false;
    }
    return false;
  }
  async function send(action, field, file, extra, retried) {
    const f = new FormData(); f.append(field, file); Object.entries(extra || {}).forEach(([k, v]) => f.append(k, v));
    const r = await fetch(API + '?action=' + action, { method: 'POST', credentials: 'same-origin', body: f });
    let d; try { d = await r.json(); } catch (e) { throw new Error('The server gave an unexpected answer (' + r.status + ').'); }
    if (d.needs_verify && !retried) { if (await verify()) return send(action, field, file, extra, true); throw new Error('Not confirmed.'); }
    if (!d.success && !d.problems) throw new Error(d.error || 'Something went wrong.');
    return d;
  }
  $('dpExport').addEventListener('click', async (e) => {
    e.preventDefault();
    if (await verify()) { window.location.href = API + '?action=export'; msg('Your download is starting. You will be asked again for the next one.'); }
  });

  // ---------- data pack ----------
  $('dpFile').addEventListener('change', () => { $('dpCheck').disabled = !$('dpFile').files.length; $('dpPreview').hidden = true; msg(''); });
  $('dpCheck').addEventListener('click', async () => {
    $('dpCheck').disabled = true; msg('');
    try {
      const d = await send('preview', 'pack', $('dpFile').files[0]);
      $('dpRows').textContent = '';
      LABELS.forEach(([k, label]) => {
        const tr = document.createElement('tr'), a = document.createElement('td'), b = document.createElement('td'), c = document.createElement('td');
        a.textContent = label; b.textContent = d.pack[k]; c.textContent = d.current[k]; b.className = c.className = 'num';
        tr.append(a, b, c); $('dpRows').append(tr);
      });
      li($('dpProblems'), d.problems || []); li($('dpWarnings'), d.warnings || []);
      importable = !!d.importable; $('dpConfirm').hidden = !importable; $('dpType').value = ''; $('dpGo').disabled = true;
      $('dpPreview').hidden = false;
      if (!importable) msg('This pack cannot be imported. Fix the problems listed, or export a fresh pack.', true);
    } catch (e) { msg(e.message, true); $('dpPreview').hidden = true; }
    $('dpCheck').disabled = false;
  });
  $('dpType').addEventListener('input', () => { $('dpGo').disabled = !(importable && $('dpType').value.trim() === 'REPLACE'); });
  $('dpGo').addEventListener('click', async () => {
    $('dpGo').disabled = true; msg('Importing. Please wait…');
    try {
      const d = await send('import', 'pack', $('dpFile').files[0], { confirm: 'REPLACE' });
      if (!d.success) { msg((d.error || 'The import failed.') + ' Nothing was changed.', true); return; }
      msg('Imported ' + d.imported.buildings + ' buildings and ' + d.imported.rooms + ' rooms. A safety copy of the previous content was saved as ' + d.safety_copy + ' in the backups folder.');
      $('dpPreview').hidden = true; $('dpFile').value = ''; $('dpCheck').disabled = true;
    } catch (e) { msg(e.message + ' Nothing was changed.', true); }
  });

  // ---------- rooms from a spreadsheet ----------
  $('csvFile').addEventListener('change', () => { $('csvCheck').disabled = !$('csvFile').files.length; $('csvPreview').hidden = true; msg(''); });
  $('csvCheck').addEventListener('click', async () => {
    $('csvCheck').disabled = true; msg('');
    try {
      const d = await send('csv-preview', 'csv', $('csvFile').files[0]);
      $('csvSummary').textContent = d.valid + ' of ' + d.rows + ' rows can be added' + (d.rows - d.valid ? '; ' + (d.rows - d.valid) + ' will be skipped.' : '.');
      $('csvSample').textContent = '';
      (d.sample || []).forEach((s) => { const tr = document.createElement('tr'); [s.line, s.room_number || 'none', s.room_name, s.floor, s.category].forEach((v) => { const td = document.createElement('td'); td.textContent = v; tr.append(td); }); $('csvSample').append(tr); });
      $('csvSampleT').hidden = !(d.sample || []).length;
      li($('csvProblems'), (d.problems || []).map((p) => 'Line ' + p[0] + ': ' + p[1]));
      $('csvBad').hidden = !(d.problems || []).length; $('csvBadSum').textContent = (d.problems || []).length + ' row(s) with a problem';
      $('csvGo').disabled = !d.valid; $('csvGo').textContent = d.valid ? 'Add ' + d.valid + ' room' + (d.valid === 1 ? '' : 's') : 'Add the rooms';
      $('csvPreview').hidden = false;
    } catch (e) { msg(e.message, true); $('csvPreview').hidden = true; }
    $('csvCheck').disabled = false;
  });
  $('csvGo').addEventListener('click', async () => {
    $('csvGo').disabled = true;
    try {
      const d = await send('csv-import', 'csv', $('csvFile').files[0]);
      if (!d.success) { msg(d.error || 'Nothing was added.', true); return; }
      msg('Added ' + d.added + ' room' + (d.added === 1 ? '' : 's') + (d.skipped ? ' and skipped ' + d.skipped + ' with a problem.' : '.'));
      $('csvPreview').hidden = true; $('csvFile').value = ''; $('csvCheck').disabled = true;
    } catch (e) { msg(e.message, true); }
  });
})();
