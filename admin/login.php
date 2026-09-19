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
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin Login</title>
<link rel="icon" type="image/svg+xml" href="../assets/favicon.svg">
<meta name="theme-color" content="#ffffff">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>
  :root {
    --green-50:  #f0fdf4;
    --green-100: #dcfce7;
    --green-200: #bbf7d0;
    --green-500: #22c55e;
    --green-600: #16a34a;
    --green-700: #15803d;
    --green-800: #14532d;
    --ink:       #14251c;
    --muted:     #5b6b63;
    --line:      #e3ede6;
  }

  * { box-sizing: border-box; }

  html, body { margin: 0; min-height: 100%; }
  body {
    font-family: 'Outfit', sans-serif;
    color: var(--ink);
    background: #ffffff;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
  }

  .backdrop {
    position: fixed;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(560px 380px at 12% -6%, var(--green-100), transparent 60%),
      radial-gradient(480px 420px at 100% 8%, var(--green-200), transparent 58%),
      radial-gradient(520px 460px at 100% 100%, var(--green-50), transparent 55%),
      #ffffff;
  }

  main {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 3.5rem 1.25rem 2rem;
  }

  .back-link {
    position: fixed;
    top: 1.25rem;
    left: 1.25rem;
    z-index: 20;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--muted);
    text-decoration: none;
    background: rgba(255, 255, 255, 0.9);
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
  }
  .back-link:hover { color: var(--ink); }

  .card {
    width: 100%;
    max-width: 26rem;
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 1.5rem;
    overflow: hidden;
    box-shadow: 0 24px 48px -24px rgba(20, 37, 28, 0.18);
  }

  /* ---- Left/top half: description ---- */
  .card-about {
    background: linear-gradient(150deg, var(--green-500) 0%, var(--green-600) 45%, var(--green-800) 100%);
    color: #ffffff;
    padding: 2rem 1.75rem;
  }

  .card-about .logo {
    width: 3rem;
    height: 3rem;
    margin-bottom: 1.25rem;
    border-radius: 0.9rem;
    background: rgba(255, 255, 255, 0.16);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .card-about h1 {
    font-size: 1.5rem;
    line-height: 1.25;
    margin: 0 0 0.6rem;
  }

  .card-about p {
    color: rgba(255, 255, 255, 0.85);
    font-size: 0.875rem;
    line-height: 1.6;
    margin: 0 0 1.25rem;
  }

  .card-about ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .card-about li {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    font-size: 0.8125rem;
    color: rgba(255, 255, 255, 0.92);
    line-height: 1.5;
  }

  .card-about li .check {
    flex-shrink: 0;
    width: 1.125rem;
    height: 1.125rem;
    margin-top: 0.05rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.22);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* ---- Right/bottom half: form ---- */
  .card-form {
    padding: 2rem 1.75rem 1.75rem;
  }

  .field { margin-bottom: 1rem; }

  .field label {
    display: block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--muted);
    margin-bottom: 0.4rem;
  }

  .field input {
    width: 100%;
    padding: 0.8rem 0.9rem;
    font-size: 0.9375rem;
    font-family: inherit;
    color: var(--ink);
    background: #ffffff;
    border: 1px solid var(--line);
    border-radius: 0.75rem;
    transition: border-color 160ms ease-out, box-shadow 160ms ease-out;
  }
  .field input:focus {
    outline: none;
    border-color: var(--green-500);
    box-shadow: 0 0 0 3px var(--green-100);
  }

  .form-error {
    color: #b91c1c;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 0.75rem;
    padding: 0.6rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 500;
    margin-bottom: 1rem;
  }

  .btn-submit {
    width: 100%;
    padding: 0.9rem 1rem;
    border: none;
    border-radius: 999px;
    background: var(--green-600);
    color: #ffffff;
    font-family: inherit;
    font-weight: 600;
    font-size: 0.9375rem;
    cursor: pointer;
    box-shadow: 0 10px 24px -8px rgba(22, 163, 74, 0.45);
    transition: transform 160ms ease-out, filter 160ms ease-out, opacity 160ms ease-out;
  }
  .btn-submit:hover { filter: brightness(1.06); }
  .btn-submit:active { transform: scale(0.98); }
  .btn-submit:disabled { opacity: 0.6; cursor: default; }

  .hint {
    text-align: center;
    color: var(--muted);
    font-size: 0.75rem;
    line-height: 1.6;
    margin: 1.25rem 0 0;
  }

  .hint code {
    background: var(--green-50);
    color: var(--green-700);
    padding: 0.1rem 0.35rem;
    border-radius: 0.35rem;
    font-size: 0.7rem;
  }

  @keyframes fade-up {
    from { opacity: 0; transform: translateY(12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .fade-up { animation: fade-up 480ms cubic-bezier(0.23, 1, 0.32, 1) both; }

  /* Desktop: card splits side by side instead of stacked. */
  @media (min-width: 768px) {
    .card {
      max-width: 46rem;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .card-about { padding: 3rem 2.5rem; display: flex; flex-direction: column; justify-content: center; }
    .card-form { padding: 3rem 2.75rem; display: flex; flex-direction: column; justify-content: center; }
  }
</style>
</head>
<body>

<div class="backdrop"></div>

<a href="../index.php" class="back-link">&larr; Back to Lampara</a>

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

        <button type="submit" class="btn-submit" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign In' }}
        </button>
      </form>

      <p class="hint">
        No account yet? Run <code>php create-admin.php</code> from the project folder on your computer.
      </p>
    </div>

  </div>
</main>

<script>
const { createApp } = Vue;
createApp({
  data() {
    return { username: '', password: '', error: '', loading: false };
  },
  methods: {
    async login() {
      this.loading = true;
      this.error = '';
      try {
        const res = await fetch('../api/admin_login.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: this.username, password: this.password })
        });
        const data = await res.json();
        if (data.success) {
          const params = new URLSearchParams(window.location.search);
          window.location.href = params.get('next') || 'dashboard.php';
        } else {
          this.error = data.error || 'Login failed.';
        }
      } catch (e) {
        this.error = "Couldn't reach the server — check your connection.";
      } finally {
        this.loading = false;
      }
    }
  }
}).mount('#app');
</script>

</body>
</html>
