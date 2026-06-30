const Overview = (() => {
  let timer = null;

  async function render() {
    const container = document.getElementById('overviewCards');
    const empty = document.getElementById('overviewEmpty');

    try {
      const [{ zones }, weatherResp] = await Promise.all([
        API.get('/api/zones'),
        API.get('/api/weather/current').catch(() => null),
      ]);

      if (!zones.length) {
        container.innerHTML = '';
        empty.classList.remove('d-none');
        return;
      }
      empty.classList.add('d-none');

      // Fetch latest reading + active irrigation per zone in parallel.
      // 404 on any one zone (e.g., deleted mid-poll) shouldn't break the whole grid.
      const enriched = (await Promise.all(zones.map(async (z) => {
        try {
          const [latest, active] = await Promise.all([
            API.get(`/api/zones/${z.id}/readings/latest`).catch(() => ({ reading: null })),
            API.get(`/api/zones/${z.id}/irrigation/active`).catch(() => ({ active: null })),
          ]);
          return { zone: z, reading: latest.reading, active: active.active };
        } catch { return null; }
      }))).filter(Boolean);

      container.innerHTML = enriched.map(cardHtml).join('');

      // Wire start/stop buttons
      container.querySelectorAll('[data-start]').forEach((btn) => {
        btn.addEventListener('click', () => startZone(Number(btn.dataset.start)));
      });
      container.querySelectorAll('[data-stop]').forEach((btn) => {
        btn.addEventListener('click', () => stopZone(Number(btn.dataset.stop)));
      });
    } catch (e) {
      container.innerHTML = `<div class="alert alert-danger">${UI.escapeHtml(e.message)}</div>`;
    }
  }

  function cardHtml({ zone, reading, active }) {
    const moisture = reading?.moisture_pct ?? null;
    const humidity = reading?.humidity_pct ?? null;
    const level    = reading?.water_level ?? null;

    const low  = Number(zone.moisture_threshold_low  ?? 0);
    const high = Number(zone.moisture_threshold_high ?? 100);
    const moistureColor =
      moisture == null ? 'secondary'
      : moisture < low  ? 'danger'
      : moisture > high ? 'info'
      : 'success';

    const statusDot = active ? 'dot-irrigating' : (reading ? 'dot-online' : 'dot-offline');
    const statusText = active
      ? `Irrigating (${active.triggered_by})`
      : (reading ? 'Idle' : 'No data');

    const buttons = active
      ? `<button class="btn btn-outline-danger btn-sm" data-stop="${zone.id}"><i class="bi bi-stop-circle"></i> Stop</button>`
      : `<button class="btn btn-primary btn-sm" data-start="${zone.id}"><i class="bi bi-play-circle"></i> Start</button>`;

    return `
      <div class="col-md-6 col-xl-4">
        <div class="card zone-card shadow-sm">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h6 class="mb-0">${UI.escapeHtml(zone.name)}</h6>
                <div class="small text-muted">${UI.escapeHtml(zone.field_name || '')}${zone.crop_name ? ` · ${UI.escapeHtml(zone.crop_name)}` : ''}</div>
              </div>
              <span class="small text-muted">
                <span class="dot ${statusDot}"></span>${UI.escapeHtml(statusText)}
              </span>
            </div>

            <div class="mt-3">
              <div class="d-flex justify-content-between">
                <span class="metric-label">Moisture</span>
                <span class="metric text-${moistureColor}">${UI.fmtPct(moisture)}</span>
              </div>
              <div class="metric-bar"><div class="bar-moisture" style="width:${moisture ?? 0}%"></div></div>
              <div class="small text-muted mt-1">Target: ${low}%–${high}%</div>
            </div>

            <div class="mt-2">
              <div class="d-flex justify-content-between">
                <span class="metric-label">Humidity</span>
                <span class="metric">${UI.fmtPct(humidity)}</span>
              </div>
              <div class="metric-bar"><div class="bar-humidity" style="width:${humidity ?? 0}%"></div></div>
            </div>

            <div class="mt-2">
              <div class="d-flex justify-content-between">
                <span class="metric-label">Water level</span>
                <span class="metric">${UI.fmtPct(level)}</span>
              </div>
              <div class="metric-bar"><div class="bar-level" style="width:${level ?? 0}%"></div></div>
            </div>

            <div class="d-flex justify-content-between align-items-center mt-3">
              <span class="small text-muted">Updated ${UI.fmtTimeAgo(reading?.recorded_at)}</span>
              ${buttons}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async function startZone(id) {
    try {
      await API.post(`/api/zones/${id}/irrigation/start`, {});
      UI.toast('Irrigation started', 'success');
      render();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  async function stopZone(id) {
    try {
      await API.post(`/api/zones/${id}/irrigation/stop`, {});
      UI.toast('Irrigation stopped', 'info');
      render();
    } catch (e) { UI.toast(e.message, 'error'); }
  }

  function start() {
    render();
    if (timer) clearInterval(timer);
    timer = setInterval(render, 5000);
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  return { render, start, stop };
})();
