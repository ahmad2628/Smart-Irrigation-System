const Reports = (() => {
  let chart = null;

  function defaultRange() {
    const today = new Date();
    const weekAgo = new Date(Date.now() - 7 * 86400_000);
    return {
      from: weekAgo.toISOString().slice(0, 10),
      to:   today.toISOString().slice(0, 10),
    };
  }

  async function render() {
    const fromInput = document.getElementById('reportFrom');
    const toInput   = document.getElementById('reportTo');
    if (!fromInput.value || !toInput.value) {
      const r = defaultRange();
      fromInput.value = r.from;
      toInput.value   = r.to;
    }

    const { zones } = await API.get('/api/zones');
    const zSel = document.getElementById('reportZone');
    const current = zSel.value;
    zSel.innerHTML = '<option value="">All zones</option>'
      + zones.map((z) => `<option value="${z.id}">${UI.escapeHtml(z.name)}</option>`).join('');
    zSel.value = current;

    updateDownloadLinks();
    await load();
  }

  function buildQuery() {
    const from = document.getElementById('reportFrom').value;
    const to   = document.getElementById('reportTo').value;
    const zone = document.getElementById('reportZone').value;
    const qs = new URLSearchParams({ from, to });
    if (zone) qs.set('zone_id', zone);
    return qs.toString();
  }

  function updateDownloadLinks() {
    const qs = buildQuery();
    const token = API.getToken();
    // Tokens via URL aren't ideal but workable for one-off downloads in this demo.
    // Better: use fetch+blob. Keeping it simple here.
    document.getElementById('dlIrrigationCsv').href = `/api/reports/irrigation.csv?${qs}`;
    document.getElementById('dlReadingsCsv').href   = `/api/reports/readings.csv?${qs}`;
    document.getElementById('dlSummaryPdf').href    = `/api/reports/summary.pdf?${qs}`;
    // Attach token via fetch-on-click below
  }

  async function downloadWithAuth(e, urlBuilder, defaultName) {
    e.preventDefault();
    try {
      const url = urlBuilder();
      const res = await fetch(url, { headers: { Authorization: `Bearer ${API.getToken()}` } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = res.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || defaultName;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 500);
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  async function load() {
    try {
      const data = await API.get(`/api/reports/summary?${buildQuery()}`);
      renderStats(data);
      renderTriggerBreakdown(data.by_trigger);
      renderStatusBreakdown(data.by_status);
      renderDailyChart(data.per_day, data.from, data.to);
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  function renderStats(data) {
    const r = data.readings || {};
    const cards = [
      { label: 'Irrigation events', value: data.totals.events, icon: 'droplet-half', color: 'primary' },
      { label: 'Total minutes',     value: data.totals.duration_minutes, icon: 'clock-history', color: 'info' },
      { label: 'Avg moisture',      value: r.avg_moisture != null ? `${r.avg_moisture}%` : '—', icon: 'moisture', color: 'success' },
      { label: 'Readings recorded', value: r.readings_count ?? 0, icon: 'list-ol', color: 'secondary' },
    ];
    document.getElementById('reportStats').innerHTML = cards.map((c) => `
      <div class="col-6 col-md-3">
        <div class="card card-body shadow-sm">
          <div class="d-flex justify-content-between">
            <div>
              <div class="text-muted small">${c.label}</div>
              <div class="h4 mb-0">${c.value}</div>
            </div>
            <i class="bi bi-${c.icon} fs-2 text-${c.color}"></i>
          </div>
        </div>
      </div>`).join('');
  }

  function renderTriggerBreakdown(rows) {
    const el = document.getElementById('reportByTrigger');
    if (!rows?.length) { el.innerHTML = '<div class="text-muted">No data</div>'; return; }
    el.innerHTML = `
      <table class="table table-sm small mb-0">
        <thead><tr><th>Trigger</th><th class="text-end">Count</th><th class="text-end">Total min</th></tr></thead>
        <tbody>${rows.map((r) => `
          <tr>
            <td><span class="badge text-bg-${r.triggered_by === 'auto' ? 'primary' : r.triggered_by === 'manual' ? 'secondary' : 'info'}">${r.triggered_by}</span></td>
            <td class="text-end">${r.count}</td>
            <td class="text-end">${Math.round(Number(r.total_duration_sec || 0) / 60)}</td>
          </tr>`).join('')}</tbody>
      </table>`;
  }

  function renderStatusBreakdown(rows) {
    const el = document.getElementById('reportByStatus');
    if (!rows?.length) { el.innerHTML = '<div class="text-muted">No data</div>'; return; }
    el.innerHTML = `
      <table class="table table-sm small mb-0">
        <thead><tr><th>Status</th><th class="text-end">Count</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td>${r.status}</td><td class="text-end">${r.count}</td></tr>`).join('')}</tbody>
      </table>`;
  }

  function renderDailyChart(perDay, from, to) {
    const days = expandDays(from, to);
    const map = new Map(perDay.map((r) => [String(r.day).slice(0, 10), Number(r.count)]));
    const counts = days.map((d) => map.get(d) || 0);

    const ctx = document.getElementById('reportDailyChart').getContext('2d');
    if (chart) chart.destroy();
    chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: days,
        datasets: [{ label: 'Events per day', data: counts, backgroundColor: '#0d6efd' }],
      },
      options: {
        responsive: true, animation: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
      },
    });
  }

  function expandDays(from, to) {
    const days = [];
    const d = new Date(from + 'T00:00:00Z');
    const end = new Date(to + 'T00:00:00Z');
    while (d <= end) {
      days.push(d.toISOString().slice(0, 10));
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return days;
  }

  function init() {
    document.getElementById('reportsFilter').addEventListener('submit', (e) => {
      e.preventDefault();
      updateDownloadLinks();
      load();
    });
    document.getElementById('dlIrrigationCsv').addEventListener('click', (e) =>
      downloadWithAuth(e, () => `/api/reports/irrigation.csv?${buildQuery()}`, 'irrigation.csv'));
    document.getElementById('dlReadingsCsv').addEventListener('click', (e) =>
      downloadWithAuth(e, () => `/api/reports/readings.csv?${buildQuery()}`, 'readings.csv'));
    document.getElementById('dlSummaryPdf').addEventListener('click', (e) =>
      downloadWithAuth(e, () => `/api/reports/summary.pdf?${buildQuery()}`, 'summary.pdf'));
  }

  return { init, render };
})();
