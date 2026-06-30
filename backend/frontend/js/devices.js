const Devices = (() => {
  async function render() {
    try {
      const [{ devices }, { zones }] = await Promise.all([
        API.get('/api/devices'),
        API.get('/api/zones'),
      ]);

      const el = document.getElementById('devicesList');
      el.innerHTML = devices.length
        ? devices.map((d) => `
          <div class="list-group-item d-flex justify-content-between align-items-center">
            <div>
              <div class="fw-semibold">${UI.escapeHtml(d.name)}
                <span class="badge text-bg-light ms-1">${UI.escapeHtml(d.type)}</span>
                <span class="small ms-2"><span class="dot ${d.status === 'online' ? 'dot-online' : 'dot-offline'}"></span>${d.status}</span>
              </div>
              <div class="small text-muted">
                ${d.zone_name ? `Zone: ${UI.escapeHtml(d.zone_name)}` : '(no zone)'}
                · last seen ${UI.fmtTimeAgo(d.last_heartbeat)}
              </div>
            </div>
            <button class="btn btn-outline-danger btn-sm" data-del-device="${d.id}"><i class="bi bi-trash"></i></button>
          </div>`).join('')
        : '<div class="text-muted small">No devices yet. Register one →</div>';

      el.querySelectorAll('[data-del-device]').forEach((b) => {
        b.addEventListener('click', () => deleteDevice(Number(b.dataset.delDevice)));
      });

      const zSel = document.getElementById('deviceZone');
      zSel.innerHTML = '<option value="">— Zone —</option>'
        + zones.map((z) => `<option value="${z.id}">${UI.escapeHtml(z.name)} (${UI.escapeHtml(z.field_name || '')})</option>`).join('');
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  }

  async function registerDevice(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const zoneId = Number(document.getElementById('deviceZone').value);
    if (!zoneId) return UI.toast('Pick a zone first', 'warn');
    await UI.busy(form, async () => {
      const body = {
        name: document.getElementById('deviceName').value.trim(),
        type: document.getElementById('deviceType').value,
        zone_id: zoneId,
      };
      try {
        const { device } = await API.post('/api/devices', body);
        UI.toast('Device registered', 'success');
        const out = document.getElementById('deviceKeyOutput');
        document.getElementById('deviceKeyValue').textContent = device.device_key;
        out.classList.remove('d-none');
        form.reset();
        render();
      } catch (err) { UI.toast(err.message, 'error'); }
    });
  }

  async function deleteDevice(id) {
    if (!confirm('Delete this device?')) return;
    try { await API.del(`/api/devices/${id}`); UI.toast('Device deleted', 'info'); render(); }
    catch (e) { UI.toast(e.message, 'error'); }
  }

  function init() {
    document.getElementById('deviceForm').addEventListener('submit', registerDevice);
  }

  return { init, render };
})();
