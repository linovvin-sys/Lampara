<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/_auth.php';
$activeNav = 'account';
$cssVer = filemtime(__DIR__ . '/../../Css/Admin/admin.css');
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/account.css');
$pageJsVer = filemtime(__DIR__ . '/../../Js/Admin/account.js');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin · Account</title>
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
<link rel="stylesheet" href="../../Css/Admin/account.css?v=<?= $pageCssVer ?>">
</head>
<body class="admin-body">
<script>LamparaSkeleton.show('admin')</script>

<div class="admin-shell">
  <?php include __DIR__ . '/../Include/admin-nav.php'; ?>

  <main class="admin-main" id="adminMain">
    <div class="admin-container ac">

      <header class="ac-hero flex items-center gap-3.5">
        <span class="ac-avatar" id="acAvatar" aria-hidden="true">?</span>
        <div class="ac-hero-text">
          <h1 id="acName">Your account</h1>
          <p class="ac-chips m-0 flex flex-wrap gap-1.5" id="acChips"></p>
        </div>
      </header>

      <div class="ac-tabs" role="tablist" aria-label="Account sections" id="acTabs">
        <button type="button" role="tab" class="ac-tab is-on" data-tab="me" aria-selected="true">My account</button>
        <button type="button" role="tab" class="ac-tab" data-tab="team" aria-selected="false" hidden>Team</button>
        <button type="button" role="tab" class="ac-tab" data-tab="log" aria-selected="false" hidden>Activity</button>
      </div>

      <!-- MY ACCOUNT -->
      <div class="ac-pane grid gap-4" id="paneMe" role="tabpanel">
        <div class="ac-two grid grid-cols-1 gap-4 min-[720px]:grid-cols-2">
          <section class="ac-box" aria-labelledby="unH">
            <h2 id="unH">Username</h2>
            <p class="ac-sub">The name you sign in with. Your password and two-step sign-in stay the same. Past activity keeps the old name.</p>
            <form id="unForm" autocomplete="off" class="ac-form grid gap-3">
              <label class="ac-field grid gap-1.5" for="unNew"><span>New username</span><input id="unNew" type="text" autocomplete="username" minlength="3" maxlength="30" pattern="[A-Za-z0-9._\-]{3,30}" required></label>
              <label class="ac-field grid gap-1.5" for="unPw"><span>Your password</span><input id="unPw" type="password" autocomplete="current-password" required></label>
              <button type="submit" class="btn btn-primary">Change username</button>
              <p class="ac-msg" id="unMsg" role="status"></p>
            </form>
          </section>

          <section class="ac-box" aria-labelledby="pwH">
            <h2 id="pwH">Password</h2>
            <p class="ac-sub">Use at least 10 characters. A phrase of a few words is easy to remember and hard to guess.</p>
            <form id="pwForm" autocomplete="off" class="ac-form grid gap-3">
              <label class="ac-field grid gap-1.5" for="pwCur"><span>Current password</span><input id="pwCur" type="password" autocomplete="current-password" required></label>
              <label class="ac-field grid gap-1.5" for="pwNew"><span>New password</span><input id="pwNew" type="password" autocomplete="new-password" minlength="10" required></label>
              <div class="ac-meter" aria-hidden="true"><span id="pwBar"></span></div>
              <p class="ac-small" id="pwHint">At least 10 characters.</p>
              <label class="ac-field grid gap-1.5" for="pwNew2"><span>New password again</span><input id="pwNew2" type="password" autocomplete="new-password" minlength="10" required></label>
              <button type="submit" class="btn btn-primary">Change password</button>
              <p class="ac-msg" id="pwMsg" role="status"></p>
            </form>
          </section>

          <section class="ac-box" aria-labelledby="tsH">
            <h2 id="tsH">Two-step sign-in</h2>
            <p class="ac-state" id="tsState"></p>
            <div id="tsOff" hidden>
              <p class="ac-sub">Sign-in also asks for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator or Authy). Someone who learns your password still cannot get in.</p>
              <button type="button" class="btn btn-primary" id="tsBegin">Set it up</button>
            </div>
            <ol class="ac-steps" id="tsSetup" hidden>
              <li><b>Add the key to your app.</b> Choose <i>Add account</i>, then <i>Enter a setup key</i>, and type this key (spaces do not matter).
                <span class="ac-key" id="tsKey"></span>
                <span class="ac-small">On the phone with the app? <a id="tsLink" href="#">Add it with one tap</a>.</span></li>
              <li><b>Type the code it shows.</b>
                <span class="ac-codeRow"><input id="tsCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="6-digit code" placeholder="6 digits"><button type="button" class="btn btn-primary" id="tsConfirm">Turn it on</button></span></li>
            </ol>
            <div id="tsOn" hidden class="ac-form grid gap-3">
              <p class="ac-sub">To switch it off, confirm with your password and a current code.</p>
              <label class="ac-field grid gap-1.5" for="tsOffPw"><span>Password</span><input id="tsOffPw" type="password" autocomplete="current-password"></label>
              <label class="ac-field grid gap-1.5" for="tsOffCode"><span>6-digit code</span><input id="tsOffCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
              <button type="button" class="btn btn-secondary" id="tsOffBtn">Switch it off</button>
            </div>
            <p class="ac-msg" id="tsMsg" role="status"></p>
            <p class="ac-small">Lost your phone? Ask an administrator to reset your password; that also switches two-step off so you can set it up again.</p>
          </section>
        </div>
      </div>

      <!-- TEAM (administrators) -->
      <div class="ac-pane grid gap-4" id="paneTeam" role="tabpanel" hidden>
        <div class="ac-stats grid grid-cols-2 gap-2.5 min-[720px]:grid-cols-4" id="teamStats"></div>
        <div class="ac-toolbar grid gap-2 min-[720px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[720px]:items-center">
          <label class="ac-search"><span class="sr-only">Search the team</span><input id="teamQ" type="search" placeholder="Search by name" autocomplete="off"></label>
          <select id="teamFilter" aria-label="Show"><option value="">Everyone</option><option value="admin">Administrators</option><option value="psmo">PSMO staff</option><option value="off">Disabled</option></select>
          <button type="button" class="btn btn-primary" id="teamAdd">Add a team member</button>
        </div>
        <div class="ac-bulk" id="teamBulk" hidden><span id="teamBulkN"></span><button type="button" class="btn btn-secondary" id="teamBulkSet">Set what they can use</button><button type="button" class="btn-link" id="teamBulkClear">Clear</button></div>
        <ul class="ac-team m-0 grid list-none gap-2.5 p-0" id="teamList"></ul>
        <p class="ac-small ac-empty" id="teamEmpty" hidden>Nobody matches.</p>
      </div>

      <!-- ACTIVITY (administrators) -->
      <div class="ac-pane grid gap-4" id="paneLog" role="tabpanel" hidden>
        <div class="ac-toolbar grid gap-2 min-[720px]:grid-cols-[minmax(0,1fr)_auto_auto] min-[720px]:items-center"><div class="ac-pills" id="logFilter" role="group" aria-label="Filter the activity"></div></div>
        <ul class="ac-log" id="logList"></ul>
        <p class="ac-small">The latest 100 events, kept for 180 days: sign-ins (good and bad), password and two-step changes, team changes, and what was done with visitor reports.</p>
      </div>

      <!-- editor sheet and one-time password sheet -->
      <div class="ac-sheet" id="sheet" hidden>
        <div class="ac-sheet-back" data-close></div>
        <div class="ac-sheet-card" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
          <div class="ac-sheet-head"><h2 id="sheetTitle"></h2><button type="button" class="ac-x" data-close aria-label="Close">&times;</button></div>
          <div class="ac-sheet-body" id="sheetBody"></div>
          <p class="ac-msg" id="sheetMsg" role="alert"></p>
          <div class="ac-sheet-foot" id="sheetFoot"></div>
        </div>
      </div>
    </div>
  </main>
</div>

<script src="../../Js/Admin/account.js?v=<?= $pageJsVer ?>"></script>
</body>
</html>
