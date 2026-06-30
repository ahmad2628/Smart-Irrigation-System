const Fields = (() => {
  let cachedFields = [];
  let cachedZones  = [];
  let cachedCrops  = [];

  async function render() {
    try {
      const [{ fields }, { zones }, { crops }] = await Promise.all([
        API.get('/api/fields'),
        API.get('/api/zones'),
        API.get('/api/crops'),
      ]);
      cachedFields = fields; cachedZones = zones; cachedCrops = crops;

      renderFieldsList();
      renderZonesList();
      populateZoneFormDropdowns();
    } catch (e) {
      UI.toast(e.message, 'error');
    }
  }

  function renderFieldsList() {
    const el = document.getElementById('fieldsList');
    if (!cachedFields.length) { el.innerHTML = '<div class="text-muted small">No fields yet.</div>'; return; }
    el.innerHTML = cachedFields.map((f) => `
      <div class="list-group-item d-flex justify-content-between align-items-center">
        <div>
          <div class="fw-semibold">${UI.escapeHtml(f.name)}</div>
          <div class="small text-muted">
            ${f.size_acres ? `${f.size_acres} acres` : ''}${f.soil_type ? ` · ${UI.escapeHtml(f.soil_type)}` : ''}${f.location ? ` · ${UI.escapeHtml(f.location)}` : ''}
          </div>
        </div>
        <button class="btn btn-outline-danger btn-sm" data-del-field="${f.id}"><i class="bi bi-trash"></i></button>
      </div>
    `).join('');
    el.querySelectorAll('[data-del-field]').forEach((b) => {
      b.addEventListener('click', () => deleteField(Number(b.dataset.delField)));
    });
  }

  function renderZonesList() {
    const el = document.getElementById('zonesList');
    if (!cachedZones.length) { el.innerHTML = '<div class="text-muted small">No zones yet.</div>'; return; }
    el.innerHTML = cachedZones.map((z) => {
      const lowVal  = z.zone_threshold_low  != null ? Number(z.zone_threshold_low)  : '';
      const highVal = z.zone_threshold_high != null ? Number(z.zone_threshold_high) : '';
      const effLow  = z.moisture_threshold_low  != null ? Number(z.moisture_threshold_low)  : '—';
      const effHigh = z.moisture_threshold_high != null ? Number(z.moisture_threshold_high) : '—';
      const override = z.zone_threshold_low != null || z.zone_threshold_high != null;
      return `
      <div class="list-group-item" data-zone-row="${z.id}">
        <div class="d-flex justify-content-between align-items-start">
          <div>
            <div class="fw-semibold">${UI.escapeHtml(z.name)}
              ${override ? '<span class="badge text-bg-warning ms-1" title="Per-zone override active">custom</span>' : ''}
            </div>
            <div class="small text-muted">
              ${UI.escapeHtml(z.field_name || '')}
              ${z.area_sqm ? ` · ${z.area_sqm} m²` : ''}
              ${z.crop_name ? ` · <span class="badge text-bg-light">${UI.escapeHtml(z.crop_name)}</span>` : ''}
              · effective ${effLow}% – ${effHigh}%
            </div>
          </div>
          <div class="d-flex gap-2 align-items-center">
            <select class="form-select form-select-sm" data-set-crop="${z.id}" style="width:auto">
              <option value="">— change crop —</option>
              ${cachedCrops.map((c) => `<option value="${c.id}" ${c.id === z.crop_id ? 'selected' : ''}>${UI.escapeHtml(c.name)}</option>`).join('')}
            </select>
            <button class="btn btn-outline-danger btn-sm" data-del-zone="${z.id}"><i class="bi bi-trash"></i></button>
          </div>
        </div>
        <div class="row g-2 mt-2 align-items-center small">
          <div class="col-auto text-muted">Override</div>
          <div class="col-auto"><input type="number" min="0" max="100" class="form-control form-control-sm zone-low"  data-zone="${z.id}" value="${lowVal}"  placeholder="(crop)" style="width:90px"/></div>
          <div class="col-auto text-muted">–</div>
          <div class="col-auto"><input type="number" min="0" max="100" class="form-control form-control-sm zone-high" data-zone="${z.id}" value="${highVal}" placeholder="(crop)" style="width:90px"/></div>
          <div class="col-auto">
            <button class="btn btn-outline-primary btn-sm py-0 px-2" data-save-zone-thresh="${z.id}"><i class="bi bi-check"></i> Save</button>
            ${override ? `<button class="btn btn-link btn-sm py-0 px-1 text-muted" data-clear-zone-thresh="${z.id}">clear</button>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
    el.querySelectorAll('[data-del-zone]').forEach((b) => {
      b.addEventListener('click', () => deleteZone(Number(b.dataset.delZone)));
    });
    el.querySelectorAll('[data-set-crop]').forEach((s) => {
      s.addEventListener('change', () => assignCrop(Number(s.dataset.setCrop), s.value));
    });
    el.querySelectorAll('[data-save-zone-thresh]').forEach((b) => {
      b.addEventListener('click', () => saveZoneThreshold(Number(b.dataset.saveZoneThresh)));
    });
    el.querySelectorAll('[data-clear-zone-thresh]').forEach((b) => {
      b.addEventListener('click', () => clearZoneThreshold(Number(b.dataset.clearZoneThresh)));
    });
  }

  async function saveZoneThreshold(zoneId) {
    const row = document.querySelector(`[data-zone-row="${zoneId}"]`);
    const lowStr  = row.querySelector('.zone-low').value.trim();
    const highStr = row.querySelector('.zone-high').value.trim();
    const body = {
      moisture_threshold_low:  lowStr  === '' ? null : Number(lowStr),
      moisture_threshold_high: highStr === '' ? null : Number(highStr),
    };
    try {
      await API.put(`/api/zones/${zoneId}`, body);
      UI.toast('Override saved', 'success');
      render();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function clearZoneThreshold(zoneId) {
    try {
      await API.put(`/api/zones/${zoneId}`, {
        moisture_threshold_low: null,
        moisture_threshold_high: null,
      });
      UI.toast('Override cleared — using crop default', 'info');
      render();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  function populateZoneFormDropdowns() {
    const fSel = document.getElementById('zoneField');
    fSel.innerHTML = cachedFields.length
      ? cachedFields.map((f) => `<option value="${f.id}">${UI.escapeHtml(f.name)}</option>`).join('')
      : '<option value="">(create a field first)</option>';

    const cSel = document.getElementById('zoneCrop');
    cSel.innerHTML = '<option value="">— Crop (optional) —</option>'
      + cachedCrops.map((c) => `<option value="${c.id}">${UI.escapeHtml(c.name)}</option>`).join('');
  }

  // -- Actions --------------------------------------------------------
  async function createField(e) {
    e.preventDefault();
    const form = e.currentTarget;
    await UI.busy(form, async () => {
      const body = {
        name:        document.getElementById('fieldName').value.trim(),
        size_acres:  parseFloat(document.getElementById('fieldSize').value) || null,
        soil_type:   document.getElementById('fieldSoil').value.trim() || null,
        location:    document.getElementById('fieldLocation').value.trim() || null,
      };
      try {
        await API.post('/api/fields', body);
        UI.toast('Field created', 'success');
        form.reset();
        render();
      } catch (err) { UI.toast(err.message, 'error'); }
    });
  }

  async function createZone(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const fieldId = Number(document.getElementById('zoneField').value);
    if (!fieldId) return UI.toast('Pick a field first', 'warn');
    await UI.busy(form, async () => {
      const lowStr  = document.getElementById('zoneTLow').value.trim();
      const highStr = document.getElementById('zoneTHigh').value.trim();
      const body = {
        name:     document.getElementById('zoneName').value.trim(),
        area_sqm: parseFloat(document.getElementById('zoneArea').value) || null,
        crop_id:  Number(document.getElementById('zoneCrop').value) || null,
        moisture_threshold_low:  lowStr  === '' ? null : Number(lowStr),
        moisture_threshold_high: highStr === '' ? null : Number(highStr),
      };
      try {
        await API.post(`/api/fields/${fieldId}/zones`, body);
        UI.toast('Zone created', 'success');
        form.reset();
        render();
      } catch (err) { UI.toast(err.message, 'error'); }
    });
  }

  async function deleteField(id) {
    if (!confirm('Delete this field and all its zones?')) return;
    try { await API.del(`/api/fields/${id}`); UI.toast('Field deleted', 'info'); render(); }
    catch (e) { UI.toast(e.message, 'error'); }
  }

  async function deleteZone(id) {
    if (!confirm('Delete this zone?')) return;
    try { await API.del(`/api/zones/${id}`); UI.toast('Zone deleted', 'info'); render(); }
    catch (e) { UI.toast(e.message, 'error'); }
  }

  async function assignCrop(zoneId, cropId) {
    if (!cropId) return;
    try {
      await API.post(`/api/zones/${zoneId}/crop`, { crop_id: Number(cropId) });
      UI.toast('Crop assigned', 'success');
      render();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  function init() {
    document.getElementById('fieldForm').addEventListener('submit', createField);
    document.getElementById('zoneForm').addEventListener('submit', createZone);
  }

  return { init, render };
})();
