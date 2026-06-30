const App = (() => {
  const sections = ['overview', 'fields', 'devices', 'schedules', 'weather', 'history', 'reports', 'admin', 'settings'];

  function init() {
    Auth.init();
    Fields.init();
    Devices.init();
    Schedules.init();
    Reports.init();
    Alerts.init();
    Settings.init();

    document.querySelectorAll('.sidebar-link').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        show(a.dataset.section);
      });
    });

    if (API.getToken()) start();
    else Auth.showLogin();
  }

  function start() {
    Auth.showApp();
    const user = API.getUser();
    const isAdmin = user?.role === 'admin';
    document.getElementById('adminNav').classList.toggle('d-none', !isAdmin);
    document.getElementById('settingsNav').classList.toggle('d-none', !isAdmin);
    Alerts.start();
    const initial = (location.hash || '#overview').replace('#', '');
    show(sections.includes(initial) ? initial : 'overview');
  }

  function show(name) {
    location.hash = name;
    sections.forEach((s) => {
      document.getElementById(`section-${s}`).classList.toggle('d-none', s !== name);
    });
    document.querySelectorAll('.sidebar-link').forEach((a) => {
      a.classList.toggle('active', a.dataset.section === name);
    });

    // Section-specific lifecycle
    if (name === 'overview') Overview.start();
    else Overview.stop();

    if (name === 'fields')    Fields.render();
    if (name === 'devices')   Devices.render();
    if (name === 'schedules') Schedules.render();
    if (name === 'weather')   Weather.render();
    if (name === 'history')   History.render();
    if (name === 'reports')   Reports.render();
    if (name === 'admin')     Admin.render();
    if (name === 'settings')  Settings.render();
  }

  // expose to other modules
  window.addEventListener('DOMContentLoaded', init);
  return { start };
})();
