const { createApp } = Vue;

// Showing the login screen means nobody is signed in: drop any saved admin pages
// and data the offline service worker kept from a previous session.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistration('../../sw.js').then((reg) => {
    if (reg && reg.active) reg.active.postMessage({ type: 'clear-private' });
  }).catch(() => {});
}
createApp({
  data() {
    return { username: '', password: '', showPassword: false, capsOn: false, error: '', loading: false, lockSeconds: 0, lockTimer: null };
  },
  computed: {
    lockLabel() {
      const s = this.lockSeconds;
      return s >= 60 ? Math.ceil(s / 60) + ' min' : s + ' s';
    }
  },
  beforeUnmount() { clearInterval(this.lockTimer); },
  methods: {
    // Tells the user when Caps Lock is on while typing the password (a common reason for a failed sign-in).
    capsCheck(e) { this.capsOn = !!(e.getModifierState && e.getModifierState('CapsLock')); },
    startLock(seconds) {
      clearInterval(this.lockTimer);
      this.lockSeconds = seconds;
      this.lockTimer = setInterval(() => {
        this.lockSeconds = Math.max(0, this.lockSeconds - 1);
        if (this.lockSeconds === 0) { clearInterval(this.lockTimer); this.error = ''; }
      }, 1000);
    },
    async login() {
      if (this.lockSeconds > 0) return;
      this.loading = true;
      this.error = '';
      try {
        const res = await fetch('../../../Backend/api/admin_login.php', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username: this.username, password: this.password })
        });
        const data = await res.json();
        if (data.success) {
          const params = new URLSearchParams(window.location.search);
          window.location.href = params.get('next') || 'dashboard.php';
        } else {
          if (data.retry_after) {
            this.startLock(data.retry_after);
            this.error = 'Too many failed attempts.';
          } else if (typeof data.attempts_left === 'number' && data.attempts_left <= 3 && data.attempts_left > 0) {
            this.error = (data.error || 'Login failed.') + ' ' + data.attempts_left + ' ' + (data.attempts_left === 1 ? 'try' : 'tries') + ' left before a 10 minute lock.';
          } else {
            this.error = data.error || 'Login failed.';
          }
        }
      } catch (e) {
        this.error = "Couldn't reach the server — check your connection.";
      } finally {
        this.loading = false;
      }
    }
  }
}).mount('#app');
