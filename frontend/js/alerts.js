const Alerts = (() => {
  let eventSource = null;

  const ICONS = {
    moisture_low:    { icon: 'moisture',        cls: 'text-warning' },
    rain_expected:   { icon: 'cloud-rain',      cls: 'text-info' },
    device_offline:  { icon: 'plug',            cls: 'text-secondary' },
    device_fault:    { icon: 'exclamation-triangle', cls: 'text-danger' },
    schedule_conflict:{ icon: 'calendar-x',     cls: 'text-warning' },
    system:          { icon: 'gear',            cls: 'text-secondary' },
  };

  async function refresh() {
    try {
      const { unread, alerts } = await API.get('/api/alerts?limit=30');
      updateBadge(unread);
      render(alerts);
    } catch (e) { /* silent on poll */ }
  }

  function updateBadge(unread) {
    const el = document.getElementById('alertUnreadBadge');
    if (unread > 0) {
      el.textContent = unread > 99 ? '99+' : unread;
      el.classList.remove('d-none');
    } else {
      el.classList.add('d-none');
    }
  }

  function render(alerts) {
    const el = document.getElementById('alertsList');
    if (!alerts.length) {
      el.innerHTML = '<div class="text-muted px-3 py-3">No notifications.</div>';
      return;
    }
    el.innerHTML = alerts.map((a) => {
      const meta = ICONS[a.type] || ICONS.system;
      const unreadCls = a.is_read ? '' : 'bg-light';
      return `
        <div class="d-flex gap-2 px-3 py-2 border-bottom ${unreadCls}" data-alert="${a.id}">
          <i class="bi bi-${meta.icon} ${meta.cls} mt-1"></i>
          <div class="flex-grow-1">
            <div>${UI.escapeHtml(a.message)}</div>
            <div class="text-muted small">${UI.fmtTimeAgo(a.created_at)} · <span class="text-uppercase">${UI.escapeHtml(a.type)}</span></div>
          </div>
          <div class="d-flex flex-column align-items-end">
            ${a.is_read ? '' : `<button class="btn btn-link btn-sm p-0" data-read="${a.id}">Mark read</button>`}
            <button class="btn btn-link btn-sm p-0 text-danger" data-del-alert="${a.id}">Delete</button>
          </div>
        </div>`;
    }).join('');

    el.querySelectorAll('[data-read]').forEach((b) => {
      b.addEventListener('click', () => markRead(Number(b.dataset.read)));
    });
    el.querySelectorAll('[data-del-alert]').forEach((b) => {
      b.addEventListener('click', () => remove(Number(b.dataset.delAlert)));
    });
  }

  async function markRead(id) {
    try { await API.post(`/api/alerts/${id}/read`, {}); refresh(); } catch (e) { UI.toast(e.message, 'error'); }
  }
  async function readAll() {
    try { await API.post('/api/alerts/read-all', {}); refresh(); } catch (e) { UI.toast(e.message, 'error'); }
  }
  async function remove(id) {
    try { await API.del(`/api/alerts/${id}`); refresh(); } catch (e) { UI.toast(e.message, 'error'); }
  }

  function openStream() {
    if (eventSource) eventSource.close();
    const token = API.getToken();
    if (!token) return;
    // Token in query is a trade-off — EventSource cannot set Authorization header.
    eventSource = new EventSource(`/api/alerts/stream?token=${encodeURIComponent(token)}`);
    eventSource.addEventListener('alert', (e) => {
      try {
        const alert = JSON.parse(e.data);
        const kind = alert.severity === 'critical' ? 'error'
                   : alert.severity === 'warning'  ? 'warn'
                   : alert.type === 'rain_expected' ? 'info' : 'info';
        UI.toast(alert.message, kind);
        refresh();
      } catch {}
    });
    eventSource.onerror = () => { /* let it auto-reconnect */ };
  }

  function closeStream() {
    if (eventSource) { eventSource.close(); eventSource = null; }
  }

  function init() {
    document.getElementById('markAllReadBtn').addEventListener('click', readAll);
  }

  function start() {
    refresh();
    openStream();
  }

  return { init, refresh, start, stop: closeStream };
})();
