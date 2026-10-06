// Admin offline layer — lets the admin panel keep working with no connection and
// sync afterwards, only with the admin's approval.
//
// How it fits together:
//   * sw.js keeps the admin pages, libraries and API reads available offline.
//   * This file keeps a list of PENDING CHANGES on the device (localStorage) for
//     everything an admin can do offline: buildings, rooms, campus walkway points,
//     entrances and floor calibration.
//   * Pages call AdminOffline.run(...) around each save. Online, the save goes
//     straight to the server exactly as before. If the server can't be reached (or
//     the login expired), the change is added to the pending list instead.
//   * Pages show the pending changes on top of the last data from the server via the
//     overlay* functions, so offline work is visible immediately and survives reloads.
//   * When the connection returns, a SweetAlert asks whether to sync. Nothing is sent
//     without a yes. The server applies the changes (Backend/api/admin-sync.php),
//     reports conflicts, and the admin decides for each one.
//
// Plain <script>; exposes `AdminOffline`. Loaded by Include/admin-nav.php on every admin page.

const AdminOffline = (() => {
  const QUEUE_KEY = 'lampara_admin_queue_v1';
  const PREWARM_KEY = 'lampara_admin_prewarm_at';
  const PREWARM_EVERY_MS = 6 * 60 * 60 * 1000;
  const PING_TIMEOUT_MS = 4000;
  const POLL_MS = 20000;

  const API = new URL('../../../Backend/api/', location.href).href;
  const ADMIN_PAGES = ['dashboard.php', 'manage-buildings.php', 'register-building.php', 'register-room.php', 'campus-paths.php', 'floor-calibration.php', 'test-chat.php'];

  // ---------- small helpers ----------
  const same = (a, b) => a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);
  const isTemp = (v) => typeof v === 'string' && v.startsWith('t_');
  // Payload fields that can hold a reference to another record (real id or temporary id).
  const TEMP_REF_KEYS = ['id', 'building_id', 'node_id', 'node_a_id', 'node_b_id', 'plan_id'];
  const rand = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const newTempId = () => 't_' + rand();
  const newOpId = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('op_' + rand() + rand());
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const esc = (s) => String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  class OfflineError extends Error {
    constructor(reason) { super('offline:' + reason); this.reason = reason; } // reason: 'network' | 'session'
  }

  // ---------- events ----------
  const listeners = { change: [], synced: [], status: [] };
  const on = (evt, fn) => { listeners[evt].push(fn); };
  const emit = (evt, arg) => listeners[evt].forEach((fn) => { try { fn(arg); } catch (e) { console.error(e); } });

  // ---------- the pending list (localStorage, mirrored in memory) ----------
  let ops = [];
  let storageWorks = true;

  function loadQueue() {
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      ops = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(ops)) ops = [];
    } catch (e) { ops = []; storageWorks = false; }
  }
  function saveQueue() {
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(ops)); storageWorks = true; }
    catch (e) { storageWorks = false; }
    emit('change', ops);
    renderChip();
  }
  loadQueue();
  window.addEventListener('storage', (e) => { if (e.key === QUEUE_KEY) { loadQueue(); emit('change', ops); renderChip(); } });

  const list = () => ops.slice();
  const count = () => ops.length;
  const makeOp = (type, payload, label) => ({ id: newOpId(), type, payload, label: label || type, createdAt: Date.now(), status: 'pending', message: '' });

  // Merging rules keep the list short and the sync simple: several offline edits
  // of the same thing become ONE change, and changing something that only exists
  // offline just edits its creation instead of adding a second step.
  function enqueue(type, payload, label) {
    payload = clone(payload);
    const findCreate = (t, key, id) => ops.find((o) => o.type === t && same(o.payload[key], id));
    const refsNode = (o, id) => (o.type === 'edge.create' && (same(o.payload.node_a_id, id) || same(o.payload.node_b_id, id))) ||
      (o.type === 'entrance.set' && same(o.payload.node_id, id));
    let touched = null;

    switch (type) {
      case 'building.update':
      case 'room.update': {
        const createType = type.replace('.update', '.create');
        const create = findCreate(createType, 'temp_id', payload.id);
        if (create) {
          const { id, base_updated_at, ...fields } = payload;
          Object.assign(create.payload, fields);
          create.label = label || create.label; touched = create;
        } else {
          const existing = ops.find((o) => o.type === type && same(o.payload.id, payload.id));
          if (existing) {
            const base = existing.payload.base_updated_at;
            Object.assign(existing.payload, payload);
            existing.payload.base_updated_at = base; // conflicts are judged against what the admin FIRST saw
            existing.label = label || existing.label; existing.status = 'pending'; existing.message = ''; touched = existing;
          }
        }
        break;
      }
      case 'node.update': {
        const create = findCreate('node.create', 'temp_id', payload.id);
        if (create) {
          Object.assign(create.payload, { lat: payload.lat, lng: payload.lng, node_type: payload.node_type });
          if (payload.name) create.payload.name = payload.name;
          touched = create;
        } else {
          const existing = ops.find((o) => o.type === 'node.update' && same(o.payload.id, payload.id));
          if (existing) {
            const base = existing.payload.base;
            Object.assign(existing.payload, payload);
            existing.payload.base = base;
            existing.label = label || existing.label; existing.status = 'pending'; existing.message = ''; touched = existing;
          }
        }
        break;
      }
      case 'node.delete': {
        const create = findCreate('node.create', 'temp_id', payload.id);
        ops = ops.filter((o) => o !== create && !refsNode(o, payload.id) && !(o.type === 'node.update' && same(o.payload.id, payload.id)));
        if (create) { touched = 'gone'; break; } // never reached the server — nothing to delete there
        if (ops.some((o) => o.type === 'node.delete' && same(o.payload.id, payload.id))) touched = 'gone';
        break;
      }
      case 'edge.create': {
        const a = payload.node_a_id, b = payload.node_b_id;
        const dupe = ops.find((o) => o.type === 'edge.create' &&
          ((same(o.payload.node_a_id, a) && same(o.payload.node_b_id, b)) || (same(o.payload.node_a_id, b) && same(o.payload.node_b_id, a))));
        if (dupe) touched = dupe;
        break;
      }
      case 'edge.delete': {
        const create = findCreate('edge.create', 'temp_id', payload.id);
        if (create) { ops = ops.filter((o) => o !== create); touched = 'gone'; }
        else if (ops.some((o) => o.type === 'edge.delete' && same(o.payload.id, payload.id))) touched = 'gone';
        break;
      }
      case 'entrance.set': {
        const existing = ops.find((o) => o.type === 'entrance.set' && same(o.payload.building_id, payload.building_id));
        if (existing) {
          const base = existing.payload.base_entrance;
          Object.assign(existing.payload, payload);
          existing.payload.base_entrance = base;
          existing.label = label || existing.label; existing.status = 'pending'; existing.message = ''; touched = existing;
        }
        break;
      }
      case 'calibration.set': {
        const existing = ops.find((o) => o.type === 'calibration.set' && same(o.payload.plan_id, payload.plan_id));
        if (existing) {
          const base = existing.payload.base_updated_at;
          Object.assign(existing.payload, payload);
          existing.payload.base_updated_at = base;
          existing.label = label || existing.label; existing.status = 'pending'; existing.message = ''; touched = existing;
        }
        break;
      }
      default: break;
    }

    if (!touched) ops.push(makeOp(type, payload, label));
    saveQueue();
    return touched;
  }

  function remove(id) { ops = ops.filter((o) => o.id !== id); saveQueue(); }
  function clearAll() { ops = []; saveQueue(); }

  // ---------- overlays: server data + pending changes = what the admin should see ----------
  function overlayBuildings(base) {
    const out = clone(base || []);
    const find = (id) => out.find((b) => same(b.id, id));
    ops.forEach((o) => {
      const p = o.payload;
      if (o.type === 'building.create') {
        out.push({ id: p.temp_id, name: p.name, lat: p.lat, lng: p.lng, floor_count: p.floor_count || 1, building_number: p.building_number ?? null,
          directory: p.directory || '', entrance_node_id: null, room_count: 0, open_flags: 0, updated_at: null, _pending: true });
      } else if (o.type === 'building.update') {
        const b = find(p.id);
        if (b) Object.assign(b, { name: p.name, lat: p.lat, lng: p.lng, floor_count: p.floor_count || 1, building_number: p.building_number ?? null, directory: p.directory || '', _pending: true });
      } else if (o.type === 'entrance.set') {
        const b = find(p.building_id);
        if (b) { b.entrance_node_id = p.node_id ?? null; b._pending = true; }
      }
    });
    return out;
  }

  function overlayRooms(base, buildings) {
    const out = clone(base || []);
    ops.forEach((o) => {
      const p = o.payload;
      const derived = () => {
        const category = ['office', 'classroom', 'cr', 'canteen'].includes(p.category) ? p.category : 'office';
        return { category, room_type: ['office', 'canteen'].includes(category) ? 'office' : 'classroom' };
      };
      if (o.type === 'room.create') {
        const b = (buildings || []).find((x) => same(x.id, p.building_id));
        out.push({ id: p.temp_id, building_id: p.building_id, building_name: b ? b.name : '', room_number: p.room_number || null, room_name: p.room_name,
          floor: p.floor, ...derived(), hours: p.hours || null, notes: p.notes || null, map_x: p.map_x ?? null, map_y: p.map_y ?? null,
          path_node_id: null, updated_at: null, _pending: true });
      } else if (o.type === 'room.update') {
        const r = out.find((x) => same(x.id, p.id));
        if (r) Object.assign(r, { room_number: p.room_number || null, room_name: p.room_name, floor: p.floor, ...derived(),
          hours: p.hours || null, notes: p.notes || null, map_x: p.map_x ?? null, map_y: p.map_y ?? null, _pending: true });
      }
    });
    return out;
  }

  function overlayCampus(base) {
    const graph = { nodes: clone((base && base.nodes) || []), edges: clone((base && base.edges) || []) };
    ops.forEach((o) => {
      const p = o.payload;
      if (o.type === 'node.create') {
        graph.nodes.push({ id: p.temp_id, lat: p.lat, lng: p.lng, node_type: p.node_type || 'junction', name: p.name || null, _pending: true });
      } else if (o.type === 'node.update') {
        const n = graph.nodes.find((x) => same(x.id, p.id));
        if (n) Object.assign(n, { lat: p.lat, lng: p.lng, node_type: p.node_type, ...(p.name ? { name: p.name } : {}), _pending: true });
      } else if (o.type === 'node.delete') {
        graph.nodes = graph.nodes.filter((n) => !same(n.id, p.id));
        graph.edges = graph.edges.filter((e) => !same(e.node_a_id, p.id) && !same(e.node_b_id, p.id));
      } else if (o.type === 'edge.create') {
        graph.edges.push({ id: p.temp_id, node_a_id: p.node_a_id, node_b_id: p.node_b_id, _pending: true });
      } else if (o.type === 'edge.delete') {
        graph.edges = graph.edges.filter((e) => !same(e.id, p.id));
      }
    });
    return graph;
  }

  function overlayPlans(base) {
    const out = clone(base || []);
    ops.forEach((o) => {
      if (o.type !== 'calibration.set') return;
      const plan = out.find((x) => same(x.id, o.payload.plan_id));
      if (plan) Object.assign(plan, { north_offset: o.payload.north_offset, meters_per_unit_x: o.payload.meters_per_unit_x, meters_per_unit_y: o.payload.meters_per_unit_y, _pending: true });
    });
    return out;
  }

  // ---------- talking to the server ----------
  const state = { reachable: navigator.onLine !== false, admin: null, syncing: false };
  const reachable = () => state.reachable;
  function setReachable(value) {
    if (state.reachable !== value) { state.reachable = value; emit('status', state); renderChip(); }
  }

  // Really asks the server (navigator.onLine can claim "online" on a dead link).
  async function ping() {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), PING_TIMEOUT_MS);
      const res = await fetch(API + 'ping.php', { cache: 'no-store', credentials: 'same-origin', signal: ctrl.signal });
      clearTimeout(timer);
      const data = await res.json();
      state.admin = !!data.admin;
      setReachable(true);
      return { reachable: true, admin: state.admin };
    } catch (e) {
      setReachable(false);
      return { reachable: false, admin: null };
    }
  }

  // JSON request that throws OfflineError when the server can't be reached or the
  // login has expired — the two cases where a change should be kept for later.
  async function fetchJson(path, options = {}) {
    let res;
    try {
      res = await fetch(API + path, { credentials: 'same-origin', ...options,
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    } catch (e) {
      setReachable(false);
      throw new OfflineError('network');
    }
    if (res.status === 401) { state.admin = false; throw new OfflineError('session'); }
    let data;
    try { data = await res.json(); }
    catch (e) { setReachable(false); throw new OfflineError('network'); } // an HTML error page from a proxy is not our API
    setReachable(true);
    data._status = res.status;
    return data;
  }

  const isOfflineError = (e) => e instanceof OfflineError || e instanceof TypeError;

  // Save now if the server is there; otherwise keep it for later.
  //   op:     { type, payload, label }  what to remember if it can't be sent now
  //   direct: async () => result        the normal save (must use fetchJson / throw on failure)
  // Returns { queued: false, result } or { queued: true }.
  async function run(op, direct) {
    // Something that only exists on this device (a point made offline, say) has no
    // server copy to talk to yet, so a change touching it always waits in the list.
    const touchesLocalOnly = TEMP_REF_KEYS.some((k) => isTemp(op.payload[k]) && !(k === 'id' && op.type.endsWith('.create')));
    if (state.reachable && !touchesLocalOnly) {
      try { return { queued: false, result: await direct() }; }
      catch (e) { if (!isOfflineError(e)) throw e; }
    }
    enqueue(op.type, op.payload, op.label);
    return { queued: true };
  }

  // For things that can't work offline (uploads, deletes, the floor path editor).
  async function guardOnline(what) {
    if (state.reachable) return true;
    await notify({ icon: 'info', title: 'Needs an internet connection', text: `${what} isn't available offline. Reconnect and try again.` });
    return false;
  }

  // ---------- SweetAlert (loaded on demand if the page doesn't already have it) ----------
  let swalLoading = null;
  function ensureSwal() {
    if (window.Swal) return Promise.resolve(window.Swal);
    if (!swalLoading) {
      swalLoading = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/sweetalert2@11';
        s.onload = () => resolve(window.Swal || null);
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
      });
    }
    return swalLoading;
  }
  async function notify(options) {
    const Swal = await ensureSwal();
    if (Swal) return Swal.fire(options);
    alert((options.title ? options.title + '\n' : '') + (options.text || ''));
    return { isConfirmed: true };
  }
  async function toast(message, icon = 'success') {
    const Swal = await ensureSwal();
    if (!Swal) return;
    Swal.fire({ toast: true, position: 'top', icon, title: message, showConfirmButton: false, timer: 2600, timerProgressBar: true });
  }

  // ---------- the sync flow ----------
  function applyTempMap(map) {
    if (!map) return;
    ops.forEach((o) => TEMP_REF_KEYS.forEach((k) => {
      const v = o.payload[k];
      if (isTemp(v) && map[v] !== undefined) o.payload[k] = map[v];
    }));
  }

  function opsListHtml(items) {
    return '<ul style="text-align:left;margin:0.5rem 0 0;padding-left:1.1rem;max-height:14rem;overflow:auto;font-size:0.875rem;line-height:1.6;">' +
      items.map((o) => `<li>${esc(o.label)}${o.status === 'failed' ? ' <span style="color:#b91c1c">(failed last time)</span>' : ''}${o.status === 'conflict' ? ' <span style="color:#b45309">(needs a decision)</span>' : ''}</li>`).join('') + '</ul>';
  }

  async function sendBatch(items) {
    const body = JSON.stringify({ ops: items.map((o) => ({ id: o.id, type: o.type, payload: o.payload, force: !!o.force })) });
    return fetchJson('admin-sync.php', { method: 'POST', body });
  }

  // Applies the server's per-change results to the pending list.
  //   ok        -> removed from the list
  //   conflict  -> kept, waiting for the admin's decision
  //   skipped   -> kept as pending: it depends on a change that hasn't been saved
  //                (yet), so it gets another try once that one is resolved
  //   error     -> kept as failed, with the server's reason
  function absorb(results, tempMap) {
    const summary = { ok: 0, conflicts: [], failed: [], skipped: [] };
    results.forEach((r) => {
      const o = ops.find((x) => x.id === r.op_id);
      if (!o) return;
      delete o.force;
      if (r.status === 'ok') { ops = ops.filter((x) => x !== o); summary.ok++; }
      else if (r.status === 'conflict') { o.status = 'conflict'; o.message = r.message || ''; o.server = r.server || null; summary.conflicts.push(o); }
      else if (r.status === 'skipped') { o.status = 'pending'; o.skipped = true; o.message = r.message || ''; summary.skipped.push(o); }
      else { o.status = 'failed'; o.message = r.message || 'Could not be saved.'; summary.failed.push(o); }
    });
    applyTempMap(tempMap);
    saveQueue();
    return summary;
  }

  function diffHtml(o) {
    const mine = o.payload, theirs = o.server || {};
    const rows = Object.keys(theirs).filter((k) => k in mine && String(mine[k] ?? '') !== String(theirs[k] ?? '') && k !== 'updated_at' && k !== 'base_updated_at')
      .map((k) => `<tr><td style="padding:0.2rem 0.6rem 0.2rem 0;color:#6b7280">${esc(k)}</td><td style="padding:0.2rem 0.6rem;color:#15803d">${esc(mine[k])}</td><td style="padding:0.2rem 0;color:#b45309">${esc(theirs[k])}</td></tr>`);
    if (!rows.length) return '';
    return '<table style="margin:0.6rem auto 0;font-size:0.8125rem;text-align:left"><tr><th></th><th style="padding:0 0.6rem;color:#15803d">Yours</th><th style="color:#b45309">On the server</th></tr>' + rows.join('') + '</table>';
  }

  // One dialog per conflict. Returns true if any "keep mine" was chosen (needs a resend).
  async function resolveConflicts(conflicts) {
    let resend = false;
    for (const o of conflicts) {
      const r = await notify({
        icon: 'warning',
        title: 'Changed on the server',
        html: `<p style="margin:0 0 0.4rem"><b>${esc(o.label)}</b></p><p style="margin:0;font-size:0.875rem">${esc(o.message)}</p>${diffHtml(o)}`,
        showDenyButton: true, showCancelButton: true,
        confirmButtonText: 'Keep my changes', denyButtonText: "Keep the server's version", cancelButtonText: 'Decide later',
        confirmButtonColor: '#16a34a', denyButtonColor: '#6b7280', allowOutsideClick: false
      });
      if (r.isConfirmed) { o.force = true; o.status = 'pending'; resend = true; }
      else if (r.isDenied) { ops = ops.filter((x) => x !== o); }
    }
    saveQueue();
    return resend;
  }

  async function runSync() {
    const Swal = await ensureSwal();
    state.syncing = true;
    let totalOk = 0;
    try {
      // Decisions still owed from an earlier attempt come first; a "keep mine"
      // turns the change back into a pending one that round 0 then includes.
      const earlier = ops.filter((o) => o.status === 'conflict');
      if (earlier.length) await resolveConflicts(earlier);

      // Round 0 sends everything that isn't waiting on a decision (retrying earlier
      // failures too). Later rounds only send what a conflict decision released:
      // "keep mine" changes and the changes that were held back behind them.
      for (let round = 0; round < 4; round++) {
        const items = round === 0
          ? ops.filter((o) => o.status !== 'conflict')
          : ops.filter((o) => o.status === 'pending');
        if (!items.length) break;
        if (Swal) Swal.fire({ title: 'Syncing…', text: `Sending ${items.length} change${items.length === 1 ? '' : 's'}`, allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
        let data;
        try { data = await sendBatch(items); }
        catch (e) {
          if (Swal) Swal.close();
          if (e instanceof OfflineError && e.reason === 'session') return promptLogin();
          await notify({ icon: 'info', title: 'Lost the connection', text: 'Your changes are still saved on this device. You can sync again once you are online.' });
          return;
        }
        const summary = absorb(data.results || [], data.temp_map);
        totalOk += summary.ok;
        if (Swal) Swal.close();
        let released = false;
        if (summary.conflicts.length) released = await resolveConflicts(summary.conflicts);
        // Keep going only if something moved: a change went through, or the admin
        // released a conflict (which lets held-back changes try again).
        if (!summary.ok && !released) break;
        if (!ops.some((o) => o.status === 'pending')) break;
      }
    } finally {
      state.syncing = false;
    }

    const failed = ops.filter((o) => o.status === 'failed');
    const waiting = ops.filter((o) => o.status === 'conflict');
    const held = ops.filter((o) => o.status === 'pending');
    const left = ops.length;
    if (totalOk && !left) {
      await notify({ icon: 'success', title: 'All synced', text: `${totalOk} change${totalOk === 1 ? '' : 's'} saved to the live app.`, timer: 2200, showConfirmButton: false });
    } else {
      const failHtml = failed.length
        ? '<p style="margin:0.6rem 0 0.2rem;font-weight:600">Not saved:</p><ul style="text-align:left;margin:0;padding-left:1.1rem;font-size:0.875rem;line-height:1.6">' +
          failed.map((o) => `<li>${esc(o.label)}: <span style="color:#b91c1c">${esc(o.message)}</span></li>`).join('') + '</ul>' : '';
      const waitHtml = waiting.length ? `<p style="margin:0.6rem 0 0;font-size:0.875rem">${waiting.length} change${waiting.length === 1 ? ' is' : 's are'} waiting for your decision.</p>` : '';
      const heldHtml = held.length ? `<p style="margin:0.6rem 0 0;font-size:0.875rem">${held.length} change${held.length === 1 ? ' is' : 's are'} waiting on another change.</p>` : '';
      await notify({ icon: failed.length ? 'warning' : 'info', title: `${totalOk} saved`, html: `<p style="margin:0">${left ? left + ' still waiting on this device.' : 'Nothing left waiting.'}</p>${failHtml}${waitHtml}${heldHtml}` });
    }
    emit('synced', { ok: totalOk });
    localStorage.removeItem(PREWARM_KEY); // fresh data now — refresh the offline copies soon
    setTimeout(() => prewarm(true), 1500);
  }

  async function promptLogin() {
    const r = await notify({ icon: 'info', title: 'Sign in to sync', text: 'Your admin session has ended. Your changes are safe on this device. Sign in and they will be offered for sync again.',
      showCancelButton: true, confirmButtonText: 'Sign in', cancelButtonText: 'Later' });
    if (r.isConfirmed) location.href = 'login.php?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search);
  }

  let lastAutoPrompt = 0;
  async function promptSync({ auto = false } = {}) {
    if (state.syncing || !ops.length) { if (!auto && !ops.length) toast('Nothing waiting to sync', 'info'); return; }
    if (auto && Date.now() - lastAutoPrompt < 90000) return;
    if (auto) lastAutoPrompt = Date.now();
    const status = await ping();
    if (!status.reachable) { if (!auto) await notify({ icon: 'info', title: 'Still offline', text: 'Your changes are saved on this device and will be offered for sync when you reconnect.' }); return; }
    if (!status.admin) { if (!auto || ops.length) await promptLogin(); return; }

    const Swal = await ensureSwal();
    const n = ops.length;
    const r = await notify({
      icon: 'question',
      title: `Sync ${n} offline change${n === 1 ? '' : 's'}?`,
      html: `<p style="margin:0;font-size:0.875rem">You made these while offline. Nothing is sent until you say so.</p>${opsListHtml(ops)}`,
      showDenyButton: true, showCancelButton: true,
      confirmButtonText: 'Sync now', denyButtonText: 'Discard all', cancelButtonText: 'Decide later',
      confirmButtonColor: '#16a34a', denyButtonColor: '#dc2626', allowOutsideClick: false
    });
    if (r.isDenied) {
      const sure = await notify({ icon: 'warning', title: 'Discard these changes?', text: "They'll be deleted from this device and never sent.", showCancelButton: true, confirmButtonText: 'Discard', confirmButtonColor: '#dc2626' });
      if (sure.isConfirmed) { clearAll(); toast('Offline changes discarded', 'info'); emit('synced', { ok: 0 }); }
      return;
    }
    if (r.isConfirmed) await runSync();
  }

  // ---------- the floating status chip ----------
  let chip = null;
  function ensureChip() {
    if (chip || !document.body) return chip;
    const style = document.createElement('style');
    style.textContent = `
      .sync-chip{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(0.9rem + env(safe-area-inset-bottom,0px));z-index:60;display:flex;align-items:center;gap:0.55rem;
        max-width:calc(100vw - 2rem);padding:0.5rem 0.55rem 0.5rem 0.9rem;border-radius:999px;background:#14251c;color:#fff;font:600 0.8125rem/1.2 'Outfit',system-ui,sans-serif;
        box-shadow:0 10px 30px -8px rgba(0,0,0,.45)}
      .sync-chip[hidden]{display:none}
      .sync-chip .sc-dot{width:8px;height:8px;border-radius:999px;background:#f59e0b;flex:none}
      .sync-chip.is-online .sc-dot{background:#34d399}
      .sync-chip button{border:0;border-radius:999px;background:#22c55e;color:#052e16;font:inherit;padding:0.4rem 0.8rem;cursor:pointer}
      .sync-chip button[hidden]{display:none}
      .sync-chip .sc-txt{min-width:0}`;
    document.head.appendChild(style);
    chip = document.createElement('div');
    chip.className = 'sync-chip';
    chip.setAttribute('role', 'status');
    chip.hidden = true;
    chip.innerHTML = '<span class="sc-dot"></span><span class="sc-txt"></span><button type="button">Review &amp; sync</button>';
    chip.querySelector('button').addEventListener('click', () => promptSync());
    document.body.appendChild(chip);
    return chip;
  }
  function renderChip() {
    if (!ensureChip()) return;
    const n = ops.length;
    const online = state.reachable;
    chip.hidden = online && n === 0;
    chip.classList.toggle('is-online', online);
    chip.querySelector('.sc-txt').textContent = !online
      ? (n ? `Offline · ${n} change${n === 1 ? '' : 's'} saved on this device` : 'Offline · changes will be saved on this device')
      : `${n} change${n === 1 ? '' : 's'} waiting to sync`;
    chip.querySelector('button').hidden = !(online && n);
  }

  // ---------- service worker, offline copies, storage ----------
  async function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return null;
    try { return await navigator.serviceWorker.register('../../sw.js'); } catch (e) { return null; }
  }

  function clearPrivateCaches() {
    return navigator.serviceWorker && navigator.serviceWorker.ready
      .then((reg) => { if (reg.active) reg.active.postMessage({ type: 'clear-private' }); })
      .catch(() => {});
  }

  // Pulls the admin pages and data through the worker while online, so they're
  // there when the connection isn't.
  let prewarming = false;
  async function prewarm(force = false) {
    if (prewarming || !state.reachable || state.admin === false) return;
    try {
      if (!force && Date.now() - Number(localStorage.getItem(PREWARM_KEY) || 0) < PREWARM_EVERY_MS) return;
    } catch (e) { /* storage unavailable — just prewarm */ }
    if (!('serviceWorker' in navigator)) return;
    prewarming = true;
    try {
      await navigator.serviceWorker.ready;
      const get = (u, extra) => fetch(u, { credentials: 'same-origin', ...(extra || {}) }).catch(() => null);
      const bJson = await (await get(API + 'buildings.php'))?.json().catch(() => null);
      await get(API + 'rooms.php');
      await get(API + 'campus-graph.php');
      const plans = [];
      for (const b of (bJson && bJson.buildings) || []) {
        const j = await (await get(API + 'floor-plans.php?building_id=' + b.id))?.json().catch(() => null);
        ((j && j.plans) || []).forEach((p) => plans.push(p));
      }
      for (const p of plans) await get(new URL('../../' + p.image_path, location.href).href);

      const seen = new Set();
      for (const page of ADMIN_PAGES) {
        const res = await get(new URL(page, location.href).href);
        if (!res || !res.ok || res.redirected) continue; // logged out — nothing to keep
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const assets = [...doc.querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel~="icon"][href]')]
          .map((el) => el.getAttribute('src') || el.getAttribute('href'));
        for (const a of assets) {
          const abs = new URL(a, new URL(page, location.href)).href;
          if (seen.has(abs)) continue;
          seen.add(abs);
          // Ordinary (CORS) fetch even for CDN files: a CORS response can serve any later
          // request, while an opaque one can't serve a script tag that uses integrity/crossorigin.
          await get(abs);
        }
      }
      localStorage.setItem(PREWARM_KEY, String(Date.now()));
    } catch (e) { /* prewarm is best effort */ }
    finally { prewarming = false; }
  }

  // ---------- start-up ----------
  let started = false;
  async function start() {
    if (started) return;
    started = true;
    renderChip();
    registerServiceWorker();
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* optional */ }

    window.addEventListener('offline', () => { setReachable(false); });
    window.addEventListener('online', async () => {
      const s = await ping();
      if (s.reachable) { if (ops.length) promptSync({ auto: true }); prewarm(); }
    });

    const first = await ping();
    if (first.reachable) {
      if (ops.length) promptSync({ auto: true });
      setTimeout(prewarm, 3000);
    }
    // Keeps checking while there's something to send (or we think we're offline),
    // because a network can come back without the browser saying so.
    setInterval(async () => {
      if (state.syncing) return;
      if (!ops.length && state.reachable) return;
      const wasOffline = !state.reachable;
      const s = await ping();
      if (s.reachable && wasOffline && ops.length) promptSync({ auto: true });
    }, POLL_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

  return {
    // state
    reachable, list, count, isTemp, newTempId, storageWorks: () => storageWorks,
    // saving
    run, enqueue, remove, clearAll, fetchJson, isOfflineError, OfflineError, guardOnline,
    // showing pending changes
    overlayBuildings, overlayRooms, overlayCampus, overlayPlans,
    // syncing
    promptSync, ping, prewarm, clearPrivateCaches,
    on, onSynced: (fn) => on('synced', fn), onChange: (fn) => on('change', fn),
    notify, toast,
    // exposed for tests
    _applyTempMap: applyTempMap, _absorb: absorb, _ops: () => ops, _reset: () => { ops = []; saveQueue(); }
  };
})();
