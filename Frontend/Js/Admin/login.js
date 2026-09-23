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
