<?php
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'test-chat';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Test Chat</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/test-chat.css">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

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

<script src="../../Js/Admin/test-chat.js"></script>

</body>
</html>
