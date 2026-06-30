import { listAllEnabledZones } from '../repositories/zones.js';
import { getLatestReading } from '../repositories/sensorReadings.js';
import { getForecast } from './weather.js';
import {
  findActiveEventForZone, startEvent, endEvent,
} from '../repositories/irrigationEvents.js';
import { listActiveSchedules, hasFiredToday } from '../repositories/schedules.js';
import { getConfigNumber } from '../repositories/systemConfig.js';
import { secondsSince, parseDbTimestamp } from '../utils/time.js';
import { emitAlert } from './alertEngine.js';
import { checkDeviceHealth } from './deviceHealth.js';

// One evaluation cycle. Iterates every enabled zone and decides whether to
// start, stop, or leave irrigation alone. Returns a summary array for logging.
export async function evaluateAll() {
  const zones = await listAllEnabledZones();

  // Default thresholds, used if a zone has no crop assigned.
  const defaultLow  = await getConfigNumber('default_moisture_low', 35);
  const defaultHigh = await getConfigNumber('default_moisture_high', 70);
  const rainSkip    = await getConfigNumber('rain_skip_threshold', 60);
  const maxDurSec   = (await getConfigNumber('max_irrigation_minutes', 30)) * 60;

  // Forecast is a shared lookup per cycle.
  let peakRain = 0;
  try {
    const fc = await getForecast();
    peakRain = Number(fc.peakRainProbability ?? 0);
  } catch {
    peakRain = 0; // engine continues without forecast if upstream fails and no cache
  }

  const results = [];
  for (const zone of zones) {
    const decision = await evaluateZone(zone, { defaultLow, defaultHigh, rainSkip, maxDurSec, peakRain });
    results.push(decision);
  }

  // After zone evaluation, fire any schedules whose start time is now.
  const fires = await runScheduledFires();
  // Then check device health.
  const health = await checkDeviceHealth();
  return { peakRain, results, scheduleFires: fires, deviceHealth: health };
}

const DAY_ABBR = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function scheduleMatchesNow(schedule, now) {
  // repeat_days: 'daily' or CSV like 'mon,tue,fri'
  const days = String(schedule.repeat_days || 'daily').toLowerCase();
  if (days !== 'daily') {
    const today = DAY_ABBR[now.getUTCDay()];
    const set = new Set(days.split(',').map((s) => s.trim()));
    if (!set.has(today)) return false;
  }
  // start_time stored as 'HH:MM:SS' (UTC server time). Compare to current UTC.
  const [sh, sm] = String(schedule.start_time).split(':').map(Number);
  return now.getUTCHours() === sh && now.getUTCMinutes() === sm;
}

async function runScheduledFires() {
  const schedules = await listActiveSchedules();
  if (!schedules.length) return [];
  const now = new Date();
  const fires = [];

  for (const s of schedules) {
    if (!scheduleMatchesNow(s, now)) continue;
    if (await hasFiredToday(s.id)) continue;
    if (await findActiveEventForZone(s.zone_id)) continue; // don't collide with existing run

    const event = await startEvent({
      zoneId: s.zone_id,
      triggeredBy: 'scheduled',
      reason: `scheduled run (${s.start_time}, ${s.duration_minutes} min)`,
      scheduleId: s.id,
      durationMinutes: s.duration_minutes,
    });
    fires.push({ schedule_id: s.id, zone_id: s.zone_id, event_id: event.id });
  }
  return fires;
}

async function evaluateZone(zone, ctx) {
  const low  = Number(zone.moisture_threshold_low  ?? ctx.defaultLow);
  const high = Number(zone.moisture_threshold_high ?? ctx.defaultHigh);

  const reading = await getLatestReading(zone.id);
  const active  = await findActiveEventForZone(zone.id);

  const base = { zone_id: zone.id, zone_name: zone.name };

  if (!reading) {
    return { ...base, action: 'idle', reason: 'no sensor reading yet' };
  }

  const moisture = Number(reading.moisture_pct);

  // --- Already running: should we stop? ----------------------------
  if (active) {
    const ageSec = secondsSince(active.start_time);

    // Target-end-time reached (manual+duration or scheduled runs)
    if (active.target_end_time) {
      const target = parseDbTimestamp(active.target_end_time);
      if (target && Date.now() >= target.getTime()) {
        await endEvent(active.id, {
          status: 'completed',
          reason: `requested duration completed`,
        });
        return { ...base, action: 'stop', event_id: active.id, reason: 'duration elapsed' };
      }
    }

    if (moisture >= high) {
      await endEvent(active.id, {
        status: 'completed',
        reason: `moisture ${moisture}% reached upper threshold ${high}%`,
      });
      return { ...base, action: 'stop', event_id: active.id, reason: `target moisture reached (${moisture}% >= ${high}%)` };
    }

    if (ageSec >= ctx.maxDurSec) {
      await endEvent(active.id, {
        status: 'aborted',
        reason: `max duration ${ctx.maxDurSec}s exceeded`,
      });
      await emitAlert({
        userId: zone.owner_id, type: 'device_fault', severity: 'warning',
        message: `Irrigation in "${zone.name}" was aborted: exceeded safety cap of ${Math.round(ctx.maxDurSec/60)} min.`,
        relatedEntity: 'zone', relatedId: zone.id,
      });
      return { ...base, action: 'abort', event_id: active.id, reason: `safety stop: duration ${ageSec}s >= ${ctx.maxDurSec}s` };
    }

    // Only auto-runs respect a sudden rain forecast; manual/scheduled keep going.
    if (active.triggered_by === 'auto' && ctx.peakRain >= ctx.rainSkip) {
      await endEvent(active.id, {
        status: 'aborted',
        reason: `rain ${ctx.peakRain}% expected — stopping auto irrigation`,
      });
      await emitAlert({
        userId: zone.owner_id, type: 'rain_expected', severity: 'info',
        message: `Auto-irrigation in "${zone.name}" stopped: rain ${ctx.peakRain}% expected.`,
        relatedEntity: 'zone', relatedId: zone.id,
      });
      return { ...base, action: 'abort', event_id: active.id, reason: `rain expected (${ctx.peakRain}%)` };
    }

    return { ...base, action: 'continue', event_id: active.id, moisture, age_sec: ageSec };
  }

  // --- Not running: should we start? -------------------------------
  if (moisture < low) {
    if (ctx.peakRain >= ctx.rainSkip) {
      await emitAlert({
        userId: zone.owner_id, type: 'moisture_low', severity: 'warning',
        message: `Zone "${zone.name}" is dry (${moisture}%) but rain ${ctx.peakRain}% expected — irrigation skipped.`,
        relatedEntity: 'zone', relatedId: zone.id, windowMin: 30,
      });
      return { ...base, action: 'skip', reason: `moisture ${moisture}% < ${low}% but rain ${ctx.peakRain}% >= ${ctx.rainSkip}%` };
    }
    const event = await startEvent({
      zoneId: zone.id,
      triggeredBy: 'auto',
      reason: `moisture ${moisture}% below threshold ${low}%`,
    });
    return { ...base, action: 'start', event_id: event.id, reason: event.reason };
  }

  return { ...base, action: 'idle', moisture, reason: `moisture ${moisture}% within [${low}, ${high}]` };
}
