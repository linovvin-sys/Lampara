<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'data-pack';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/data-pack.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/data-pack.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Data</title>
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
<link rel="stylesheet" href="../../Css/Admin/data-pack.css?v=<?= $pageCssVer ?>">
<script src="../../assets/vendor/sweetalert2/sweetalert2-11.26.25.all.min.js"></script>
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="adminMain">
    <div class="admin-container dp">

      <header class="page-head">
        <div>
          <h1>Data</h1>
          <p>Move a whole school between installs, restore one, or load rooms from a spreadsheet.</p>
        </div>
      </header>

      <p class="dp-msg" id="dpMsg" role="status" hidden></p>

      <section class="dp-card" aria-labelledby="dpExpH">
        <h2 id="dpExpH">Export this school</h2>
        <p>One zip with the buildings, rooms, floor plans with their paths, doors, campus walkways, map pins, enrollment steps and school settings. It never contains staff accounts, passwords or visitor reports.</p>
        <a class="btn btn-primary" id="dpExport" href="../../../Backend/api/data-pack.php?action=export">Download the data pack</a>
      </section>

      <section class="dp-card" aria-labelledby="dpImpH">
        <h2 id="dpImpH">Import a data pack</h2>
        <p>This <b>replaces</b> the current buildings, rooms, floor plans, paths, doors and map pins with the pack&rsquo;s. A safety copy of what is here now is saved first.</p>
        <div class="dp-row">
          <input type="file" id="dpFile" accept=".zip,application/zip">
          <button type="button" class="btn btn-secondary" id="dpCheck" disabled>Check the pack</button>
        </div>
        <div id="dpPreview" hidden>
          <table class="dp-table" aria-label="What the pack contains compared with what is here now">
            <thead><tr><th>What</th><th>In the pack</th><th>Here now</th></tr></thead>
            <tbody id="dpRows"></tbody>
          </table>
          <ul class="dp-list bad" id="dpProblems"></ul>
          <ul class="dp-list warn" id="dpWarnings"></ul>
          <div id="dpConfirm" hidden>
            <label for="dpType">Type <b>REPLACE</b> to confirm</label>
            <div class="dp-row">
              <input type="text" id="dpType" autocomplete="off" placeholder="REPLACE">
              <button type="button" class="btn btn-danger" id="dpGo" disabled>Replace everything with this pack</button>
            </div>
          </div>
        </div>
      </section>

      <section class="dp-card" aria-labelledby="dpCsvH">
        <h2 id="dpCsvH">Add rooms from a spreadsheet</h2>
        <p>A CSV file with the columns <code>building_name, floor, room_number, room_name, category, hours, notes</code>. Buildings must already exist and are matched by name. Category is office, classroom, cr or canteen. Rooms already there are never changed; rows with a problem are skipped. <a href="../../assets/templates/rooms-template.csv" download>Download a template</a>.</p>
        <div class="dp-row">
          <input type="file" id="csvFile" accept=".csv,text/csv">
          <button type="button" class="btn btn-secondary" id="csvCheck" disabled>Check the file</button>
        </div>
        <div id="csvPreview" hidden>
          <p id="csvSummary" class="dp-summary"></p>
          <table class="dp-table" id="csvSampleT"><thead><tr><th>Line</th><th>Number</th><th>Room</th><th>Floor</th><th>Category</th></tr></thead><tbody id="csvSample"></tbody></table>
          <details id="csvBad" class="dp-bad" hidden><summary id="csvBadSum"></summary><ul class="dp-list bad" id="csvProblems"></ul></details>
          <button type="button" class="btn btn-primary" id="csvGo" disabled>Add the rooms</button>
        </div>
      </section>

    </div>
  </main>
</div>

<script src="../../Js/Admin/data-pack.js?v=<?= $pageJsVer ?>"></script>
</body>
</html>
