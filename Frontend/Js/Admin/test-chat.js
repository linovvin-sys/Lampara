const { createApp } = Vue;
createApp({
  data() {
    return {
      buildings: [],
      buildingId: '',
      messages: [],
      input: '',
      loading: false
    };
  },
  mounted() { this.loadBuildings(); },
  methods: {
    async loadBuildings() {
      const res = await fetch('../../../Backend/api/buildings.php');
      const data = await res.json();
      if (data.success) this.buildings = data.buildings;
    },
    resetChat() {
      this.messages = [];
      this.input = '';
    },
    async send() {
      if (!this.input.trim() || this.loading || !this.buildingId) return;
      const text = this.input;
      const history = this.messages.map(m => ({ role: m.role, text: m.text }));
      this.messages.push({ role: 'user', text });
      this.input = '';
      this.loading = true;
      this.scrollToBottom();
      try {
        const res = await fetch('../../../Backend/api/chat.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ building_id: this.buildingId, message: text, history })
        });
        const data = await res.json();
        this.messages.push({ role: 'assistant', text: data.reply || "I don't have that information." });
      } catch (e) {
        this.messages.push({ role: 'assistant', text: "Couldn't reach the server — try again." });
      } finally {
        this.loading = false;
        this.scrollToBottom();
      }
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.chatLog;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
    // Same rendering as the student chat — escape first so nothing (AI text
    // or admin input) can inject raw HTML, then apply bold/list formatting.
    formatMessage(text) {
      const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const bolded = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      return bolded.split(/\n\s*\n/).map(block => {
        const lines = block.split('\n').filter(l => l.trim() !== '');
        if (lines.length === 0) return '';
        const isList = lines.every(l => /^[-*]\s+/.test(l.trim()));
        if (isList) {
          const items = lines.map(l => '<li>' + l.trim().replace(/^[-*]\s+/, '') + '</li>').join('');
          return '<ul>' + items + '</ul>';
        }
        return '<p style="margin:0 0 0.4rem;">' + lines.join('<br>') + '</p>';
      }).join('');
    }
  }
}).mount('#app');
