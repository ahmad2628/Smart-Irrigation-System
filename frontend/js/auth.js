const Auth = (() => {
  function init() {
    document.querySelectorAll('#loginTabs button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#loginTabs button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        document.getElementById('loginForm').classList.toggle('d-none', tab !== 'login');
        document.getElementById('registerForm').classList.toggle('d-none', tab !== 'register');
        document.getElementById('loginError').classList.add('d-none');
      });
    });

    document.getElementById('loginForm').addEventListener('submit', onLogin);
    document.getElementById('registerForm').addEventListener('submit', onRegister);
    document.getElementById('logoutBtn').addEventListener('click', onLogout);
    setupPasswordToggle('toggleLoginPassword', 'loginPassword', 'loginPasswordIcon');
    setupPasswordToggle('toggleRegPassword', 'regPassword', 'regPasswordIcon');
  }

  function setupPasswordToggle(buttonId, inputId, iconId) {
    const btn = document.getElementById(buttonId);
    const input = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    btn.addEventListener('click', () => {
      const isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      icon.classList.toggle('bi-eye', !isHidden);
      icon.classList.toggle('bi-eye-slash', isHidden);
    });
  }

  async function onLogin(e) {
    e.preventDefault();
    showError(null);
    try {
      const email = document.getElementById('loginEmail').value.trim();
      const password = document.getElementById('loginPassword').value;
      const { token, user } = await API.post('/api/auth/login', { email, password });
      API.setToken(token); API.setUser(user);
      App.start();
    } catch (err) { showError(err.message); }
  }

  async function onRegister(e) {
    e.preventDefault();
    showError(null);
    try {
      const name = document.getElementById('regName').value.trim();
      const email = document.getElementById('regEmail').value.trim();
      const password = document.getElementById('regPassword').value;
      await API.post('/api/auth/register', { name, email, password });
      // Auto-login after register
      const { token, user } = await API.post('/api/auth/login', { email, password });
      API.setToken(token); API.setUser(user);
      App.start();
    } catch (err) { showError(err.message); }
  }

  async function onLogout() {
    try { await API.post('/api/auth/logout'); } catch {}
    try { Alerts.stop(); } catch {}
    API.clearToken();
    location.hash = '';
    showLogin();
  }

  function showError(msg) {
    const el = document.getElementById('loginError');
    if (!msg) { el.classList.add('d-none'); el.textContent = ''; return; }
    el.textContent = msg; el.classList.remove('d-none');
  }

  function showLogin() {
    document.getElementById('page-app').classList.add('d-none');
    document.getElementById('page-login').classList.remove('d-none');
  }

  function showApp() {
    document.getElementById('page-login').classList.add('d-none');
    document.getElementById('page-app').classList.remove('d-none');
    const u = API.getUser();
    document.getElementById('userEmail').textContent = u?.email || '';
    const badge = document.getElementById('userRoleBadge');
    badge.textContent = u?.role || '';
  }

  return { init, showLogin, showApp };
})();
