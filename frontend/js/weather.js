const Weather = (() => {
  async function render() {
    const cur = document.getElementById('weatherCurrent');
    const fc  = document.getElementById('weatherForecast');
    cur.innerHTML = '<div class="text-muted small">Loading…</div>';
    fc.innerHTML  = '<div class="text-muted small">Loading…</div>';

    try {
      const current = await API.get('/api/weather/current').catch((e) => ({ error: e.message }));
      if (current?.error) {
        cur.innerHTML = `<div class="alert alert-warning small mb-0">${UI.escapeHtml(current.error)}</div>`;
      } else {
        const d = current.data || {};
        cur.innerHTML = `
          <div class="d-flex justify-content-between"><span>Temperature</span><strong>${d.temperature_c ?? '—'} °C</strong></div>
          <div class="d-flex justify-content-between"><span>Humidity</span><strong>${d.humidity_pct ?? '—'} %</strong></div>
          <div class="d-flex justify-content-between"><span>Wind</span><strong>${d.wind_kph ?? '—'} kph</strong></div>
          <div class="d-flex justify-content-between"><span>Rain (last hr)</span><strong>${d.rain_mm ?? 0} mm</strong></div>
          <div class="d-flex justify-content-between text-capitalize"><span>Conditions</span><strong>${UI.escapeHtml(d.condition_text || '—')}</strong></div>
          <div class="small text-muted mt-2">source: ${UI.escapeHtml(current.source || '?')} · ${UI.escapeHtml(current.location || '')}</div>`;
      }

      const forecast = await API.get('/api/weather/forecast?hours=24').catch((e) => ({ error: e.message }));
      if (forecast?.error) {
        fc.innerHTML = `<div class="alert alert-warning small mb-0">${UI.escapeHtml(forecast.error)}</div>`;
      } else {
        const slots = forecast.slots || [];
        const skip  = (forecast.peakRainProbability ?? 0) >= 60;
        const rows = slots.map((s) => `
          <tr>
            <td>${UI.escapeHtml(s.forecast_for)}</td>
            <td>${s.temperature_c ?? '—'} °C</td>
            <td>${s.humidity_pct ?? '—'} %</td>
            <td><span class="${Number(s.rain_probability) >= 60 ? 'fw-bold text-info' : ''}">${s.rain_probability ?? 0} %</span></td>
            <td class="text-capitalize">${UI.escapeHtml(s.condition_text || '')}</td>
          </tr>`).join('');

        fc.innerHTML = `
          <div class="mb-2">
            <strong>Peak rain probability:</strong> ${forecast.peakRainProbability ?? 0}%
            ${skip ? '<span class="badge text-bg-info ms-2">Engine will skip auto irrigation</span>' : ''}
          </div>
          <div class="table-responsive">
            <table class="table table-sm small">
              <thead><tr><th>Time (UTC)</th><th>Temp</th><th>Humidity</th><th>Rain %</th><th>Conditions</th></tr></thead>
              <tbody>${rows || '<tr><td colspan="5" class="text-muted">No forecast data.</td></tr>'}</tbody>
            </table>
          </div>
          <div class="small text-muted">source: ${UI.escapeHtml(forecast.source || '?')}</div>`;
      }
    } catch (e) { UI.toast(e.message, 'error'); }
  }
  return { render };
})();
