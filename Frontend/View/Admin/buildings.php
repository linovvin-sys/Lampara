<?php
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'manage-buildings';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$editorToolsVer = filemtime(__DIR__ . '/../../Css/Admin/editor-tools.css');
$buildingJsVer = filemtime(__DIR__ . '/../../Js/Admin/register-building.js');
$roomJsVer = filemtime(__DIR__ . '/../../Js/Admin/register-room.js');
$listJsVer = filemtime(__DIR__ . '/../../Js/Admin/manage-buildings.js');

// Deep-link support: ?tab=add-building|add-room|all (default all), plus
// the existing ?edit=<id> forwarded from old bookmarks/links.
$initialTab = $_GET['tab'] ?? 'all';
if (!in_array($initialTab, ['all', 'add-building', 'add-room'], true)) $initialTab = 'all';
if (isset($_GET['edit']) && $initialTab === 'all') $initialTab = 'add-building';
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Buildings</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/Admin/admin.css?v=<?= $cssVer ?>">
<link rel="stylesheet" href="../../Css/Admin/manage-buildings.css">
<link rel="stylesheet" href="../../Css/Admin/register-building.css">
<link rel="stylesheet" href="../../Css/Admin/register-room.css">
<link rel="stylesheet" href="../../Css/Admin/editor-tools.css?v=<?= $editorToolsVer ?>">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
<style>
  :root {
    --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
    --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
  }

  /* ---- Segmented tab control: a glass pill with a sliding indicator
     that tracks the active tab's own position, instead of separate
     static underlines fighting for attention. ---- */
  .tabs-wrap { position: sticky; top: 0.75rem; z-index: 5; margin-bottom: 1.5rem; }
  .tabs-bar {
    position: relative;
    display: inline-flex;
    gap: 0.15rem;
    padding: 0.3rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.72);
    border: 1px solid rgba(226, 230, 241, 0.8);
    box-shadow: 0 1px 2px rgba(16, 24, 56, 0.04), 0 8px 24px -12px rgba(16, 24, 56, 0.12);
    backdrop-filter: blur(14px) saturate(1.4);
    -webkit-backdrop-filter: blur(14px) saturate(1.4);
    max-width: 100%;
    overflow-x: auto;
  }
  .tabs-indicator {
    position: absolute;
    top: 0.3rem;
    left: 0.3rem;
    height: calc(100% - 0.6rem);
    width: 0;
    border-radius: 0.75rem;
    background: var(--blue-600, #1a4fc4);
    box-shadow: 0 6px 16px -6px rgba(26, 79, 196, 0.55);
    transition: transform 280ms var(--ease-in-out), width 280ms var(--ease-in-out);
    will-change: transform, width;
  }
  .tab-btn {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font: inherit;
    font-size: 0.8125rem;
    font-weight: 700;
    color: var(--muted, #5b6b79);
    background: none;
    border: 0;
    padding: 0.6rem 1.05rem;
    border-radius: 0.75rem;
    cursor: pointer;
    white-space: nowrap;
    transition: color 200ms ease, transform 140ms var(--ease-out);
  }
  .tab-btn svg { flex: none; opacity: 0.8; transition: opacity 200ms ease; }
  @media (hover: hover) and (pointer: fine) {
    .tab-btn:hover { color: var(--ink, #16213d); }
  }
  .tab-btn:active { transform: scale(0.96); }
  .tab-btn.is-active { color: #ffffff; }
  .tab-btn.is-active svg { opacity: 1; }

  /* ---- Panel transitions: a quiet fade + rise, not a jump cut. ---- */
  .tab-panel[hidden] { display: none; }
  .tab-panel { animation: panelIn 260ms var(--ease-out) both; }
  @keyframes panelIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ---- Rows: lift on hover, stagger in on first paint. ---- */
  .building-row, .list-row { transition: transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out); }
  @media (hover: hover) and (pointer: fine) {
    .building-row:hover { transform: translateY(-2px); box-shadow: 0 10px 24px -14px rgba(16, 24, 56, 0.25); }
  }
  .stagger-in > * { opacity: 0; animation: rowIn 320ms var(--ease-out) both; }
  .stagger-in > *:nth-child(1) { animation-delay: 0ms; }
  .stagger-in > *:nth-child(2) { animation-delay: 40ms; }
  .stagger-in > *:nth-child(3) { animation-delay: 80ms; }
  .stagger-in > *:nth-child(4) { animation-delay: 120ms; }
  .stagger-in > *:nth-child(5) { animation-delay: 160ms; }
  .stagger-in > *:nth-child(n+6) { animation-delay: 200ms; }
  @keyframes rowIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ---- Glass surfaces for the supporting cards: a soft frosted look
     instead of flat white, consistent with the tab bar above. ---- */
  .tinted-card, .map-card {
    background: linear-gradient(160deg, rgba(240, 245, 254, 0.85), rgba(255, 255, 255, 0.92));
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
  }

  /* ---- Search box: a visible focus glow instead of a flat outline. ---- */
  .search-box { transition: box-shadow 160ms ease, border-color 160ms ease; border-radius: 999px; }
  .search-box:focus-within { box-shadow: 0 0 0 3px var(--blue-100, #dbe6fb); border-color: var(--blue-500, #3566d6); }

  /* ---- Edit/Delete row actions: a bit more tactile than bare text links. ---- */
  .edit-link, .delete-link, .room-action {
    display: inline-flex; align-items: center;
    padding: 0.25rem 0.55rem; border-radius: 999px;
    transition: background-color 140ms ease, color 140ms ease, transform 120ms var(--ease-out);
  }
  .edit-link:hover { background: var(--blue-50, #f0f5fe); }
  .delete-link:hover, .room-delete:hover { background: var(--red-50, #fef2f2); }
  .edit-link:active, .delete-link:active, .room-action:active { transform: scale(0.95); }

  @media (prefers-reduced-motion: reduce) {
    .tabs-indicator, .tab-btn, .tab-panel, .building-row, .list-row, .stagger-in > * {
      animation-duration: 1ms !important; transition-duration: 1ms !important;
    }
  }

  /* ================= All Buildings: card-style rows + stat pills ================= */
  .stats-row { display: flex; gap: 0.6rem; margin: 0 0 1.1rem; flex-wrap: wrap; }
  .stat-pill {
    display: inline-flex; align-items: center; gap: 0.45rem;
    padding: 0.5rem 0.9rem; border-radius: 999px;
    background: rgba(255, 255, 255, 0.75); border: 1px solid var(--line, #e2e6f1);
    font-size: 0.75rem; font-weight: 700; color: var(--muted, #5b6b79);
    backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  }
  .stat-pill strong { color: var(--ink, #16213d); font-size: 0.9375rem; font-weight: 800; }
  .stat-pill .stat-dot { width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--blue-600, #1a4fc4); flex: none; }

  .building-row {
    border-radius: 1.1rem !important;
    padding: 1rem 1.15rem !important;
    gap: 0.9rem;
  }
  .building-row .avatar {
    width: 2.6rem; height: 2.6rem; font-size: 1rem; font-weight: 800;
    box-shadow: 0 0 0 3px #fff, 0 4px 14px -4px rgba(16, 24, 56, 0.35);
  }
  .building-meta { gap: 0.4rem; row-gap: 0.35rem; flex-wrap: wrap; }
  .building-meta .meta-text, .building-meta .stale-text {
    display: inline-flex; align-items: center;
    padding: 0.15rem 0.55rem; border-radius: 999px;
    background: var(--blue-50, #f0f5fe); font-size: 0.6875rem; font-weight: 600;
  }
  .building-meta .stale-text { background: var(--yellow-50, #fffaeb); color: var(--yellow-700, #a66400); }
  .building-meta .dot { display: none; } /* status now reads from the pill's own color, not a separate dot */

  /* ================= Form sections: quiet dividers that group related fields ================= */
  .field-divider {
    display: flex; align-items: center; gap: 0.5rem;
    margin: 1.4rem 0 0.9rem;
    font-size: 0.6875rem; font-weight: 800; letter-spacing: 0.06em; text-transform: uppercase;
    color: var(--blue-700, #123a8f);
  }
  .field-divider:first-child { margin-top: 0; }
  .field-divider svg { flex: none; opacity: 0.85; }
  .field-divider::after { content: ''; flex: 1; height: 1px; background: linear-gradient(90deg, var(--line, #e2e6f1), transparent); }

  /* ================= Toggle group: segmented pills with a touch more presence ================= */
  .toggle-group { gap: 0.2rem; }
  .toggle-group button { transition: background-color 160ms ease, color 160ms ease, transform 120ms var(--ease-out); }
  .toggle-group button:active { transform: scale(0.96); }

  /* ================= Floor plan rows: elevated mini-cards ================= */
  #building-app .list-row {
    border: 1px solid transparent; border-radius: 1rem; padding: 1rem !important;
    transition: border-color 160ms ease, background-color 160ms ease;
  }
  #building-app .list-row:hover { border-color: var(--line, #e2e6f1); background: rgba(240, 245, 254, 0.4); }
  #building-app .list-row:last-child { border-bottom: 1px solid transparent !important; }

  /* ================= Path editor: calmer surface, clearer active point ================= */
  .lock-bar { border-radius: 1rem; }
  .points-list .pt-row { border-radius: 0.85rem; }
  .points-list .pt-row.sel { box-shadow: 0 0 0 1px var(--blue-500, #3566d6) inset; }
  .pt-badge { box-shadow: 0 2px 6px -2px rgba(26, 79, 196, 0.5); }

  /* QR print dialog: the code sits on plain white, never themed, so it
     scans correctly straight off the screen or a printout. */
  .qr-print-canvas { display: inline-block; padding: 1rem; background: #fff; border-radius: 0.75rem; }
  .qr-print-canvas img, .qr-print-canvas canvas { display: block; }

  /* ================= Rooms sidebar: a frosted dark glass panel instead of flat ink ================= */
  .rooms-panel {
    background: linear-gradient(165deg, #1b2a52, var(--ink, #16213d)) !important;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 14px 30px -18px rgba(16, 24, 56, 0.5);
  }
  .room-row {
    border-radius: 0.85rem; padding: 0.55rem 0.6rem !important;
    transition: background-color 160ms ease, transform 140ms var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .room-row:hover { background: rgba(255, 255, 255, 0.07); }
  }
  .room-row:active { transform: scale(0.99); }

  /* ================= Geo-capture button: a gentle pulse while idle, inviting the tap ================= */
  .geo-btn svg { animation: geoPulse 2400ms ease-in-out infinite; transform-origin: center; }
  @keyframes geoPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); } }
  @media (prefers-reduced-motion: reduce) { .geo-btn svg { animation: none; } }

  /* ================= Section cards (Floor Plans / Registered Buildings): a touch of lift ================= */
  .section-title { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9375rem; }
  .section-title::before { content: ''; width: 0.3rem; height: 0.3rem; border-radius: 999px; background: var(--blue-600, #1a4fc4); }

  /* ================= Modal trigger card: the compact summary that replaces
     always-expanded heavy editing (floor plans, marker placement) inline. ================= */
  .modal-trigger-card { cursor: pointer; transition: border-color 160ms ease, transform 140ms var(--ease-out); }
  .modal-trigger-card:hover { border-color: var(--blue-500, #3566d6); }
  .modal-trigger-card:active { transform: scale(0.99); }
  .modal-trigger-card:focus-visible { outline: 2px solid var(--blue-500, #3566d6); outline-offset: 2px; }
  .modal-trigger-row { display: flex; align-items: center; gap: 0.9rem; }
  .modal-trigger-arrow { flex: none; color: var(--muted, #5b6b79); transition: transform 160ms var(--ease-out); }
  .modal-trigger-card:hover .modal-trigger-arrow { transform: translateX(3px); color: var(--blue-600, #1a4fc4); }
  .marker-thumb { position: relative; width: 3.25rem; height: 3.25rem; border-radius: 0.6rem; overflow: hidden; flex: none; border: 1px solid var(--line, #e2e6f1); }
  .marker-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .marker-thumb-dot { position: absolute; width: 0.5rem; height: 0.5rem; border-radius: 999px; background: var(--blue-600, #1a4fc4); border: 1.5px solid #fff; transform: translate(-50%, -100%); box-shadow: 0 1px 3px rgba(0,0,0,0.4); }

  /* ================= Modal shell: centered sheet over a blurred backdrop.
     Entrance starts from a visible 0.95 scale (never from 0 — nothing in the
     real world pops in from nothing) with a quick ease-out; exit is faster
     than enter, since dismissal should feel immediate. ================= */
  .modal-overlay {
    position: fixed; inset: 0; z-index: 60;
    display: flex; align-items: center; justify-content: center;
    padding: 1.25rem;
    visibility: hidden;
    pointer-events: none;
  }
  .modal-overlay.is-open { visibility: visible; pointer-events: auto; }
  .modal-backdrop {
    position: absolute; inset: 0;
    background: rgba(16, 24, 56, 0.45);
    backdrop-filter: blur(3px); -webkit-backdrop-filter: blur(3px);
    opacity: 0;
    transition: opacity 220ms ease;
  }
  .modal-overlay.is-open .modal-backdrop { opacity: 1; }
  .modal-sheet {
    position: relative;
    background: #ffffff;
    border-radius: 1.25rem;
    box-shadow: 0 30px 60px -20px rgba(16, 24, 56, 0.4);
    width: 100%;
    max-width: 34rem;
    max-height: calc(100vh - 2.5rem);
    display: flex;
    flex-direction: column;
    opacity: 0;
    transform: scale(0.95) translateY(6px);
    transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
  }
  .modal-sheet-wide { max-width: 56rem; }
  .modal-overlay.is-open .modal-sheet { opacity: 1; transform: scale(1) translateY(0); }
  .modal-overlay:not(.is-open) .modal-sheet { transition-duration: 140ms; }
  .modal-head {
    display: flex; align-items: center; justify-content: space-between;
    padding: 1.1rem 1.25rem; border-bottom: 1px solid var(--line, #e2e6f1); flex: none;
  }
  .modal-head h3 { margin: 0; font-size: 1rem; font-weight: 700; color: var(--ink, #16213d); }
  .modal-close {
    display: inline-flex; align-items: center; justify-content: center;
    width: 2rem; height: 2rem; border-radius: 999px; border: 0; background: none;
    color: var(--muted, #5b6b79); cursor: pointer;
    transition: background-color 140ms ease, transform 120ms var(--ease-out);
  }
  .modal-close:hover { background: var(--blue-50, #f0f5fe); color: var(--ink, #16213d); }
  .modal-close:active { transform: scale(0.92); }
  .modal-body { padding: 1.25rem; overflow-y: auto; flex: 1; }
  .modal-foot { padding: 1rem 1.25rem; border-top: 1px solid var(--line, #e2e6f1); display: flex; justify-content: flex-end; flex: none; }
  @media (max-width: 640px) {
    .modal-overlay { padding: 0; align-items: flex-end; }
    .modal-sheet { max-width: 100%; max-height: 88vh; border-radius: 1.25rem 1.25rem 0 0; }
    .modal-overlay.is-open .modal-sheet { transform: translateY(0); }
    .modal-sheet { transform: translateY(100%); }
  }
  @media (prefers-reduced-motion: reduce) {
    .modal-backdrop, .modal-sheet { transition-duration: 1ms !important; }
  }
</style>
</head>
<body class="admin-body">

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main">
    <div class="admin-container">
      <div class="page-head">
        <div>
          <h1>Buildings</h1>
          <p>Manage buildings and rooms from one workspace.</p>
        </div>
      </div>

      <div class="tabs-wrap">
        <nav class="tabs-bar" role="tablist">
          <span class="tabs-indicator" aria-hidden="true"></span>
          <button type="button" class="tab-btn" data-tab="all" role="tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/></svg>
            All Buildings
          </button>
          <button type="button" class="tab-btn" data-tab="add-building" role="tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg>
            Add / Edit Building
          </button>
          <button type="button" class="tab-btn" data-tab="add-room" role="tab">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M4 21h16M9 12v.01"/></svg>
            Add / Edit Room
          </button>
        </nav>
      </div>

      <!-- ===== Tab: All Buildings (from manage-buildings.php) ===== -->
      <section class="tab-panel" data-tab-panel="all">
        <div id="list-app">
          <div class="page-head">
            <div>
              <p>{{ buildings.length }} building(s) on file</p>
            </div>
            <div class="search-box">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="#9aa79f" stroke-width="1.8"/><path d="M20 20l-4.5-4.5" stroke="#9aa79f" stroke-width="1.8" stroke-linecap="round"/></svg>
              <input v-model="q" type="text" placeholder="Search buildings">
            </div>
          </div>

          <div class="stats-row">
            <span class="stat-pill"><span class="stat-dot"></span><strong>{{ buildings.length }}</strong> building(s)</span>
            <span class="stat-pill"><span class="stat-dot"></span><strong>{{ buildings.reduce((s, b) => s + (b.room_count || 0), 0) }}</strong> room(s)</span>
            <span class="stat-pill"><span class="stat-dot"></span><strong>{{ buildings.filter(b => b.open_flags > 0).length }}</strong> flagged</span>
          </div>

          <div class="manage-grid">
            <div class="stagger-in">
              <div v-for="b in filtered" :key="b.id" class="card building-row">
                <div class="avatar" :style="{ background: colorFor(b.id) }">{{ b.name.charAt(0) }}</div>
                <div style="flex:1; min-width:0;">
                  <div style="font-weight:600; font-size:0.875rem;" class="truncate">{{ b.name }}</div>
                  <div style="font-family:'JetBrains Mono',monospace; font-size:0.6875rem; color:#9aa79f;">{{ b.lat }}, {{ b.lng }}</div>
                  <div class="building-meta">
                    <span class="dot" :class="isStale(b.updated_at) ? 'dot-amber' : 'dot-green'"></span>
                    <span :class="isStale(b.updated_at) ? 'stale-text' : 'meta-text'">{{ timeAgo(b.updated_at) }}</span>
                    <span class="meta-text">&middot; {{ b.room_count }} room(s)</span>
                    <span v-if="b.open_flags > 0" class="badge badge-amber">{{ b.open_flags }}</span>
                    <button type="button" class="btn-link edit-link" @click="editBuildingFromList(b)">Edit</button>
                    <button v-if="!b._pending" @click="deleteBuilding(b)" class="btn-link delete-link">Delete</button>
                  </div>
                </div>
              </div>
              <div v-if="filtered.length === 0" class="empty-state">No buildings match.</div>
            </div>

            <div class="card map-card">
              <div class="map-head">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M9 20l-6-2V6l6 2 6-2 6 2v12l-6-2-6 2Z" stroke="#5b6b63" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 8v12M15 6v12" stroke="#5b6b63" stroke-width="1.7"/></svg>
                <span style="font-weight:600; font-size:0.8125rem;">Campus Map Preview</span>
                <span class="map-n">N &uarr;</span>
              </div>
              <div class="map-area" ref="mapArea"></div>
              <p v-if="buildings.length === 0" class="map-empty">No coordinates to plot yet.</p>
            </div>
          </div>
        </div>
      </section>

      <!-- ===== Tab: Add/Edit Building (from register-building.php) ===== -->
      <section class="tab-panel" data-tab-panel="add-building" hidden>
        <div id="building-app">
          <div class="admin-container narrow" style="padding:0;">
            <div class="page-head">
              <div>
                <h1 style="font-size:1.25rem;">{{ editingId ? 'Edit Building' : 'Register a Building' }}</h1>
                <p>{{ editingId ? "Update this building's details." : 'Add a new building with its GPS location. Rooms are added separately. Works offline: changes are saved on this device and synced later.' }}</p>
              </div>
            </div>

            <div class="form-grid">
              <form @submit.prevent="submitBuilding" class="card">
                <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1.2"/></svg>Basic Info</div>
                <div class="field">
                  <label>Building name</label>
                  <input v-model="form.name" type="text" required placeholder="e.g. Amafel Building (NCST)">
                </div>

                <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.1"/></svg>Location</div>
                <div class="field field-row">
                  <div>
                    <label>Latitude</label>
                    <input v-model="form.lat" type="text" required placeholder="14.328300" style="font-family:'JetBrains Mono',monospace;">
                  </div>
                  <div>
                    <label>Longitude</label>
                    <input v-model="form.lng" type="text" required placeholder="120.937200" style="font-family:'JetBrains Mono',monospace;">
                  </div>
                </div>

                <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M9 21v-4.5h6V21M9 7.5h1.2M9 11h1.2M9 14.5h1.2M13.8 7.5H15M13.8 11H15"/></svg>Capacity &amp; Numbering</div>
                <div class="field field-row">
                  <div>
                    <label>Number of floors</label>
                    <input v-model.number="form.floor_count" type="number" min="1" step="1" required style="max-width:8rem;">
                  </div>
                  <div>
                    <label>Building number (optional)</label>
                    <input v-model.number="form.building_number" type="number" min="1" step="1" placeholder="e.g. 1" style="max-width:8rem;">
                  </div>
                </div>
                <p style="color: var(--muted); font-size:0.75rem; margin:-0.75rem 0 1rem;">
                  First digit of every room number in this building (e.g. Amafel = 1, so its rooms are 1101, 1204… and may carry a section, like 1101 - A). Leave blank for buildings with no numbered rooms.
                </p>

                <button type="button" @click="captureLocation" class="btn btn-secondary geo-btn">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" stroke="#1a4fc4" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" stroke="#1a4fc4" stroke-width="1.8"/></svg>
                  Capture My Current Location
                </button>
                <p v-if="geoStatus" class="geo-status" :class="geoError ? 'geo-error' : 'geo-ok'">{{ geoStatus }}</p>

                <div v-if="nearbyWarnings.length" class="tinted-card warn-card">
                  <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.5rem;">
                    <span class="dot dot-amber"></span>
                    <h3 style="font-weight:600; font-size:0.875rem; margin:0;">Close to {{ nearbyWarnings.length > 1 ? 'other buildings' : 'another building' }}</h3>
                  </div>
                  <p v-for="w in nearbyWarnings" :key="w.id" style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0 0 0.35rem;">
                    <strong style="color: var(--fg, #1a1a1a);">{{ w.name }}</strong> is only {{ w.distance }}m away — visitors standing nearby may get the wrong building labeled. Consider spacing GPS points further apart, or double-check both points are accurate.
                  </p>
                </div>

                <div class="field-divider" style="margin-top:1.4rem;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16l-6-3-6 3Z"/></svg>Notes</div>
                <div class="field">
                  <label>Notes (optional — general, not room-specific)</label>
                  <textarea v-model="form.directory" rows="4" placeholder="Any campus-wide facts not tied to a specific room."></textarea>
                </div>

                <div style="display:flex; align-items:center; gap:0.75rem;">
                  <button type="submit" :disabled="submitting" class="btn btn-primary" :class="{ 'is-loading': submitting }">
                    <span v-if="submitting" class="btn-spinner"></span>{{ submitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Register Building') }}
                  </button>
                  <button v-if="editingId" type="button" @click="cancelEdit" class="btn-link" style="color: var(--muted); font-size:0.8125rem;">Cancel</button>
                </div>
              </form>

              <div style="display:flex; flex-direction:column; gap:1.25rem;">
                <div class="tinted-card">
                  <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.5rem;">
                    <span class="dot dot-green"></span>
                    <h3 style="font-weight:600; font-size:0.875rem; margin:0;">Why this matters</h3>
                  </div>
                  <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0;">
                    The AI chat only answers from facts registered here and per-room — it will refuse
                    ("I don't have that information") rather than guess. After registering the building,
                    add its rooms individually on the Add / Edit Room tab.
                  </p>
                </div>

                <div v-if="editingId && !editingIsLocalOnly">
                  <h3 class="section-title">Floor Plans</h3>
                  <div class="card modal-trigger-card" data-modal-open="floorPlansModal" tabindex="0" role="button">
                    <div class="modal-trigger-row">
                      <div class="avatar" style="background: var(--blue-600, #1a4fc4); flex-shrink:0;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4V4Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 14h16M10 4v16" stroke="#fff" stroke-width="1.6"/></svg>
                      </div>
                      <div style="flex:1; min-width:0;">
                        <div style="font-weight:700; font-size:0.9375rem;">Manage floor plans &amp; walkable paths</div>
                        <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0.25rem 0 0;">
                          {{ Object.keys(floorPlans).length }} of {{ floorList.length }} floor(s) have an uploaded plan. Upload photos and edit walkable-path junctions here.
                        </p>
                      </div>
                      <svg class="modal-trigger-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="editingIsLocalOnly" class="tinted-card" style="margin-top: 1.5rem;">
              <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0;">
                This building was saved on this device and hasn't synced yet. Floor plans and walkable paths can be added once it has synced.
              </p>
            </div>

            <teleport to="body">
              <div class="modal-overlay" data-modal="floorPlansModal" aria-hidden="true">
                <div class="modal-backdrop" data-modal-close="floorPlansModal"></div>
                <div class="modal-sheet modal-sheet-wide" role="dialog" aria-modal="true" aria-label="Floor plans and walkable paths">
                  <div class="modal-head">
                    <h3>Floor Plans &amp; Walkable Paths</h3>
                    <button type="button" class="modal-close" data-modal-close="floorPlansModal" aria-label="Close">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                  </div>
                  <div class="modal-body">
                <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0 0 1rem;">
                  Upload a photo of each floor's plan (an evacuation map works fine) so the scan
                  result screen can show visitors where a room is instead of only text directions.
                  Optional — floors with no plan just keep the text-only directions.
                </p>
                <div v-for="floor in floorList" :key="floor" class="list-row" style="align-items:flex-start;">
                  <div class="avatar" style="background: var(--green-600); flex-shrink:0;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M4 4h16v16H4V4Z" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/><path d="M4 14h16M10 4v16" stroke="#fff" stroke-width="1.6"/></svg>
                  </div>
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.875rem; margin-bottom:0.4rem;">{{ floor }}</div>
                    <div v-if="floorPlans[floor]" style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                      <img :src="'../../' + floorPlans[floor].image_path" alt="" style="width:4.5rem; height:4.5rem; object-fit:cover; border-radius:0.5rem; border:1px solid var(--border, #e5e7eb);">
                      <label class="btn btn-secondary" style="font-size:0.75rem; cursor:pointer;">
                        Replace
                        <input type="file" accept="image/*" style="display:none;" @change="uploadFloorPlan(floor, $event)">
                      </label>
                      <button type="button" @click="pathEditorFloor === floor ? closePathEditor() : openPathEditor(floor)" class="btn-secondary" style="font-size:0.75rem; border:1px solid var(--border,#e5e7eb); border-radius:0.5rem; padding:0.4rem 0.7rem; background:#fff; cursor:pointer;">
                        {{ pathEditorFloor === floor ? 'Close path editor' : 'Edit walkable paths' }}
                      </button>
                      <button type="button" @click="removeFloorPlan(floor)" class="btn-link" style="font-size:0.75rem; color: var(--red-600);">Remove</button>
                    </div>
                    <label v-else class="btn btn-secondary" style="font-size:0.75rem; cursor:pointer;" :class="{ 'is-loading': uploadingFloor === floor }">
                      <span v-if="uploadingFloor === floor" class="btn-spinner"></span>
                      {{ uploadingFloor === floor ? 'Uploading…' : 'Upload plan' }}
                      <input type="file" accept="image/*" style="display:none;" :disabled="uploadingFloor === floor" @change="uploadFloorPlan(floor, $event)">
                    </label>

                    <div v-if="pathEditorFloor === floor" style="margin-top:0.75rem;">
                      <p style="font-size:0.75rem; color:var(--muted); margin:0 0 0.5rem;">
                        Tap empty space to drop a junction along a corridor. Tap one junction, then another, to connect them. Tap a connection line to remove it.
                        <span v-if="selectedNodeId !== null" style="color:#b45309; font-weight:600;"> — junction selected: tap another to connect, or use the × button on it to delete.</span>
                      </p>
                      <div class="lock-bar" :class="{ 'is-locked': pathLocked }">
                        <button type="button" class="lock-btn" :class="{ on: pathLocked }" :aria-pressed="pathLocked ? 'true' : 'false'" @click="toggleLock">
                          <span v-html="pathLocked ? lockIcon.closed : lockIcon.open"></span>{{ pathLocked ? 'Locked' : 'Unlocked' }}
                        </button>
                        <span class="lock-msg">{{ pathLocked
                          ? 'Points and connections can\'t be added, connected or deleted. You can still select points and scroll.'
                          : 'Editing is on: drag a point to move it. Lock the editor to protect it from accidental taps.' }}</span>
                      </div>
                      <div class="path-editor-grid">
                      <div style="min-width:0;">
                      <div @click.self="addPathNode" :class="{ 'is-locked-surface': pathLocked }" style="position:relative; cursor:crosshair; border-radius:0.6rem; overflow:hidden; border:1px solid var(--border,#e5e7eb); user-select:none;">
                        <img :src="'../../' + floorPlans[floor].image_path" alt="" style="width:100%; display:block; pointer-events:none;">
                        <svg style="position:absolute; inset:0; width:100%; height:100%; pointer-events:none;">
                          <line v-for="edge in pathEdges" :key="edge.id"
                                :x1="(pathNodes.find(n => n.id === edge.node_a_id) || {}).x + '%'"
                                :y1="(pathNodes.find(n => n.id === edge.node_a_id) || {}).y + '%'"
                                :x2="(pathNodes.find(n => n.id === edge.node_b_id) || {}).x + '%'"
                                :y2="(pathNodes.find(n => n.id === edge.node_b_id) || {}).y + '%'"
                                stroke="#1a4fc4" stroke-width="2" :style="{ pointerEvents: pathLocked ? 'none' : 'stroke', cursor: 'pointer' }" @click="deleteEdge(edge)" />
                        </svg>
                        <div v-for="node in pathNodes" :key="node.id" @click.stop="selectNode(node)" @pointerdown="startDrag(node, $event)"
                             :style="{ position: 'absolute', left: node.x + '%', top: node.y + '%', transform: 'translate(-50%, -50%)', width: '14px', height: '14px', borderRadius: '999px', background: selectedNodeId === node.id ? '#f59e0b' : '#1a4fc4', border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)', cursor: pathLocked ? 'pointer' : 'grab', touchAction: pathLocked ? 'auto' : 'none' }">
                          <span class="cp-pt-label" style="position:absolute; left:50%; bottom:100%; transform:translate(-50%, -1px); pointer-events:none;">{{ pointShort(node) }}</span>
                        </div>
                        <button v-if="selectedNodeId !== null && !pathLocked" type="button" @click.stop="deleteSelectedNode"
                                :style="{ position: 'absolute', left: (pathNodes.find(n => n.id === selectedNodeId) || {}).x + '%', top: (pathNodes.find(n => n.id === selectedNodeId) || {}).y + '%', transform: 'translate(6px, -26px)' }"
                                style="width:22px; height:22px; border-radius:999px; background:#dc2626; border:2px solid #fff; box-shadow:0 1px 3px rgba(0,0,0,0.3); color:#fff; font-size:13px; line-height:1; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0;">
                          ×
                        </button>
                      </div>
                      </div>

                      <aside class="path-side">
                        <div class="pts-head">
                          <h4 class="side-title" style="margin:0; font-size:0.875rem;">Points ({{ pathPointList.length }})</h4>
                          <button type="button" class="btn-remove-all" :disabled="pathLocked || !pathPointList.length" @click="removeAllPathNodes">Remove all</button>
                        </div>
                        <!-- One AR anchor QR per FLOOR, not per point — this is what
                             the indoor AR guide scans to establish its real starting
                             position instead of guessing from the camera's own pose.
                             Pick the point first (select it below), then set it. -->
                        <div class="tinted-card" style="padding:0.7rem 0.8rem; margin-bottom:0.75rem;">
                          <p style="font-size:0.75rem; font-weight:700; color:var(--ink); margin:0 0 0.3rem;">AR anchor for this floor</p>
                          <template v-if="floorQrAnchor">
                            <p style="font-size:0.75rem; color:var(--muted); margin:0 0 0.5rem;">Set at <strong>{{ floorQrAnchor.label || 'this point' }}</strong>.</p>
                            <div style="display:flex; gap:0.5rem;">
                              <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:0.4rem 0.7rem;" @click="showFloorQr">View / print</button>
                              <button type="button" class="btn-link" style="font-size:0.75rem; color: var(--red-600);" @click="removeFloorQr">Remove</button>
                            </div>
                          </template>
                          <template v-else>
                            <p style="font-size:0.75rem; color:var(--muted); margin:0 0 0.5rem;">
                              None yet. Select a point below (ideally the entrance or a landing), then set it as this floor's one AR anchor.
                            </p>
                            <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:0.4rem 0.7rem;" :disabled="selectedNodeId === null || qrBusy" @click="setFloorQr">
                              {{ qrBusy ? 'Generating…' : (selectedNodeId === null ? 'Select a point first' : 'Set selected point as AR anchor') }}
                            </button>
                          </template>
                        </div>
                        <div v-if="pathUndo" class="undo-bar" role="status">
                          <span>{{ pathUndo.label }}</span>
                          <button type="button" @click="undoPathDelete">Undo</button>
                          <button type="button" class="undo-x" aria-label="Dismiss" @click="pathUndo = null">&times;</button>
                        </div>
                        <p v-if="!pathPointList.length" style="font-size:0.75rem; color:var(--muted); margin:0;">No points yet. Tap the plan to add Point A.</p>
                        <div v-else class="points-list" role="list">
                          <button v-for="p in pathPointList" :key="p.id" type="button" role="listitem" class="pt-row" :class="{ sel: p.id === selectedNodeId }" @click="selectFromList(p.id)">
                            <span class="pt-badge">{{ p.short }}</span>
                            <span class="pt-main">
                              <span class="pt-name">{{ p.name }}</span>
                              <span class="pt-sub"><template v-if="p.links.length">to {{ p.links.join(', ') }}</template><template v-else>not connected</template></span>
                            </span>
                          </button>
                        </div>
                        <div v-if="selectedNodeId !== null" style="margin-top:0.7rem;">
                          <label for="path-point-name" style="display:block; font-size:0.75rem; font-weight:600; color:var(--muted); margin-bottom:0.3rem;">Name</label>
                          <div class="name-row">
                            <input id="path-point-name" v-model="pathNameDraft" type="text" maxlength="40" :disabled="pathLocked" @keydown.enter.prevent="renamePathNode">
                            <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:0.4rem 0.7rem;" :disabled="pathLocked" @click="renamePathNode">Rename</button>
                          </div>
                          <p v-if="pathNameError" class="name-error">{{ pathNameError }}</p>
                        </div>
                      </aside>
                      </div>

                      <div v-if="selectedNodeId !== null" style="margin-top:0.6rem; padding:0.6rem 0.75rem; background:#fffbeb; border:1px solid #fde68a; border-radius:0.5rem;">
                        <p style="font-size:0.75rem; font-weight:600; color:#92400e; margin:0 0 0.4rem;">Connections to other floors (stairs/elevator)</p>
                        <div v-if="crossLinks.length" style="display:flex; flex-direction:column; gap:0.3rem; margin-bottom:0.5rem;">
                          <div v-for="link in crossLinks" :key="link.edgeId" style="display:flex; align-items:center; justify-content:space-between; font-size:0.75rem; color:#78350f;">
                            <span>↕ {{ link.floor }}</span>
                            <button type="button" @click="unlinkCrossFloor(link)" class="btn-link" style="font-size:0.7rem; color: var(--red-600);">Remove</button>
                          </div>
                        </div>
                        <p v-else style="font-size:0.75rem; color:#a16207; margin:0 0 0.5rem;">Not connected to any other floor yet.</p>
                        <button type="button" @click="openCrossFloorPicker" :disabled="pathLocked" class="btn btn-secondary" style="font-size:0.75rem; padding:0.35rem 0.6rem;">+ Connect to another floor</button>

                        <div v-if="crossFloorOptions" style="margin-top:0.6rem; border-top:1px solid #fde68a; padding-top:0.6rem;">
                          <div v-if="Object.keys(crossFloorOptions).length === 0" style="font-size:0.75rem; color:#a16207;">
                            No junctions exist on any other floor yet — add one there first (Edit walkable paths on that floor).
                          </div>
                          <div v-for="(nodes, floorName) in crossFloorOptions" :key="floorName" style="margin-bottom:0.75rem;">
                            <p style="font-size:0.7rem; font-weight:700; color:#78350f; margin:0 0 0.3rem;">{{ floorName }}</p>
                            <div v-if="floorPlans[floorName]" style="position:relative; border-radius:0.5rem; overflow:hidden; border:1px solid #fde68a;">
                              <img :src="'../../' + floorPlans[floorName].image_path" alt="" style="width:100%; display:block;">
                              <button v-for="n in nodes" :key="n.id" type="button" @click="linkAcrossFloors(n.id)"
                                      :style="{ position: 'absolute', left: n.x + '%', top: n.y + '%', transform: 'translate(-50%, -50%)' }"
                                      style="width:20px; height:20px; border-radius:999px; background:#0369a1; border:2px solid #fff; box-shadow:0 0 0 1px rgba(0,0,0,0.25); cursor:pointer; padding:0;"
                                      title="Tap to link to this junction">
                              </button>
                            </div>
                            <p v-else style="font-size:0.6875rem; color:#a16207; margin:0;">No plan image found for {{ floorName }}.</p>
                          </div>
                          <button type="button" @click="closeCrossFloorPicker" class="btn-link" style="font-size:0.7rem; color: var(--muted); margin-top:0.3rem;">Cancel</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  </div>
                </div>
              </div>
              </div>
            </teleport>

            <teleport to="body">
              <div class="modal-overlay" :class="{ 'is-open': showingFloorQr }" :aria-hidden="!showingFloorQr">
                <div class="modal-backdrop" @click="showingFloorQr = false"></div>
                <div class="modal-sheet" style="max-width:24rem; text-align:center;" role="dialog" aria-modal="true" aria-label="Floor AR anchor QR">
                  <div class="modal-head">
                    <h3>{{ pathEditorFloor }} — AR anchor</h3>
                    <button type="button" class="modal-close" @click="showingFloorQr = false" aria-label="Close">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                    </button>
                  </div>
                  <div class="modal-body" style="display:flex; flex-direction:column; align-items:center; gap:0.9rem;">
                    <div class="qr-print-canvas" ref="qrCanvas"></div>
                    <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0;">
                      Print this and post it at <strong>{{ floorQrAnchor ? (floorQrAnchor.label || 'this spot') : '' }}</strong>. Scanning it when starting the AR guide on this floor sets the exact starting anchor instead of guessing from the camera.
                    </p>
                  </div>
                  <div class="modal-foot" style="justify-content:flex-end;">
                    <button type="button" class="btn btn-primary" @click="showingFloorQr = false">Done</button>
                  </div>
                </div>
              </div>
            </teleport>

            <div style="margin-top: 2.5rem;">
              <h3 class="section-title">Registered Buildings ({{ buildings.length }})</h3>
              <div class="card stagger-in">
                <div v-if="buildings.length === 0" class="empty-state">None yet — add one above.</div>
                <div v-for="b in buildings" :key="b.id" class="list-row">
                  <div class="avatar" style="background: var(--green-600);">{{ b.name.charAt(0) }}</div>
                  <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.875rem;" class="truncate">{{ b.name }}
                      <span v-if="b._pending" style="margin-left:0.4rem; font-size:0.625rem; font-weight:700; color:#92400e; background:#fef3c7; border:1px solid #fde68a; border-radius:999px; padding:0.05rem 0.45rem; vertical-align:1px;">Not synced</span>
                    </div>
                    <div style="font-family:'JetBrains Mono',monospace; font-size:0.6875rem; color:#9aa79f;">{{ b.lat }}, {{ b.lng }} &middot; {{ b.floor_count }} floor(s) &middot; {{ b.building_number !== null ? 'Bldg #' + b.building_number : 'no building #' }} &middot; {{ b.room_count }} room(s)</div>
                  </div>
                  <button @click="startEdit(b)" class="btn-link" style="font-size:0.75rem; color: var(--muted);">Edit</button>
                  <button v-if="!b._pending" @click="deleteBuilding(b)" class="btn-link" style="font-size:0.75rem; color: var(--red-600); margin-left:0.75rem;">Delete</button>
                </div>
              </div>
            </div>
          </div>

          <transition name="overlay">
            <div v-if="submitting" class="loading-overlay">
              <div class="loading-card">
                <div class="loading-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
                </div>
                <p>{{ editingId ? 'Saving changes…' : 'Registering building…' }}</p>
              </div>
            </div>
          </transition>
        </div>
      </section>

      <!-- ===== Tab: Add/Edit Room (from register-room.php) ===== -->
      <section class="tab-panel" data-tab-panel="add-room" hidden>
        <div id="room-app">
          <div class="admin-container narrow" style="padding:0;">
            <div class="page-head">
              <div>
                <h1 style="font-size:1.25rem;">{{ editingId ? 'Edit Room' : 'Register a Room' }}</h1>
                <p>Structured fields — this is what signage scanning matches against.</p>
              </div>
            </div>

            <div class="form-grid">
              <form @submit.prevent="submitRoom" class="card">
                <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="3" width="16" height="18" rx="1.2"/></svg>Assignment</div>
                <div class="field">
                  <label>Building</label>
                  <select v-model="form.building_id" @change="form.floor = ''" required>
                    <option value="" disabled>Select a building…</option>
                    <option v-for="b in buildings" :key="b.id" :value="b.id">{{ b.name }}</option>
                  </select>
                </div>

                <div v-if="buildingBlocksRooms" class="tinted-card warn-card" style="margin-bottom:1rem;">
                  <p style="color:#92400e; font-size:0.8125rem; line-height:1.6; margin:0;">
                    <strong>{{ selectedBuilding.name }}</strong> was registered with no building number, meaning it doesn't have numbered rooms. If this is wrong, add a building number for it on the Add / Edit Building tab first.
                  </p>
                </div>

                <template v-if="!buildingBlocksRooms">
                  <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 21V5a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v16"/><path d="M4 21h16M9 12v.01"/></svg>Room Details</div>
                  <div class="field">
                    <label>Category</label>
                    <div class="toggle-group">
                      <button type="button" @click="setCategory('office')" :class="form.category === 'office' ? 'is-active' : ''">Office</button>
                      <button type="button" @click="setCategory('classroom')" :class="form.category === 'classroom' ? 'is-active' : ''">Classroom / Lab</button>
                      <button type="button" @click="setCategory('cr')" :class="form.category === 'cr' ? 'is-active' : ''">CR</button>
                      <button type="button" @click="setCategory('canteen')" :class="form.category === 'canteen' ? 'is-active' : ''">Canteen</button>
                    </div>
                  </div>

                  <div class="field field-row">
                    <div>
                      <label>Room number</label>
                      <input v-if="!form.noSignage && !forcesNoNumber" v-model="form.room_number" type="text" required
                             :placeholder="expectedPrefix ? expectedPrefix + '01' : '204'"
                             style="font-family:'JetBrains Mono',monospace;">
                      <input v-else type="text" value="No number" disabled
                             style="font-family:'JetBrains Mono',monospace; color:#9aa79f; background:#f4f6f4;">
                      <p v-if="!form.noSignage && !forcesNoNumber && (expectedPrefix || roomNumberError)" style="font-size:0.6875rem; margin:0.3rem 0 0;" :style="{ color: roomNumberError ? '#dc2626' : '#9aa79f' }">
                        {{ roomNumberError || ('Should start with ' + expectedPrefix + ' — building ' + selectedBuilding.building_number + ', floor ' + floorDigit + '. A section can follow a dash, like ' + expectedPrefix + '01 - A.') }}
                      </p>
                      <p v-if="roomNumberPreview && !roomNumberError" style="font-size:0.6875rem; margin:0.3rem 0 0; color:var(--green-700, #15803d); font-weight:600;">
                        Will be saved as {{ roomNumberPreview }}
                      </p>
                      <p v-if="forcesNoNumber" style="font-size:0.75rem; color:var(--muted); margin:0.4rem 0 0;">CRs and canteens don't get room numbers.</p>
                      <label v-else style="display:flex; align-items:center; gap:0.4rem; margin-top:0.4rem; font-size:0.75rem; font-weight:500; color:var(--muted); cursor:pointer;">
                        <input v-model="form.noSignage" type="checkbox" style="width:auto;">
                        No number / no signage (e.g. stairwell)
                      </label>
                    </div>
                    <div>
                      <label>Floor</label>
                      <select v-model="form.floor" required :disabled="!form.building_id">
                        <option value="" disabled>{{ form.building_id ? 'Select a floor…' : 'Select a building first' }}</option>
                        <option v-for="f in floorOptions" :key="f" :value="f">{{ f }}</option>
                        <option v-if="form.floor && !floorOptions.includes(form.floor)" :value="form.floor">{{ form.floor }} (existing)</option>
                      </select>
                    </div>
                  </div>

                  <div class="field" v-if="form.floor">
                    <label>Location on floor plan (optional)</label>
                    <p v-if="loadingPlan" style="font-size:0.75rem; color:#9aa79f; margin:0;">Loading plan…</p>
                    <p v-else-if="!currentFloorPlan" style="font-size:0.75rem; color:#9aa79f; margin:0;">
                      <template v-if="planUnavailable">The floor plan isn't available offline. Open this page once while connected to keep a copy. The room can still be saved without a marker.</template>
                      <template v-else-if="planForNewBuilding">This building hasn't synced yet, so it has no floor plan.</template>
                      <template v-else>No plan uploaded for {{ form.floor }} yet — add one on the Add / Edit Building tab to place a marker here.</template>
                    </p>
                    <template v-else>
                      <div class="card modal-trigger-card" data-modal-open="roomMarkerModal" tabindex="0" role="button">
                        <div class="modal-trigger-row">
                          <div class="marker-thumb">
                            <img :src="'../../' + currentFloorPlan.image_path" alt="">
                            <span v-if="form.map_x !== null && form.map_y !== null" class="marker-thumb-dot" :style="{ left: form.map_x + '%', top: form.map_y + '%' }"></span>
                          </div>
                          <div style="flex:1; min-width:0;">
                            <div style="font-weight:700; font-size:0.875rem;">{{ form.map_x !== null ? 'Marker placed' : 'No marker yet' }}</div>
                            <p style="color: var(--muted); font-size:0.75rem; line-height:1.5; margin:0.2rem 0 0;">Tap to open {{ form.floor }}'s plan and place or move the pin.</p>
                          </div>
                          <button v-if="form.map_x !== null" type="button" @click.stop="clearMarker" class="btn-link" style="font-size:0.75rem; color: var(--muted);">Clear</button>
                          <svg class="modal-trigger-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>
                        </div>
                      </div>

                      <teleport to="body">
                      <div class="modal-overlay" data-modal="roomMarkerModal" aria-hidden="true">
                        <div class="modal-backdrop" data-modal-close="roomMarkerModal"></div>
                        <div class="modal-sheet" role="dialog" aria-modal="true" aria-label="Place room marker">
                          <div class="modal-head">
                            <h3>Place Marker — {{ form.floor }}</h3>
                            <button type="button" class="modal-close" data-modal-close="roomMarkerModal" aria-label="Close">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
                            </button>
                          </div>
                          <div class="modal-body">
                            <div class="map-marker-frame" @click="placeMarker" style="position:relative; cursor:crosshair; border-radius:0.6rem; overflow:hidden; border:1px solid var(--border, #e5e7eb); user-select:none;">
                              <img :src="'../../' + currentFloorPlan.image_path" alt="" style="width:100%; display:block; pointer-events:none;">
                              <div v-for="p in occupiedPins" :key="p.id"
                                   :style="{ position: 'absolute', left: p.map_x + '%', top: p.map_y + '%', transform: 'translate(-50%, -100%)', pointerEvents: 'none' }">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#9aa79f" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                                <span style="position:absolute; top:100%; left:50%; transform:translateX(-50%); font-size:0.5625rem; font-weight:700; background:#5b6b63; color:#fff; padding:0.05rem 0.3rem; border-radius:0.25rem; white-space:nowrap;">{{ p.room_number || p.room_name }}</span>
                              </div>
                              <div v-if="form.map_x !== null && form.map_y !== null"
                                   :style="{ position: 'absolute', left: form.map_x + '%', top: form.map_y + '%', transform: 'translate(-50%, -100%)', pointerEvents: 'none' }">
                                <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" fill="#1a4fc4" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/><circle cx="12" cy="9.5" r="2.1" fill="#fff"/></svg>
                              </div>
                            </div>
                            <div style="display:flex; align-items:center; justify-content:space-between; margin-top:0.6rem;">
                              <p style="font-size:0.6875rem; color:#9aa79f; margin:0;">Tap the plan to place the marker. <span v-if="occupiedPins.length">Gray pins are already-placed rooms.</span></p>
                              <button v-if="form.map_x !== null" type="button" @click="clearMarker" class="btn-link" style="font-size:0.75rem; color: var(--muted);">Clear marker</button>
                            </div>
                          </div>
                          <div class="modal-foot">
                            <button type="button" class="btn btn-primary" data-modal-close="roomMarkerModal">Done</button>
                          </div>
                        </div>
                      </div>
                      </teleport>
                    </template>
                  </div>

                  <div class="field" v-if="form.category === 'classroom'">
                    <label>Room name</label>
                    <select v-model="form.room_name" required>
                      <option value="" disabled>Select a type…</option>
                      <option value="Lecture Room">Lecture Room</option>
                      <option value="Laboratory Room">Laboratory Room</option>
                      <option v-if="form.room_name && form.room_name !== 'Lecture Room' && form.room_name !== 'Laboratory Room'" :value="form.room_name">{{ form.room_name }} (existing)</option>
                    </select>
                  </div>
                  <div class="field" v-else>
                    <label>Room name</label>
                    <input v-model="form.room_name" type="text" required placeholder="Treasury">
                  </div>

                  <div class="field-divider"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>Hours &amp; Notes</div>
                  <div class="field" v-if="categoryHasHours">
                    <label>Hours</label>
                    <div class="field-row">
                      <div>
                        <input v-model="form.hoursStart" type="time" aria-label="Opens">
                      </div>
                      <div>
                        <input v-model="form.hoursEnd" type="time" aria-label="Closes">
                      </div>
                    </div>

                    <label style="display:flex; align-items:center; gap:0.4rem; margin-top:0.6rem; font-size:0.8125rem; font-weight:500; color:var(--muted); cursor:pointer;">
                      <input v-model="form.hasLunchBreak" type="checkbox" style="width:auto;">
                      Closed for lunch
                    </label>
                    <div v-if="form.hasLunchBreak" class="field-row" style="margin-top:0.4rem;">
                      <div>
                        <input v-model="form.lunchStart" type="time" aria-label="Lunch starts">
                      </div>
                      <div>
                        <input v-model="form.lunchEnd" type="time" aria-label="Lunch ends">
                      </div>
                    </div>

                    <label style="display:block; font-size:0.75rem; font-weight:600; color:var(--muted); margin:0.75rem 0 0.4rem;">Days</label>
                    <div class="toggle-group">
                      <button type="button" @click="form.hoursDaysPreset = 'Mon–Fri'" :class="form.hoursDaysPreset === 'Mon–Fri' ? 'is-active' : ''">Mon–Fri</button>
                      <button type="button" @click="form.hoursDaysPreset = 'Mon–Sat'" :class="form.hoursDaysPreset === 'Mon–Sat' ? 'is-active' : ''">Mon–Sat</button>
                      <button type="button" @click="form.hoursDaysPreset = 'Daily'" :class="form.hoursDaysPreset === 'Daily' ? 'is-active' : ''">Daily</button>
                      <button type="button" @click="form.hoursDaysPreset = 'Custom'" :class="form.hoursDaysPreset === 'Custom' ? 'is-active' : ''">Custom</button>
                    </div>
                    <input v-if="form.hoursDaysPreset === 'Custom'" v-model="form.hoursDaysCustom" type="text" placeholder="e.g. Tue &amp; Thu only" style="margin-top:0.5rem;">

                    <p v-if="composedHours" style="font-size:0.6875rem; color:#9aa79f; margin:0.5rem 0 0;">Saves as: {{ composedHours }}</p>
                  </div>
                  <div v-else class="no-hours-note">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.5" stroke="#9aa79f" stroke-width="1.6" stroke-dasharray="3 3"/></svg>
                    {{ form.category === 'cr' ? 'No fixed hours for a CR.' : 'No fixed hours for classrooms/labs — class scheduling is a separate scope.' }}
                  </div>

                  <div class="field">
                    <label>Notes (optional)</label>
                    <input v-model="form.notes" type="text" placeholder="e.g. 3rd floor, past the stairwell">
                  </div>
                </template>

                <div style="display:flex; align-items:center; gap:0.75rem; margin-top:0.5rem;">
                  <button type="submit" :disabled="submitting || !!roomNumberError || buildingBlocksRooms" class="btn btn-primary" :class="{ 'is-loading': submitting }">
                    <span v-if="submitting" class="btn-spinner"></span>{{ submitting ? 'Saving…' : (editingId ? 'Save Changes' : 'Add Room') }}
                  </button>
                  <button v-if="editingId" type="button" @click="cancelEdit" class="btn-link" style="color: var(--muted); font-size:0.8125rem;">Cancel</button>
                </div>
              </form>

              <div class="side-col">
                <div class="tinted-card">
                  <div style="display:flex; align-items:center; gap:0.4rem; margin-bottom:0.5rem;">
                    <span class="dot dot-green"></span>
                    <h3 style="font-weight:600; font-size:0.875rem; margin:0;">Why room numbers, not text</h3>
                  </div>
                  <p style="color: var(--muted); font-size:0.8125rem; line-height:1.6; margin:0;">
                    When the AI reads a signage ("ROOM 204"), it matches that number directly against a
                    room record — not a keyword search through a paragraph. Structured fields also power
                    Manual Search and Nearby suggestions.
                  </p>
                </div>

                <div class="rooms-panel">
                  <p class="rooms-panel-label">ROOMS {{ form.building_id ? 'IN THIS BUILDING' : '' }} ({{ filteredRooms.length }})</p>
                  <div v-if="filteredRooms.length === 0" class="empty-state" style="color: rgba(255,255,255,0.4);">None yet.</div>
                  <div class="stagger-in">
                  <div v-for="r in filteredRooms" :key="r.id" class="room-row">
                    <span class="room-num">{{ r.room_number || 'no #' }}</span>
                    <span class="room-name truncate">{{ r.room_name }}<span v-if="r._pending" title="Saved on this device, not synced yet" style="margin-left:0.35rem; font-size:0.5625rem; font-weight:700; color:#fbbf24;">&bull; Not synced</span></span>
                    <span class="room-type" :class="r.room_type === 'office' ? 'type-office' : 'type-classroom'">{{ { office: 'Office', classroom: 'Room', cr: 'CR', canteen: 'Canteen' }[r.category] || 'Room' }}</span>
                    <button @click="startEdit(r)" class="btn-link room-action">Edit</button>
                    <button v-if="!r._pending" @click="deleteRoom(r)" class="btn-link room-action room-delete">Delete</button>
                  </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <transition name="overlay">
            <div v-if="submitting" class="loading-overlay">
              <div class="loading-card">
                <div class="loading-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
                </div>
                <p>{{ editingId ? 'Saving changes…' : 'Adding room…' }}</p>
              </div>
            </div>
          </transition>
        </div>
      </section>

    </div>
  </main>
</div>

<script src="../../Js/Include/point-names.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/point-names.js') ?>"></script>
<script src="../../Js/Include/editor-lock.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/editor-lock.js') ?>"></script>
<script src="../../Js/Include/room-number.js?v=<?= filemtime(__DIR__ . '/../../Js/Include/room-number.js') ?>"></script>
<script src="../../Js/Admin/manage-buildings.js?v=<?= $listJsVer ?>"></script>
<script src="../../Js/Admin/register-building.js?v=<?= $buildingJsVer ?>"></script>
<script src="../../Js/Admin/register-room.js?v=<?= $roomJsVer ?>"></script>

<script>
(function () {
  var tabs = document.querySelectorAll('.tab-btn');
  var panels = document.querySelectorAll('.tab-panel');
  var indicator = document.querySelector('.tabs-indicator');

  function moveIndicator(btn) {
    if (!indicator || !btn) return;
    indicator.style.width = btn.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
  }

  function activate(tab) {
    var activeBtn = null;
    tabs.forEach(function (t) {
      var isActive = t.dataset.tab === tab;
      t.classList.toggle('is-active', isActive);
      if (isActive) activeBtn = t;
    });
    panels.forEach(function (p) {
      var show = p.dataset.tabPanel === tab;
      p.hidden = !show;
      if (show) {
        // Re-trigger the enter animation even if this panel was shown before —
        // without removing+re-adding the class, a repeat activation wouldn't replay it.
        p.style.animation = 'none';
        void p.offsetWidth;
        p.style.animation = '';
      }
    });
    moveIndicator(activeBtn);
    var url = new URL(window.location);
    url.searchParams.set('tab', tab);
    window.history.replaceState(null, '', url);
  }
  tabs.forEach(function (btn) {
    btn.addEventListener('click', function () { activate(btn.dataset.tab); });
  });
  activate(<?= json_encode($initialTab) ?>);
  // The indicator needs the real layout (fonts loaded, icons sized) before it
  // can measure correctly — one more pass after paint settles.
  window.addEventListener('resize', function () {
    moveIndicator(document.querySelector('.tab-btn.is-active'));
  });

  // Cross-tab "Edit" from the All Buildings list: reuse the already-mounted
  // Building tab's Vue app instead of a full page reload.
  window.LamparaListApp.editBuildingFromList = function (b) {
    if (window.LamparaBuildingApp && typeof window.LamparaBuildingApp.startEdit === 'function') {
      window.LamparaBuildingApp.startEdit(b);
    }
    activate('add-building');
  };

  <?php if (isset($_GET['edit'])): ?>
  // Forwarded from an old bookmark/link: ?edit=<id> on this page jumps
  // straight into the Building tab with that record loaded (register-building.js
  // already reads this param in its own mounted() hook).
  activate('add-building');
  <?php endif; ?>

  // ---- Modals: Floor Plans/Paths and Room Marker placement live in a
  // dialog instead of always-expanded inline content. Plain DOM toggling,
  // independent of each tab's own Vue app — no component state involved,
  // so none of their methods/bindings change.
  function openModal(name) {
    var overlay = document.querySelector('.modal-overlay[data-modal="' + name + '"]');
    if (!overlay) return;
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(name) {
    var overlay = document.querySelector('.modal-overlay[data-modal="' + name + '"]');
    if (!overlay) return;
    overlay.classList.remove('is-open');
    overlay.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal-overlay.is-open')) document.body.style.overflow = '';
  }
  // Delegated on document, not attached per-element: the trigger cards and
  // close buttons live inside Vue v-if/v-else blocks that render only after
  // async state changes (editingId set, currentFloorPlan loaded, etc.) —
  // a one-time querySelectorAll at script-load time would miss any of them
  // Vue inserts afterward.
  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-modal-open]');
    if (opener) { openModal(opener.dataset.modalOpen); return; }
    var closer = e.target.closest('[data-modal-close]');
    if (closer) { closeModal(closer.dataset.modalClose); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      var opener = e.target.closest('[data-modal-open]');
      if (opener) { e.preventDefault(); openModal(opener.dataset.modalOpen); }
      return;
    }
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.modal-overlay.is-open');
    if (open) closeModal(open.dataset.modal);
  });
})();
</script>

</body>
</html>
