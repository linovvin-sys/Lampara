<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'dashboard';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Dashboard</title>
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
<link rel="stylesheet" href="../../Css/Admin/dashboard.css">
<script src="../../assets/vendor/vue.global.prod.js"></script>
<script src="../../assets/vendor/sweetalert2/sweetalert2-11.26.25.all.min.js"></script>
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="app">
    <div class="admin-container">

      <div class="page-head">
        <div>
          <h1>Dashboard</h1>
          <p>The campus directory you maintain, and what needs you next.</p>
        </div>
        <div class="page-actions">
          <a href="buildings.php?new=1" class="btn btn-secondary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> New building</a>
          <a href="buildings.php?tab=rooms" class="btn btn-primary"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> New room</a>
        </div>
      </div>

      <!-- What to do next: the few things that matter most right now, each with the button that fixes it. -->
      <section class="card nextup" aria-labelledby="nextTitle">
        <h2 id="nextTitle">{{ greeting }}</h2>
        <p class="nu-sub" role="status">
          <template v-if="loading && healthLoading">Checking what needs attention&hellip;</template>
          <template v-else-if="nextUp.length">{{ nextSummary }}</template>
          <template v-else>Nothing needs attention right now.</template>
        </p>
        <ul v-if="nextUp.length" class="nu-list">
          <li v-for="t in nextUp" :key="t.key">
            <span class="nu-dot" :class="t.kind" aria-hidden="true"></span>
            <div class="nu-text"><strong>{{ t.title }}</strong><small>{{ t.detail }}</small></div>
            <a :href="t.href" class="btn" :class="t.kind === 'fix' ? 'btn-primary' : 'btn-secondary'">{{ t.cta }}</a>
          </li>
        </ul>
        <p v-else-if="!loading && !healthLoading && health" class="nu-ok">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>
          Every route and floor is ready for students.
        </p>
        <p v-if="more > 0" class="nu-more">+ {{ more }} more below in Setup health. <a href="#healthTitle">See them</a></p>
      </section>

            <section class="stat-grid is-compact" aria-label="Directory totals">
        <a href="#reports" class="stat-card stat-primary" :class="{ 'needs-attention': openFlags.length }" aria-label="Open reports: jump to the list">
          <div class="stat-icon" :class="openFlags.length ? 'is-alert' : 'is-ok'">
            <svg v-if="openFlags.length" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4"/><path d="M5 4h13l-3 4 3 4H5"/></svg>
            <svg v-else width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
          </div>
          <div class="stat-value"><span v-if="loading" class="sk sk-title u-b6ebbc"></span><template v-else>{{ openFlags.length }}</template></div>
          <div class="stat-label">Open reports</div>
        </a>
        <a href="buildings.php" class="stat-card" aria-label="Buildings: open the building list">
          <div class="stat-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/></svg>
          </div>
          <div class="stat-value"><span v-if="loading" class="sk sk-title u-b6ebbc"></span><template v-else>{{ buildings.length }}</template></div>
          <div class="stat-label">Buildings</div>
        </a>
        <a href="buildings.php?tab=rooms" class="stat-card" aria-label="Rooms: open the room editor">
          <div class="stat-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M4 21h16M9 12v.01"/></svg>
          </div>
          <div class="stat-value"><span v-if="loading" class="sk sk-title u-b6ebbc"></span><template v-else>{{ rooms.length }}</template></div>
          <div class="stat-label">Rooms</div>
        </a>
        <a href="buildings.php?tab=rooms" class="stat-card" aria-label="Offices: open the room editor">
          <div class="stat-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></svg>
          </div>
          <div class="stat-value"><span v-if="loading" class="sk sk-title u-b6ebbc"></span><template v-else>{{ officeCount }}</template></div>
          <div class="stat-label">Offices</div>
        </a>
      </section>

      <div class="card-tools">
        <span class="card-tools-label">Sections</span>
        <button type="button" class="link-sm" @click="setAllCards(true)" :disabled="allCollapsed">Show less</button>
        <span aria-hidden="true">&middot;</span>
        <button type="button" class="link-sm" @click="setAllCards(false)" :disabled="noneCollapsed">Show all</button>
      </div>

      <section class="card health-card" aria-labelledby="healthTitle">
        <div class="card-head">
          <h2 class="section-title flush" id="healthTitle">Setup health</h2>
          <span v-if="health && health.fixes" class="badge badge-red">{{ health.fixes }} to fix</span>
          <span v-else-if="health && health.tips" class="badge badge-amber">{{ health.tips }} optional</span>
          <span v-else-if="health" class="badge badge-green">All set</span>
          <button type="button" class="collapse-btn" :aria-expanded="String(!collapsed.health)" aria-controls="card-health" @click="toggleCard('health')"><svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>{{ collapsed.health ? 'Show all' : 'Show less' }}</span><span class="sr-only"> Setup health</span></button>
        </div>
        <p v-show="collapsed.health" class="card-summary">
          <template v-if="healthLoading">Checking the setup…</template>
          <template v-else-if="healthError">Couldn't check the setup right now.</template>
          <template v-else-if="health && !health.items.length">All set. Every floor with a route is ready for the AR guide.</template>
          <template v-else-if="health"><strong>{{ health.fixes }} to fix</strong><template v-if="health.tips"> &middot; {{ health.tips }} optional</template> &middot; first: {{ health.items[0].building }}<template v-if="health.items[0].floor">, {{ health.items[0].floor }}</template> &mdash; {{ health.items[0].problem }}</template>
        </p>
        <div v-show="!collapsed.health" id="card-health" class="card-body">
        <div v-if="healthLoading" aria-hidden="true"><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div></div>
        <p v-else-if="healthError" class="empty-state">Couldn't check the setup right now. {{ healthError }} <button type="button" class="btn-link link-sm" @click="loadHealth">Try again</button></p>
        <template v-else-if="health">
          <div v-if="!health.items.length" class="health-ok">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>
            Every floor with a route is ready for the AR guide.
          </div>
          <template v-else>
            <p class="health-summary"><b>Fix these first.</b> Items marked red stop routes or the indoor AR guide from working for students.</p>
            <div class="health-table-wrap">
              <table class="health-table">
                <thead><tr><th scope="col">Building</th><th scope="col">Floor</th><th scope="col">Problem</th><th scope="col"><span class="sr-only">Fix it</span></th></tr></thead>
                <tbody>
                  <tr v-for="(it, i) in visibleHealth" :key="i" :class="'is-' + it.level">
                    <td data-label="Building" class="ht-building"><span class="health-dot" aria-hidden="true"></span><span class="sr-only">{{ it.level === 'fix' ? 'Needs fixing: ' : 'Optional: ' }}</span>{{ it.building }}</td>
                    <td data-label="Floor">{{ it.floor || '—' }}</td>
                    <td data-label="Problem"><strong>{{ it.problem }}</strong><small>{{ it.detail }}</small></td>
                    <td class="ht-action"><a :href="it.href" class="btn btn-secondary btn-sm-pad">{{ it.action }}</a></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <button v-if="health.items.length > 5" type="button" class="btn btn-ghost health-more" @click="showAllHealth = !showAllHealth" :aria-expanded="showAllHealth">
              {{ showAllHealth ? 'Show fewer' : 'Show all ' + health.items.length }}
            </button>
          </template>
        </template>
      
        </div>
      </section>

      <section class="card progress-card" aria-labelledby="progTitle" v-if="health && health.buildings && health.buildings.length">
        <div class="card-head">
          <div>
            <h2 class="section-title flush" id="progTitle">Building setup progress</h2>
            <p class="prog-sub" v-show="!collapsed.progress">Each building needs {{ stepTotal }} steps before students get the full guide. Start with the first button below.</p>
          </div>
          <span class="pill" :class="todoList.length ? 'pill-blue' : 'pill-ok'">{{ doneList.length }} of {{ health.buildings.length }} finished</span>
          <button type="button" class="collapse-btn" :aria-expanded="String(!collapsed.progress)" aria-controls="card-progress" @click="toggleCard('progress')"><svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>{{ collapsed.progress ? 'Show all' : 'Show less' }}</span><span class="sr-only"> Building setup progress</span></button>
        </div>
        <p v-show="collapsed.progress" class="card-summary">
          <strong>{{ doneList.length }} of {{ health.buildings.length }} buildings finished</strong> &middot; {{ overall.pct }}% of all steps done<template v-if="todoList.length"> &middot; next: {{ todoList[0].name }}, {{ todoList[0].next.label.toLowerCase() }}</template>
        </p>
        <div v-show="!collapsed.progress" id="card-progress" class="card-body">

        <div class="overall" v-if="todoList.length">
          <div class="overall-bar" role="progressbar" aria-label="All buildings together" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="overall.pct"><span :style="{ width: overall.pct + '%' }"></span></div>
          <p class="overall-note"><strong>{{ overall.pct }}%</strong> done &middot; {{ overall.done }} of {{ overall.total }} steps across all buildings</p>
        </div>

        <div v-if="!todoList.length" class="empty-art">
          <img src="../../assets/illustrations/empty-reports.svg" alt="" width="120" height="90">
          <strong>Every building is fully set up</strong>
          <span>All {{ stepTotal }} steps are done for all {{ health.buildings.length }} buildings.</span>
        </div>

        <ul v-else class="bprog-list">
          <li v-for="b in todoList" :key="b.id" class="bprog" :class="{ open: isOpen(b.id) }">
            <div class="bprog-main">
              <div class="ring" :style="{ '--p': pct(b) }" role="img" :aria-label="b.done + ' of ' + b.total + ' steps done'"><span>{{ b.done }}/{{ b.total }}</span></div>
              <div class="bprog-text">
                <div class="bprog-title"><strong>{{ b.name }}</strong><span class="status-chip" :class="statusClass(b)">{{ statusLabel(b) }}</span></div>
                <p class="bprog-next"><span class="lbl">Next step</span> <b>{{ b.next.label }}.</b> {{ b.next.hint }}</p>
              </div>
              <div class="bprog-actions">
                <a :href="b.next.href" class="btn btn-sm-pad" :class="b === todoList[0] ? 'btn-primary' : 'btn-secondary'">{{ b.next.cta }}</a>
                <button type="button" class="link-sm" :aria-expanded="isOpen(b.id)" :aria-controls="'steps-' + b.id" @click="toggleOpen(b.id)">{{ isOpen(b.id) ? 'Hide the steps' : 'See all ' + b.total + ' steps' }}</button>
              </div>
            </div>
            <ol v-show="isOpen(b.id)" :id="'steps-' + b.id" class="bsteps">
              <li v-for="(st, i) in b.steps" :key="st.key" :class="{ done: st.done, next: !st.done && b.next && b.next.key === st.key }">
                <span class="bs-dot" aria-hidden="true">{{ st.done ? '✓' : i + 1 }}</span>
                <span class="bs-text"><b>{{ st.label }}</b><span class="sr-only">{{ st.done ? ' (done)' : (b.next && b.next.key === st.key ? ' (next)' : ' (still to do)') }}</span><small>{{ st.hint }}</small></span>
                <a v-if="!st.done" :href="st.href" class="link-sm">{{ st.cta }}</a>
                <span v-else class="bs-done">Done</span>
              </li>
            </ol>
          </li>
        </ul>

        <div v-if="doneList.length && todoList.length" class="done-toggle">
          <button type="button" class="link-sm" :aria-expanded="showDone" @click="showDone = !showDone">{{ showDone ? 'Hide' : 'Show' }} {{ doneList.length }} finished building{{ doneList.length === 1 ? '' : 's' }}</button>
          <ul v-show="showDone" class="done-list">
            <li v-for="b in doneList" :key="b.id"><span class="bs-dot ok" aria-hidden="true">✓</span><strong>{{ b.name }}</strong><span class="muted-sm">All {{ b.total }} steps done</span><a :href="'buildings.php?b=' + b.id + '&tab=details'" class="link-sm">Open</a></li>
          </ul>
        </div>
      
        </div>
      </section>

      <!-- Who changed which room or building, newest first, with an Undo for each change that can still be undone. -->
      <section class="card changes-card" aria-labelledby="changesTitle" v-if="changes.length">
        <div class="card-head"><h2 class="section-title flush" id="changesTitle">Recent changes</h2></div>
        <ul class="changes-list">
          <li v-for="c in changes" :key="c.id">
            <div class="ch-text">
              <strong>{{ c.label }}</strong>
              <span>{{ ({ create: 'Added', update: 'Edited', delete: 'Deleted' })[c.action] }} {{ c.entity }} &middot; {{ c.admin_name }} &middot; {{ timeAgo(c.created_at) }}</span>
            </div>
            <button v-if="c.undoable" type="button" class="btn btn-secondary btn-sm-pad" :disabled="undoing === c.id" @click="undoChange(c)">{{ undoing === c.id ? 'Undoing…' : 'Undo' }}</button>
            <span v-else class="ch-why">{{ c.why_not }}</span>
          </li>
        </ul>
      </section>

      <div class="grid-2">

        <section class="card" aria-labelledby="recentTitle">
          <div class="card-head">
            <h2 class="section-title flush" id="recentTitle">Recently updated buildings</h2>
            <a href="buildings.php" class="link-sm">View all &rarr;</a>
            <button type="button" class="collapse-btn" :aria-expanded="String(!collapsed.recent)" aria-controls="card-recent" @click="toggleCard('recent')"><svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>{{ collapsed.recent ? 'Show all' : 'Show less' }}</span><span class="sr-only"> Recently updated buildings</span></button>
        </div>
        <p v-show="collapsed.recent" class="card-summary">
          <template v-if="loading">Loading…</template>
          <template v-else-if="!recentBuildings.length">No buildings registered yet.</template>
          <template v-else><strong>{{ buildings.length }} buildings</strong> &middot; latest update: {{ recentBuildings[0].name }}</template>
        </p>
        <div v-show="!collapsed.recent" id="card-recent" class="card-body">
          <div v-if="loading" aria-hidden="true"><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div></div>
          <template v-else>
            <div v-if="recentBuildings.length === 0" class="empty-state">No buildings registered yet. <a href="buildings.php?new=1" class="link-sm">Add the first one</a></div>
            <div v-for="b in recentBuildings" :key="b.id" class="list-row">
              <div class="avatar" :style="{ background: colorFor(b.id) }" aria-hidden="true">{{ b.name.charAt(0) }}</div>
              <div class="row-main">
                <div class="row-title truncate">{{ b.name }}</div>
                <div class="row-sub">{{ b.room_count }} room(s) &middot; {{ b.updated_at ? 'updated ' + timeAgo(b.updated_at) : 'not synced yet' }}</div>
              </div>
              <span v-if="b.open_flags > 0" class="badge badge-amber">{{ b.open_flags }} flag(s)</span>
              <a :href="'buildings.php?b=' + b.id + '&tab=details'" class="link-sm is-muted" :aria-label="'Edit ' + b.name">Edit</a>
            </div>
          </template>
        
        </div>
      </section>

        <section class="card" id="reports" aria-labelledby="reportsTitle">
          <div class="card-head">
            <h2 class="section-title flush" id="reportsTitle">Open outdated-info reports</h2>
            <button type="button" class="collapse-btn" :aria-expanded="String(!collapsed.reports)" aria-controls="card-reports" @click="toggleCard('reports')"><svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg><span>{{ collapsed.reports ? 'Show all' : 'Show less' }}</span><span class="sr-only"> Open outdated-info reports</span></button>
        </div>
        <p v-show="collapsed.reports" class="card-summary">
          <template v-if="loading">Loading…</template>
          <template v-else-if="!openFlags.length">Nothing flagged. The directory looks current.</template>
          <template v-else><strong>{{ openFlags.length }} open report{{ openFlags.length === 1 ? '' : 's' }}</strong> &middot; newest: room {{ openFlags[0].room_number || openFlags[0].room_name }}</template>
        </p>
        <div v-show="!collapsed.reports" id="card-reports" class="card-body">
          <div v-if="loading" aria-hidden="true"><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-60"></span><span class="sk sk-line w-40"></span></div></div></div>
          <template v-else>
            <div v-if="openFlags.length === 0" class="empty-art"><img src="../../assets/illustrations/empty-reports.svg" alt="" width="140" height="105"><strong>Nothing flagged</strong><span>The directory looks current. Student reports show up here.</span></div>
            <div v-for="f in openFlags" :key="f.id" class="list-row row-top">
              <div class="row-main">
                <div class="row-title">
                  <span class="room-chip">{{ f.room_number }}</span>
                  {{ f.room_name }} &middot; {{ f.building_name }}
                </div>
                <div v-if="f.note" class="row-sub">&ldquo;{{ f.note }}&rdquo;</div>
                <div class="row-when">{{ timeAgo(f.created_at) }}</div>
              </div>
              <button @click="resolveFlag(f)" class="btn btn-secondary btn-sm-pad" :aria-label="'Resolve report for ' + (f.room_number || f.room_name)">Resolve</button>
            </div>
          </template>
        
        </div>
      </section>

      </div>

    </div>
  </main>
</div>

<script>window.ADMIN_NAME = <?= json_encode($adminUsername ?? 'Admin') ?>;</script>
<script src="../../Js/Admin/dashboard.js"></script>

</body>
</html>
