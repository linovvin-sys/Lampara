// The Ask page: a full-screen chat with the campus guide. Everything the bot says comes from Backend/api/chat.php (grounded on the
// registered campus records); chat-core.js adds the offline fallback. The conversation is kept for this visit only.
const { createApp } = Vue;
const SAVE = 'lampara_ask';

createApp({
  data() {
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(SAVE)); } catch (e) { saved = null; }
    return {
      scope: saved && saved.scope ? String(saved.scope) : '',
      messages: saved && Array.isArray(saved.messages) ? saved.messages : [],
      input: '', loading: false, offline: !navigator.onLine,
      buildings: [], rooms: []
    };
  },
  computed: {
    mascotName() { return window.LamparaMascots ? LamparaMascots.get(LamparaMascots.equipped()).name : 'Lampara'; },
    starterList() { return LamparaChat.starters(this.rooms, this.scope || null); }
  },
  async created() {
    window.addEventListener('online', () => { this.offline = false; });
    window.addEventListener('offline', () => { this.offline = true; });
    try { this.buildings = await LamparaCache.loadBuildings('../../../Backend/api/buildings.php'); } catch (e) { this.buildings = []; }
    try { this.rooms = LamparaCache.getRooms() || []; } catch (e) { this.rooms = []; }
    if (navigator.onLine) {                       // a fresh copy of the directory, kept for offline answers and for the starter questions
      try { const d = await (await fetch('../../../Backend/api/rooms.php')).json(); if (d && d.success) { this.rooms = d.rooms; LamparaCache.setRooms(d.rooms); } } catch (e) { /* the saved copy stays */ }
    }
  },
  mounted() { this.$nextTick(this.toBottom); },
  methods: {
    format: (t) => LamparaChat.format(t),
    roomHref: (id) => LamparaChat.roomHref(id),
    save() { try { sessionStorage.setItem(SAVE, JSON.stringify({ scope: this.scope, messages: this.messages.slice(-30) })); } catch (e) { /* not kept */ } },
    toBottom() { const m = this.$refs.main; if (m) m.scrollTop = m.scrollHeight; },
    scopeChanged() { this.newChat(); },
    newChat() { this.messages = []; this.input = ''; this.save(); this.$nextTick(() => { this.toBottom(); if (this.$refs.box) this.$refs.box.focus(); }); },
    async send(text) {
      const q = String(text === undefined ? this.input : text).trim();
      if (!q || this.loading) return;
      if (window.LamparaMascots) { LamparaMascots.event('ask'); if (LamparaMascots.award('first-question', 5)) LamparaMascots.toast('First Question', 5); }
      const history = this.messages.map((m) => ({ role: m.role, text: m.text }));
      this.messages.push({ role: 'user', text: q });
      this.input = ''; this.loading = true;
      this.$nextTick(this.toBottom);
      let out;
      try { out = await LamparaChat.ask({ buildingId: this.scope || null, message: q, history }); }
      catch (e) { out = LamparaChat.localAnswer(q, this.scope || null); }
      this.messages.push({ role: 'assistant', text: out.reply, rooms: out.rooms || [], gates: out.gates || [], followups: out.followups || [], offline: !!out.offline });
      this.loading = false; this.save();
      if (window.LamparaAudio) LamparaAudio.blip('a');
      this.$nextTick(() => { this.toBottom(); if (this.$refs.box && matchMedia('(min-width: 700px)').matches) this.$refs.box.focus(); });
    }
  }
}).mount('#app');
