import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireFields } from '../utils/validate.js';
import { findZoneById } from '../repositories/zones.js';
import {
  listSchedulesByUser, findScheduleById, createSchedule,
  updateSchedule, deleteSchedule,
} from '../repositories/schedules.js';
import { logActivity } from '../repositories/activityLogs.js';

const VALID_DAYS = new Set(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

function normalizeRepeatDays(value) {
  if (value == null || value === '') return 'daily';
  const v = String(value).trim().toLowerCase();
  if (v === 'daily') return 'daily';
  const parts = v.split(',').map((s) => s.trim()).filter(Boolean);
  for (const p of parts) {
    if (!VALID_DAYS.has(p)) {
      throw new HttpError(400, `Invalid day '${p}' in repeat_days. Use 'daily' or comma-separated mon|tue|wed|thu|fri|sat|sun`);
    }
  }
  return [...new Set(parts)].join(',');
}

function normalizeStartTime(value) {
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(String(value))) {
    throw new HttpError(400, 'start_time must be HH:MM or HH:MM:SS (24h)');
  }
  const [hh, mm, ss = '00'] = String(value).split(':');
  const H = Number(hh), M = Number(mm), S = Number(ss);
  if (H < 0 || H > 23 || M < 0 || M > 59 || S < 0 || S > 59) {
    throw new HttpError(400, 'start_time out of range');
  }
  return `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}:${String(S).padStart(2, '0')}`;
}

function normalizeDuration(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0 || n > 1440) {
    throw new HttpError(400, 'duration_minutes must be an integer in 1..1440');
  }
  return n;
}

async function loadOwnedSchedule(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid schedule id');
  const s = await findScheduleById(id);
  if (!s) throw new HttpError(404, 'Schedule not found');
  if (s.owner_id !== req.user.id && req.user.role !== 'admin') {
    throw new HttpError(403, 'Not your schedule');
  }
  return s;
}

export const list = asyncHandler(async (req, res) => {
  res.json({ schedules: await listSchedulesByUser(req.user.id) });
});

export const create = asyncHandler(async (req, res) => {
  requireFields(req.body, ['zone_id', 'start_time', 'duration_minutes']);

  const zone = await findZoneById(Number(req.body.zone_id));
  if (!zone) throw new HttpError(404, 'Zone not found');
  if (zone.owner_id !== req.user.id && req.user.role !== 'admin') {
    throw new HttpError(403, 'Not your zone');
  }

  const startTime = normalizeStartTime(req.body.start_time);
  const duration  = normalizeDuration(req.body.duration_minutes);
  const repeat    = normalizeRepeatDays(req.body.repeat_days);

  const schedule = await createSchedule({
    zoneId: zone.id, userId: req.user.id,
    startTime, durationMinutes: duration,
    repeatDays: repeat,
    isActive: req.body.is_active !== false,
  });

  await logActivity({
    userId: req.user.id, action: 'create', entity: 'schedule', entityId: schedule.id,
    details: { zone_id: zone.id, start_time: startTime, duration },
  });
  res.status(201).json({ schedule });
});

export const get = asyncHandler(async (req, res) => {
  res.json({ schedule: await loadOwnedSchedule(req) });
});

export const update = asyncHandler(async (req, res) => {
  const s = await loadOwnedSchedule(req);

  const patch = {};
  if (req.body.start_time       != null) patch.startTime       = normalizeStartTime(req.body.start_time);
  if (req.body.duration_minutes != null) patch.durationMinutes = normalizeDuration(req.body.duration_minutes);
  if (req.body.repeat_days      != null) patch.repeatDays      = normalizeRepeatDays(req.body.repeat_days);
  if (typeof req.body.is_active === 'boolean') patch.isActive  = req.body.is_active;

  const updated = await updateSchedule(s.id, patch);
  await logActivity({
    userId: req.user.id, action: 'update', entity: 'schedule', entityId: s.id,
  });
  res.json({ schedule: updated });
});

export const remove = asyncHandler(async (req, res) => {
  const s = await loadOwnedSchedule(req);
  await deleteSchedule(s.id);
  await logActivity({
    userId: req.user.id, action: 'delete', entity: 'schedule', entityId: s.id,
  });
  res.status(204).send();
});
