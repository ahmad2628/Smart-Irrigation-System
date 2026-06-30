const Schedules = (() => {
  async function render() {
    try {
      const [{ schedules }, { zones }] = await Promise.all([
        API.get('/api/schedules'),
        API.get('/api/zones'),
      ]);

      const el = document.getElementById('schedulesList');
      el.innerHTML = schedules.length
        ? schedules.map((s) => `
          <div class="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <div class="fw-semibold">${UI.escapeHtml(s.zone_name)} · ${UI.escapeHtml(s.start_time)} UTC · ${s.duration_minutes} min</div>
              <div class="small text-muted">repeats: ${UI.escapeHtml(s.repeat_days || 'daily')} · ${s.is_active ? 'active' : 'paused'}</div>
            </div>
            <div class="d-flex gap-2">
              <button class="btn btn-outline-secondary btn-sm" data-toggle-sched="${s.id}" data-active="${s.is_active}">
                <i class="bi bi-${s.is_active ? 'pause' : 'play'}-circle"></i>
              </button>
              <button class="btn btn-outline-danger btn-sm" data-del-sched="${s.id}"><i class="bi bi-trash"></i></button>
            </div>
          </div>`).join('')
        : '<div class="text-muted small">No schedules yet.</div>';

      el.querySelectorAll('[data-del-sched]').forEach((b) => {
        b.addEventListener('click', () => del(Number(b.dataset.delSched)));
      });
      el.querySelectorAll('[data-toggle-sched]').forEach((b) => {
        b.addEventListener('click', () => toggle(Number(b.dataset.toggleSched), b.dataset.active === '1'));
      });

      const sel = document.getElementById('schedZone');
      sel.innerHTML = zones.map((z) => `<option value="${z.id}">${UI.escapeHtml(z.name)} (${UI.escapeHtml(z.field_name || '')})</option>`).join('');
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function create(e) {
    e.preventDefault();
    const form = e.currentTarget;
    await UI.busy(form, async () => {
      const body = {
        zone_id: Number(document.getElementById('schedZone').value),
        start_time: document.getElementById('schedStart').value,        // HH:MM
        duration_minutes: Number(document.getElementById('schedDuration').value),
        repeat_days: document.getElementById('schedDays').value.trim() || 'daily',
      };
      try {
        await API.post('/api/schedules', body);
        UI.toast('Schedule created', 'success');
        form.reset();
        document.getElementById('schedDays').value = 'daily';
        render();
      } catch (err) { UI.toast(err.message, 'error'); }
    });
  }

  async function toggle(id, currentlyActive) {
    try {
      await API.put(`/api/schedules/${id}`, { is_active: !currentlyActive });
      UI.toast('Schedule updated', 'info');
      render();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function del(id) {
    if (!confirm('Delete this schedule?')) return;
    try { await API.del(`/api/schedules/${id}`); UI.toast('Schedule deleted', 'info'); render(); }
    catch (e) { UI.toast(e.message, 'error'); }
  }

  function init() {
    document.getElementById('scheduleForm').addEventListener('submit', create);
  }
  return { init, render };
})();
