import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireFields } from '../utils/validate.js';
import { findFieldById } from '../repositories/fields.js';
import { findCropById } from '../repositories/crops.js';
import {
  listZonesByUser, listZonesByFieldId, findZoneById,
  createZone, updateZone, setZoneCrop, deleteZone,
} from '../repositories/zones.js';
import { listReadings, getLatestReading } from '../repositories/sensorReadings.js';
import { listEventsForZone, findActiveEventForZone } from '../repositories/irrigationEvents.js';
import { logActivity } from '../repositories/activityLogs.js';

function ensureOwnership(req, ownerId) {
  if (ownerId !== req.user.id && req.user.role !== 'admin') {
    throw new HttpError(403, 'Not your resource');
  }
}

async function loadOwnedField(req, fieldId) {
  if (!Number.isInteger(fieldId) || fieldId <= 0) throw new HttpError(400, 'Invalid field id');
  const field = await findFieldById(fieldId);
  if (!field) throw new HttpError(404, 'Field not found');
  ensureOwnership(req, field.user_id);
  return field;
}

async function loadOwnedZone(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid zone id');
  const zone = await findZoneById(id);
  if (!zone) throw new HttpError(404, 'Zone not found');
  ensureOwnership(req, zone.owner_id);
  return zone;
}

export const list = asyncHandler(async (req, res) => {
  res.json({ zones: await listZonesByUser(req.user.id) });
});

export const listZonesByField = asyncHandler(async (req, res) => {
  const field = await loadOwnedField(req, Number(req.params.id));
  res.json({ zones: await listZonesByFieldId(field.id) });
});

function parseThreshold(value, name) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new HttpError(400, `${name} must be 0..100 (or empty to use crop default)`);
  }
  return n;
}

export const createZoneForField = asyncHandler(async (req, res) => {
  const field = await loadOwnedField(req, Number(req.params.id));
  requireFields(req.body, ['name']);
  const { name, area_sqm, crop_id, is_enabled,
          moisture_threshold_low, moisture_threshold_high } = req.body;
  if (crop_id != null && !(await findCropById(crop_id))) throw new HttpError(404, 'Crop not found');

  const tLow  = parseThreshold(moisture_threshold_low,  'moisture_threshold_low');
  const tHigh = parseThreshold(moisture_threshold_high, 'moisture_threshold_high');
  if (tLow != null && tHigh != null && tLow >= tHigh) {
    throw new HttpError(400, 'moisture_threshold_low must be < moisture_threshold_high');
  }

  const zone = await createZone({
    fieldId: field.id, cropId: crop_id, name, areaSqm: area_sqm,
    isEnabled: is_enabled !== false,
    thresholdLow: tLow, thresholdHigh: tHigh,
  });
  await logActivity({
    userId: req.user.id, action: 'create', entity: 'zone', entityId: zone.id,
    details: { field_id: field.id, name },
  });
  res.status(201).json({ zone });
});

export const get = asyncHandler(async (req, res) => {
  res.json({ zone: await loadOwnedZone(req) });
});

export const update = asyncHandler(async (req, res) => {
  const zone = await loadOwnedZone(req);
  const { name, area_sqm, is_enabled, crop_id,
          moisture_threshold_low, moisture_threshold_high } = req.body;
  if (crop_id != null && !(await findCropById(crop_id))) throw new HttpError(404, 'Crop not found');

  // For PUT we distinguish: key not present = no change, key=null/'' = clear override, key=number = set.
  const tLowPresent  = Object.prototype.hasOwnProperty.call(req.body, 'moisture_threshold_low');
  const tHighPresent = Object.prototype.hasOwnProperty.call(req.body, 'moisture_threshold_high');
  const tLow  = tLowPresent  ? parseThreshold(moisture_threshold_low,  'moisture_threshold_low')  : undefined;
  const tHigh = tHighPresent ? parseThreshold(moisture_threshold_high, 'moisture_threshold_high') : undefined;
  if (tLow != null && tHigh != null && tLow >= tHigh) {
    throw new HttpError(400, 'moisture_threshold_low must be < moisture_threshold_high');
  }

  const updated = await updateZone(zone.id, {
    name, areaSqm: area_sqm,
    isEnabled: typeof is_enabled === 'boolean' ? is_enabled : undefined,
    cropId: crop_id,
    thresholdLow: tLow, thresholdHigh: tHigh,
  });
  await logActivity({
    userId: req.user.id, action: 'update', entity: 'zone', entityId: zone.id,
  });
  res.json({ zone: updated });
});

export const assignCrop = asyncHandler(async (req, res) => {
  const zone = await loadOwnedZone(req);
  requireFields(req.body, ['crop_id']);
  const { crop_id } = req.body;
  const crop = await findCropById(crop_id);
  if (!crop) throw new HttpError(404, 'Crop not found');
  const updated = await setZoneCrop(zone.id, crop_id);
  await logActivity({
    userId: req.user.id, action: 'assign_crop', entity: 'zone', entityId: zone.id,
    details: { crop_id, crop_name: crop.name },
  });
  res.json({ zone: updated });
});

export const remove = asyncHandler(async (req, res) => {
  const zone = await loadOwnedZone(req);
  await deleteZone(zone.id);
  await logActivity({
    userId: req.user.id, action: 'delete', entity: 'zone', entityId: zone.id,
  });
  res.status(204).send();
});

export const readings = asyncHandler(async (req, res) => {
  const zone = await loadOwnedZone(req);
  const { limit, since_minutes } = req.query;
  const rows = await listReadings(zone.id, { limit, sinceMinutes: since_minutes });
  res.json({ zone_id: zone.id, count: rows.length, readings: rows });
});

export const latestReading = asyncHandler(async (req, res) => {
  const zone = await loadOwnedZone(req);
  const reading = await getLatestReading(zone.id);
  res.json({ zone_id: zone.id, reading });
});

export const activeIrrigation = asyncHandler(async (req, res) => {
  const zone = await loadOwnedZone(req);
  const event = await findActiveEventForZone(zone.id);
  res.json({ zone_id: zone.id, active: event });
});

export const irrigationHistory = asyncHandler(async (req, res) => {
  const zone = await loadOwnedZone(req);
  const events = await listEventsForZone(zone.id, req.query.limit);
  res.json({ zone_id: zone.id, count: events.length, events });
});
