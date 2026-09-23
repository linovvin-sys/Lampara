const { createApp } = Vue;
const COLORS = ['#22c55e', '#16a34a', '#15803d', '#86efac', '#65a30d', '#14532d'];

createApp({
  data() {
    return { buildings: [], rooms: [], openFlags: [], loading: true };
  },
  computed: {
    officeCount() { return this.rooms.filter(r => r.room_type === 'office').length; },
    recentBuildings() {
      return [...this.buildings]
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
        .slice(0, 6);
    }
  },
  async mounted() {
    await Promise.all([this.loadBuildings(), this.loadRooms(), this.loadFlags()]);
    this.loading = false;
  },
  methods: {
    colorFor(id) { return COLORS[id % COLORS.length]; },
    async loadBuildings() {
      const res = await fetch('../../../Backend/api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;
    },
    async loadRooms() {
      const res = await fetch('../../../Backend/api/rooms.php');
      const data = await res.json();
      if (data.success) this.rooms = data.rooms;
    },
    async loadFlags() {
      const res = await fetch('../../../Backend/api/flags.php?resolved=0');
      const data = await res.json();
      if (data.success) this.openFlags = data.flags;
    },
    async resolveFlag(f) {
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
