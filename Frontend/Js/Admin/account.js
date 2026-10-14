// Admin / PSMO: your own account (password, two-step sign-in), and for administrators the account list and the security activity.
// Talks to Backend/api/account.php. Everything the server sends is put on the page as text, never as markup.
(function () {
  const API = '../../../Backend/api/account.php';
  const $ = (id) => document.getElementById(id);
  let role = 'admin';

  async function call(path, body) {
    const res = await fetch(API + path, body === undefined ? { cache: 'no-store' } : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    let data = {};
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok && !data.error) data.error = 'Something went wrong (' + res.status + ')';
    return data;
  }
  const say = (el, text, ok) => { el.textContent = text; el.className = 'ac-msg ' + (ok ? 'is-ok' : 'is-bad'); };
  const cell = (tr, text) => { const td = document.createElement('td'); td.textContent = text == null ? '' : String(text); tr.appendChild(td); };

  async function load() {
    const me = await call('');
    if (!me.success) { $('acWho').textContent = me.error || 'Could not load your account.'; return; }
    role = me.role;
    $('acWho').textContent = 'Signed in as ' + me.username + ' (' + (me.role === 'psmo' ? 'PSMO: buildings and rooms' : 'administrator') + ').';
    showTwoStep(me.two_step);
    if (role === 'admin') { $('acAccounts').hidden = false; $('acAudit').hidden = false; loadLists(); }
  }
  async function loadLists() {
    const a = await call('?list=1');
    $('acRows').textContent = '';
    (a.accounts || []).forEach((x) => { const tr = document.createElement('tr'); cell(tr, x.username); cell(tr, x.role === 'psmo' ? 'PSMO' : 'Administrator'); cell(tr, x.disabled ? 'Disabled' : 'Active'); cell(tr, x.two_step ? 'On' : 'Off'); cell(tr, x.created_at); $('acRows').appendChild(tr); });
    const e = await call('?audit=1');
    $('auRows').textContent = '';
    (e.events || []).forEach((x) => { const tr = document.createElement('tr'); cell(tr, x.at); cell(tr, x.actor || ''); cell(tr, x.action.replace(/_/g, ' ')); cell(tr, [x.target, x.detail].filter(Boolean).join(' · ')); cell(tr, x.ip); $('auRows').appendChild(tr); });
  }
  function showTwoStep(on) {
    $('tsState').textContent = on ? 'Two-step sign-in is ON for your account.' : 'Two-step sign-in is OFF for your account.';
    $('tsOn').hidden = !on; $('tsOff').hidden = on; $('tsSetup').hidden = true;
  }

  $('pwForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if ($('pwNew').value !== $('pwNew2').value) return say($('pwMsg'), 'The two new passwords are not the same.', false);
    const r = await call('?action=password', { current: $('pwCur').value, new: $('pwNew').value });
    if (r.success) { say($('pwMsg'), 'Password changed.', true); $('pwForm').reset(); } else say($('pwMsg'), r.error || 'Could not change it.', false);
  });
  $('tsBegin').addEventListener('click', async () => {
    const r = await call('?action=2fa_begin', {});
    if (!r.success) return say($('tsMsg'), r.error || 'Could not start.', false);
    $('tsKey').textContent = r.secret.replace(/(.{4})/g, '$1 ').trim();
    $('tsLink').href = r.uri;
    $('tsOff').hidden = true; $('tsSetup').hidden = false; $('tsMsg').textContent = '';
  });
  $('tsConfirm').addEventListener('click', async () => {
    const r = await call('?action=2fa_confirm', { code: $('tsCode').value });
    if (r.success) { say($('tsMsg'), 'Two-step sign-in is on. You will be asked for a code the next time you sign in.', true); showTwoStep(true); $('tsCode').value = ''; if (role === 'admin') loadLists(); } else say($('tsMsg'), r.error || 'That code did not work.', false);
  });
  $('tsOffBtn').addEventListener('click', async () => {
    const r = await call('?action=2fa_off', { password: $('tsOffPw').value, code: $('tsOffCode').value });
    if (r.success) { say($('tsMsg'), 'Two-step sign-in is off.', true); showTwoStep(false); $('tsOffPw').value = ''; $('tsOffCode').value = ''; if (role === 'admin') loadLists(); } else say($('tsMsg'), r.error || 'Could not switch it off.', false);
  });
  load();
})();
