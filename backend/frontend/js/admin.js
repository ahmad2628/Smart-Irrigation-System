const Admin = (() => {
  async function render() {
    try {
      const { logs } = await API.get('/api/admin/logs?limit=200');
      const el = document.getElementById('adminLogsTable');
      if (!logs.length) { el.innerHTML = '<div class="text-muted">No activity logs yet.</div>'; return; }
      el.innerHTML = `
        <table class="table table-sm table-hover small mb-0">
          <thead>
            <tr><th>When (UTC)</th><th>User</th><th>Action</th><th>Entity</th><th>Entity ID</th><th>Details</th></tr>
          </thead>
          <tbody>${logs.map((l) => `
            <tr>
              <td>${UI.escapeHtml(l.created_at)}</td>
              <td>${UI.escapeHtml(l.user_email || '(system)')}</td>
              <td><code>${UI.escapeHtml(l.action)}</code></td>
              <td>${UI.escapeHtml(l.entity || '')}</td>
              <td>${l.entity_id ?? ''}</td>
              <td class="text-muted">${UI.escapeHtml(l.details ? JSON.stringify(l.details) : '')}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    } catch (e) {
      document.getElementById('adminLogsTable').innerHTML = `<div class="alert alert-danger">${UI.escapeHtml(e.message)}</div>`;
    }
  }
  return { render };
})();
