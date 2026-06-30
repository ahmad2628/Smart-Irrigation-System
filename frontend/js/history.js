const History = (() => {
  let chart = null;

  async function render() {
    try {
      const { zones } = await API.get('/api/zones');
      const sel = document.getElementById('historyZone');
      sel.innerHTML = zones.map((z) => `<option value="${z.id}">${UI.escapeHtml(z.name)}</option>`).join('');
      if (!zones.length) {
        document.getElementById('eventsList').innerHTML = '<div class="text-muted">No zones yet.</div>';
        if (chart) { chart.destroy(); chart = null; }
        return;
      }
      sel.onchange = () => renderZone(Number(sel.value));
      await renderZone(Number(sel.value || zones[0].id));
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function renderZone(zoneId) {
    const [readings, events] = await Promise.all([
      API.get(`/api/zones/${zoneId}/readings?limit=100`),
      API.get(`/api/zones/${zoneId}/irrigation?limit=20`),
    ]);

    drawChart(readings.readings || []);
    drawEvents(events.events || []);
  }

  function drawChart(readings) {
    const ordered = [...readings].reverse(); // oldest → newest
    const labels = ordered.map((r) => r.recorded_at.slice(11, 19));
    const moist  = ordered.map((r) => Number(r.moisture_pct));
    const hum    = ordered.map((r) => Number(r.humidity_pct));
    const lvl    = ordered.map((r) => Number(r.water_level));

    const ctx = document.getElementById('readingsChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Moisture %', data: moist, borderColor: '#0d6efd', tension: 0.2 },
          { label: 'Humidity %', data: hum,   borderColor: '#20c997', tension: 0.2 },
          { label: 'Water level', data: lvl,  borderColor: '#ffc107', tension: 0.2 },
        ],
      },
      options: {
        responsive: true,
        animation: false,
        scales: { y: { beginAtZero: true, max: 100 } },
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  function drawEvents(events) {
    const el = document.getElementById('eventsList');
    if (!events.length) { el.innerHTML = '<div class="text-muted">No irrigation events.</div>'; return; }
    el.innerHTML = `
      <table class="table table-sm small mb-0">
        <thead><tr><th>Triggered</th><th>Reason</th><th>Start (UTC)</th><th>Duration</th><th>Status</th></tr></thead>
        <tbody>
          ${events.map((e) => `
            <tr>
              <td><span class="badge text-bg-${e.triggered_by === 'auto' ? 'primary' : e.triggered_by === 'manual' ? 'secondary' : 'info'}">${e.triggered_by}</span></td>
              <td>${UI.escapeHtml(e.reason || '')}</td>
              <td>${UI.escapeHtml(e.start_time)}</td>
              <td>${e.duration_sec != null ? e.duration_sec + 's' : '—'}</td>
              <td>${UI.escapeHtml(e.status)}</td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  }

  return { render };
})();
