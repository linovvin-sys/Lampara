const { createApp } = Vue;
const COLORS = ['#22c55e', '#16a34a', '#15803d', '#86efac', '#65a30d', '#14532d'];

createApp({
  data() {
    return { baseBuildings: [], baseRooms: [], buildings: [], rooms: [], openFlags: [], loading: true };
  },
  computed: {
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
    await Promise.all([this.loadBuildings(), this.loadRooms(), this.loadFlags()]);
    this.loading = false;
    AdminOffline.onSynced(() => { this.loadBuildings(); this.loadRooms(); this.loadFlags(); });
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
    async resolveFlag(f) {
      if (!(await AdminOffline.guardOnline('Resolving a report'))) return;
      const res = await fetch('../../../Backend/api/flags.php?id=' + f.id, { method: 'PUT' });
      const data = await res.json();
      if (data.success) this.openFlags = this.openFlags.filter(x => x.id !== f.id);
      else Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'unknown' });
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
