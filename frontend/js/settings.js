const Settings = (() => {
  const LABELS = {
    default_moisture_low:     'Default moisture lower threshold (%)',
    default_moisture_high:    'Default moisture upper threshold (%)',
    rain_skip_threshold:      'Skip irrigation if rain forecast ≥ (%)',
    reading_interval_sec:     'Expected sensor reading interval (s)',
    device_offline_after_sec: 'Mark device offline after no heartbeat (s)',
    max_irrigation_minutes:   'Safety cap per auto-irrigation run (min)',
  };

  async function render() {
    try {
      const { config } = await API.get('/api/admin/config');
      const el = document.getElementById('configFields');
      el.innerHTML = config.map((c) => `
        <div class="row mb-2 align-items-center">
          <label class="col-md-7 col-form-label col-form-label-sm">
            ${UI.escapeHtml(LABELS[c.config_key] || c.config_key)}
            <div class="text-muted small">${UI.escapeHtml(c.config_key)}</div>
          </label>
          <div class="col-md-5">
            <input type="text" class="form-control form-control-sm config-input" data-key="${c.config_key}" value="${UI.escapeHtml(c.config_value)}" />
          </div>
        </div>`).join('');
    } catch (e) {
      document.getElementById('configFields').innerHTML = `<div class="alert alert-danger">${UI.escapeHtml(e.message)}</div>`;
    }
    await renderCrops();
  }

  async function renderCrops() {
    const el = document.getElementById('cropsEditor');
    if (!el) return;
    try {
      const { crops } = await API.get('/api/crops');
      if (!crops.length) { el.innerHTML = '<div class="text-muted small">No crops.</div>'; return; }
      el.innerHTML = `
        <table class="table table-sm small align-middle mb-0">
          <thead class="text-muted"><tr><th>Crop</th><th style="width:80px">Low %</th><th style="width:80px">High %</th><th style="width:120px"></th></tr></thead>
          <tbody>
            ${crops.map((c) => `
              <tr data-crop="${c.id}">
                <td>${UI.escapeHtml(c.name)}</td>
                <td><input type="number" min="0" max="100" step="1" class="form-control form-control-sm crop-low"  value="${Number(c.moisture_threshold_low)}"  /></td>
                <td><input type="number" min="0" max="100" step="1" class="form-control form-control-sm crop-high" value="${Number(c.moisture_threshold_high)}" /></td>
                <td class="text-end">
                  <button class="btn btn-outline-primary btn-sm py-0 px-2" data-save-crop="${c.id}"><i class="bi bi-check"></i></button>
                  <button class="btn btn-outline-danger  btn-sm py-0 px-2" data-del-crop="${c.id}"><i class="bi bi-trash"></i></button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;

      el.querySelectorAll('[data-save-crop]').forEach((b) => {
        b.addEventListener('click', () => saveCrop(Number(b.dataset.saveCrop), b.closest('tr')));
      });
      el.querySelectorAll('[data-del-crop]').forEach((b) => {
        b.addEventListener('click', () => deleteCrop(Number(b.dataset.delCrop)));
      });
    } catch (e) {
      el.innerHTML = `<div class="alert alert-danger small">${UI.escapeHtml(e.message)}</div>`;
    }
  }

  async function saveCrop(id, row) {
    const low  = Number(row.querySelector('.crop-low').value);
    const high = Number(row.querySelector('.crop-high').value);
    try {
      await API.put(`/api/admin/crops/${id}`, {
        moisture_threshold_low:  low,
        moisture_threshold_high: high,
      });
      UI.toast('Crop thresholds saved', 'success');
      renderCrops();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function deleteCrop(id) {
    if (!confirm('Delete this crop? (Will fail if any zone uses it.)')) return;
    try {
      await API.del(`/api/admin/crops/${id}`);
      UI.toast('Crop deleted', 'info');
      renderCrops();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function createCrop(e) {
    e.preventDefault();
    const form = e.currentTarget;
    await UI.busy(form, async () => {
      const body = {
        name: document.getElementById('newCropName').value.trim(),
        moisture_threshold_low:  Number(document.getElementById('newCropLow').value),
        moisture_threshold_high: Number(document.getElementById('newCropHigh').value),
      };
      try {
        await API.post('/api/admin/crops', body);
        UI.toast('Crop added', 'success');
        form.reset();
        renderCrops();
      } catch (err) { UI.toast(err.message, 'error'); }
    });
  }

  async function save(e) {
    e.preventDefault();
    const updates = {};
    document.querySelectorAll('.config-input').forEach((i) => { updates[i.dataset.key] = i.value; });
    try {
      const res = await API.put('/api/admin/config', updates);
      UI.toast(`Saved ${res.updated.length} settings`, 'success');
      render();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function backup(compact) {
    try {
      const url = `/api/admin/backup${compact ? '?compact=true' : ''}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${API.getToken()}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'backup.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 500);
      UI.toast('Backup downloaded', 'success');
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function restore() {
    const file = document.getElementById('restoreFile').files[0];
    const out  = document.getElementById('restoreResult');
    if (!file) { UI.toast('Pick a backup file first', 'warn'); return; }
    if (!confirm('Restore will REPLACE all data in matching tables. Are you sure?')) return;

    try {
      const text = await file.text();
      let dump;
      try { dump = JSON.parse(text); } catch { throw new Error('File is not valid JSON'); }
      const res = await fetch('/api/admin/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API.getToken()}` },
        body: JSON.stringify(dump),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      out.innerHTML = '<div class="alert alert-success small">Restored: <pre class="mb-0">' + UI.escapeHtml(JSON.stringify(data.restored, null, 2)) + '</pre></div>';
      UI.toast('Restore complete', 'success');
    } catch (e) {
      out.innerHTML = `<div class="alert alert-danger small">${UI.escapeHtml(e.message)}</div>`;
    }
  }

  function init() {
    document.getElementById('configForm').addEventListener('submit', save);
    document.getElementById('downloadBackup').addEventListener('click', () => backup(false));
    document.getElementById('downloadCompactBackup').addEventListener('click', () => backup(true));
    document.getElementById('restoreBtn').addEventListener('click', restore);
    document.getElementById('newCropForm').addEventListener('submit', createCrop);
  }
  return { init, render };
})();
