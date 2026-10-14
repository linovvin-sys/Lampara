const { createApp } = Vue;
// Which dashboard cards are collapsed is remembered in this browser (storage may be blocked: then every card starts open).
const COLLAPSE_KEY = 'lampara_dash_collapsed2';   // v2: the detail cards now start folded
function loadCollapsed() {
  const base = { health: true, progress: true, recent: true, reports: true };
  try { return Object.assign(base, JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}')); } catch (e) { return base; }
}
const COLORS = ['#2e3192', '#ffd100', '#ff0000', '#6a6dd0', '#ffe066', '#9b9ce6'];

createApp({
  data() {
    return { baseBuildings: [], baseRooms: [], buildings: [], rooms: [], openFlags: [], loading: true,
      changes: [], undoing: null, health: null, healthLoading: true, healthError: '', showAllHealth: false, openIds: [], showDone: false, collapsed: loadCollapsed() };
  },
  computed: {
    // "Good morning, name": the dashboard speaks to you first.
    greeting() {
      const h = new Date().getHours(), part = h < 12 ? 'Good morning' : (h < 18 ? 'Good afternoon' : 'Good evening');
      const name = (window.ADMIN_NAME || '').trim();
      return name && name.toLowerCase() !== 'admin' ? part + ', ' + name : part;
    },
    // The most important things to do now: problems that break routes or indoor AR first, then student reports.
    nextUp() {
      const out = [];
      const items = this.health ? this.health.items || [] : [];
      items.filter((it) => it.level === 'fix').slice(0, 1).forEach((it, i) => {
        out.push({ key: 'fix' + i, kind: 'fix', title: it.building + (it.floor ? ' \u00b7 ' + it.floor : '') + ': ' + it.problem, detail: it.detail || '', href: it.href, cta: it.action });
      });
      if (this.openFlags.length) {
        const f = this.openFlags[0];
        out.push({ key: 'reports', kind: 'report', title: this.openFlags.length + ' outdated-info report' + (this.openFlags.length === 1 ? '' : 's') + ' from students',
          detail: 'Newest: room ' + (f.room_number || f.room_name) + ' in ' + f.building_name, href: '#reports', cta: 'Review' });
      }
      if (!out.length) items.slice(0, 2).forEach((it, i) => out.push({ key: 'tip' + i, kind: 'tip', title: it.building + (it.floor ? ' \u00b7 ' + it.floor : '') + ': ' + it.problem, detail: it.detail || '', href: it.href, cta: it.action }));
      return out.slice(0, 2);
    },
    // How many setup items are not shown in the short list above.
    more() {
      const total = this.health ? (this.health.items || []).length : 0;
      const shown = this.nextUp.filter((t) => t.kind !== 'report').length;
      return Math.max(0, total - shown);
    },
    nextSummary() {
      const fixes = this.health ? this.health.fixes || 0 : 0, reports = this.openFlags.length;
      const bits = [];
      if (fixes) bits.push(fixes + ' setup problem' + (fixes === 1 ? '' : 's') + ' to fix');
      if (reports) bits.push(reports + ' student report' + (reports === 1 ? '' : 's') + ' to review');
      return bits.length ? bits.join(' and ') + '. Start here:' : 'A few optional improvements:';
    },
    allCollapsed() { return Object.values(this.collapsed).every(Boolean); },
    noneCollapsed() { return !Object.values(this.collapsed).some(Boolean); },
    // ---- building setup progress ----
    // Buildings still to finish: the ones closest to done come first, so each button finishes something.
    todoList() {
      const list = this.health ? (this.health.buildings || []).filter((b) => b.next) : [];
      return list.slice().sort((a, b) => (a.total - a.done) - (b.total - b.done) || a.name.localeCompare(b.name));
    },
    doneList() { return this.health ? (this.health.buildings || []).filter((b) => !b.next) : []; },
    stepTotal() { const b = this.health && (this.health.buildings || [])[0]; return b ? b.total : 8; },
    overall() {
      const all = this.health ? (this.health.buildings || []) : [];
      const done = all.reduce((s, b) => s + b.done, 0), total = all.reduce((s, b) => s + b.total, 0);
      return { done, total, pct: total ? Math.round(done / total * 100) : 0 };
    },
    visibleHealth() { return this.health ? (this.showAllHealth ? this.health.items : this.health.items.slice(0, 5)) : []; },
    officeCount() { return this.rooms.filter(r => r.room_type === 'office').length; },
    recentBuildings() {
      return [...this.buildings]
        // Buildings saved offline have no server timestamp yet: they're the newest.
        .sort((a, b) => (b.updated_at ? new Date(b.updated_at).getTime() : Infinity) - (a.updated_at ? new Date(a.updated_at).getTime() : Infinity))
        .slice(0, 6);
    }
  },
  async mounted() {
    // Offline (or the server is down) each list just stays as the last saved copy
    // instead of leaving the whole page stuck on "loading".
    await Promise.all([this.loadBuildings(), this.loadRooms(), this.loadFlags(), this.loadHealth(), this.loadChanges()]);
    this.loading = false;
    AdminOffline.onSynced(() => { this.loadBuildings(); this.loadRooms(); this.loadFlags(); this.loadHealth(); });
    AdminOffline.onChange(() => this.applyPending());
  },
  methods: {
    // Buildings saved offline have string ids ("t_…"), not numbers.
    colorFor(id) { return COLORS[(Number(id) || 0) % COLORS.length]; },
    applyPending() {
      this.buildings = AdminOffline.overlayBuildings(this.baseBuildings);
      this.rooms = AdminOffline.overlayRooms(this.baseRooms, this.buildings);
    },
    async loadBuildings() {
      try {
        const res = await fetch('../../../Backend/api/buildings.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.baseBuildings = data.buildings;
      } catch (e) { /* offline with no saved copy */ }
      this.applyPending();
    },
    async loadRooms() {
      try {
        const res = await fetch('../../../Backend/api/rooms.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.baseRooms = data.rooms;
      } catch (e) { /* offline with no saved copy */ }
      this.applyPending();
    },
    async loadFlags() {
      try {
        const res = await fetch('../../../Backend/api/flags.php?resolved=0', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.openFlags = data.flags;
      } catch (e) { /* offline with no saved copy */ }
    },
    toggleCard(key) { this.collapsed[key] = !this.collapsed[key]; this.saveCollapsed(); },
    setAllCards(value) { Object.keys(this.collapsed).forEach((k) => { this.collapsed[k] = value; }); this.saveCollapsed(); },
    saveCollapsed() { try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(this.collapsed)); } catch (e) { /* storage blocked */ } },
    pct(b) { return b.total ? Math.round(b.done / b.total * 100) : 0; },
    statusLabel(b) {
      const left = b.total - b.done;
      return left <= 2 ? 'Almost there' : (b.done <= 2 ? 'Just started' : 'In progress');
    },
    statusClass(b) { const left = b.total - b.done; return left <= 2 ? 'almost' : (b.done <= 2 ? 'start' : 'mid'); },
    isOpen(id) { return this.openIds.includes(id); },
    toggleOpen(id) { this.openIds = this.isOpen(id) ? this.openIds.filter((x) => x !== id) : [...this.openIds, id]; },
    // "Setup health": what still blocks routes or indoor AR, with a link to the fixing page.
    // Needs the server, so offline it says so instead of showing a stale all-clear.
    async loadHealth() {
      this.healthLoading = true;
      this.healthError = '';
      try {
        const res = await fetch('../../../Backend/api/setup-health.php', { credentials: 'same-origin', cache: 'no-store' });
        const data = await res.json();
        if (data.success) this.health = data;
        else this.healthError = data.error || '';
      } catch (e) {
        this.healthError = 'You may be offline.';
      }
      this.healthLoading = false;
    },
    async resolveFlag(f) {
      if (!(await AdminOffline.guardOnline('Resolving a report'))) return;
      if (f.note && !(await AdminConfirm({ icon: 'question', title: 'Mark this report as resolved?', text: 'Room ' + (f.room_number || f.room_name) + ': "' + f.note + '". It leaves the open list.', confirmText: 'Resolve' }))) return;
      const res = await fetch('../../../Backend/api/flags.php?id=' + f.id, { method: 'PUT' });
      const data = await res.json();
      if (data.success) this.openFlags = this.openFlags.filter(x => x.id !== f.id);
      else Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
    },
    // Recent edits with an Undo (the list is empty, and hidden, until history is set up on the server).
    async loadChanges() {
      try {
        const res = await fetch('../../../Backend/api/changes.php', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.success) this.changes = data.changes || [];
      } catch (e) { /* offline: the list just stays as it was */ }
    },
    async undoChange(c) {
      if (!(await AdminOffline.guardOnline('Undoing a change'))) return;
      const ok = await Swal.fire({ icon: 'question', title: 'Undo this change?', text: c.label + ' will go back to how it was before.', showCancelButton: true, confirmButtonText: 'Undo' });
      if (!ok.isConfirmed) return;
      this.undoing = c.id;
      try {
        const res = await fetch('../../../Backend/api/changes.php?id=' + c.id, { method: 'POST', credentials: 'same-origin' });
        const data = await res.json();
        if (!data.success) Swal.fire({ icon: 'error', title: 'Could not undo', text: data.error || 'Try again.' });
        else await Promise.all([this.loadChanges(), this.loadBuildings(), this.loadRooms(), this.loadHealth()]);
      } catch (e) {
        Swal.fire({ icon: 'error', title: 'Could not undo', text: 'The server could not be reached.' });
      } finally { this.undoing = null; }
    },
    timeAgo(dateStr) {
      const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
      if (days < 1) return 'today';
      if (days === 1) return '1 day ago';
      if (days < 30) return days + ' days ago';
      const months = Math.floor(days / 30);
      return months === 1 ? '1 month ago' : months + ' months ago';
    }
  }
}).mount('#app');
