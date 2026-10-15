// Your account (password, two-step sign-in) and, for administrators, the team and the activity log.
// Talks to Backend/api/account.php. Everything the server sends is put on the page as text, never as markup.
(function () {
  const API = '../../../Backend/api/account.php';
  const $ = (id) => document.getElementById(id);
  let role = 'admin', me = null, team = [], areas = {}, picked = new Set(), events = [], logFilter = 'all';

  // PSMO presets: one tap sets the areas a group of staff needs.
  const PRESETS = [
    { label: 'Buildings team', areas: ['buildings'] },
    { label: 'Campus paths team', areas: ['campus'] },
    { label: 'Reports desk', areas: ['reports'] },
    { label: 'All areas', areas: ['buildings', 'campus', 'reports', 'enrollment', 'assistant'] }
  ];

  async function call(path, body) {
    const res = await fetch(API + path, body === undefined ? { cache: 'no-store', credentials: 'same-origin' } : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = {}; try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok && !data.error) data.error = 'Something went wrong (' + res.status + ')';
    return data;
  }
  // A tiny element builder: h('div', { class: 'x', onclick: fn }, 'text', child)
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (v === false || v == null) return; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'class') el.className = v; else el.setAttribute(k, v === true ? '' : v); });
    kids.flat().forEach((c) => { if (c == null || c === false) return; el.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return el;
  }
  const say = (el, text, ok) => { el.textContent = text; el.className = 'ac-msg ' + (text ? (ok ? 'is-ok' : 'is-bad') : ''); };
  const ago = (s) => {
    if (!s) return 'Never signed in';
    const m = Math.max(0, Math.round((Date.now() - new Date(s.replace(' ', 'T')).getTime()) / 60000));
    if (m < 2) return 'Active just now'; if (m < 60) return m + ' min ago'; if (m < 1440) return Math.round(m / 60) + ' h ago'; const d = Math.round(m / 1440); return d === 1 ? 'Yesterday' : d + ' days ago';
  };

  // ---------- tabs ----------
  function showTab(name) {
    document.querySelectorAll('.ac-tab').forEach((b) => { const on = b.dataset.tab === name; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', on); });
    $('paneMe').hidden = name !== 'me'; $('paneTeam').hidden = name !== 'team'; $('paneLog').hidden = name !== 'log';
    if (name === 'team') loadTeam(); if (name === 'log') loadLog();
    try { history.replaceState(null, '', '#' + name); } catch (e) { /* fine */ }
  }
  $('acTabs').addEventListener('click', (e) => { const b = e.target.closest('.ac-tab'); if (b && !b.hidden) showTab(b.dataset.tab); });

  // ---------- me ----------
  async function load() {
    me = await call('');
    if (!me.success) { $('acName').textContent = me.error || 'Could not load your account.'; return; }
    role = me.role;
    $('acName').textContent = me.username; $('acAvatar').textContent = me.username.charAt(0).toUpperCase();
    $('acChips').textContent = '';
    $('acChips').append(h('span', { class: 'chip ' + (role === 'admin' ? 'chip-dark' : '') }, role === 'admin' ? 'Administrator' : 'PSMO staff'), h('span', { class: 'chip ' + (me.two_step ? 'chip-ok' : 'chip-warn') }, me.two_step ? 'Two-step on' : 'Two-step off'));
    showTwoStep(me.two_step);
    if (role === 'admin') { document.querySelectorAll('.ac-tab[hidden]').forEach((b) => { b.hidden = false; }); }
    const start = (location.hash || '').slice(1); if (role === 'admin' && (start === 'team' || start === 'log')) showTab(start);
  }
  function showTwoStep(on) {
    $('tsState').textContent = on ? 'On. Signing in asks for a code from your app.' : 'Off. Turning it on is the single best protection for this account.';
    $('tsState').className = 'ac-state ' + (on ? 'is-on' : 'is-off');
    $('tsOn').hidden = !on; $('tsOff').hidden = on; $('tsSetup').hidden = true;
  }
  $('pwNew').addEventListener('input', () => {
    const v = $('pwNew').value; let s = 0;
    if (v.length >= 10) s++; if (v.length >= 14) s++; if (/[A-Z]/.test(v) && /[a-z]/.test(v)) s++; if (/\d/.test(v) || /[^A-Za-z0-9]/.test(v)) s++;
    $('pwBar').style.width = (s * 25) + '%'; $('pwBar').dataset.level = s;
    $('pwHint').textContent = !v ? 'At least 10 characters.' : v.length < 10 ? (10 - v.length) + ' more character' + (10 - v.length === 1 ? '' : 's') + ' needed.' : ['', 'Okay. A longer phrase is stronger.', 'Good.', 'Strong.', 'Very strong.'][s] || 'Good.';
  });
  $('unForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const r = await call('?action=username', { username: $('unNew').value.trim(), password: $('unPw').value });
    if (!r.success) return say($('unMsg'), r.error || 'Could not change it.', false);
    $('unForm').reset(); say($('unMsg'), 'Username changed to ' + r.username + '.', true); load();
  });
  $('pwForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if ($('pwNew').value !== $('pwNew2').value) return say($('pwMsg'), 'The two new passwords are not the same.', false);
    const r = await call('?action=password', { current: $('pwCur').value, new: $('pwNew').value });
    if (r.success) { say($('pwMsg'), 'Password changed.', true); $('pwForm').reset(); $('pwBar').style.width = '0'; } else say($('pwMsg'), r.error || 'Could not change it.', false);
  });
  $('tsBegin').addEventListener('click', async () => {
    const r = await call('?action=2fa_begin', {});
    if (!r.success) return say($('tsMsg'), r.error || 'Could not start.', false);
    $('tsKey').textContent = r.secret.replace(/(.{4})/g, '$1 ').trim(); $('tsLink').href = r.uri;
    $('tsOff').hidden = true; $('tsSetup').hidden = false; say($('tsMsg'), '', true); $('tsCode').focus();
  });
  $('tsConfirm').addEventListener('click', async () => {
    const r = await call('?action=2fa_confirm', { code: $('tsCode').value });
    if (r.success) { say($('tsMsg'), 'Two-step sign-in is on.', true); showTwoStep(true); $('tsCode').value = ''; load(); } else say($('tsMsg'), r.error || 'That code did not work.', false);
  });
  $('tsOffBtn').addEventListener('click', async () => {
    const r = await call('?action=2fa_off', { password: $('tsOffPw').value, code: $('tsOffCode').value });
    if (r.success) { say($('tsMsg'), 'Two-step sign-in is off.', true); showTwoStep(false); $('tsOffPw').value = ''; $('tsOffCode').value = ''; load(); } else say($('tsMsg'), r.error || 'Could not switch it off.', false);
  });

  // ---------- team ----------
  async function loadTeam() {
    const r = await call('?team=1'); if (!r.success) return;
    team = r.accounts; areas = r.areas; drawTeam();
  }
  function accessChips(a) {
    if (a.role === 'admin') return [h('span', { class: 'chip chip-dark' }, 'Everything')];
    return a.permissions.length ? a.permissions.map((k) => h('span', { class: 'chip' }, (areas[k] || {}).label || k)) : [h('span', { class: 'chip chip-warn' }, 'No access')];
  }
  function drawTeam() {
    const q = $('teamQ').value.trim().toLowerCase(), f = $('teamFilter').value;
    const list = team.filter((a) => (!q || a.username.toLowerCase().includes(q)) && (!f || (f === 'off' ? a.disabled : a.role === f)));
    const staff = team.filter((a) => a.role === 'psmo');
    $('teamStats').textContent = '';
    [['Administrators', team.filter((a) => a.role === 'admin' && !a.disabled).length], ['PSMO staff', staff.filter((a) => !a.disabled).length], ['Without two-step', team.filter((a) => !a.two_step && !a.disabled).length], ['Disabled', team.filter((a) => a.disabled).length]]
      .forEach(([l, n]) => $('teamStats').append(h('div', { class: 'ac-stat' }, h('b', {}, n), h('span', {}, l))));
    $('teamList').textContent = '';
    list.forEach((a) => {
      const sel = h('input', { type: 'checkbox', 'aria-label': 'Select ' + a.username, checked: picked.has(a.id), disabled: a.role === 'admin' || null, onchange: (e) => { e.target.checked ? picked.add(a.id) : picked.delete(a.id); drawBulk(); } });
      $('teamList').append(h('li', { class: 'ac-member grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 min-[720px]:grid-cols-[auto_auto_minmax(0,1fr)_auto] min-[720px]:items-center' + (a.disabled ? ' is-off' : '') },
        a.role === 'psmo' ? h('label', { class: 'ac-pick' }, sel) : h('span', { class: 'ac-pick' }),
        h('span', { class: 'ac-avatar sm', 'aria-hidden': 'true' }, a.username.charAt(0).toUpperCase()),
        h('div', { class: 'ac-member-main' },
          h('div', { class: 'ac-member-name' }, a.username, a.you ? h('span', { class: 'chip' }, 'You') : null, a.disabled ? h('span', { class: 'chip chip-warn' }, 'Disabled') : null),
          h('div', { class: 'ac-member-meta' }, (a.role === 'admin' ? 'Administrator' : 'PSMO staff') + ' · ' + ago(a.last_login) + ' · ' + (a.two_step ? 'Two-step on' : 'No two-step')),
          h('div', { class: 'ac-chips m-0 flex flex-wrap gap-1.5' }, accessChips(a))),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => openEditor(a) }, 'Manage')));
    });
    $('teamEmpty').hidden = list.length > 0; drawBulk();
  }
  function drawBulk() { $('teamBulk').hidden = !picked.size; $('teamBulkN').textContent = picked.size + ' selected'; }
  $('teamQ').addEventListener('input', drawTeam); $('teamFilter').addEventListener('change', drawTeam);
  $('teamBulkClear').addEventListener('click', () => { picked.clear(); drawTeam(); });
  $('teamBulkSet').addEventListener('click', () => openEditor(null, [...picked]));
  $('teamAdd').addEventListener('click', () => openEditor('new'));

  // ---------- the editor sheet ----------
  function closeSheet() { $('sheet').hidden = true; document.body.classList.remove('ac-lock'); }
  $('sheet').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeSheet(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('sheet').hidden) closeSheet(); });
  function openSheet(title) { $('sheetTitle').textContent = title; say($('sheetMsg'), '', true); $('sheetBody').textContent = ''; $('sheetFoot').textContent = ''; $('sheet').hidden = false; document.body.classList.add('ac-lock'); }

  // a (existing account), 'new', or null with ids (the same areas for several PSMO accounts at once)
  function openEditor(a, ids) {
    const isNew = a === 'new', bulk = !!ids, acct = (!isNew && !bulk) ? a : null;
    openSheet(isNew ? 'Add a team member' : bulk ? 'Set access for ' + ids.length + ' people' : acct.username);
    let roleV = acct ? acct.role : 'psmo'; const on = new Set(acct ? acct.permissions : ['buildings']); let disabled = acct ? acct.disabled : false;
    const body = $('sheetBody');
    const nameIn = isNew ? h('input', { id: 'edName', type: 'text', maxlength: 30, autocomplete: 'off', placeholder: 'e.g. jdelacruz' }) : null;
    const roleSel = (isNew || (acct && !acct.you)) ? h('div', { class: 'ac-seg', role: 'group', 'aria-label': 'Role' },
      ['psmo', 'admin'].map((r) => h('button', { type: 'button', 'data-role': r, class: roleV === r ? 'is-on' : '', 'aria-pressed': roleV === r, onclick: () => { roleV = r; draw(); } }, r === 'psmo' ? 'PSMO staff' : 'Administrator'))) : null;
    const areaBox = h('div', { class: 'ac-areas' });
    function draw() {
      roleSel && roleSel.querySelectorAll('button').forEach((b) => { b.classList.toggle('is-on', b.dataset.role === roleV); b.setAttribute('aria-pressed', b.dataset.role === roleV); });
      areaBox.textContent = '';
      if (roleV === 'admin') { areaBox.append(h('p', { class: 'ac-sub' }, 'Administrators can use everything, including school settings, data backup and the team.')); return; }
      areaBox.append(h('div', { class: 'ac-presets' }, h('span', { class: 'ac-small' }, 'Quick set:'), PRESETS.map((p) => h('button', { type: 'button', class: 'chip chip-btn', onclick: () => { on.clear(); p.areas.forEach((k) => on.add(k)); draw(); } }, p.label))));
      Object.entries(areas).forEach(([k, v]) => areaBox.append(h('label', { class: 'ac-area' + (on.has(k) ? ' is-on' : '') },
        h('input', { type: 'checkbox', checked: on.has(k), onchange: (e) => { e.target.checked ? on.add(k) : on.delete(k); e.target.closest('.ac-area').classList.toggle('is-on', e.target.checked); } }),
        h('span', { class: 'ac-switch', 'aria-hidden': 'true' }), h('span', { class: 'ac-area-text' }, h('b', {}, v.label), h('small', {}, v.about)))));
      areaBox.append(h('p', { class: 'ac-small' }, 'School settings, data backup and the team are always administrator-only.'));
    }
    if (isNew) body.append(h('label', { class: 'ac-field grid gap-1.5', for: 'edName' }, h('span', {}, 'Username'), nameIn));
    if (roleSel) body.append(h('div', { class: 'ac-field grid gap-1.5' }, h('span', {}, 'Role'), roleSel));
    body.append(areaBox);
    draw();
    const foot = $('sheetFoot');
    const save = h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => {
      save.disabled = true; let r;
      const permissions = roleV === 'psmo' ? [...on] : [];
      if (isNew) r = await call('?action=team_create', { username: nameIn.value.trim(), role: roleV, permissions });
      else if (bulk) { r = { success: true }; for (const id of ids) { const x = await call('?action=team_update', { id, role: 'psmo', permissions }); if (!x.success) { r = x; break; } } }
      else r = await call('?action=team_update', { id: acct.id, role: roleV, permissions, disabled });
      save.disabled = false;
      if (!r.success) return say($('sheetMsg'), r.error || 'Could not save.', false);
      if (isNew) { showPassword(r.username, r.password, 'created'); } else closeSheet();
      picked.clear(); loadTeam();
    } }, isNew ? 'Create the account' : bulk ? 'Apply to everyone selected' : 'Save changes');
    foot.append(save);
    if (acct && !acct.you) {
      const dis = h('button', { type: 'button', class: 'btn btn-secondary', onclick: async () => { const r = await call('?action=team_update', { id: acct.id, role: acct.role, permissions: acct.permissions, disabled: !acct.disabled }); if (!r.success) return say($('sheetMsg'), r.error, false); closeSheet(); loadTeam(); } }, acct.disabled ? 'Enable the account' : 'Disable sign-in');
      const reset = h('button', { type: 'button', class: 'btn btn-secondary', onclick: async () => { if (!confirm('Make a new temporary password for ' + acct.username + '? Their old password stops working and two-step is switched off.')) return; const r = await call('?action=team_reset', { id: acct.id }); if (!r.success) return say($('sheetMsg'), r.error, false); showPassword(acct.username, r.password, 'reset'); loadTeam(); } }, 'Reset the password');
      const del = h('button', { type: 'button', class: 'btn-link danger', onclick: async () => { if (!confirm('Delete ' + acct.username + '? This cannot be undone.')) return; const r = await call('?action=team_delete', { id: acct.id }); if (!r.success) return say($('sheetMsg'), r.error, false); closeSheet(); loadTeam(); } }, 'Delete the account');
      foot.append(dis, reset, del);
    }
  }
  // The temporary password is shown once, with a copy button.
  function showPassword(user, pw, why) {
    openSheet(why === 'created' ? 'Account created' : 'New temporary password');
    $('sheetBody').append(
      h('p', { class: 'ac-sub' }, 'Give ' + user + ' this temporary password in person or by a private message. It is shown only once. They should change it under My account after signing in.'),
      h('div', { class: 'ac-key big' }, pw));
    const copy = h('button', { type: 'button', class: 'btn btn-primary', onclick: async () => { try { await navigator.clipboard.writeText(pw); copy.textContent = 'Copied'; } catch (e) { copy.textContent = 'Select and copy it'; } } }, 'Copy password');
    $('sheetFoot').append(copy, h('button', { type: 'button', class: 'btn btn-secondary', 'data-close': true }, 'Done'));
  }

  // ---------- activity ----------
  const KINDS = { all: 'Everything', sign: 'Sign-ins', team: 'Team and accounts', reports: 'Reports' };
  const kindOf = (a) => /^login|logout/.test(a) ? 'sign' : /^team_|password|two_step/.test(a) ? 'team' : /report|hazard/.test(a) ? 'reports' : 'other';
  async function loadLog() { const r = await call('?audit=1'); events = r.events || []; drawLog(); }
  function drawLog() {
    $('logFilter').textContent = '';
    Object.entries(KINDS).forEach(([k, l]) => $('logFilter').append(h('button', { type: 'button', class: 'chip chip-btn' + (logFilter === k ? ' is-on' : ''), onclick: () => { logFilter = k; drawLog(); } }, l)));
    $('logList').textContent = '';
    events.filter((x) => logFilter === 'all' || kindOf(x.action) === logFilter).forEach((x) => {
      const bad = /failed|locked|bad/.test(x.action);
      $('logList').append(h('li', { class: 'ac-ev' + (bad ? ' is-bad' : '') }, h('span', { class: 'ac-dot', 'aria-hidden': 'true' }),
        h('div', {}, h('b', {}, (x.actor || 'Someone') + ' '), x.action.replace(/_/g, ' '), x.target ? ' · ' + x.target : '', x.detail ? h('small', {}, x.detail) : null, h('small', {}, x.at + (x.ip ? ' · ' + x.ip : '')))));
    });
  }
  load();
})();
