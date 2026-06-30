import { asyncHandler, HttpError } from '../utils/asyncHandler.js';
import { requireFields } from '../utils/validate.js';
import { findFieldById } from '../repositories/fields.js';
import { findZoneById } from '../repositories/zones.js';
import {
  listDevicesByUser, findDeviceById, createDevice, deleteDevice,
} from '../repositories/devices.js';
import { logActivity } from '../repositories/activityLogs.js';

const VALID_TYPES = ['controller', 'soil_moisture', 'humidity', 'water_level', 'valve', 'pump'];

const sanitize = (d, includeKey = false) => ({
  id: d.id,
  name: d.name,
  type: d.type,
  zone_id: d.zone_id,
  zone_name: d.zone_name,
  field_id: d.field_id,
  status: d.status,
  last_heartbeat: d.last_heartbeat,
  created_at: d.created_at,
  ...(includeKey ? { device_key: d.device_key } : {}),
});

async function loadOwnedDevice(req) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid device id');
  const device = await findDeviceById(id);
  if (!device) throw new HttpError(404, 'Device not found');
  if (device.owner_id != null && device.owner_id !== req.user.id && req.user.role !== 'admin') {
    throw new HttpError(403, 'Not your device');
  }
  return device;
}

export const list = asyncHandler(async (req, res) => {
  const devices = (await listDevicesByUser(req.user.id)).map((d) => sanitize(d));
  res.json({ devices });
});

export const create = asyncHandler(async (req, res) => {
  requireFields(req.body, ['name', 'type', 'zone_id']);
  const { name, type, zone_id } = req.body;
  if (!VALID_TYPES.includes(type)) {
    throw new HttpError(400, `Invalid type. Allowed: ${VALID_TYPES.join(', ')}`);
  }

  // Devices are scoped to a zone so ownership is unambiguous.
  const zone = await findZoneById(zone_id);
  if (!zone) throw new HttpError(404, 'Zone not found');
  if (zone.owner_id !== req.user.id && req.user.role !== 'admin') {
    throw new HttpError(403, 'Not your zone');
  }

  const device = await createDevice({ zoneId: zone_id, name, type });
  await logActivity({
    userId: req.user.id, action: 'create', entity: 'device', entityId: device.id,
    details: { type, zone_id },
  });
  // Return device_key ONLY here — won't be shown again
  res.status(201).json({ device: sanitize(device, true) });
});

export const get = asyncHandler(async (req, res) => {
  const device = await loadOwnedDevice(req);
  res.json({ device: sanitize(device) });
});

export const remove = asyncHandler(async (req, res) => {
  const device = await loadOwnedDevice(req);
  await deleteDevice(device.id);
  await logActivity({
    userId: req.user.id, action: 'delete', entity: 'device', entityId: device.id,
  });
  res.status(204).send();
});
