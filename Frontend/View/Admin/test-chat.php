<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'test-chat';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Try the chat</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/skeleton.css?v=<?= filemtime(__DIR__ . '/../../Css/skeleton.css') ?>">
<script src="../../Js/Include/skeleton.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/skeleton.js') ?>"></script>
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/utilities.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/utilities.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/design-pass.css?v=<?= filemtime(__DIR__ . '/../../Css/Admin/design-pass.css') ?>">
<link rel="stylesheet" href="../../Css/Admin/test-chat.css">
<script src="../../assets/vendor/vue.global.prod.js"></script>
<script src="../../assets/vendor/sweetalert2/sweetalert2-11.26.25.all.min.js"></script>
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container narrow">

      <div class="page-head">
        <div>
          <h1>Try the chat</h1>
          <p>Ask a registered building exactly what a student would — before they do.</p>
        </div>
      </div>

      <div class="form-grid">
        <div class="card chat-card">
          <div class="field" style="margin-bottom: 0.75rem;">
            <label for="chatBuilding">Building</label>
            <select id="chatBuilding" v-model="buildingId" @change="resetChat">
              <option value="" disabled>Select a building…</option>
              <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
            </select>
          </div>

          <div v-if="!buildingId" class="empty-state" role="status">Pick a building above to start testing.</div>

          <template v-else>
            <div class="chat-log" ref="chatLog" role="log" aria-live="polite" aria-label="Conversation with the test assistant">
              <div v-for="(m, i) in messages" :key="i" class="chat-row" :class="m.role === 'user' ? 'row-user' : 'row-ai'">
                <div class="chat-bubble" :class="m.role === 'user' ? 'bubble-user' : 'bubble-ai'" v-html="formatMessage(m.text)"></div>
              </div>
              <div v-if="loading" class="chat-row row-ai">
                <div class="chat-bubble bubble-ai typing-bubble" role="status" aria-label="The assistant is typing">
                  <span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>
                </div>
              </div>
            </div>

            <form @submit.prevent="send" class="chat-input-row">
              <label for="chatInput" class="sr-only">Question to ask</label>
              <input id="chatInput" v-model="input" type="text" placeholder="Ask something a student might ask…" :disabled="loading" autocomplete="off">
              <button type="submit" class="btn btn-primary" :disabled="loading || !input.trim()">Send</button>
            </form>
          </template>
        </div>

        <div class="side-col">
          <div class="tinted-card">
            <div class="u-fd5ed7">
              <span class="dot dot-green"></span>
              <h3 class="u-4e9d62">Why this matters</h3>
            </div>
            <p class="u-2565fb">
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
