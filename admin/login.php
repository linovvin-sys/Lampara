<?php
if (session_status() !== PHP_SESSION_ACTIVE) {
    session_start();
}
// Already logged in? Skip straight past the login form.
if (!empty($_SESSION['admin_id'])) {
    $next = $_GET['next'] ?? 'manage-buildings.php';
    header('Location: ' . $next);
    exit;
}
$cssVer = filemtime(__DIR__ . '/../assets/css/tailwind.css');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Lampara — Admin Login</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../assets/css/tailwind.css?v=<?= $cssVer ?>">
<script src="https://unpkg.com/vue@3/dist/vue.global.js"></script>
<style>body { font-family: 'Outfit', sans-serif; }
.lamp-glow { filter: drop-shadow(0 0 18px rgba(245, 158, 11, 0.55)); }</style>
</head>
<body class="bg-zinc-950 min-h-screen">

<div id="app" class="min-h-screen flex items-center justify-center px-5 py-10">
  <div class="w-full max-w-sm">
    <div class="text-center mb-8">
      <div class="w-14 h-14 mx-auto mb-5 rounded-2xl bg-amber-500 flex items-center justify-center lamp-glow">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none"><path d="M9 3h6l1.5 6.5a4.5 4.5 0 0 1-9 0L9 3Z" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 21h4M11 18v3M13 18v3" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
      </div>
      <h1 class="text-white text-2xl font-bold">Admin Login</h1>
      <p class="text-white/50 text-sm mt-1.5">Register and manage buildings &amp; rooms</p>
    </div>

    <form @submit.prevent="login" class="space-y-3.5">
      <div>
        <label class="block text-xs font-medium text-white/50 mb-1.5">Username</label>
        <input v-model="username" type="text" required autocapitalize="off" autocorrect="off"
               class="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3.5 text-white text-base placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent">
      </div>
      <div>
        <label class="block text-xs font-medium text-white/50 mb-1.5">Password</label>
        <input v-model="password" type="password" required
               class="w-full bg-white/5 border border-white/15 rounded-xl px-4 py-3.5 text-white text-base placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent">
      </div>

      <p v-if="error" class="text-red-400 text-sm font-medium pt-1">{{ error }}</p>

      <button type="submit" :disabled="loading"
              class="w-full bg-amber-500 hover:bg-amber-400 active:scale-[0.98] text-zinc-900 rounded-xl px-6 py-3.5 font-semibold text-base transition disabled:opacity-50 shadow-lg shadow-amber-500/25 mt-2">
        {{ loading ? 'Signing in…' : 'Sign In' }}
      </button>
    </form>

    <p class="text-center text-white/30 text-xs mt-8">
      No account yet? Run <code class="text-white/50">php create-admin.php</code> from the project folder on your computer.
    </p>
  </div>
</div>

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
          window.location.href = params.get('next') || 'manage-buildings.php';
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
