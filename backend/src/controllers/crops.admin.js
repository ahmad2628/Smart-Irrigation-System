import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireFields } from '../utils/validate.js';
import {
  findCropById, findCropByName, createCropRow, updateCropRow,
  deleteCropRow, countZonesUsingCrop,
} from '../repositories/crops.js';
import { logActivity } from '../repositories/activityLogs.js';

function assertPercent(value, fieldName) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new HttpError(400, `${fieldName} must be a number between 0 and 100`);
  }
  return n;
}

function assertThresholdPair(low, high) {
  if (low >= high) throw new HttpError(400, 'moisture_threshold_low must be < moisture_threshold_high');
}

export const create = asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'moisture_threshold_low', 'moisture_threshold_high']);
  const name = String(req.body.name).trim();
  if (!name) throw new HttpError(400, 'name required');
  if (await findCropByName(name)) throw new HttpError(409, 'Crop name already exists');

  const low  = assertPercent(req.body.moisture_threshold_low,  'moisture_threshold_low');
  const high = assertPercent(req.body.moisture_threshold_high, 'moisture_threshold_high');
  assertThresholdPair(low, high);

  const crop = await createCropRow({
    name,
    description: req.body.description,
    low, high,
    humLow:  req.body.ideal_humidity_min  != null ? assertPercent(req.body.ideal_humidity_min,  'ideal_humidity_min')  : null,
    humHigh: req.body.ideal_humidity_max != null ? assertPercent(req.body.ideal_humidity_max, 'ideal_humidity_max') : null,
  });

  await logActivity({
    userId: req.user.id, action: 'create', entity: 'crop', entityId: crop.id,
    details: { name, low, high },
  });
  res.status(201).json({ crop });
});

export const update = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid crop id');
  const existing = await findCropById(id);
  if (!existing) throw new HttpError(404, 'Crop not found');

  // Name uniqueness if changed
  if (req.body.name && req.body.name !== existing.name) {
    const dup = await findCropByName(req.body.name);
    if (dup) throw new HttpError(409, 'Crop name already exists');
  }

  const low  = req.body.moisture_threshold_low  != null ? assertPercent(req.body.moisture_threshold_low,  'moisture_threshold_low')  : null;
  const high = req.body.moisture_threshold_high != null ? assertPercent(req.body.moisture_threshold_high, 'moisture_threshold_high') : null;
  if (low != null && high != null) assertThresholdPair(low, high);
  if (low  != null && high == null) assertThresholdPair(low,  Number(existing.moisture_threshold_high));
  if (high != null && low  == null) assertThresholdPair(Number(existing.moisture_threshold_low),  high);

  const crop = await updateCropRow(id, {
    name: req.body.name ? String(req.body.name).trim() : null,
    description: req.body.description,
    low, high,
    humLow:  req.body.ideal_humidity_min  != null ? assertPercent(req.body.ideal_humidity_min,  'ideal_humidity_min')  : null,
    humHigh: req.body.ideal_humidity_max != null ? assertPercent(req.body.ideal_humidity_max, 'ideal_humidity_max') : null,
  });

  await logActivity({
    userId: req.user.id, action: 'update', entity: 'crop', entityId: crop.id,
    details: { low, high, name: crop.name },
  });
  res.json({ crop });
});

export const remove = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid crop id');
  const existing = await findCropById(id);
  if (!existing) throw new HttpError(404, 'Crop not found');

  const used = await countZonesUsingCrop(id);
  if (used > 0) {
    throw new HttpError(409, `Cannot delete: ${used} zone(s) still use this crop`);
  }

  await deleteCropRow(id);
  await logActivity({
    userId: req.user.id, action: 'delete', entity: 'crop', entityId: id,
    details: { name: existing.name },
  });
  res.status(204).send();
});
