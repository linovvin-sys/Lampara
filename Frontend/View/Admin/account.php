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

      <header class="page-head">
        <div>
          <h1>Your account</h1>
          <p id="acWho">Loading&hellip;</p>
        </div>
      </header>

      <section class="ac-card" aria-labelledby="pwH">
        <h2 id="pwH">Change your password</h2>
        <form id="pwForm" autocomplete="off">
          <label for="pwCur">Current password</label>
          <input id="pwCur" type="password" autocomplete="current-password" required>
          <label for="pwNew">New password <small>(at least 10 characters)</small></label>
          <input id="pwNew" type="password" autocomplete="new-password" minlength="10" required>
          <label for="pwNew2">New password again</label>
          <input id="pwNew2" type="password" autocomplete="new-password" minlength="10" required>
          <button type="submit" class="btn btn-primary">Change password</button>
          <p class="ac-msg" id="pwMsg" role="status"></p>
        </form>
      </section>

      <section class="ac-card" aria-labelledby="tsH">
        <h2 id="tsH">Two-step sign-in</h2>
        <p id="tsState"></p>
        <div id="tsOff" hidden>
          <p>Sign-in will also ask for a 6-digit code from an authenticator app (Google Authenticator, Microsoft Authenticator, Authy). Someone who learns your password still cannot get in.</p>
          <button type="button" class="btn btn-primary" id="tsBegin">Set it up</button>
        </div>
        <div id="tsSetup" hidden>
          <p>In your authenticator app choose <b>Add account</b>, then <b>Enter a setup key</b>, and type this key (spaces do not matter):</p>
          <p class="ac-key" id="tsKey"></p>
          <p class="ac-small">Or open this link on the phone that has the app: <a id="tsLink" href="#">Add to my authenticator</a></p>
          <label for="tsCode">Then type the 6-digit code the app shows</label>
          <input id="tsCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
          <button type="button" class="btn btn-primary" id="tsConfirm">Turn it on</button>
        </div>
        <div id="tsOn" hidden>
          <label for="tsOffPw">To switch it off, type your password</label>
          <input id="tsOffPw" type="password" autocomplete="current-password">
          <label for="tsOffCode">and a current 6-digit code</label>
          <input id="tsOffCode" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code">
          <button type="button" class="btn btn-secondary" id="tsOffBtn">Switch it off</button>
        </div>
        <p class="ac-msg" id="tsMsg" role="status"></p>
        <p class="ac-small">Lost your phone? An administrator can reset it on the server with <code>manage-admins.php reset-2fa</code>.</p>
      </section>

      <section class="ac-card" id="acAccounts" hidden aria-labelledby="acH">
        <h2 id="acH">All accounts</h2>
        <p class="ac-small">Accounts are created, disabled and given roles on the server with <code>Backend/scripts/create-admin.php</code> and <code>manage-admins.php</code>.</p>
        <div class="ac-table"><table><thead><tr><th>Username</th><th>Role</th><th>Status</th><th>Two-step</th><th>Created</th></tr></thead><tbody id="acRows"></tbody></table></div>
      </section>

      <section class="ac-card" id="acAudit" hidden aria-labelledby="auH">
        <h2 id="auH">Security activity</h2>
        <p class="ac-small">The latest 100 events: sign-ins (good and bad), sign-outs, password and two-step changes, and what was done with visitor reports. Kept for 180 days.</p>
        <div class="ac-table"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Details</th><th>From</th></tr></thead><tbody id="auRows"></tbody></table></div>
      </section>
    </div>
  </main>
</div>

<script src="../../Js/Admin/account.js?v=<?= $pageJsVer ?>"></script>
</body>
</html>
