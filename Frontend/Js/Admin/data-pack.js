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
  // The "confirm it is you" step is a dialog in the admin's own look (not a pop-up from a library): one password field with a show
  // toggle, and a code field that appears when the account uses two-step sign-in. Mistakes show inline, so nothing stacks on top of it.
  let vDlg = null;
  function buildDialog() {
    const d = document.createElement('dialog'); d.className = 'vf'; d.setAttribute('aria-labelledby', 'vfTitle');
    d.innerHTML =
      '<form method="dialog" class="vf-form" novalidate>' +
        '<div class="vf-icon" aria-hidden="true"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></div>' +
        '<h2 id="vfTitle">Confirm it is you</h2>' +
        '<p class="vf-sub">A data pack holds your whole directory, so enter your password again before continuing.</p>' +
        '<label class="vf-field" for="vfPw"><span>Password</span><span class="vf-pw"><input id="vfPw" type="password" autocomplete="current-password" required><button type="button" class="vf-eye" id="vfEye" aria-label="Show the password" aria-pressed="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg></button></span></label>' +
        '<button type="button" class="vf-link" id="vfMore">I use a two-step code</button>' +
        '<label class="vf-field" id="vfCodeRow" for="vfCode" hidden><span>Two-step code</span><input id="vfCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 digits"></label>' +
        '<p class="vf-err" id="vfErr" role="alert" hidden></p>' +
        '<div class="vf-actions"><button type="button" class="btn btn-secondary" id="vfCancel">Cancel</button><button type="submit" class="btn btn-primary" id="vfGo">Confirm</button></div>' +
      '</form>';
    document.body.appendChild(d);
    const $d = (id) => d.querySelector('#' + id);
    $d('vfEye').addEventListener('click', () => { const pw = $d('vfPw'), show = pw.type === 'password'; pw.type = show ? 'text' : 'password'; $d('vfEye').setAttribute('aria-pressed', show); $d('vfEye').setAttribute('aria-label', show ? 'Hide the password' : 'Show the password'); });
    $d('vfMore').addEventListener('click', () => { $d('vfCodeRow').hidden = false; $d('vfMore').hidden = true; $d('vfCode').focus(); });
    $d('vfCancel').addEventListener('click', () => d.close('cancel'));
    d.addEventListener('click', (e) => { if (e.target === d) d.close('cancel'); });   // a tap on the dim area closes it
    return d;
  }
  function verify() {
    if (!vDlg) vDlg = buildDialog();
    const d = vDlg, $d = (id) => d.querySelector('#' + id);
    $d('vfPw').value = ''; $d('vfCode').value = ''; $d('vfErr').hidden = true; $d('vfGo').disabled = false; $d('vfGo').textContent = 'Confirm';
    $d('vfCodeRow').hidden = true; $d('vfMore').hidden = false; $d('vfPw').type = 'password';
    d.showModal(); $d('vfPw').focus();
    return new Promise((resolve) => {
      let done = false;
      const fail = (t) => { const e = $d('vfErr'); e.textContent = t; e.hidden = false; d.classList.remove('is-shake'); void d.offsetWidth; d.classList.add('is-shake'); };
      const onSubmit = async (e) => {
        e.preventDefault();
        if (!$d('vfPw').value) { fail('Enter your password.'); $d('vfPw').focus(); return; }
        $d('vfGo').disabled = true; $d('vfGo').textContent = 'Checking…';
        try {
          const res = await fetch(API + '?action=verify', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $d('vfPw').value, code: $d('vfCode').value }) });
          let r = {}; try { r = await res.json(); } catch (x) { /* handled below */ }
          if (r.success) { done = true; d.close('ok'); return; }
          if (r.needs_code) { $d('vfCodeRow').hidden = false; $d('vfMore').hidden = true; if (!$d('vfCode').value) $d('vfCode').focus(); }
          fail(r.error || 'That did not work. Try again.');
          if (res.status === 429) { $d('vfGo').textContent = 'Try later'; return; }
        } catch (x) { fail('Could not reach the server. Check your connection.'); }
        $d('vfGo').disabled = false; $d('vfGo').textContent = 'Confirm';
      };
      const form = d.querySelector('form'); form.addEventListener('submit', onSubmit);
      d.addEventListener('close', () => { form.removeEventListener('submit', onSubmit); $d('vfPw').value = ''; $d('vfCode').value = ''; resolve(done); }, { once: true });
    });
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
