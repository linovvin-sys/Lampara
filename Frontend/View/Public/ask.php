<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
require_once __DIR__ . '/../../../Backend/institution.php';
if (!inst_feature('chat')) { header('Location: index.php'); exit; }   // this school switched the feature off (Admin > School settings)
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
$f = fn($p) => filemtime(__DIR__ . '/../../' . $p);
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Ask Lampara</title>
<meta name="description" content="Ask Lampara about any room, office, building or gate on the <?= inst_h('short_name') ?> campus. Answers come only from the registered campus records.">
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<link rel="apple-touch-icon" href="../../assets/apple-touch-icon.png?v=3">
<meta name="theme-color" content="#0f1138">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pixelify+Sans:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/theme-vars.css?v=<?= filemtime(__DIR__ . '/../../Css/theme-vars.css') ?>">
<script src="../../../Backend/api/institution.php?format=js"></script>
<script src="../../Js/Include/theme.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/theme.js') ?>"></script>
<link rel="stylesheet" href="../../Css/pixel-scene.css?v=<?= $f('Css/pixel-scene.css') ?>">
<link rel="stylesheet" href="../../Css/chat-pixel.css?v=<?= $f('Css/chat-pixel.css') ?>">
<link rel="stylesheet" href="../../Css/Public/ask.css?v=<?= $f('Css/Public/ask.css') ?>">
<script src="../../assets/vendor/vue.global.prod.js"></script>
</head>
<body>
<div class="ps ask-bg" id="askBg" aria-hidden="true"></div>

<div id="app" v-cloak class="ask">
  <header class="ask-top">
    <a href="index.php" class="ch-icon" aria-label="Back to the home page">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
    </a>
    <div class="ask-title">
      <h1>Ask Lampara</h1>
      <p><span class="ask-dot" :class="{ off: offline }" aria-hidden="true"></span>{{ offline ? 'Offline: answering from this phone' : 'Answers only from campus records' }}</p>
    </div>
    <button type="button" class="ch-icon" aria-label="Start a new chat" :disabled="loading || !messages.length" @click="newChat">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
    </button>
  </header>

  <div class="ask-scope">
    <label for="scope">Asking about</label>
    <select id="scope" v-model="scope" @change="scopeChanged" :disabled="loading">
      <option value="">The whole campus</option>
      <option v-for="b in buildings" :key="b.id" :value="String(b.id)">{{ b.name }}</option>
    </select>
  </div>

  <main class="ask-main" ref="main">
    <div class="ch-log" role="log" aria-live="polite" aria-label="Conversation">
      <!-- hello, and things to try -->
      <div class="ch-msg">
        <span class="ch-av" aria-hidden="true"><img data-mascot alt=""></span>
        <div class="ch-body">
          <div class="ch-bubble"><p>Hi! I'm {{ mascotName }}. Ask me where a room or office is, when it opens, what is on a floor, or how to use Lampara.</p><p>I only answer from the registered campus records, so if I don't know, I'll say so.</p></div>
          <div v-if="!messages.length" class="ch-chips" aria-label="Things you can ask"><span class="ch-try">Tap to ask:</span>
            <button v-for="s in starterList" :key="s" type="button" class="ch-chip" @click="send(s)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg><span>{{ s }}</span></button>
          </div>
        </div>
      </div>

      <div v-for="(m, i) in messages" :key="i" class="ch-msg" :class="{ me: m.role === 'user', offline: m.offline }">
        <span v-if="m.role !== 'user'" class="ch-av" aria-hidden="true"><img data-mascot alt=""></span>
        <div class="ch-body">
          <div class="ch-bubble" v-html="format(m.text)"></div>
          <div v-if="m.rooms && m.rooms.length" class="ch-cards">
            <article v-for="r in m.rooms" :key="r.id" class="ch-card">
              <div class="ch-card-top"><span v-if="r.room_number" class="ch-num">{{ r.room_number }}</span><strong>{{ r.room_name }}</strong></div>
              <div class="ch-meta">{{ r.floor }} &middot; {{ r.building_name }}<template v-if="r.hours"> &middot; open {{ r.hours }}</template></div>
              <a :href="roomHref(r.id)" class="ch-go">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                Show me the way
              </a>
            </article>
          </div>
          <div v-if="m.gates && m.gates.length" class="ch-cards">
            <article v-for="g in m.gates" :key="'g' + g.id" class="ch-card">
              <div class="ch-card-top"><strong>{{ g.name }}</strong></div>
              <div class="ch-meta">Entrance and exit</div>
              <a :href="'guide-ar.php?gate=' + g.id" class="ch-go">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                Walk to this gate
              </a>
            </article>
          </div>
          <div v-if="i === messages.length - 1 && m.role !== 'user' && m.followups && m.followups.length && !loading" class="ch-chips" aria-label="Follow-up questions"><span class="ch-try">Tap to ask:</span>
            <button v-for="f in m.followups" :key="f" type="button" class="ch-chip" @click="send(f)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg><span>{{ f }}</span></button>
          </div>
        </div>
      </div>

      <div v-if="loading" class="ch-msg" aria-label="Lampara is typing">
        <span class="ch-av" aria-hidden="true"><img data-mascot alt=""></span>
        <div class="ch-body"><div class="ch-typing" aria-hidden="true"><i></i><i></i><i></i></div></div>
      </div>
    </div>
  </main>

  <form class="ch-composer" @submit.prevent="send()">
    <label class="sr-only" for="q">Your question</label>
    <input id="q" ref="box" v-model="input" type="text" maxlength="300" autocomplete="off" enterkeyhint="send" :placeholder="scope ? 'Ask about this building…' : 'Ask about any room or office…'" :disabled="loading">
    <button class="ch-send" :disabled="loading || !input.trim()" aria-label="Send">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
    </button>
  </form>
</div>

<script src="../../Js/Include/offline-cache.js?v=<?= $f('Js/Include/offline-cache.js') ?>"></script>
<script src="../../Js/Include/student-offline.js?v=<?= $f('Js/Include/student-offline.js') ?>"></script>
<script src="../../Js/Include/room-number.js?v=<?= $f('Js/Include/room-number.js') ?>"></script>
<script src="../../Js/Include/room-search.js?v=<?= $f('Js/Include/room-search.js') ?>"></script>
<script src="../../Js/Include/mascots.js?v=<?= $f('Js/Include/mascots.js') ?>"></script>
<script src="../../Js/Include/pixel-scene.js?v=<?= $f('Js/Include/pixel-scene.js') ?>"></script>
<script>LamparaPixelScene.mount(document.getElementById('askBg'), { seed: 41, moon: false, walker: false, stars: 34 });</script>
<script src="../../Js/Include/chat-core.js?v=<?= $f('Js/Include/chat-core.js') ?>"></script>
<script src="../../Js/Public/ask.js?v=<?= $f('Js/Public/ask.js') ?>"></script>
<script src="../../Js/Public/guide-audio.js?v=<?= $f('Js/Public/guide-audio.js') ?>"></script>
<script src="../../Js/Include/game-feel.js?v=<?= $f('Js/Include/game-feel.js') ?>"></script>
<script src="../../Js/Include/read-more.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/read-more.js') ?>"></script>
<script src="../../Js/Include/smart-back.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/smart-back.js') ?>"></script>
</body>
</html>
