import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { findZoneById } from '../repositories/zones.js';
import {
  findActiveEventForZone, startEvent, endEvent,
} from '../repositories/irrigationEvents.js';
import { logActivity } from '../repositories/activityLogs.js';

function ownsZone(req, zone) {
  return zone && (zone.owner_id === req.user.id || req.user.role === 'admin');
}

async function loadOwnedZone(req, idParam = 'id') {
  const id = Number(req.params[idParam]);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid zone id');
  const zone = await findZoneById(id);
  if (!zone) throw new HttpError(404, 'Zone not found');
  if (!ownsZone(req, zone)) throw new HttpError(403, 'Not your zone');
  return zone;
}

function parseDuration(value) {
  if (value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1440) {
    throw new HttpError(400, 'duration_minutes must be 1..1440');
  }
  return n;
}

// -- Single zone -----------------------------------------------------
export const startForZone = asyncHandler(async (req, res) => {
  const zone = await loadOwnedZone(req);
  const durationMinutes = parseDuration(req.body?.duration_minutes);
  const note = req.body?.reason ? String(req.body.reason).slice(0, 200) : null;

  const existing = await findActiveEventForZone(zone.id);
  if (existing) throw new HttpError(409, 'Irrigation already running for this zone');

  const event = await startEvent({
    zoneId: zone.id,
    triggeredBy: 'manual',
    reason: note || `manual start by ${req.user.email}`,
    userId: req.user.id,
    durationMinutes,
  });

  await logActivity({
    userId: req.user.id, action: 'irrigation_start',
    entity: 'zone', entityId: zone.id,
    details: { event_id: event.id, duration_minutes: durationMinutes },
  });

  res.status(201).json({ event });
});

export const stopForZone = asyncHandler(async (req, res) => {
  const zone = await loadOwnedZone(req);
  const active = await findActiveEventForZone(zone.id);
  if (!active) throw new HttpError(404, 'No running irrigation for this zone');

  const updated = await endEvent(active.id, {
    status: 'completed',
    reason: `manual stop by ${req.user.email}`,
  });

  await logActivity({
    userId: req.user.id, action: 'irrigation_stop',
    entity: 'zone', entityId: zone.id,
    details: { event_id: active.id },
  });

  res.json({ event: updated });
});

// -- Multi-zone ------------------------------------------------------
function parseZoneIds(body) {
  const arr = Array.isArray(body?.zone_ids) ? body.zone_ids : null;
  if (!arr || arr.length === 0) {
    throw new HttpError(400, 'zone_ids (non-empty array) required');
  }
  const ids = arr.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!ids.length) throw new HttpError(400, 'No valid zone ids in zone_ids');
  return [...new Set(ids)];
}

export const startBulk = asyncHandler(async (req, res) => {
  const ids = parseZoneIds(req.body);
  const durationMinutes = parseDuration(req.body?.duration_minutes);

  const started = [];
  const skipped = [];

  for (const id of ids) {
    const zone = await findZoneById(id);
    if (!zone)            { skipped.push({ zone_id: id, reason: 'not_found' });    continue; }
    if (!ownsZone(req, zone)) { skipped.push({ zone_id: id, reason: 'forbidden' }); continue; }

    const existing = await findActiveEventForZone(id);
    if (existing) { skipped.push({ zone_id: id, reason: 'already_running', event_id: existing.id }); continue; }

    const event = await startEvent({
      zoneId: id, triggeredBy: 'manual',
      reason: `bulk manual start by ${req.user.email}`,
      userId: req.user.id, durationMinutes,
    });
    started.push({ zone_id: id, event_id: event.id });
  }

  await logActivity({
    userId: req.user.id, action: 'irrigation_bulk_start',
    details: { started: started.map((s) => s.zone_id), skipped },
  });
  res.json({ started, skipped });
});

export const stopBulk = asyncHandler(async (req, res) => {
  const ids = parseZoneIds(req.body);
  const stopped = [];
  const skipped = [];

  for (const id of ids) {
    const zone = await findZoneById(id);
    if (!zone)            { skipped.push({ zone_id: id, reason: 'not_found' });    continue; }
    if (!ownsZone(req, zone)) { skipped.push({ zone_id: id, reason: 'forbidden' }); continue; }

    const active = await findActiveEventForZone(id);
    if (!active) { skipped.push({ zone_id: id, reason: 'not_running' }); continue; }

    await endEvent(active.id, {
      status: 'completed',
      reason: `bulk manual stop by ${req.user.email}`,
    });
    stopped.push({ zone_id: id, event_id: active.id });
  }

  await logActivity({
    userId: req.user.id, action: 'irrigation_bulk_stop',
    details: { stopped: stopped.map((s) => s.zone_id), skipped },
  });
  res.json({ stopped, skipped });
});
