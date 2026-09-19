<?php
require_once __DIR__ . '/_auth.php';
$activeNav = 'test-chat';
$cssVer = filemtime(__DIR__ . '/../assets/css/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Test Chat</title>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/admin.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/_nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container narrow">

      <div class="page-head">
        <div>
          <h1>Test Chat</h1>
          <p>Ask a registered building exactly what a student would — before they do.</p>
        </div>
      </div>

      <div class="form-grid">
        <div class="card chat-card">
          <div class="field" style="margin-bottom: 0.75rem;">
            <label>Building</label>
            <select v-model="buildingId" @change="resetChat">
              <option value="" disabled>Select a building…</option>
              <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div v-if="!buildingId" class="empty-state">Pick a building above to start testing.</div>

          <template v-else>
            <div class="chat-log" ref="chatLog">
              <div v-for="(m, i) in messages" :key="i" class="chat-row" :class="m.role === 'user' ? 'row-user' : 'row-ai'">
                <div class="chat-bubble" :class="m.role === 'user' ? 'bubble-user' : 'bubble-ai'" v-html="formatMessage(m.text)"></div>
              </div>
              <div v-if="loading" class="chat-row row-ai">
                <div class="chat-bubble bubble-ai typing-bubble">
                  <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                </div>
              </div>
            </div>

            <form @submit.prevent="send" class="chat-input-row">
              <input v-model="input" type="text" placeholder="Ask something a student might ask…" :disabled="loading">
              <button type="submit" class="btn btn-primary" :disabled="loading || !input.trim()">Send</button>
            </form>
          </template>
        </div>

        <div class="side-col">
          <div class="tinted-card">
            <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.5rem;">
              <span class="dot dot-green"></span>
              <h3 style="font-weight:600; font-size:0.875rem; margin:0;">Why this matters</h3>
            </div>
            <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0;">
              This calls the exact same grounded chat endpoint the student app uses — same
              refusal rules, same facts. If it hallucinates, guesses, or wrongly refuses
              something you know is registered, that's a directory data problem to fix here,
              not a student-side bug.
            </p>
          </div>
        </div>
      </div>

    </div>
  </main>
</div>

<style>
  .form-grid { display: grid; grid-template-columns: 1fr; gap: 1.25rem; }
  @media (min-width: 800px) { .form-grid { grid-template-columns: 1.3fr 1fr; align-items: start; } }
  .side-col { display: flex; flex-direction: column; gap: 1.25rem; }
  .dot { width: 0.4rem; height: 0.4rem; border-radius: 999px; display:inline-block; }
  .dot-green { background: var(--green-500); }

  .chat-card { display: flex; flex-direction: column; }
  .chat-log { display: flex; flex-direction: column; gap: 0.6rem; min-height: 320px; max-height: 460px; overflow-y: auto; padding: 0.25rem; }
  .chat-row { display: flex; }
  .row-user { justify-content: flex-end; }
  .row-ai { justify-content: flex-start; }
  .chat-bubble { max-width: 80%; padding: 0.6rem 0.9rem; border-radius: 1rem; font-size: 0.875rem; line-height: 1.5; }
  .bubble-user { background: var(--green-600); color: #fff; border-bottom-right-radius: 0.3rem; }
  .bubble-ai { background: var(--ink); color: #fff; border-bottom-left-radius: 0.3rem; }
  .bubble-ai :deep(strong) { color: var(--green-500); }
  .bubble-ai ul { margin: 0.25rem 0; padding-left: 1.1rem; }
  .typing-bubble { display: flex; gap: 0.25rem; align-items: center; padding: 0.85rem 0.9rem; }
  .typing-dot { width: 5px; height: 5px; border-radius: 999px; background: rgba(255,255,255,0.5); animation: typing-bounce 1.1s infinite ease-in-out; }
  .typing-dot:nth-child(2) { animation-delay: 150ms; }
  .typing-dot:nth-child(3) { animation-delay: 300ms; }
  @keyframes typing-bounce { 0%, 60%, 100% { transform: translateY(0); opacity: .4; } 30% { transform: translateY(-3px); opacity: 1; } }

  .chat-input-row { display: flex; gap: 0.6rem; margin-top: 0.9rem; }
  .chat-input-row input { flex: 1; }
</style>

<script>
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
      const res = await fetch('../api/buildings.php');
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
        const res = await fetch('../api/chat.php', {
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
</script>

</body>
</html>
