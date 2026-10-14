<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'manage-buildings';
$workspace = 'list';
$pageTitle = 'Buildings';
$needsMap = true;

include __DIR__ . '/../Include/buildings-head.php';
?>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main">
    <div class="admin-container">
     <div id="listView">
      <div class="page-head">
        <div>
          <h1>Buildings</h1>
          <p>Every registered building, with its location on the campus map.</p>
        </div>
        <div class="page-actions">
          <a href="buildings.php?new=1" class="btn btn-primary" data-ws><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg> New building</a>
        </div>
      </div>

        <div class="bw-callout" id="bwCallout" hidden>Choose a building below, then open its <b>Rooms</b> tab to add or edit rooms.</div>
        <div id="list-app" v-cloak>
          <div class="list-toolbar">
            <p class="list-count"><strong>{{ buildings.length }}</strong> buildings &middot; <strong>{{ buildings.reduce((s, b) => s + (b.room_count || 0), 0) }}</strong> rooms &middot; <strong>{{ buildings.filter(b => b.open_flags > 0).length }}</strong> flagged</p>
            <div class="search-box">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="var(--muted)" stroke-width="1.8"/><path d="M20 20l-4.5-4.5" stroke="var(--muted)" stroke-width="1.8" stroke-linecap="round"/></svg>
              <label for="buildingSearch" class="sr-only">Search buildings</label>
              <input id="buildingSearch" v-model="q" type="search" placeholder="Search buildings">
            </div>
            <div class="sort-box">
              <label for="buildingSort">Sort</label>
              <select id="buildingSort" v-model="sortBy">
                <option value="attention">Needs attention first</option>
                <option value="name">Name</option>
                <option value="recent">Recently updated</option>
                <option value="rooms">Most rooms</option>
              </select>
            </div>
          </div>

          <div class="manage-grid">
            <div class="card table-card">
              <div class="table-wrap">
                <table class="btable">
                  <thead><tr><th scope="col">Building</th><th scope="col">Floors</th><th scope="col">Rooms</th><th scope="col">Updated</th><th scope="col">Setup</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    <template v-if="!loaded">
                      <tr v-for="n in 5" :key="'sk' + n" aria-hidden="true"><td colspan="6"><div class="sk-row"><span class="sk sk-avatar"></span><div class="sk-stack"><span class="sk sk-line w-40"></span><span class="sk sk-line w-25"></span></div></div></td></tr>
                    </template>
                    <tr v-for="b in filtered" :key="b.id">
                      <td>
                        <div class="bt-name"><img v-if="b.photo_path" class="bt-thumb" :src="'../../' + b.photo_path" :alt="'Photo of ' + b.name">
                        <span v-else class="avatar" :style="{ background: colorFor(b.id) }" aria-hidden="true">{{ b.name.charAt(0) }}</span>
                        <span class="bt-text"><strong>{{ b.name }}</strong><small v-if="b.closed_note" class="closed-note">Closed: {{ b.closed_note }}</small><small v-else>{{ b.lat }}, {{ b.lng }}</small></span></div>
                      </td>
                      <td data-label="Floors">{{ b.is_open ? 'Open' : b.floor_count }}</td>
                      <td data-label="Rooms">{{ b.room_count }}<span v-if="b.open_flags > 0" class="badge badge-amber" :title="b.open_flags + ' open report(s)'">{{ b.open_flags }} flagged</span></td>
                      <td data-label="Updated"><span class="dot" :class="isStale(b.updated_at) ? 'dot-amber' : 'dot-green'"></span><span :class="isStale(b.updated_at) ? 'stale-text' : 'meta-text'">{{ timeAgo(b.updated_at) }}</span></td>
                      <td data-label="Setup">
                        <span v-if="b._pending" class="badge badge-neutral">Not synced</span>
                        <template v-else-if="fixesFor(b) > 0">
                          <a href="dashboard.php#healthTitle" class="badge badge-red">{{ fixesFor(b) }} to fix</a>
                          <small class="next-fix">{{ nextFix(b) }}</small>
                        </template>
                        <span v-else-if="healthLoaded" class="badge badge-green">All set</span>
                      </td>
                      <td class="bt-actions">
                        <a :href="'buildings.php?b=' + b.id + '&tab=rooms'" class="row-btn" data-ws :aria-label="'Rooms in ' + b.name">Rooms</a>
                        <a :href="'buildings.php?b=' + b.id + '&tab=details'" class="row-btn row-open" data-ws :aria-label="'Open ' + b.name">Open</a>
                        <span v-if="!b._pending" class="row-menu">
                          <button type="button" class="row-more" :class="{ on: menuFor === b.id }" aria-haspopup="menu" :aria-expanded="menuFor === b.id ? 'true' : 'false'" :aria-label="'More actions for ' + b.name" @click.stop="menuFor = menuFor === b.id ? null : b.id">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="19" r="1.8"/></svg>
                          </button>
                          <div v-if="menuFor === b.id" class="row-pop" role="menu" @click.stop>
                            <a role="menuitem" :href="'buildings.php?b=' + b.id + '&tab=doors'" data-ws>Set entrance and exit</a>
                            <a role="menuitem" :href="'test-chat.php?building=' + b.id">Preview the chat as a student</a>
                            <button type="button" role="menuitem" @click="menuFor = null; toggleClosed(b)">{{ b.closed_note ? 'Reopen this building' : 'Close for maintenance' }}</button>
                            <button type="button" role="menuitem" class="danger" @click="menuFor = null; deleteBuilding(b)">Delete {{ b.name }}&hellip;</button>
                          </div>
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div v-if="loaded && filtered.length === 0" class="empty-art"><img src="../../assets/illustrations/empty-map.svg" alt="" width="120" height="90"><strong>No buildings match</strong><span>Try a different name, or clear the search.</span></div>
            </div>

            <div class="card map-card">
              <div class="map-head">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 20l-6-2V6l6 2 6-2 6 2v12l-6-2-6 2Z" stroke="#55556b" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 8v12M15 6v12" stroke="#55556b" stroke-width="1.7"/></svg>
                <span style="font-weight:600; font-size:0.8125rem;">Campus Map Preview</span>
                <span class="map-n">N &uarr;</span>
              </div>
              <div class="map-area" ref="mapArea"></div>
              <p v-if="buildings.length === 0" class="map-empty">No coordinates to plot yet.</p>
            </div>
          </div>
        
          <div v-if="drawer" class="drawer-overlay" @click.self="closeDrawer">
            <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="drawerTitle">
              <div class="drawer-head">
                <h2 id="drawerTitle">Edit {{ drawer.name }}</h2>
                <button type="button" class="pd-close" @click="closeDrawer" aria-label="Close">&times;</button>
              </div>
              <div class="drawer-body">
                <div class="photo-field" :class="{ 'is-over': photoOver }" @dragover.prevent="photoOver = true" @dragleave="photoOver = false" @drop.prevent="dropPhoto($event)">
                  <div class="photo-preview" :class="{ 'is-empty': !drawer.photo }">
                    <img v-if="drawer.photo" :src="'../../' + drawer.photo" :alt="'Photo of ' + drawer.name">
                    <div v-else class="photo-empty"><img src="../../assets/illustrations/empty-room.svg" alt="" width="88" height="66"><span>No photo yet</span></div>
                  </div>
                  <div class="photo-side">
                    <div class="photo-actions">
                      <button type="button" class="btn btn-secondary" :disabled="photoBusy" @click="choosePhoto()">{{ photoBusy ? 'Saving…' : (drawer.photo ? 'Replace photo' : 'Add a photo') }}</button>
                      <button v-if="drawer.photo" type="button" class="btn-link danger" :disabled="photoBusy" @click="removePhoto">Remove</button>
                    </div>
                    <p class="hint">Or drop a picture onto this box.</p>
                  </div>
                </div>
                <div class="field"><label for="dName">Building name</label><input id="dName" ref="dName" v-model="drawer.form.name" type="text" required></div>
                <div class="drawer-two">
                  <div class="field"><label for="dFloors">Number of floors</label><input id="dFloors" v-model.number="drawer.form.floor_count" type="number" min="1" step="1"></div>
                  <div class="field"><label for="dNum">Building number</label><input id="dNum" v-model.trim="drawer.form.building_number" type="text" maxlength="6" placeholder="e.g. 2 or 2-A"></div>
                </div>
                <div class="field"><label for="dDesc">Description</label><textarea id="dDesc" v-model="drawer.form.directory" rows="4" placeholder="General facts about the building, not tied to one room"></textarea></div>
                <p class="hint">The map pin, floor plans and walkable paths are edited in the full editor.</p>
                <p v-if="drawer.error" class="drawer-error" role="alert">{{ drawer.error }}</p>
              </div>
              <div class="drawer-foot">
                <a :href="'building-edit.php?edit=' + drawer.id" class="btn btn-secondary">Open full editor</a>
                <button type="button" class="btn btn-primary" :disabled="drawer.saving" @click="saveDrawer">{{ drawer.saving ? 'Saving…' : 'Save changes' }}</button>
              </div>
            </aside>
          </div>
        </div>
     </div>

     <section id="bw" class="bw" hidden aria-label="Building workspace">
       <div class="bw-top">
         <a href="buildings.php" class="bw-back" id="bwBack">&larr; All buildings</a>
         <div class="bw-title">
           <h1 id="bwName">Building</h1>
           <div class="bw-chips" id="bwChips"></div>
         </div>
         <button type="button" class="btn btn-secondary" id="bwLock">Close for maintenance</button>
         <a class="btn btn-secondary" id="bwPreview" href="../Public/map.php" target="_blank" rel="noopener">Preview as student</a>
       </div>
       <div class="bw-tabs" role="tablist" aria-label="Building sections" id="bwTabs"></div>
       <div class="bw-body">
         <div class="bw-loading" id="bwLoading">Loading&hellip;</div>
         <iframe id="bwFrame" class="bw-frame" title="Building editor"></iframe>
       </div>
     </section>
    </div>
  </main>
</div>

<script src="../../Js/Include/photo-upload.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/photo-upload.js') ?>"></script>
<script src="../../Js/Include/lockdown.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/lockdown.js') ?>"></script>
<script src="../../Js/Admin/building-workspace.js?v=<?= filemtime(__DIR__ . '/../../Js/Admin/building-workspace.js') ?>"></script>
<script src="../../Js/Include/topo-base.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/topo-base.js') ?>"></script>
<script src="../../Js/Admin/manage-buildings.js?v=<?= filemtime(__DIR__ . '/../../Js/Admin/manage-buildings.js') ?>"></script>
</body>
</html>
