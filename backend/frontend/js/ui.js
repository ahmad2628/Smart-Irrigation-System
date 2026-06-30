const UI = (() => {
  function toast(message, kind = 'info') {
    const id = `t${Date.now()}${Math.random().toString(36).slice(2, 5)}`;
    const bg = { success: 'text-bg-success', error: 'text-bg-danger', info: 'text-bg-primary', warn: 'text-bg-warning' }[kind] || 'text-bg-primary';
    const html = `
      <div id="${id}" class="toast ${bg} mb-2" role="alert">
        <div class="d-flex">
          <div class="toast-body">${escapeHtml(message)}</div>
          <button class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
        </div>
      </div>`;
    document.getElementById('globalToast').insertAdjacentHTML('beforeend', html);
    const el = document.getElementById(id);
    const t = bootstrap.Toast.getOrCreateInstance(el, { delay: 3500 });
    t.show();
    el.addEventListener('hidden.bs.toast', () => el.remove());
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmtPct(v) {
    if (v == null) return '—';
    return `${Number(v).toFixed(1)}%`;
  }

  function fmtTimeAgo(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'string' ? ts.replace(' ', 'T') + 'Z' : ts);
    const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (sec < 60) return `${sec}s ago`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
  }

  function fmtDateTime(ts) {
    if (!ts) return '—';
    const d = new Date(typeof ts === 'string' ? ts.replace(' ', 'T') + 'Z' : ts);
    return d.toLocaleString();
  }

  // Disable the form's submit button while `fn()` runs to avoid double-clicks.
  async function busy(form, fn) {
    const btn = form.querySelector('button[type="submit"], button:not([type])');
    const prev = btn?.innerHTML;
    if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Working…`; }
    try { return await fn(); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = prev; } }
  }

  return { toast, escapeHtml, fmtPct, fmtTimeAgo, fmtDateTime, busy };
})();
