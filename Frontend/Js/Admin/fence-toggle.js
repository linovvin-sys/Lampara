// Campus Paths page: the admin's on/off switch for "visitors must be on the campus" (Backend/api/fence.php).
// The page is built by Vue after this script runs, so the switch is looked up fresh each time instead of being bound once.
(() => {
  const API = '../../../Backend/api/fence.php';
  let enabled = null, busy = false;

  const btn = () => document.getElementById('ftBtn');
  function paint() {
    const b = btn(), s = document.getElementById('ftState');
    if (!b || enabled === null) return false;
    b.setAttribute('aria-checked', String(enabled));
    b.classList.toggle('on', enabled);
    b.disabled = busy;
    s.textContent = enabled ? 'ON: only people on the campus can use the app' : 'OFF: anyone, anywhere, can use the app';
    s.classList.toggle('off', !enabled);
    return true;
  }

  async function load() {
    try { enabled = (await (await fetch(API, { credentials: 'same-origin', cache: 'no-store' })).json()).enabled !== false; }
    catch (e) { return; }
    let tries = 0;
    const t = setInterval(() => { if (paint() || ++tries > 40) clearInterval(t); }, 150);
  }

  document.addEventListener('click', async (e) => {
    if (!e.target.closest('#ftBtn') || busy || enabled === null) return;
    const turnOn = !enabled;
    const ask = await Swal.fire({
      icon: turnOn ? 'question' : 'warning',
      title: turnOn ? 'Switch the campus-only check on?' : 'Switch the campus-only check off?',
      text: turnOn ? 'Visitors who are not on the campus will not be able to use the app.' : 'Anyone, anywhere, will be able to use the app. Logged-in admins are never blocked either way.',
      showCancelButton: true, confirmButtonText: turnOn ? 'Switch on' : 'Switch off', cancelButtonText: 'Cancel', reverseButtons: true,
      confirmButtonColor: turnOn ? '#161850' : '#ff0000'
    });
    if (!ask.isConfirmed) return;
    busy = true; paint();
    try {
      const d = await (await fetch(API, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: turnOn }) })).json();
      if (!d.success) throw new Error(d.error || 'Could not save the change.');
      enabled = d.enabled;
      Swal.fire({ icon: 'success', title: enabled ? 'Campus-only check is on' : 'Campus-only check is off', timer: 1600, showConfirmButton: false });
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'That did not work', text: err.message || 'Please try again.' });
    }
    busy = false; paint();
  });

  load();
})();
