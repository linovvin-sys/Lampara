<?php
require_once __DIR__ . '/../../../Backend/security_headers.php';
$themeVer = filemtime(__DIR__ . '/../../Css/theme.css');
require_once __DIR__ . '/../../../Backend/session_boot.php';
lampara_session_start();
// Already logged in? Skip straight past the login form.
if (!empty($_SESSION['admin_id'])) {
    $next = $_GET['next'] ?? 'dashboard.php';
    header('Location: ' . $next);
    exit;
}
$pageCssVer = filemtime(__DIR__ . '/../../Css/Admin/login.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin Login</title>
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg?v=3">
<link rel="icon" type="image/png" sizes="32x32" href="../../assets/favicon-32.png?v=3">
<link rel="shortcut icon" href="../../assets/favicon.ico?v=3">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/theme.css?v=<?= $themeVer ?>">
<link rel="stylesheet" href="../../Css/Admin/login.css?v=<?= $pageCssVer ?>">
<script src="../../assets/vendor/vue.global.prod.js"></script>
</head>
<body>

<a href="../Public/index.php" class="back-link">
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
  Back to Lampara
</a>

<main class="login">
  <div id="app" v-cloak class="shell">

    <!-- the campus side: who this is for and what it is for -->
    <aside class="about" aria-label="About the admin area">
      <div class="about-in">
        <div class="brand"><span class="logo"><img src="../../assets/logo.svg" alt="" width="26" height="26" aria-hidden="true"></span><span>Lampara</span></div>
        <h2>Keep the campus directory right for every student.</h2>
        <ul>
          <li><span class="check" aria-hidden="true">&#10003;</span>Register and edit buildings and rooms</li>
          <li><span class="check" aria-hidden="true">&#10003;</span>Draw walkways and set building doors</li>
          <li><span class="check" aria-hidden="true">&#10003;</span>Review outdated-info reports from students</li>
        </ul>
      </div>
    </aside>

    <!-- the sign-in form -->
    <section class="panel" aria-labelledby="login-h">
      <div class="panel-in">
        <div class="mark" aria-hidden="true"><img src="../../assets/logo.svg" alt="" width="24" height="24"></div>
        <h1 id="login-h">Admin sign in</h1>
        <p class="sub">Use your administrator account to manage the campus guide.</p>

        <form @submit.prevent="login" novalidate>
          <div class="field">
            <label for="loginUsername">Username</label>
            <input id="loginUsername" name="username" v-model="username" type="text" required autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" autofocus :aria-invalid="!!error" aria-describedby="loginError" placeholder="Your username">
          </div>
          <div class="field">
            <label for="loginPassword">Password</label>
            <div class="password-wrap">
              <input id="loginPassword" name="password" v-model="password" :type="showPassword ? 'text' : 'password'" required autocomplete="current-password" :aria-invalid="!!error" aria-describedby="loginError capsNote" placeholder="Your password" autocapitalize="off" autocorrect="off" spellcheck="false" @keyup="capsCheck" @keydown="capsCheck" @blur="capsOn = false">
              <button type="button" class="password-toggle" @click="showPassword = !showPassword" :aria-label="showPassword ? 'Hide password' : 'Show password'" :aria-pressed="showPassword">
                <svg v-if="!showPassword" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></svg>
                <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>
              </button>
            </div>
            <p id="capsNote" class="caps" v-if="capsOn" role="status">Caps Lock is on.</p>
          </div>

          <div class="field" v-if="needCode">
            <label for="loginCode">6-digit code from your authenticator app</label>
            <input id="loginCode" name="code" v-model="code" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" autocapitalize="off" spellcheck="false" ref="codeBox">
          </div>

          <div id="loginError" role="alert" aria-live="assertive"><p v-if="error" class="form-error">{{ error }}<template v-if="lockSeconds > 0"> Try again in <strong>{{ lockLabel }}</strong>.</template></p></div>

          <button type="submit" class="btn-submit" :class="{ 'is-loading': loading }" :disabled="loading || lockSeconds > 0">
            <span v-if="loading" class="btn-spinner" aria-hidden="true"></span>{{ loading ? 'Signing in…' : (lockSeconds > 0 ? 'Locked for ' + lockLabel : 'Sign in') }}
          </button>
        </form>

        <p class="hint">Need an account? Ask a Lampara administrator to create one for you.</p>
      </div>
    </section>

    <transition name="overlay">
      <div v-if="loading" class="loading-overlay">
        <div class="loading-card">
          <div class="loading-icon">
            <img src="../../assets/logo.svg" alt="" width="25" height="25" style="display:block">
          </div>
          <p>Signing in…</p>
        </div>
      </div>
    </transition>

  </div>
</main>

<script src="../../Js/Admin/login.js"></script>

</body>
</html>
