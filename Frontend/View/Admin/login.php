<?php
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
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
<link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../../Css/Admin/login.css?v=<?= $pageCssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
</head>
<body>

<div class="backdrop"></div>

<a href="../Public/index.php" class="back-link">&larr; Back to Lampara</a>

<main>
  <div id="app" class="card fade-up">

    <div class="card-about">
      <div class="logo">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
      </div>
      <h1>Admin Login</h1>
      <p>Sign in to manage the campus directory that powers every student's guide.</p>
      <ul>
        <li><span class="check">&#10003;</span> Register and edit buildings &amp; rooms</li>
        <li><span class="check">&#10003;</span> Keep office hours and floors accurate</li>
        <li><span class="check">&#10003;</span> Review outdated-info reports from students</li>
      </ul>
    </div>

    <div class="card-form">
      <form @submit.prevent="login">
        <div class="field">
          <label>Username</label>
          <input v-model="username" type="text" required autocapitalize="off" autocorrect="off" placeholder="Enter your username">
        </div>
        <div class="field">
          <label>Password</label>
          <input v-model="password" type="password" required placeholder="Enter your password">
        </div>

        <p v-if="error" class="form-error">{{ error }}</p>

        <button type="submit" class="btn-submit" :class="{ 'is-loading': loading }" :disabled="loading">
          <span v-if="loading" class="btn-spinner"></span>{{ loading ? 'Signing in…' : 'Sign In' }}
        </button>
      </form>

      <p class="hint">
        No account yet? Run <code>php Backend/scripts/create-admin.php</code> from the project folder on your computer.
      </p>
    </div>

    <transition name="overlay">
      <div v-if="loading" class="loading-overlay">
        <div class="loading-card">
          <div class="loading-icon">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
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
