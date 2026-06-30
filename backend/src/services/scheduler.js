import { evaluateAll } from './decisionEngine.js';

let handle = null;
let running = false;
let lastSummary = null;

const PERIOD_SEC = Number(process.env.DECISION_PERIOD_SEC || 15);
const VERBOSE    = process.env.DECISION_VERBOSE !== 'false';

async function tick() {
  if (running) return; // skip overlapping ticks if a cycle takes too long
  running = true;
  try {
    const summary = await evaluateAll();
    lastSummary = { ...summary, ranAt: new Date().toISOString() };
    if (VERBOSE) {
      const counts = summary.results.reduce((acc, r) => {
        acc[r.action] = (acc[r.action] || 0) + 1; return acc;
      }, {});
      const counterStr = Object.entries(counts).map(([k, v]) => `${k}:${v}`).join(' ') || 'no-zones';
      console.log(`[engine] cycle: ${counterStr}  peakRain=${summary.peakRain}%`);
      for (const r of summary.results) {
        if (r.action === 'start' || r.action === 'stop' || r.action === 'abort' || r.action === 'skip') {
          console.log(`[engine]   zone=${r.zone_id} ${r.action.toUpperCase()}: ${r.reason}`);
        }
      }
      for (const f of summary.scheduleFires || []) {
        console.log(`[engine]   schedule=${f.schedule_id} → started event=${f.event_id} on zone=${f.zone_id}`);
      }
    }
  } catch (e) {
    console.error('[engine] cycle error:', e.message);
  } finally {
    running = false;
  }
}

export function startScheduler() {
  if (handle) return;
  console.log(`[engine] starting decision loop (every ${PERIOD_SEC}s)`);
  // Initial tick after a small delay so DB is fully ready
  setTimeout(tick, 2000);
  handle = setInterval(tick, PERIOD_SEC * 1000);
}

export function stopScheduler() {
  if (handle) {
    clearInterval(handle);
    handle = null;
    console.log('[engine] stopped');
  }
}

export function getLastSummary() {
  return lastSummary;
}
